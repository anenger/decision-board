import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getViewer, githubEnabled, requireViewer } from './auth'
import { loadBoard, snapshotFor } from './board-store'
import { getOrCreateDeviceSeed } from './device'
import type { BoardSummary } from '@/lib/board'
import type { BoardSnapshot } from '@/lib/board-sync/protocol'
import { db } from '@/db'
import { boards } from '@/db/schema'

// Changes to a board's contents go through its BoardRoom Durable Object
// (src/server/board-room.ts); these functions cover reads and accounts.

export const getSessionInfo = createServerFn({ method: 'GET' }).handler(
  async () => ({
    viewer: await getViewer(),
    githubEnabled,
    deviceSeed: getOrCreateDeviceSeed(),
  }),
)

/**
 * Board sockets can't set cookies, so the client calls this before its first
 * change to make sure a (guest) session exists, then reconnects.
 */
export const ensureSession = createServerFn({ method: 'POST' }).handler(
  async () => {
    const viewer = await requireViewer()
    return { viewerId: viewer.id }
  },
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

/** Initial board contents for server rendering, before the socket connects. */
export const getBoard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ boardId: z.string().min(1).max(64) }))
  .handler(async ({ data }): Promise<BoardSnapshot | null> => {
    const [viewer, board] = await Promise.all([
      getViewer(),
      loadBoard(db, data.boardId),
    ])
    return board ? snapshotFor(board, viewer?.id ?? null) : null
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
