import { and, asc, eq } from 'drizzle-orm'
import { closeTimeOf, insertCloseNotifications } from './notifications'
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
  /** Decision id → the close its members were last notified about. */
  notifiedCloseAt: Map<string, number>
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
    notifiedCloseAt: new Map(
      decisionRows.flatMap((d) =>
        d.notifiedCloseAt ? [[d.id, d.notifiedCloseAt.getTime()]] : [],
      ),
    ),
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
  | {
      ok: true
      stateChanged: boolean
      myVotes: VoteMap
      /** People who got a new notification from this change. */
      notified: Array<string>
    }
  | { ok: false; reason: string }

/** A close that members were told about in the same write. */
type Notified = { decisionId: string; closedAt: number; userIds: Array<string> }

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

  let notified: Notified | null
  try {
    notified = await persistOperation(
      db,
      board.state,
      board.notifiedCloseAt,
      op,
      actorId,
      now,
    )
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
    board.notifiedCloseAt.delete(op.decisionId)
  }
  if (notified)
    board.notifiedCloseAt.set(notified.decisionId, notified.closedAt)

  return {
    ok: true,
    stateChanged,
    myVotes: next.myVotes,
    notified: notified?.userIds ?? [],
  }
}

/**
 * Notifies members about questions that closed without anyone closing them,
 * i.e. their deadline passed. Each close is notified once, even if this runs
 * again after a failure or a retried alarm. Returns who got a notification.
 */
export async function notifyClosedDecisions(
  db: BatchingDb,
  board: LoadedBoard,
  now: number,
): Promise<Array<string>> {
  const boardId = board.state.board.id
  const due = board.state.decisions.flatMap((decision) => {
    const closedAt = closeTimeOf(decision, now)
    return closedAt !== null &&
      board.notifiedCloseAt.get(decision.id) !== closedAt
      ? [{ decisionId: decision.id, closedAt }]
      : []
  })
  if (due.length === 0) return []

  const [first, ...rest] = due.flatMap((close) =>
    closeWrites(db, boardId, close.decisionId, close.closedAt, null, now),
  )
  const results = (await db.batch([first, ...rest])) as Array<unknown>
  for (const close of due) {
    board.notifiedCloseAt.set(close.decisionId, close.closedAt)
  }
  return uniqueRecipients(results)
}

/**
 * Records that a close was notified and notifies everyone else on the board,
 * as two statements to run in one batch (a single transaction in D1).
 */
function closeWrites(
  db: BatchingDb,
  boardId: string,
  decisionId: string,
  closedAt: number,
  closedBy: string | null,
  now: number,
) {
  return [
    db
      .update(decisions)
      .set({ notifiedCloseAt: new Date(closedAt) })
      .where(and(eq(decisions.id, decisionId), eq(decisions.boardId, boardId))),
    insertCloseNotifications(db, {
      boardId,
      decisionId,
      closedAt,
      exceptUserId: closedBy,
      now,
    }),
  ] as const
}

/** The user ids returned by the notification inserts in a batch. */
function uniqueRecipients(results: Array<unknown>) {
  const userIds = new Set<string>()
  for (const result of results) {
    if (!Array.isArray(result)) continue
    for (const row of result as Array<{ userId?: unknown }>) {
      if (typeof row.userId === 'string') userIds.add(row.userId)
    }
  }
  return [...userIds]
}

/**
 * Writes an operation that checkOperation has allowed against `before`.
 * Mirrors applyOperation in src/lib/board-sync/reducer.ts, including its
 * no-ops, so the database and the in-memory state stay identical.
 */
async function persistOperation(
  db: BatchingDb,
  before: BoardState,
  notifiedCloseAt: ReadonlyMap<string, number>,
  op: Operation,
  actorId: string,
  now: number,
): Promise<Notified | null> {
  const boardId = before.board.id

  if (op.kind === 'renameBoard') {
    if (before.board.name === op.name) return null
    await db.update(boards).set({ name: op.name }).where(eq(boards.id, boardId))
    return null
  }

  const decision = before.decisions.find((d) => d.id === op.decisionId)
  const inThisBoard = and(
    eq(decisions.id, op.decisionId),
    eq(decisions.boardId, boardId),
  )

  switch (op.kind) {
    case 'createDecision': {
      if (decision) return null
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
      return null
    }

    case 'renameDecision':
      await db.update(decisions).set({ title: op.title }).where(inThisBoard)
      return null

    case 'setDecisionClosed': {
      if (!decision) return null
      if (!op.closed) {
        // Reopening clears the deadline too, or it would close again at once.
        const reopen = db
          .update(decisions)
          .set({ closedAt: null, closesAt: null })
          .where(inThisBoard)
        // A deadline that passed before its alarm ran hasn't been announced,
        // and once the deadline is cleared nothing will find it again. So
        // announce it in the same write, to everyone but the person
        // reopening it.
        const missed = closeTimeOf(decision, now)
        if (missed === null || notifiedCloseAt.get(op.decisionId) === missed) {
          await reopen
          return null
        }
        const [, notified] = (await db.batch([
          ...closeWrites(db, boardId, op.decisionId, missed, actorId, now),
          reopen,
        ])) as [unknown, Array<{ userId: string }>, unknown]
        return {
          decisionId: op.decisionId,
          closedAt: missed,
          userIds: notified.map((row) => row.userId),
        }
      }
      if (!isDecisionOpen(decision, now)) return null
      // Closing and notifying commit together, or not at all.
      const [, , notified] = (await db.batch([
        db
          .update(decisions)
          .set({ closedAt: new Date(now) })
          .where(inThisBoard),
        ...closeWrites(db, boardId, op.decisionId, now, actorId, now),
      ])) as [unknown, unknown, Array<{ userId: string }>]
      return {
        decisionId: op.decisionId,
        closedAt: now,
        userIds: notified.map((row) => row.userId),
      }
    }

    case 'deleteDecision':
      if (!decision) return null
      // Options and votes are removed by cascading deletes.
      await db.delete(decisions).where(inThisBoard)
      return null

    case 'addOption':
      if (!decision || decision.options.some((o) => o.id === op.optionId)) {
        return null
      }
      await db.insert(options).values({
        id: op.optionId,
        decisionId: op.decisionId,
        text: op.text,
        position: decision.options.length,
        createdById: actorId,
      })
      return null

    case 'setVote': {
      const mine = and(
        eq(votes.decisionId, op.decisionId),
        eq(votes.userId, actorId),
      )
      if (op.optionId === null) {
        await db.delete(votes).where(mine)
        return null
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
      return null
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
