import { and, desc, eq } from 'drizzle-orm'
import type { BatchingDb } from '@/db/types'
import type { InviteRole, Role } from '@/lib/board-sync/protocol'
import type { BoardSummary } from '@/lib/board'
import { boardInvites, boardMembers, boards, user } from '@/db/schema'
import { higherRole } from '@/lib/board-sync/protocol'

const INVITE_ROLES: Array<InviteRole> = ['voter', 'editor']

/** Unguessable, URL-safe invite token (144 bits). */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export async function getBoardRole(
  db: BatchingDb,
  boardId: string,
  userId: string | null,
): Promise<Role | null> {
  const board = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .get()
  if (!board) return null
  if (userId === null) return 'viewer'
  if (userId === board.ownerId) return 'owner'

  const member = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    )
    .get()
  return member?.role ?? 'viewer'
}

/** The board's invite links, creating any that don't exist yet. */
export async function getOrCreateInvites(db: BatchingDb, boardId: string) {
  await db.batch([
    db
      .insert(boardInvites)
      .values(
        INVITE_ROLES.map((role) => ({ token: newToken(), boardId, role })),
      )
      .onConflictDoNothing(),
  ])
  const rows = await db
    .select({ role: boardInvites.role, token: boardInvites.token })
    .from(boardInvites)
    .where(eq(boardInvites.boardId, boardId))
  return Object.fromEntries(rows.map((r) => [r.role, r.token])) as Record<
    InviteRole,
    string
  >
}

/** Replaces both links, so anyone holding an old one can no longer join. */
export async function resetInvites(db: BatchingDb, boardId: string) {
  await db.batch([
    db.delete(boardInvites).where(eq(boardInvites.boardId, boardId)),
    db
      .insert(boardInvites)
      .values(
        INVITE_ROLES.map((role) => ({ token: newToken(), boardId, role })),
      ),
  ])
  return getOrCreateInvites(db, boardId)
}

/**
 * Joins a board through an invite link. Never demotes: an editor opening a
 * voter link stays an editor, and the owner stays the owner. Returns the
 * resulting role, or null if the link isn't valid for this board.
 */
export async function acceptInvite(
  db: BatchingDb,
  boardId: string,
  token: string,
  userId: string,
): Promise<Role | null> {
  const invite = await db
    .select({ role: boardInvites.role })
    .from(boardInvites)
    .where(
      and(eq(boardInvites.token, token), eq(boardInvites.boardId, boardId)),
    )
    .get()
  if (!invite) return null

  const current = await getBoardRole(db, boardId, userId)
  if (current === null) return null
  if (current === 'owner') return 'owner'

  const role =
    current === 'viewer' ? invite.role : higherRole(current, invite.role)
  await db
    .insert(boardMembers)
    .values({ boardId, userId, role })
    .onConflictDoUpdate({
      target: [boardMembers.boardId, boardMembers.userId],
      set: { role },
    })
  return role
}

export type BoardMember = {
  userId: string
  name: string
  image: string | null
  isGuest: boolean
  role: Role
  /** When they joined; the board's creation time for the owner. */
  joinedAt: number
}

type MemberRow = {
  userId: string
  name: string
  image: string | null
  isAnonymous: boolean | null
  joinedAt: Date
}

/** The owner first, then members in the order they joined. */
export async function listMembers(
  db: BatchingDb,
  boardId: string,
): Promise<Array<BoardMember>> {
  const [owners, members] = (await db.batch([
    db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        isAnonymous: user.isAnonymous,
        joinedAt: boards.createdAt,
      })
      .from(boards)
      .innerJoin(user, eq(user.id, boards.ownerId))
      .where(eq(boards.id, boardId)),
    db
      .select({
        userId: user.id,
        name: user.name,
        image: user.image,
        isAnonymous: user.isAnonymous,
        role: boardMembers.role,
        joinedAt: boardMembers.createdAt,
      })
      .from(boardMembers)
      .innerJoin(user, eq(user.id, boardMembers.userId))
      .where(eq(boardMembers.boardId, boardId))
      .orderBy(boardMembers.createdAt),
  ])) as [Array<MemberRow>, Array<MemberRow & { role: InviteRole }>]

  const toMember = (row: MemberRow, role: Role): BoardMember => ({
    userId: row.userId,
    name: row.name,
    image: row.image,
    isGuest: Boolean(row.isAnonymous),
    role,
    joinedAt: row.joinedAt.getTime(),
  })

  return [
    ...owners.map((row) => toMember(row, 'owner')),
    ...members.map((row) => toMember(row, row.role)),
  ]
}

/** Changes a member's role, or removes them (back to watching) with null. */
export async function setMemberRole(
  db: BatchingDb,
  boardId: string,
  userId: string,
  role: InviteRole | null,
) {
  const mine = and(
    eq(boardMembers.boardId, boardId),
    eq(boardMembers.userId, userId),
  )
  if (role === null) {
    await db.delete(boardMembers).where(mine)
  } else {
    await db.update(boardMembers).set({ role }).where(mine)
  }
}

/** Boards you own or were invited to, newest first. */
export async function listBoardsFor(
  db: BatchingDb,
  userId: string,
): Promise<Array<BoardSummary>> {
  const [owned, joined] = (await db.batch([
    db
      .select({ id: boards.id, name: boards.name, createdAt: boards.createdAt })
      .from(boards)
      .where(eq(boards.ownerId, userId)),
    db
      .select({
        id: boards.id,
        name: boards.name,
        createdAt: boards.createdAt,
        role: boardMembers.role,
      })
      .from(boardMembers)
      .innerJoin(boards, eq(boards.id, boardMembers.boardId))
      .where(eq(boardMembers.userId, userId))
      .orderBy(desc(boards.createdAt)),
  ])) as [
    Array<{ id: string; name: string; createdAt: Date }>,
    Array<{ id: string; name: string; createdAt: Date; role: InviteRole }>,
  ]

  return [...owned.map((b) => ({ ...b, role: 'owner' as const })), ...joined]
    .map((b) => ({ ...b, createdAt: b.createdAt.getTime() }))
    .sort((a, b) => b.createdAt - a.createdAt)
}
