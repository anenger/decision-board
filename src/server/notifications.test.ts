import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { setMemberRole } from './board-access'
import {
  commitOperation,
  loadBoard,
  notifyClosedDecisions,
} from './board-store'
import { moveGuestData } from './guest-data'
import {
  insertCloseNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from './notifications'
import type { LoadedBoard } from './board-store'
import type { Operation } from '@/lib/board-sync/protocol'
import type { TestDb } from '@/db/test-db'
import { boardMembers, boards, notifications, user } from '@/db/schema'
import { createTestDb } from '@/db/test-db'
import { describeNotification } from '@/lib/notifications'

let db: TestDb
const START = 1_700_000_000_000
const DEADLINE = START + 60_000

async function load() {
  const board = await loadBoard(db, 'board')
  if (!board) throw new Error('missing board')
  return board
}

async function commit(
  board: LoadedBoard,
  op: Operation,
  actor: string,
  now: number,
) {
  const result = await commitOperation(db, board, op, actor, now)
  if (!result.ok) throw new Error(result.reason)
  return result
}

function ask(
  decisionId: string,
  { closesAt = null, hideResults = false } = {} as {
    closesAt?: number | null
    hideResults?: boolean
  },
): Operation {
  return {
    kind: 'createDecision',
    decisionId,
    title: 'Lunch?',
    closesAt,
    hideResults,
    options: [
      { id: `${decisionId}-pizza`, text: 'Pizza' },
      { id: `${decisionId}-tacos`, text: 'Tacos' },
    ],
  }
}

const close = (decisionId: string, closed = true): Operation => ({
  kind: 'setDecisionClosed',
  decisionId,
  closed,
})

const vote = (decisionId: string, option: string): Operation => ({
  kind: 'setVote',
  decisionId,
  optionId: `${decisionId}-${option}`,
})

async function recipients() {
  const rows = await db
    .select({ userId: notifications.userId })
    .from(notifications)
  return rows.map((r) => r.userId).sort()
}

beforeEach(async () => {
  db = await createTestDb()
  await db.insert(user).values(
    ['owner', 'editor', 'voter', 'watcher', 'guest'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      isAnonymous: id === 'guest',
    })),
  )
  await db
    .insert(boards)
    .values({ id: 'board', name: 'Offsite', ownerId: 'owner' })
  await db.insert(boardMembers).values([
    { boardId: 'board', userId: 'editor', role: 'editor' },
    { boardId: 'board', userId: 'voter', role: 'voter' },
  ])
})

describe('who gets notified', () => {
  it('notifies everyone on the board but the person who closed it', async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)

    const result = await commit(board, close('lunch'), 'editor', START + 1)

    expect(result.notified.sort()).toEqual(['owner', 'voter'])
    // Watchers aren't members, so they aren't told.
    expect(await recipients()).toEqual(['owner', 'voter'])
  })

  it('notifies everyone, the author included, when the deadline passes', async () => {
    const board = await load()
    await commit(board, ask('lunch', { closesAt: DEADLINE }), 'editor', START)

    expect(await notifyClosedDecisions(db, board, DEADLINE - 1)).toEqual([])
    expect(await recipients()).toEqual([])

    const notified = await notifyClosedDecisions(db, board, DEADLINE)
    expect(notified.sort()).toEqual(['editor', 'owner', 'voter'])
    expect(await recipients()).toEqual(['editor', 'owner', 'voter'])
  })

  it('stops notifying a member once they are removed', async () => {
    // Loaded before the removal, like a room that hasn't refreshed yet:
    // recipients come from the database, not the room's memory.
    const board = await load()
    await commit(board, ask('lunch'), 'owner', START)
    await setMemberRole(db, 'board', 'voter', null)

    await commit(board, close('lunch'), 'owner', START + 1)

    expect(await recipients()).toEqual(['editor'])
  })

  it('writes nothing for a close that was rejected or did nothing', async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)

    const rejected = await commitOperation(
      db,
      board,
      close('lunch'),
      'voter',
      START + 1,
    )
    expect(rejected.ok).toBe(false)

    await commit(board, close('lunch'), 'editor', START + 2)
    // Closing an already-closed question is a no-op, so nobody hears twice.
    const again = await commit(board, close('lunch'), 'owner', START + 3)
    expect(again.notified).toEqual([])
    expect(await recipients()).toEqual(['owner', 'voter'])
  })

  it('removes notifications along with their question', async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)
    await commit(board, close('lunch'), 'editor', START + 1)
    await commit(
      board,
      { kind: 'deleteDecision', decisionId: 'lunch' },
      'editor',
      START + 2,
    )

    expect(await recipients()).toEqual([])
  })
})

describe('no duplicates', () => {
  it('notifies once per close however often the alarm runs', async () => {
    const board = await load()
    await commit(board, ask('lunch', { closesAt: DEADLINE }), 'editor', START)

    await notifyClosedDecisions(db, board, DEADLINE)
    // A retried alarm in the same room...
    expect(await notifyClosedDecisions(db, board, DEADLINE + 5)).toEqual([])
    // ...and after the room restarts and reloads from D1.
    expect(
      await notifyClosedDecisions(db, await load(), DEADLINE + 10),
    ).toEqual([])

    expect(await recipients()).toEqual(['editor', 'owner', 'voter'])
  })

  it("doesn't tell people who joined later about an old close", async () => {
    const board = await load()
    await commit(board, ask('lunch', { closesAt: DEADLINE }), 'editor', START)
    await notifyClosedDecisions(db, board, DEADLINE)

    await db.insert(user).values({
      id: 'late',
      name: 'late',
      email: 'late@example.com',
    })
    await db
      .insert(boardMembers)
      .values({ boardId: 'board', userId: 'late', role: 'voter' })
    await notifyClosedDecisions(db, await load(), DEADLINE + 1)

    expect(await recipients()).not.toContain('late')
  })

  it('ignores a repeated insert for the same close', async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)
    const write = () =>
      insertCloseNotifications(db, {
        boardId: 'board',
        decisionId: 'lunch',
        closedAt: START + 1,
        exceptUserId: null,
        now: START + 1,
      })

    expect(await write()).toHaveLength(3)
    expect(await write()).toEqual([])
    expect(await recipients()).toHaveLength(3)
  })

  it('treats closing again after a reopen as a new close', async () => {
    const board = await load()
    await commit(board, ask('lunch', { closesAt: DEADLINE }), 'editor', START)
    await notifyClosedDecisions(db, board, DEADLINE)
    await commit(board, close('lunch', false), 'editor', DEADLINE + 1)

    const second = await commit(board, close('lunch'), 'owner', DEADLINE + 2)

    expect(second.notified.sort()).toEqual(['editor', 'voter'])
    expect(await recipients()).toEqual([
      'editor',
      'editor',
      'owner',
      'voter',
      'voter',
    ])
  })
})

describe('secret results', () => {
  it('names the winner only while the board shows the results', async () => {
    const board = await load()
    await commit(
      board,
      ask('lunch', { closesAt: DEADLINE, hideResults: true }),
      'editor',
      START,
    )
    await commit(board, vote('lunch', 'tacos'), 'voter', START + 1)
    await commit(board, vote('lunch', 'tacos'), 'owner', START + 2)
    await notifyClosedDecisions(db, board, DEADLINE)

    // Closed, so the board reveals the results, and so can the notification.
    const closed = await listNotifications(db, 'voter', DEADLINE + 1)
    expect(closed.items[0]?.winners).toEqual(['Tacos'])
    expect(describeNotification(closed.items[0])).toEqual({
      headline: 'Voting closed on “Lunch?” in Offsite',
      result: '👑 Tacos won',
    })

    // Reopened: the counts are secret again, so the notification says only
    // that voting closed, and sends nothing about the options.
    await commit(board, close('lunch', false), 'editor', DEADLINE + 2)
    const reopened = await listNotifications(db, 'voter', DEADLINE + 3)
    expect(reopened.items[0]?.winners).toBeNull()
    expect(describeNotification(reopened.items[0])).toEqual({
      headline: 'Voting closed on “Lunch?” in Offsite',
      result: null,
    })
    expect(JSON.stringify(reopened)).not.toMatch(/Tacos|Pizza/)
  })

  it('keeps an old close quiet about results after a later one', async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)
    await commit(board, vote('lunch', 'pizza'), 'voter', START + 1)
    await commit(board, close('lunch'), 'editor', START + 2)
    await commit(board, close('lunch', false), 'editor', START + 3)
    await commit(board, close('lunch'), 'editor', START + 4)

    const { items } = await listNotifications(db, 'owner', START + 5)
    // Newest first: only the current close carries the result.
    expect(items.map((i) => i.winners)).toEqual([['Pizza'], null])
  })

  it('reports ties and questions nobody voted on', async () => {
    const board = await load()
    await commit(board, ask('tie'), 'editor', START)
    await commit(board, vote('tie', 'pizza'), 'voter', START + 1)
    await commit(board, vote('tie', 'tacos'), 'owner', START + 2)
    await commit(board, close('tie'), 'editor', START + 3)
    await commit(board, ask('empty'), 'editor', START + 4)
    await commit(board, close('empty'), 'editor', START + 5)

    const { items } = await listNotifications(db, 'voter', START + 6)
    expect(items.map((i) => describeNotification(i).result)).toEqual([
      'Nobody voted',
      '👑 Tie: Pizza and Tacos',
    ])
  })
})

describe('reading notifications', () => {
  beforeEach(async () => {
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)
    await commit(board, close('lunch'), 'editor', START + 1)
    await commit(board, close('lunch', false), 'editor', START + 2)
    await commit(board, close('lunch'), 'editor', START + 3)
  })

  it("lists only the viewer's own notifications", async () => {
    const voter = await listNotifications(db, 'voter', START + 4)
    const watcher = await listNotifications(db, 'watcher', START + 4)

    expect(voter.unreadCount).toBe(2)
    expect(voter.items).toHaveLength(2)
    expect(watcher).toEqual({ items: [], unreadCount: 0 })

    const voterRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, 'voter'))
    expect(voter.items.map((i) => i.id).sort()).toEqual(
      voterRows.map((r) => r.id).sort(),
    )
  })

  it("can't mark someone else's notifications read", async () => {
    const voterIds = (await listNotifications(db, 'voter', START)).items.map(
      (i) => i.id,
    )

    await markNotificationsRead(db, 'owner', voterIds, START + 5)
    await markAllNotificationsRead(db, 'owner', START + 5)

    expect((await listNotifications(db, 'voter', START)).unreadCount).toBe(2)
    expect((await listNotifications(db, 'owner', START)).unreadCount).toBe(0)
  })

  it('marks one, then all, as read', async () => {
    const [first] = (await listNotifications(db, 'voter', START)).items
    await markNotificationsRead(db, 'voter', [first.id], START + 5)

    const afterOne = await listNotifications(db, 'voter', START + 6)
    expect(afterOne.unreadCount).toBe(1)
    expect(afterOne.items.map((i) => i.isRead)).toEqual([true, false])

    await markAllNotificationsRead(db, 'voter', START + 7)
    expect((await listNotifications(db, 'voter', START + 8)).unreadCount).toBe(
      0,
    )
  })
})

describe('signing in from a guest account', () => {
  it("moves the guest's notifications, without doubling shared ones", async () => {
    await db
      .insert(boardMembers)
      .values({ boardId: 'board', userId: 'guest', role: 'voter' })
    const board = await load()
    await commit(board, ask('lunch'), 'editor', START)
    await commit(board, ask('dinner'), 'editor', START + 1)
    // Both accounts hear about lunch; only the guest hears about dinner.
    await commit(board, close('lunch'), 'editor', START + 2)
    await setMemberRole(db, 'board', 'voter', null)
    await commit(board, close('dinner'), 'editor', START + 3)

    await moveGuestData(db, 'guest', 'voter')
    await db.delete(user).where(eq(user.id, 'guest'))

    const { items } = await listNotifications(db, 'voter', START + 4)
    expect(items.map((i) => i.decisionId)).toEqual(['dinner', 'lunch'])
  })
})
