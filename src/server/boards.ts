import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { getServerByName } from 'partyserver'
import { z } from 'zod'
import { getViewer, githubEnabled, requireViewer } from './auth'
import {
  acceptInvite,
  getBoardRole,
  getOrCreateInvites,
  listBoardsFor,
  listMembers,
  resetInvites,
  setMemberRole,
} from './board-access'
import { loadBoard, snapshotFor } from './board-store'
import { getOrCreateDeviceSeed } from './device'
import type { BoardMember } from './board-access'
import type { BoardSummary } from '@/lib/board'
import type { BoardSnapshot, InviteRole, Role } from '@/lib/board-sync/protocol'
import { db } from '@/db'
import { boards } from '@/db/schema'
import { LIMITS, hasRole } from '@/lib/board-sync/protocol'

// Changes to a board's contents go through its BoardRoom Durable Object
// (src/server/board-room.ts); these functions cover reads, accounts and
// who may do what.

const boardIdSchema = z.uuid()

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
    return viewer ? listBoardsFor(db, viewer.id) : []
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
    return board ? snapshotFor(board, viewer?.id ?? null, Date.now()) : null
  })

export const createBoard = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ name: z.string().trim().max(LIMITS.boardNameLength) }),
  )
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

/**
 * Joins a board from an invite link. Called from the browser after the page
 * loads, so link previews and crawlers don't become members.
 */
export const acceptBoardInvite = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ boardId: boardIdSchema, token: z.string().min(8).max(64) }),
  )
  .handler(async ({ data }): Promise<{ role: Role }> => {
    const viewer = await requireViewer()
    const role = await acceptInvite(db, data.boardId, data.token, viewer.id)
    if (role === null) {
      const exists = (await getBoardRole(db, data.boardId, null)) !== null
      throw new Error(
        exists
          ? 'This invite link has been reset. Ask for a new one to join in.'
          : 'This board was deleted.',
      )
    }
    await refreshRoom(data.boardId)
    return { role }
  })

export type BoardSharing = {
  role: Role
  /** Editors only get the voter link; owners get both. */
  invites: Partial<Record<InviteRole, string>>
  members: Array<BoardMember>
}

export const getBoardSharing = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ boardId: boardIdSchema }))
  .handler(async ({ data }): Promise<BoardSharing> => {
    const viewer = await getViewer()
    const role = await requireRole(data.boardId, viewer?.id ?? null, 'editor')
    const [invites, members] = await Promise.all([
      getOrCreateInvites(db, data.boardId),
      listMembers(db, data.boardId),
    ])
    return {
      role,
      invites: role === 'owner' ? invites : { voter: invites.voter },
      members,
    }
  })

export const resetBoardInvites = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ boardId: boardIdSchema }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    await requireRole(data.boardId, viewer.id, 'owner')
    return resetInvites(db, data.boardId)
  })

export const updateMemberRole = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      boardId: boardIdSchema,
      userId: z.string().min(1).max(64),
      role: z.enum(['editor', 'voter']).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const viewer = await requireViewer()
    await requireRole(data.boardId, viewer.id, 'owner')
    if (data.userId === viewer.id) {
      throw new Error("You can't change your own role")
    }
    await setMemberRole(db, data.boardId, data.userId, data.role)
    await refreshRoom(data.boardId)
  })

/**
 * Deletes a board for good. Renaming goes over the board's socket like any
 * other change; deleting goes through the room too, but waits for the
 * answer so the owner only sees it gone once it really is.
 */
export const deleteBoard = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ boardId: boardIdSchema }))
  .handler(async ({ data }) => {
    // No session means not the owner; don't make a guest account to say so.
    const viewer = await getViewer()
    if (!viewer) throw new Error('Only the board owner can delete it')
    const room = await getServerByName(env.BOARD_ROOM, data.boardId)
    const result = await room.deleteBoard(viewer.id)
    if (!result.ok) throw new Error(result.reason)
  })

async function requireRole(
  boardId: string,
  userId: string | null,
  atLeast: Role,
): Promise<Role> {
  const role = await getBoardRole(db, boardId, userId)
  if (role === null) throw new Error('Board not found')
  if (!hasRole(role, atLeast)) {
    throw new Error(
      atLeast === 'owner'
        ? 'Only the board owner can do that'
        : 'Only editors and the owner can share this board',
    )
  }
  return role
}

/** Tells the board's open tabs that access changed. */
async function refreshRoom(boardId: string) {
  const room = await getServerByName(env.BOARD_ROOM, boardId)
  await room.refreshAccess()
}
