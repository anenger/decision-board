import { and, asc, eq } from 'drizzle-orm'
import type { BatchingDb } from '@/db/types'
import type {
  BoardSnapshot,
  BoardState,
  InviteRole,
  Operation,
  Role,
  VoteMap,
} from '@/lib/board-sync/protocol'
import { boardMembers, boards, decisions, options, votes } from '@/db/schema'
import { isDecisionOpen } from '@/lib/board-sync/protocol'
import {
  applyOperation,
  checkOperation,
  publicState,
} from '@/lib/board-sync/reducer'

export type LoadedBoard = {
  /** Full state, including counts hidden from clients. */
  state: BoardState
  /** Every user's votes: user id → their vote map. Never sent to clients. */
  votesByUser: Map<string, VoteMap>
  /** Invited members; the owner is state.board.ownerId. */
  members: Map<string, InviteRole>
}

export async function loadBoard(
  db: BatchingDb,
  boardId: string,
): Promise<LoadedBoard | null> {
  const onBoard = eq(decisions.boardId, boardId)
  const [boardRows, decisionRows, optionRows, voteRows, memberRows] =
    (await db.batch([
      db.select().from(boards).where(eq(boards.id, boardId)),
      db
        .select()
        .from(decisions)
        .where(onBoard)
        .orderBy(asc(decisions.createdAt), asc(decisions.id)),
      db
        .select({
          id: options.id,
          decisionId: options.decisionId,
          text: options.text,
        })
        .from(options)
        .innerJoin(decisions, eq(decisions.id, options.decisionId))
        .where(onBoard)
        .orderBy(asc(options.position), asc(options.id)),
      db
        .select({
          decisionId: votes.decisionId,
          userId: votes.userId,
          optionId: votes.optionId,
        })
        .from(votes)
        .innerJoin(decisions, eq(decisions.id, votes.decisionId))
        .where(onBoard),
      db
        .select({ userId: boardMembers.userId, role: boardMembers.role })
        .from(boardMembers)
        .where(eq(boardMembers.boardId, boardId)),
    ])) as [
      Array<typeof boards.$inferSelect>,
      Array<typeof decisions.$inferSelect>,
      Array<{ id: string; decisionId: string; text: string }>,
      Array<{ decisionId: string; userId: string; optionId: string }>,
      Array<{ userId: string; role: InviteRole }>,
    ]

  const board = boardRows.at(0)
  if (!board) return null

  const voteCounts = new Map<string, number>()
  const decisionTotals = new Map<string, number>()
  const votesByUser = new Map<string, VoteMap>()
  for (const vote of voteRows) {
    voteCounts.set(vote.optionId, (voteCounts.get(vote.optionId) ?? 0) + 1)
    decisionTotals.set(
      vote.decisionId,
      (decisionTotals.get(vote.decisionId) ?? 0) + 1,
    )
    const userVotes = votesByUser.get(vote.userId) ?? {}
    userVotes[vote.decisionId] = vote.optionId
    votesByUser.set(vote.userId, userVotes)
  }

  return {
    state: {
      board: {
        id: board.id,
        name: board.name,
        ownerId: board.ownerId,
        createdAt: board.createdAt.getTime(),
      },
      decisions: decisionRows.map((decision) => ({
        id: decision.id,
        title: decision.title,
        createdById: decision.createdById,
        createdAt: decision.createdAt.getTime(),
        closesAt: decision.closesAt?.getTime() ?? null,
        closedAt: decision.closedAt?.getTime() ?? null,
        hideResults: decision.hideResults,
        totalVotes: decisionTotals.get(decision.id) ?? 0,
        options: optionRows
          .filter((option) => option.decisionId === decision.id)
          .map((option) => ({
            id: option.id,
            text: option.text,
            votes: voteCounts.get(option.id) ?? 0,
          })),
      })),
    },
    votesByUser,
    members: new Map(memberRows.map((m) => [m.userId, m.role])),
  }
}

export function roleOf(board: LoadedBoard, userId: string | null): Role {
  if (userId === null) return 'viewer'
  if (userId === board.state.board.ownerId) return 'owner'
  return board.members.get(userId) ?? 'viewer'
}

/** What one viewer may see: their own votes and role, and no hidden counts. */
export function snapshotFor(
  board: LoadedBoard,
  viewerId: string | null,
  now: number,
): BoardSnapshot {
  return {
    state: publicState(board.state, now),
    myVotes: (viewerId && board.votesByUser.get(viewerId)) || {},
    role: roleOf(board, viewerId),
  }
}

export type CommitResult =
  | { ok: true; stateChanged: boolean; myVotes: VoteMap }
  | { ok: false; reason: string }

/**
 * Checks, saves and applies one operation, updating `board` in place. The
 * caller must not run two commits for the same board at once.
 */
export async function commitOperation(
  db: BatchingDb,
  board: LoadedBoard,
  op: Operation,
  actorId: string,
  now: number,
): Promise<CommitResult> {
  const role = roleOf(board, actorId)
  const error = checkOperation(board.state, op, { id: actorId, role }, now)
  if (error) return { ok: false, reason: error }

  try {
    await persistOperation(db, board.state, op, actorId, now)
  } catch (cause) {
    // For example, a decision id that already exists on another board.
    console.error('Failed to save board operation', { op, cause })
    return { ok: false, reason: "Couldn't save that change" }
  }

  // Applied to the full state, so hidden counts stay accurate on the server.
  const next = applyOperation(
    {
      state: board.state,
      myVotes: board.votesByUser.get(actorId) ?? {},
      role,
    },
    op,
    actorId,
    now,
  )
  const stateChanged = next.state !== board.state
  board.state = next.state
  board.votesByUser.set(actorId, next.myVotes)
  if (op.kind === 'deleteDecision') {
    // The database cascade removed everyone's votes, not just the actor's.
    for (const userVotes of board.votesByUser.values()) {
      delete userVotes[op.decisionId]
    }
  }

  return { ok: true, stateChanged, myVotes: next.myVotes }
}

/**
 * Writes an operation that checkOperation has allowed against `before`.
 * Mirrors applyOperation in src/lib/board-sync/reducer.ts, including its
 * no-ops, so the database and the in-memory state stay identical.
 */
async function persistOperation(
  db: BatchingDb,
  before: BoardState,
  op: Operation,
  actorId: string,
  now: number,
) {
  const boardId = before.board.id

  if (op.kind === 'renameBoard') {
    if (before.board.name === op.name) return
    await db.update(boards).set({ name: op.name }).where(eq(boards.id, boardId))
    return
  }

  const decision = before.decisions.find((d) => d.id === op.decisionId)
  const inThisBoard = and(
    eq(decisions.id, op.decisionId),
    eq(decisions.boardId, boardId),
  )

  switch (op.kind) {
    case 'createDecision': {
      if (decision) return
      await db.batch([
        db.insert(decisions).values({
          id: op.decisionId,
          boardId,
          title: op.title,
          createdById: actorId,
          createdAt: new Date(now),
          closesAt: op.closesAt === null ? null : new Date(op.closesAt),
          hideResults: op.hideResults,
        }),
        db.insert(options).values(
          op.options.map((option, position) => ({
            id: option.id,
            decisionId: op.decisionId,
            text: option.text,
            position,
            createdById: actorId,
          })),
        ),
      ])
      return
    }

    case 'renameDecision':
      await db.update(decisions).set({ title: op.title }).where(inThisBoard)
      return

    case 'setDecisionClosed':
      if (!decision) return
      if (op.closed) {
        if (!isDecisionOpen(decision, now)) return
        await db
          .update(decisions)
          .set({ closedAt: new Date(now) })
          .where(inThisBoard)
      } else {
        // Reopening clears the deadline too, or it would close again at once.
        await db
          .update(decisions)
          .set({ closedAt: null, closesAt: null })
          .where(inThisBoard)
      }
      return

    case 'deleteDecision':
      if (!decision) return
      // Options and votes are removed by cascading deletes.
      await db.delete(decisions).where(inThisBoard)
      return

    case 'addOption':
      if (!decision || decision.options.some((o) => o.id === op.optionId)) {
        return
      }
      await db.insert(options).values({
        id: op.optionId,
        decisionId: op.decisionId,
        text: op.text,
        position: decision.options.length,
        createdById: actorId,
      })
      return

    case 'setVote': {
      const mine = and(
        eq(votes.decisionId, op.decisionId),
        eq(votes.userId, actorId),
      )
      if (op.optionId === null) {
        await db.delete(votes).where(mine)
        return
      }
      await db
        .insert(votes)
        .values({
          decisionId: op.decisionId,
          userId: actorId,
          optionId: op.optionId,
        })
        .onConflictDoUpdate({
          target: [votes.decisionId, votes.userId],
          set: { optionId: op.optionId },
        })
      return
    }
  }
}

export type DeleteResult = { ok: true } | { ok: false; reason: string }

/**
 * Deletes a board and everything on it, if `actorId` owns it. Questions,
 * members and invite links go with it through the schema's cascading
 * deletes (options and votes cascade from questions); D1 enforces foreign
 * keys. Only the board's room calls this, so it stays the only writer.
 */
export async function deleteBoard(
  db: BatchingDb,
  boardId: string,
  actorId: string,
): Promise<DeleteResult> {
  const board = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .get()
  if (!board) return { ok: false, reason: 'This board was already deleted' }

  // Editors and voters can't delete it either (see canManageBoard).
  if (board.ownerId !== actorId) {
    return { ok: false, reason: 'Only the board owner can delete it' }
  }

  await db
    .delete(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, actorId)))
  return { ok: true }
}
