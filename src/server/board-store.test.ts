import { beforeEach, describe, expect, it } from 'vitest'
import { count, eq, inArray } from 'drizzle-orm'
import {
  acceptInvite,
  getBoardRole,
  getOrCreateInvites,
  listBoardsFor,
} from './board-access'
import {
  commitOperation,
  deleteBoard,
  loadBoard,
  snapshotFor,
} from './board-store'
import type { LoadedBoard } from './board-store'
import type { Operation } from '@/lib/board-sync/protocol'
import type { TestDb } from '@/db/test-db'
import {
  boardInvites,
  boardMembers,
  boards,
  decisions,
  options,
  user,
  votes,
} from '@/db/schema'
import { createTestDb } from '@/db/test-db'

let db: TestDb
let clock = 1_700_000_000_000

async function load(boardId = 'board') {
  const board = await loadBoard(db, boardId)
  if (!board) throw new Error(`missing ${boardId}`)
  return board
}

function commit(board: LoadedBoard, op: Operation, actor: string) {
  clock += 1_000
  return commitOperation(db, board, op, actor, clock)
}

/** What a fresh load sees, in the same shape as the in-memory board. */
async function reloaded(boardId = 'board') {
  const board = await load(boardId)
  return {
    state: board.state,
    votes: Object.fromEntries(board.votesByUser),
    members: Object.fromEntries(board.members),
    notifiedCloseAt: Object.fromEntries(board.notifiedCloseAt),
  }
}

function inMemory(board: LoadedBoard) {
  // Users whose votes were all removed are absent after a reload.
  const nonEmptyVotes = Object.fromEntries(
    [...board.votesByUser].filter(([, v]) => Object.keys(v).length > 0),
  )
  return {
    state: board.state,
    votes: nonEmptyVotes,
    members: Object.fromEntries(board.members),
    notifiedCloseAt: Object.fromEntries(board.notifiedCloseAt),
  }
}

beforeEach(async () => {
  db = await createTestDb()
  await db.insert(user).values(
    ['owner', 'alice', 'bob'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
    })),
  )
  await db.insert(boards).values([
    { id: 'board', name: 'Offsite', ownerId: 'owner' },
    { id: 'other-board', name: 'Elsewhere', ownerId: 'owner' },
  ])
  await db.insert(boardMembers).values(
    ['board', 'other-board'].flatMap((boardId) =>
      ['alice', 'bob'].map((userId) => ({
        boardId,
        userId,
        role: 'editor' as const,
      })),
    ),
  )
})

describe('commitOperation', () => {
  it('keeps memory and the database identical through a mixed session', async () => {
    const board = await load()
    const steps: Array<[Operation, string]> = [
      [
        {
          kind: 'createDecision',
          decisionId: 'lunch',
          title: 'Lunch?',
          closesAt: null,
          hideResults: false,
          options: [
            { id: 'pizza', text: 'Pizza' },
            { id: 'tacos', text: 'Tacos' },
          ],
        },
        'alice',
      ],
      [
        {
          kind: 'createDecision',
          decisionId: 'venue',
          title: 'Venue?',
          closesAt: null,
          hideResults: false,
          options: [{ id: 'park', text: 'Park' }],
        },
        'bob',
      ],
      [
        {
          kind: 'addOption',
          decisionId: 'lunch',
          optionId: 'sushi',
          text: 'Sushi',
        },
        'bob',
      ],
      [{ kind: 'setVote', decisionId: 'lunch', optionId: 'pizza' }, 'alice'],
      [{ kind: 'setVote', decisionId: 'lunch', optionId: 'sushi' }, 'bob'],
      [{ kind: 'setVote', decisionId: 'lunch', optionId: 'tacos' }, 'alice'],
      [{ kind: 'setVote', decisionId: 'venue', optionId: 'park' }, 'alice'],
      [
        { kind: 'renameDecision', decisionId: 'lunch', title: 'Dinner?' },
        'owner',
      ],
      [{ kind: 'setVote', decisionId: 'lunch', optionId: null }, 'bob'],
      [{ kind: 'deleteDecision', decisionId: 'venue' }, 'bob'],
    ]

    for (const [op, actor] of steps) {
      const result = await commit(board, op, actor)
      expect(result, `${op.kind} by ${actor}`).toMatchObject({ ok: true })
      expect(await reloaded()).toEqual(inMemory(board))
    }

    expect(board.state.decisions.map((d) => [d.id, d.title])).toEqual([
      ['lunch', 'Dinner?'],
    ])
    expect(
      board.state.decisions[0]?.options.map((o) => [o.id, o.votes]),
    ).toEqual([
      ['pizza', 0],
      ['tacos', 1],
      ['sushi', 0],
    ])
  })

  it('treats replayed operations as no-ops', async () => {
    const board = await load()
    const create: Operation = {
      kind: 'createDecision',
      decisionId: 'lunch',
      title: 'Lunch?',
      closesAt: null,
      hideResults: false,
      options: [{ id: 'pizza', text: 'Pizza' }],
    }
    const vote: Operation = {
      kind: 'setVote',
      decisionId: 'lunch',
      optionId: 'pizza',
    }

    for (const op of [create, vote, create, vote]) {
      expect(await commit(board, op, 'alice')).toMatchObject({ ok: true })
    }
    expect(board.state.decisions).toHaveLength(1)
    expect(board.state.decisions[0]?.options[0]?.votes).toBe(1)
    expect(await reloaded()).toEqual(inMemory(board))
  })

  it("rejects edits by people who don't own the decision, without writing", async () => {
    const board = await load()
    await commit(
      board,
      {
        kind: 'createDecision',
        decisionId: 'lunch',
        title: 'Lunch?',
        closesAt: null,
        hideResults: false,
        options: [{ id: 'pizza', text: 'Pizza' }],
      },
      'alice',
    )

    const rename = await commit(
      board,
      { kind: 'renameDecision', decisionId: 'lunch', title: 'Hacked' },
      'bob',
    )
    const remove = await commit(
      board,
      { kind: 'deleteDecision', decisionId: 'lunch' },
      'bob',
    )

    expect(rename).toMatchObject({ ok: false })
    expect(remove).toMatchObject({ ok: false })
    expect((await reloaded()).state.decisions.map((d) => d.title)).toEqual([
      'Lunch?',
    ])
  })

  it("can't reach into another board with a reused id", async () => {
    const other = await load('other-board')
    await commit(
      other,
      {
        kind: 'createDecision',
        decisionId: 'secret',
        title: 'Other board decision',
        closesAt: null,
        hideResults: false,
        options: [{ id: 'secret-option', text: 'x' }],
      },
      'owner',
    )

    const board = await load()
    const hijack = await commit(
      board,
      {
        kind: 'createDecision',
        decisionId: 'secret',
        title: 'Collides',
        closesAt: null,
        hideResults: false,
        options: [{ id: 'fresh', text: 'x' }],
      },
      'bob',
    )
    const vote = await commit(
      board,
      { kind: 'setVote', decisionId: 'secret', optionId: 'secret-option' },
      'bob',
    )

    expect(hijack).toEqual({ ok: false, reason: "Couldn't save that change" })
    expect(vote).toMatchObject({ ok: false })
    expect(board.state.decisions).toEqual([])
    expect((await reloaded('other-board')).state.decisions[0]?.title).toBe(
      'Other board decision',
    )
  })
})

describe('commitOperation roles and deadlines', () => {
  it('lets viewers watch but not vote', async () => {
    await db.insert(user).values({
      id: 'carol',
      name: 'carol',
      email: 'carol@example.com',
    })
    const board = await load()
    await commit(
      board,
      {
        kind: 'createDecision',
        decisionId: 'lunch',
        title: 'Lunch?',
        options: [{ id: 'pizza', text: 'Pizza' }],
        closesAt: null,
        hideResults: false,
      },
      'alice',
    )
    const vote = await commit(
      board,
      { kind: 'setVote', decisionId: 'lunch', optionId: 'pizza' },
      'carol',
    )
    expect(vote).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/watching/),
    })
    expect(snapshotFor(board, 'carol', clock).role).toBe('viewer')
  })

  it('saves deadlines, hidden results and closing, and reloads them', async () => {
    const board = await load()
    const steps: Array<[Operation, string]> = [
      [
        {
          kind: 'createDecision',
          decisionId: 'secret',
          title: 'Secret ballot',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
          ],
          closesAt: clock + 60 * 60 * 1000,
          hideResults: true,
        },
        'alice',
      ],
      [{ kind: 'setVote', decisionId: 'secret', optionId: 'yes' }, 'bob'],
      [{ kind: 'setVote', decisionId: 'secret', optionId: 'yes' }, 'owner'],
      [
        { kind: 'setDecisionClosed', decisionId: 'secret', closed: true },
        'alice',
      ],
    ]
    for (const [op, actor] of steps) {
      expect(await commit(board, op, actor), op.kind).toMatchObject({
        ok: true,
      })
      expect(await reloaded()).toEqual(inMemory(board))
    }

    const reopened = await commit(
      board,
      { kind: 'setDecisionClosed', decisionId: 'secret', closed: false },
      'owner',
    )
    expect(reopened).toMatchObject({ ok: true })
    expect(await reloaded()).toEqual(inMemory(board))
    expect(board.state.decisions[0]).toMatchObject({
      closesAt: null,
      closedAt: null,
    })
  })

  it('keeps hidden counts accurate on the server while clients see none', async () => {
    const board = await load()
    await commit(
      board,
      {
        kind: 'createDecision',
        decisionId: 'secret',
        title: 'Secret ballot',
        options: [{ id: 'yes', text: 'Yes' }],
        closesAt: clock + 60 * 60 * 1000,
        hideResults: true,
      },
      'alice',
    )
    await commit(
      board,
      { kind: 'setVote', decisionId: 'secret', optionId: 'yes' },
      'bob',
    )

    expect(board.state.decisions[0]?.options[0]?.votes).toBe(1)
    const seen = snapshotFor(board, 'bob', clock).state.decisions[0]
    expect(seen.options[0]?.votes).toBeNull()
    expect(seen.totalVotes).toBe(1)
    expect(
      snapshotFor(board, 'bob', clock + 2 * 60 * 60 * 1000).state.decisions[0]
        ?.options[0]?.votes,
    ).toBe(1)
  })
})

describe('renaming a board', () => {
  const rename = (name: string): Operation => ({ kind: 'renameBoard', name })

  it('saves the owner’s new name, which the boards list then shows', async () => {
    const board = await load()
    expect(await commit(board, rename('Team retreat'), 'owner')).toEqual({
      ok: true,
      stateChanged: true,
      myVotes: {},
      notified: [],
    })
    expect(await reloaded()).toEqual(inMemory(board))
    expect(board.state.board.name).toBe('Team retreat')
    expect(
      (await listBoardsFor(db, 'alice')).find((b) => b.id === 'board')?.name,
    ).toBe('Team retreat')
    // Other boards keep their names.
    expect((await reloaded('other-board')).state.board.name).toBe('Elsewhere')
  })

  it('refuses editors, without writing', async () => {
    const board = await load()
    const result = await commit(board, rename('Hacked'), 'alice')
    expect(result).toEqual({
      ok: false,
      reason: 'Only the board owner can rename it',
    })
    expect((await reloaded()).state.board.name).toBe('Offsite')
  })

  it('treats a replayed rename as a no-op', async () => {
    const board = await load()
    await commit(board, rename('Retreat'), 'owner')
    expect(await commit(board, rename('Retreat'), 'owner')).toMatchObject({
      ok: true,
      stateChanged: false,
    })
    expect(await reloaded()).toEqual(inMemory(board))
  })
})

describe('deleting a board', () => {
  /** A board with something in every table that hangs off it. */
  async function fillBoard(boardId: string) {
    const board = await load(boardId)
    const ok = { ok: true }
    expect(
      await commit(
        board,
        {
          kind: 'createDecision',
          decisionId: `${boardId}-lunch`,
          title: 'Lunch?',
          options: [
            { id: `${boardId}-pizza`, text: 'Pizza' },
            { id: `${boardId}-tacos`, text: 'Tacos' },
          ],
          closesAt: clock + 60 * 60 * 1000,
          hideResults: false,
        },
        'alice',
      ),
    ).toMatchObject(ok)
    for (const [actor, option] of [
      ['alice', 'pizza'],
      ['bob', 'tacos'],
    ] as const) {
      expect(
        await commit(
          board,
          {
            kind: 'setVote',
            decisionId: `${boardId}-lunch`,
            optionId: `${boardId}-${option}`,
          },
          actor,
        ),
      ).toMatchObject(ok)
    }
    return getOrCreateInvites(db, boardId)
  }

  async function rowsFor(boardId: string) {
    const decisionIds = (
      await db
        .select({ id: decisions.id })
        .from(decisions)
        .where(eq(decisions.boardId, boardId))
    ).map((d) => d.id)
    // Count every option and vote too, so orphans would show up.
    const [[b], [d], [o], [v], [m], [i]] = await Promise.all([
      db.select({ n: count() }).from(boards).where(eq(boards.id, boardId)),
      db
        .select({ n: count() })
        .from(decisions)
        .where(eq(decisions.boardId, boardId)),
      db
        .select({ n: count() })
        .from(options)
        .where(inArray(options.id, [`${boardId}-pizza`, `${boardId}-tacos`])),
      db
        .select({ n: count() })
        .from(votes)
        .where(eq(votes.decisionId, `${boardId}-lunch`)),
      db
        .select({ n: count() })
        .from(boardMembers)
        .where(eq(boardMembers.boardId, boardId)),
      db
        .select({ n: count() })
        .from(boardInvites)
        .where(eq(boardInvites.boardId, boardId)),
    ])
    return {
      boards: b.n,
      decisions: d.n,
      options: o.n,
      votes: v.n,
      members: m.n,
      invites: i.n,
      decisionIds,
    }
  }

  it('is for the owner only', async () => {
    await fillBoard('board')
    for (const actor of ['alice', 'bob', 'stranger']) {
      expect(await deleteBoard(db, 'board', actor), actor).toEqual({
        ok: false,
        reason: 'Only the board owner can delete it',
      })
    }
    expect(await loadBoard(db, 'board')).not.toBeNull()
  })

  it('removes the board and every row under it, and nothing else', async () => {
    await fillBoard('board')
    await fillBoard('other-board')
    const before = await rowsFor('board')
    expect(before).toMatchObject({
      boards: 1,
      decisions: 1,
      options: 2,
      votes: 2,
      members: 2,
      invites: 2,
    })

    expect(await deleteBoard(db, 'board', 'owner')).toEqual({ ok: true })

    expect(await rowsFor('board')).toEqual({
      boards: 0,
      decisions: 0,
      options: 0,
      votes: 0,
      members: 0,
      invites: 0,
      decisionIds: [],
    })
    expect(await rowsFor('other-board')).toEqual({
      ...before,
      decisionIds: ['other-board-lunch'],
    })
  })

  it('refuses invites, links and stale changes to a deleted board', async () => {
    const links = await fillBoard('board')
    const stale = await load()
    await db.insert(user).values({
      id: 'carol',
      name: 'carol',
      email: 'carol@example.com',
    })
    await deleteBoard(db, 'board', 'owner')

    // The board's page, and the room on its next connection, find nothing.
    expect(await loadBoard(db, 'board')).toBeNull()
    expect(await getBoardRole(db, 'board', 'carol')).toBeNull()
    expect(await acceptInvite(db, 'board', links.voter, 'carol')).toBeNull()
    expect(await acceptInvite(db, 'board', links.editor, 'alice')).toBeNull()
    expect(await listBoardsFor(db, 'alice')).toEqual([
      expect.objectContaining({ id: 'other-board' }),
    ])

    // A change replayed against an old copy can't bring any of it back.
    const replay = await commit(
      stale,
      {
        kind: 'createDecision',
        decisionId: 'zombie',
        title: 'Back from the dead?',
        options: [{ id: 'zombie-yes', text: 'Yes' }],
        closesAt: null,
        hideResults: false,
      },
      'owner',
    )
    expect(replay).toEqual({ ok: false, reason: "Couldn't save that change" })
    expect(await loadBoard(db, 'board')).toBeNull()

    // Deleting again is refused cleanly rather than throwing.
    expect(await deleteBoard(db, 'board', 'owner')).toEqual({
      ok: false,
      reason: 'This board was already deleted',
    })
  })
})
