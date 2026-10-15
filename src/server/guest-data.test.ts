import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { moveGuestData } from './guest-data'
import type { TestDb } from '@/db/test-db'
import * as schema from '@/db/schema'
import { createTestDb } from '@/db/test-db'

const { boards, decisions, options, user, votes } = schema

describe('moveGuestData', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await createTestDb()

    await db.insert(user).values(
      ['guest', 'account', 'other'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
        isAnonymous: id === 'guest',
      })),
    )
    await db.insert(boards).values([
      { id: 'guest-board', name: 'Guest board', ownerId: 'guest' },
      { id: 'other-board', name: 'Other board', ownerId: 'other' },
    ])
    await db.insert(decisions).values([
      {
        id: 'guest-decision',
        boardId: 'guest-board',
        title: 'Lunch?',
        createdById: 'guest',
      },
      {
        id: 'other-decision',
        boardId: 'other-board',
        title: 'Venue?',
        createdById: 'other',
      },
    ])
    await db.insert(options).values([
      {
        id: 'pizza',
        decisionId: 'guest-decision',
        text: 'Pizza',
        position: 0,
        createdById: 'guest',
      },
      {
        id: 'tacos',
        decisionId: 'guest-decision',
        text: 'Tacos',
        position: 1,
        createdById: 'guest',
      },
      {
        id: 'park',
        decisionId: 'other-decision',
        text: 'Park',
        position: 0,
        createdById: 'other',
      },
      {
        id: 'hall',
        decisionId: 'other-decision',
        text: 'Hall',
        position: 1,
        createdById: 'guest',
      },
    ])
    await db.insert(votes).values([
      { decisionId: 'guest-decision', userId: 'guest', optionId: 'pizza' },
      { decisionId: 'other-decision', userId: 'guest', optionId: 'hall' },
      { decisionId: 'other-decision', userId: 'account', optionId: 'park' },
    ])
  })

  it("moves the guest's rows to the account", async () => {
    await moveGuestData(db, 'guest', 'account')

    const board = await db.query.boards.findFirst({
      where: eq(boards.id, 'guest-board'),
    })
    expect(board?.ownerId).toBe('account')

    const decisionAuthors = await db
      .select({ id: decisions.id, createdById: decisions.createdById })
      .from(decisions)
    expect(decisionAuthors).toEqual(
      expect.arrayContaining([
        { id: 'guest-decision', createdById: 'account' },
        { id: 'other-decision', createdById: 'other' },
      ]),
    )

    const optionAuthors = await db
      .select({ id: options.id, createdById: options.createdById })
      .from(options)
    expect(optionAuthors).toEqual(
      expect.arrayContaining([
        { id: 'pizza', createdById: 'account' },
        { id: 'hall', createdById: 'account' },
        { id: 'park', createdById: 'other' },
      ]),
    )
  })

  it("keeps the account's vote where both accounts voted", async () => {
    await moveGuestData(db, 'guest', 'account')

    const remaining = await db.select().from(votes)
    expect(remaining).toHaveLength(2)
    expect(remaining).toEqual(
      expect.arrayContaining([
        { decisionId: 'guest-decision', userId: 'account', optionId: 'pizza' },
        { decisionId: 'other-decision', userId: 'account', optionId: 'park' },
      ]),
    )
  })

  it('leaves nothing for the guest deletion to cascade', async () => {
    await moveGuestData(db, 'guest', 'account')
    await db.delete(user).where(eq(user.id, 'guest'))

    expect(await db.$count(boards)).toBe(2)
    expect(await db.$count(decisions)).toBe(2)
    expect(await db.$count(options)).toBe(4)
    expect(await db.$count(votes)).toBe(2)
  })

  it('loses guest data without the move (guards the cascade assumption)', async () => {
    await db.delete(user).where(eq(user.id, 'guest'))

    expect(await db.$count(boards)).toBe(1)
  })
})
