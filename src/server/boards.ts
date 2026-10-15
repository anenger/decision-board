import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { getViewer, githubEnabled, requireViewer } from './auth'
import type { Viewer } from './auth'
import type {
  BoardDetails,
  BoardSummary,
  DecisionView,
} from '@/lib/board'
import { db } from '@/db'
import { boards, decisions, options, votes } from '@/db/schema'
import { canEditDecision } from '@/lib/board'

const idSchema = z.string().min(1).max(64)
const titleSchema = z.string().trim().min(1).max(200)
const optionTextSchema = z.string().trim().min(1).max(200)

export const getSessionInfo = createServerFn({ method: 'GET' }).handler(
  async () => ({ viewer: await getViewer(), githubEnabled }),
)

export const listMyBoards = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<BoardSummary>> => {
    const viewer = await getViewer()
    if (!viewer) return []

    const rows = await db
      .select({ id: boards.id, name: boards.name, createdAt: boards.createdAt })
      .from(boards)
      .where(eq(boards.ownerId, viewer.id))
      .orderBy(desc(boards.createdAt))

    return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }))
  },
)

export const getBoard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ boardId: idSchema }))
  .handler(async ({ data }): Promise<BoardDetails | null> => {
    const viewer = await getViewer()
    const viewerId = viewer?.id ?? null
    const onBoard = eq(decisions.boardId, data.boardId)

    const [board, decisionRows, optionRows, voteCounts, myVotes] =
      await db.batch([
        db.select().from(boards).where(eq(boards.id, data.boardId)),
        db
          .select()
          .from(decisions)
          .where(onBoard)
          .orderBy(asc(decisions.createdAt)),
        db
          .select({
            id: options.id,
            decisionId: options.decisionId,
            text: options.text,
          })
          .from(options)
          .innerJoin(decisions, eq(decisions.id, options.decisionId))
          .where(onBoard)
          .orderBy(asc(options.position)),
        db
          .select({ optionId: votes.optionId, votes: count() })
          .from(votes)
          .innerJoin(decisions, eq(decisions.id, votes.decisionId))
          .where(onBoard)
          .groupBy(votes.optionId),
        db
          .select({ optionId: votes.optionId })
          .from(votes)
          .innerJoin(decisions, eq(decisions.id, votes.decisionId))
          .where(and(onBoard, eq(votes.userId, viewerId ?? ''))),
      ])

    const boardRow = board.at(0)
    if (!boardRow) return null

    const votesByOption = new Map(voteCounts.map((r) => [r.optionId, r.votes]))
    const selected = new Set(myVotes.map((r) => r.optionId))

    const decisionViews = decisionRows.map(
      (decision): DecisionView => ({
        id: decision.id,
        title: decision.title,
        canEdit: canEditDecision(viewerId, {
          createdById: decision.createdById,
          ownerId: boardRow.ownerId,
        }),
        options: optionRows
          .filter((option) => option.decisionId === decision.id)
          .map((option) => ({
            id: option.id,
            text: option.text,
            votes: votesByOption.get(option.id) ?? 0,
            isSelected: selected.has(option.id),
          })),
      }),
    )

    return {
      board: {
        id: boardRow.id,
        name: boardRow.name,
        createdAt: boardRow.createdAt.getTime(),
        isOwner: viewerId === boardRow.ownerId,
      },
      decisions: decisionViews,
    }
  })

export const createBoard = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ name: z.string().trim().max(100) }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    const id = crypto.randomUUID()

    await db.insert(boards).values({
      id,
      name: data.name || 'Untitled board',
      ownerId: viewer.id,
    })

    return { id }
  })

export const createDecision = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      boardId: idSchema,
      title: titleSchema,
      options: z.array(optionTextSchema).min(1).max(20),
    }),
  )
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    const board = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, data.boardId))
      .get()
    if (!board) throw new Error('Board not found')

    const decisionId = crypto.randomUUID()
    await db.batch([
      db.insert(decisions).values({
        id: decisionId,
        boardId: data.boardId,
        title: data.title,
        createdById: viewer.id,
      }),
      db.insert(options).values(
        data.options.map((text, position) => ({
          id: crypto.randomUUID(),
          decisionId,
          text,
          position,
          createdById: viewer.id,
        })),
      ),
    ])

    return { id: decisionId }
  })

async function assertCanEditDecision(decisionId: string, viewer: Viewer) {
  const decision = await db
    .select({ createdById: decisions.createdById, ownerId: boards.ownerId })
    .from(decisions)
    .innerJoin(boards, eq(boards.id, decisions.boardId))
    .where(eq(decisions.id, decisionId))
    .get()

  if (!decision) throw new Error('Decision not found')
  if (!canEditDecision(viewer.id, decision)) {
    throw new Error(
      "Only the board owner or the decision's author can change it",
    )
  }
}

export const renameDecision = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ decisionId: idSchema, title: titleSchema }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    await assertCanEditDecision(data.decisionId, viewer)

    await db
      .update(decisions)
      .set({ title: data.title })
      .where(eq(decisions.id, data.decisionId))
  })

export const deleteDecision = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ decisionId: idSchema }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    await assertCanEditDecision(data.decisionId, viewer)

    // Options and votes are removed by cascading deletes.
    await db.delete(decisions).where(eq(decisions.id, data.decisionId))
  })

export const addOption = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ decisionId: idSchema, text: optionTextSchema }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    const decision = await db
      .select({ lastPosition: max(options.position) })
      .from(decisions)
      .leftJoin(options, eq(options.decisionId, decisions.id))
      .where(eq(decisions.id, data.decisionId))
      .groupBy(decisions.id)
      .get()
    if (!decision) throw new Error('Decision not found')

    await db.insert(options).values({
      id: crypto.randomUUID(),
      decisionId: data.decisionId,
      text: data.text,
      position: (decision.lastPosition ?? -1) + 1,
      createdById: viewer.id,
    })
  })

export const vote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ decisionId: idSchema, optionId: idSchema }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    const option = await db
      .select({ id: options.id })
      .from(options)
      .where(
        and(
          eq(options.id, data.optionId),
          eq(options.decisionId, data.decisionId),
        ),
      )
      .get()
    if (!option) throw new Error('Option not found for this decision')

    const myVote = and(
      eq(votes.decisionId, data.decisionId),
      eq(votes.userId, viewer.id),
    )
    const existing = await db
      .select({ optionId: votes.optionId })
      .from(votes)
      .where(myVote)
      .get()

    // Matches applyVote in src/lib/board.ts: same option toggles the vote off.
    if (existing?.optionId === data.optionId) {
      await db.delete(votes).where(myVote)
      return
    }

    await db
      .insert(votes)
      .values({
        decisionId: data.decisionId,
        userId: viewer.id,
        optionId: data.optionId,
      })
      .onConflictDoUpdate({
        target: [votes.decisionId, votes.userId],
        set: { optionId: data.optionId },
      })
  })
