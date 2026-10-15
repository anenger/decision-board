import { describe, expect, it } from 'vitest'
import { applyOperation, checkOperation, toBoardDetails } from './reducer'
import type { BoardSnapshot, Operation } from './protocol'

const NOW = 1_700_000_000_000

function makeSnapshot(): BoardSnapshot {
  return {
    state: {
      board: { id: 'b1', name: 'Offsite', ownerId: 'owner', createdAt: NOW },
      decisions: [
        {
          id: 'd1',
          title: 'Lunch?',
          createdById: 'author',
          createdAt: NOW,
          options: [
            { id: 'pizza', text: 'Pizza', votes: 2 },
            { id: 'tacos', text: 'Tacos', votes: 1 },
          ],
        },
      ],
    },
    myVotes: {},
  }
}

const apply = (snapshot: BoardSnapshot, op: Operation, actor = 'author') =>
  applyOperation(snapshot, op, actor, NOW)

const counts = (snapshot: BoardSnapshot) =>
  snapshot.state.decisions[0]?.options.map((o) => [o.id, o.votes])

describe('checkOperation permissions', () => {
  const { state } = makeSnapshot()
  const rename: Operation = {
    kind: 'renameDecision',
    decisionId: 'd1',
    title: 'Dinner?',
  }
  const remove: Operation = { kind: 'deleteDecision', decisionId: 'd1' }

  it('lets the owner and the author rename or delete a decision', () => {
    for (const actor of ['owner', 'author']) {
      expect(checkOperation(state, rename, actor)).toBeNull()
      expect(checkOperation(state, remove, actor)).toBeNull()
    }
  })

  it('stops anyone else from renaming or deleting it', () => {
    expect(checkOperation(state, rename, 'stranger')).toMatch(/Only the board/)
    expect(checkOperation(state, remove, 'stranger')).toMatch(/Only the board/)
  })

  it('lets anyone vote and add options', () => {
    expect(
      checkOperation(
        state,
        { kind: 'setVote', decisionId: 'd1', optionId: 'pizza' },
        'stranger',
      ),
    ).toBeNull()
    expect(
      checkOperation(
        state,
        { kind: 'addOption', decisionId: 'd1', optionId: 'o3', text: 'Sushi' },
        'stranger',
      ),
    ).toBeNull()
  })

  it('rejects votes for options that are not on the decision', () => {
    expect(
      checkOperation(
        state,
        { kind: 'setVote', decisionId: 'd1', optionId: 'other-board-option' },
        'author',
      ),
    ).toMatch(/no longer exists/)
  })

  it("rejects reusing another user's decision id", () => {
    const create: Operation = {
      kind: 'createDecision',
      decisionId: 'd1',
      title: 'Hijack',
      options: [{ id: 'x', text: 'x' }],
    }
    expect(checkOperation(state, create, 'stranger')).toMatch(/taken/)
    // ...but a replay of the author's own create is fine.
    expect(checkOperation(state, create, 'author')).toBeNull()
  })

  it('treats deleting a missing decision as already done', () => {
    expect(
      checkOperation(
        state,
        { kind: 'deleteDecision', decisionId: 'gone' },
        'stranger',
      ),
    ).toBeNull()
  })
})

describe('applyOperation votes', () => {
  it('casts, moves and clears a vote with matching counts', () => {
    const cast = apply(makeSnapshot(), {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'tacos',
    })
    expect(counts(cast)).toEqual([
      ['pizza', 2],
      ['tacos', 2],
    ])
    expect(cast.myVotes).toEqual({ d1: 'tacos' })

    const moved = apply(cast, {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'pizza',
    })
    expect(counts(moved)).toEqual([
      ['pizza', 3],
      ['tacos', 1],
    ])

    const cleared = apply(moved, {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: null,
    })
    expect(counts(cleared)).toEqual([
      ['pizza', 2],
      ['tacos', 1],
    ])
    expect(cleared.myVotes).toEqual({})
  })
})

describe('applyOperation idempotency', () => {
  // A change can be confirmed by the server and still pending locally, so
  // applying it twice must equal applying it once.
  const ops: Array<Operation> = [
    {
      kind: 'createDecision',
      decisionId: 'd2',
      title: 'Venue?',
      options: [{ id: 'park', text: 'Park' }],
    },
    { kind: 'renameDecision', decisionId: 'd1', title: 'Dinner?' },
    { kind: 'deleteDecision', decisionId: 'd1' },
    { kind: 'addOption', decisionId: 'd1', optionId: 'sushi', text: 'Sushi' },
    { kind: 'setVote', decisionId: 'd1', optionId: 'pizza' },
    { kind: 'setVote', decisionId: 'd1', optionId: null },
  ]

  for (const op of ops) {
    it(`${op.kind}${'optionId' in op && op.optionId === null ? ' (clear)' : ''}`, () => {
      const once = apply(makeSnapshot(), op)
      expect(apply(once, op)).toEqual(once)
    })
  }

  it('does not mutate its input', () => {
    const snapshot = makeSnapshot()
    const before = structuredClone(snapshot)
    for (const op of ops) apply(snapshot, op)
    expect(snapshot).toEqual(before)
  })
})

describe('toBoardDetails', () => {
  it('marks the viewer’s vote and edit rights', () => {
    const voted = apply(makeSnapshot(), {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'tacos',
    })
    const asAuthor = toBoardDetails(voted, 'author')
    expect(asAuthor.decisions[0]?.canEdit).toBe(true)
    expect(
      asAuthor.decisions[0]?.options.map((o) => [o.id, o.isSelected]),
    ).toEqual([
      ['pizza', false],
      ['tacos', true],
    ])

    expect(toBoardDetails(voted, 'stranger').decisions[0]?.canEdit).toBe(false)
    expect(toBoardDetails(voted, null).board.isOwner).toBe(false)
  })
})
