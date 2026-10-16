import { beforeEach, describe, expect, it } from 'vitest'
import {
  acceptInvite,
  getBoardRole,
  getOrCreateInvites,
  listBoardsFor,
  listMembers,
  resetInvites,
  setMemberRole,
} from './board-access'
import type { TestDb } from '@/db/test-db'
import { boards, user } from '@/db/schema'
import { createTestDb } from '@/db/test-db'

let db: TestDb

beforeEach(async () => {
  db = await createTestDb()
  await db.insert(user).values(
    ['owner', 'alice', 'bob'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      isAnonymous: id === 'bob',
    })),
  )
  await db.insert(boards).values([
    { id: 'board', name: 'Offsite', ownerId: 'owner' },
    { id: 'other', name: 'Elsewhere', ownerId: 'alice' },
  ])
})

describe('invites', () => {
  it('creates one stable link per role', async () => {
    const first = await getOrCreateInvites(db, 'board')
    const second = await getOrCreateInvites(db, 'board')
    expect(first.voter).toMatch(/^[\w-]{24}$/)
    expect(first.editor).not.toBe(first.voter)
    expect(second).toEqual(first)
  })

  it('joins with the link’s role, and never demotes', async () => {
    const links = await getOrCreateInvites(db, 'board')

    expect(await acceptInvite(db, 'board', links.voter, 'alice')).toBe('voter')
    expect(await acceptInvite(db, 'board', links.editor, 'alice')).toBe(
      'editor',
    )
    // Opening the voter link again keeps the higher role.
    expect(await acceptInvite(db, 'board', links.voter, 'alice')).toBe('editor')
    expect(await getBoardRole(db, 'board', 'alice')).toBe('editor')
  })

  it('leaves the owner as the owner', async () => {
    const links = await getOrCreateInvites(db, 'board')
    expect(await acceptInvite(db, 'board', links.voter, 'owner')).toBe('owner')
    expect(await listMembers(db, 'board')).toHaveLength(1)
  })

  it('rejects links for other boards, and links that were reset', async () => {
    const links = await getOrCreateInvites(db, 'board')
    expect(await acceptInvite(db, 'other', links.voter, 'bob')).toBeNull()

    const fresh = await resetInvites(db, 'board')
    expect(fresh.voter).not.toBe(links.voter)
    expect(await acceptInvite(db, 'board', links.voter, 'bob')).toBeNull()
    expect(await acceptInvite(db, 'board', fresh.voter, 'bob')).toBe('voter')
  })
})

describe('members', () => {
  it('lists the owner first, then members, and changes roles', async () => {
    const links = await getOrCreateInvites(db, 'board')
    await acceptInvite(db, 'board', links.voter, 'alice')
    await acceptInvite(db, 'board', links.voter, 'bob')

    expect(
      (await listMembers(db, 'board')).map((m) => [
        m.userId,
        m.role,
        m.isGuest,
      ]),
    ).toEqual([
      ['owner', 'owner', false],
      ['alice', 'voter', false],
      ['bob', 'voter', true],
    ])

    await setMemberRole(db, 'board', 'alice', 'editor')
    await setMemberRole(db, 'board', 'bob', null)
    expect(await getBoardRole(db, 'board', 'alice')).toBe('editor')
    expect(await getBoardRole(db, 'board', 'bob')).toBe('viewer')
  })

  it('treats everyone else as a viewer, and unknown boards as missing', async () => {
    expect(await getBoardRole(db, 'board', 'bob')).toBe('viewer')
    expect(await getBoardRole(db, 'board', null)).toBe('viewer')
    expect(await getBoardRole(db, 'nope', 'bob')).toBeNull()
  })

  it('lists boards you own or joined, with your role', async () => {
    const links = await getOrCreateInvites(db, 'board')
    await acceptInvite(db, 'board', links.editor, 'alice')

    const mine = await listBoardsFor(db, 'alice')
    expect(mine.map((b) => [b.id, b.role]).sort()).toEqual([
      ['board', 'editor'],
      ['other', 'owner'],
    ])
    expect(await listBoardsFor(db, 'bob')).toEqual([])
  })
})
