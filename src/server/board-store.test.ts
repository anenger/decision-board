import { beforeEach, describe, expect, it } from 'vitest'
import { commitOperation, loadBoard, snapshotFor } from './board-store'
import type { LoadedBoard } from './board-store'
import type { Operation } from '@/lib/board-sync/protocol'
import type { TestDb } from '@/db/test-db'
import { boardMembers, boards, user } from '@/db/schema'
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
  }
}

function inMemory(board: LoadedBoard) {
  // Users whose votes were all removed are absent after a reload.
  const votes = Object.fromEntries(
    [...board.votesByUser].filter(([, v]) => Object.keys(v).length > 0),
  )
  return {
    state: board.state,
    votes,
    members: Object.fromEntries(board.members),
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
