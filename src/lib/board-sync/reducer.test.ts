import { describe, expect, it } from 'vitest'
import {
  applyOperation,
  checkOperation,
  nextDeadline,
  publicState,
  toBoardDetails,
} from './reducer'
import type { Actor } from './reducer'
import type { BoardSnapshot, DecisionState, Operation, Role } from './protocol'

const NOW = 1_700_000_000_000
const HOUR = 60 * 60 * 1000

function decision(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    id: 'd1',
    title: 'Lunch?',
    createdById: 'author',
    createdAt: NOW,
    closesAt: null,
    closedAt: null,
    hideResults: false,
    totalVotes: 3,
    options: [
      { id: 'pizza', text: 'Pizza', votes: 2 },
      { id: 'tacos', text: 'Tacos', votes: 1 },
    ],
    ...overrides,
  }
}

function makeSnapshot(
  overrides: Partial<DecisionState> = {},
  role: Role = 'editor',
): BoardSnapshot {
  return {
    state: {
      board: { id: 'b1', name: 'Offsite', ownerId: 'owner', createdAt: NOW },
      decisions: [decision(overrides)],
    },
    myVotes: {},
    role,
  }
}

const as = (id: string, role: Role): Actor => ({ id, role })

const apply = (snapshot: BoardSnapshot, op: Operation, actor = 'author') =>
  applyOperation(snapshot, op, actor, NOW)

const counts = (snapshot: BoardSnapshot) =>
  snapshot.state.decisions[0]?.options.map((o) => [o.id, o.votes])

const create = (
  overrides: Partial<Operation & { kind: 'createDecision' }> = {},
): Operation => ({
  kind: 'createDecision',
  decisionId: 'd2',
  title: 'Venue?',
  options: [{ id: 'park', text: 'Park' }],
  closesAt: null,
  hideResults: false,
  ...overrides,
})

describe('checkOperation roles', () => {
  const { state } = makeSnapshot()
  const vote: Operation = {
    kind: 'setVote',
    decisionId: 'd1',
    optionId: 'pizza',
  }
  const addOption: Operation = {
    kind: 'addOption',
    decisionId: 'd1',
    optionId: 'sushi',
    text: 'Sushi',
  }
  const rename: Operation = {
    kind: 'renameDecision',
    decisionId: 'd1',
    title: 'Dinner?',
  }
  const close: Operation = {
    kind: 'setDecisionClosed',
    decisionId: 'd1',
    closed: true,
  }

  it('lets viewers do nothing', () => {
    for (const op of [vote, addOption, create(), rename, close]) {
      expect(checkOperation(state, op, as('someone', 'viewer'), NOW)).toMatch(
        /watching/,
      )
    }
  })

  it('lets voters vote and add options, but not ask questions', () => {
    expect(checkOperation(state, vote, as('v', 'voter'), NOW)).toBeNull()
    expect(checkOperation(state, addOption, as('v', 'voter'), NOW)).toBeNull()
    expect(checkOperation(state, create(), as('v', 'voter'), NOW)).toMatch(
      /Only editors/,
    )
  })

  it('lets editors ask questions', () => {
    expect(checkOperation(state, create(), as('e', 'editor'), NOW)).toBeNull()
  })

  it('lets the owner and the author manage a question, but no one else', () => {
    for (const op of [rename, close]) {
      expect(checkOperation(state, op, as('owner', 'owner'), NOW)).toBeNull()
      expect(checkOperation(state, op, as('author', 'editor'), NOW)).toBeNull()
      expect(checkOperation(state, op, as('other', 'editor'), NOW)).toMatch(
        /Only the board owner/,
      )
    }
  })

  it("rejects reusing another user's decision id", () => {
    const hijack = create({ decisionId: 'd1' })
    expect(checkOperation(state, hijack, as('other', 'editor'), NOW)).toMatch(
      /taken/,
    )
    // ...but a replay of the author's own create is fine.
    expect(
      checkOperation(state, hijack, as('author', 'editor'), NOW),
    ).toBeNull()
  })

  it('rejects votes for options that are not on the question', () => {
    expect(
      checkOperation(
        state,
        { kind: 'setVote', decisionId: 'd1', optionId: 'other-board-option' },
        as('v', 'voter'),
        NOW,
      ),
    ).toMatch(/no longer exists/)
  })
})

describe('deadlines', () => {
  it('only accepts deadlines in the next 90 days', () => {
    const { state } = makeSnapshot()
    const editor = as('e', 'editor')
    expect(
      checkOperation(state, create({ closesAt: NOW - 1 }), editor, NOW),
    ).toMatch(/future/)
    expect(
      checkOperation(
        state,
        create({ closesAt: NOW + 91 * 24 * HOUR }),
        editor,
        NOW,
      ),
    ).toMatch(/future/)
    expect(
      checkOperation(state, create({ closesAt: NOW + HOUR }), editor, NOW),
    ).toBeNull()
  })

  it('stops votes and new options once the deadline passes', () => {
    const { state } = makeSnapshot({ closesAt: NOW + HOUR })
    const vote: Operation = {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'pizza',
    }
    expect(checkOperation(state, vote, as('v', 'voter'), NOW)).toBeNull()
    expect(checkOperation(state, vote, as('v', 'voter'), NOW + HOUR)).toMatch(
      /closed/,
    )
    expect(
      checkOperation(
        state,
        { kind: 'addOption', decisionId: 'd1', optionId: 'x', text: 'x' },
        as('v', 'voter'),
        NOW + HOUR,
      ),
    ).toMatch(/closed/)
  })

  it('closes now, and reopening clears the deadline', () => {
    const scheduled = makeSnapshot({ closesAt: NOW + HOUR })
    const closed = apply(scheduled, {
      kind: 'setDecisionClosed',
      decisionId: 'd1',
      closed: true,
    })
    expect(closed.state.decisions[0]).toMatchObject({ closedAt: NOW })

    const reopened = apply(closed, {
      kind: 'setDecisionClosed',
      decisionId: 'd1',
      closed: false,
    })
    expect(reopened.state.decisions[0]).toMatchObject({
      closedAt: null,
      closesAt: null,
    })
  })

  it('finds the next deadline that has not passed', () => {
    const snapshot = makeSnapshot({ closesAt: NOW + 2 * HOUR })
    snapshot.state.decisions.push(
      decision({ id: 'soon', closesAt: NOW + HOUR }),
      decision({ id: 'past', closesAt: NOW - HOUR }),
      decision({ id: 'closed', closesAt: NOW + 0.5 * HOUR, closedAt: NOW }),
    )
    expect(nextDeadline(snapshot.state, NOW)).toBe(NOW + HOUR)
    expect(nextDeadline(snapshot.state, NOW + 3 * HOUR)).toBeNull()
  })
})

describe('hidden results', () => {
  it('strips per-option counts while open, keeping the total', () => {
    const { state } = makeSnapshot({ hideResults: true, closesAt: NOW + HOUR })
    const hidden = publicState(state, NOW).decisions[0]
    expect(hidden.options.map((o) => o.votes)).toEqual([null, null])
    expect(hidden.totalVotes).toBe(3)
    expect(state.decisions[0]?.options[0]?.votes).toBe(2) // not mutated

    const revealed = publicState(state, NOW + HOUR).decisions[0]
    expect(revealed.options.map((o) => o.votes)).toEqual([2, 1])
  })

  it('counts a vote toward the total without revealing per-option counts', () => {
    const snapshot = makeSnapshot({ hideResults: true })
    snapshot.state = publicState(snapshot.state, NOW)
    const voted = apply(snapshot, {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'tacos',
    })
    expect(voted.state.decisions[0]?.totalVotes).toBe(4)
    expect(counts(voted)).toEqual([
      ['pizza', null],
      ['tacos', null],
    ])
    expect(voted.myVotes).toEqual({ d1: 'tacos' })
  })
})

describe('applyOperation votes', () => {
  it('casts, moves and clears a vote with matching counts and totals', () => {
    const cast = apply(makeSnapshot(), {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'tacos',
    })
    expect(counts(cast)).toEqual([
      ['pizza', 2],
      ['tacos', 2],
    ])
    expect(cast.state.decisions[0]?.totalVotes).toBe(4)

    const moved = apply(cast, {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'pizza',
    })
    expect(counts(moved)).toEqual([
      ['pizza', 3],
      ['tacos', 1],
    ])
    expect(moved.state.decisions[0]?.totalVotes).toBe(4)

    const cleared = apply(moved, {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: null,
    })
    expect(counts(cleared)).toEqual([
      ['pizza', 2],
      ['tacos', 1],
    ])
    expect(cleared.state.decisions[0]?.totalVotes).toBe(3)
    expect(cleared.myVotes).toEqual({})
  })
})

describe('applyOperation idempotency', () => {
  // A change can be confirmed by the server and still pending locally, so
  // applying it twice must equal applying it once.
  const ops: Array<Operation> = [
    create(),
    { kind: 'renameDecision', decisionId: 'd1', title: 'Dinner?' },
    { kind: 'deleteDecision', decisionId: 'd1' },
    { kind: 'addOption', decisionId: 'd1', optionId: 'sushi', text: 'Sushi' },
    { kind: 'setVote', decisionId: 'd1', optionId: 'pizza' },
    { kind: 'setVote', decisionId: 'd1', optionId: null },
    { kind: 'setDecisionClosed', decisionId: 'd1', closed: true },
    { kind: 'setDecisionClosed', decisionId: 'd1', closed: false },
  ]

  for (const [index, op] of ops.entries()) {
    it(`${index}: ${op.kind}`, () => {
      const once = apply(makeSnapshot(), op)
      expect(apply(once, op)).toEqual(once)
    })
  }

  it('returns the same snapshot for no-ops, so the server broadcasts nothing', () => {
    const snapshot = makeSnapshot()
    expect(
      apply(snapshot, {
        kind: 'renameDecision',
        decisionId: 'd1',
        title: 'Lunch?',
      }),
    ).toBe(snapshot)
    expect(
      apply(snapshot, {
        kind: 'setDecisionClosed',
        decisionId: 'd1',
        closed: false,
      }),
    ).toBe(snapshot)
  })

  it('does not mutate its input', () => {
    const snapshot = makeSnapshot()
    const before = structuredClone(snapshot)
    for (const op of ops) apply(snapshot, op)
    expect(snapshot).toEqual(before)
  })
})

describe('toBoardDetails', () => {
  it('marks the viewer’s vote and what they may do', () => {
    const voted = apply(makeSnapshot({}, 'voter'), {
      kind: 'setVote',
      decisionId: 'd1',
      optionId: 'tacos',
    })
    const view = toBoardDetails(voted, 'someone', NOW)
    expect(view.board.canAsk).toBe(false)
    expect(view.decisions[0]).toMatchObject({ canVote: true, canManage: false })
    expect(view.decisions[0]?.options.map((o) => [o.id, o.isSelected])).toEqual(
      [
        ['pizza', false],
        ['tacos', true],
      ],
    )

    const asAuthor = toBoardDetails({ ...voted, role: 'editor' }, 'author', NOW)
    expect(asAuthor.board.canAsk).toBe(true)
    expect(asAuthor.decisions[0]?.canManage).toBe(true)

    const asViewer = toBoardDetails({ ...voted, role: 'viewer' }, 'author', NOW)
    expect(asViewer.decisions[0]).toMatchObject({
      canVote: false,
      canManage: false,
    })
  })

  it('hides counts while open and crowns winners once closed, ties included', () => {
    const tied = makeSnapshot({
      hideResults: true,
      closesAt: NOW + HOUR,
      options: [
        { id: 'a', text: 'A', votes: 2 },
        { id: 'b', text: 'B', votes: 2 },
        { id: 'c', text: 'C', votes: 1 },
      ],
    })
    const open = toBoardDetails(tied, null, NOW).decisions[0]
    expect(open.options.map((o) => o.votes)).toEqual([null, null, null])
    expect(open.options.some((o) => o.isWinner)).toBe(false)

    const closed = toBoardDetails(tied, null, NOW + HOUR).decisions[0]
    expect(closed.isOpen).toBe(false)
    expect(closed.canVote).toBe(false)
    expect(closed.options.map((o) => o.isWinner)).toEqual([true, true, false])
  })

  it('crowns nobody when a closed question got no votes', () => {
    const empty = makeSnapshot({
      closedAt: NOW,
      options: [
        { id: 'a', text: 'A', votes: 0 },
        { id: 'b', text: 'B', votes: 0 },
      ],
    })
    expect(
      toBoardDetails(empty, null, NOW).decisions[0]?.options.some(
        (o) => o.isWinner,
      ),
    ).toBe(false)
  })
})

describe('renameBoard', () => {
  const rename = (name: string): Operation => ({ kind: 'renameBoard', name })

  it('is for the owner only', () => {
    expect(
      checkOperation(
        makeSnapshot().state,
        rename('New'),
        as('owner', 'owner'),
        NOW,
      ),
    ).toBeNull()
    for (const role of ['editor', 'voter', 'viewer'] as const) {
      expect(
        checkOperation(makeSnapshot().state, rename('New'), as('x', role), NOW),
        role,
      ).not.toBeNull()
    }
  })

  it('needs a trimmed, non-empty name of at most 100 characters', () => {
    const check = (name: string) =>
      checkOperation(
        makeSnapshot().state,
        rename(name),
        as('owner', 'owner'),
        NOW,
      )
    expect(check('a'.repeat(100))).toBeNull()
    expect(check('Team offsite 🏕️')).toBeNull()
    expect(check('')).toMatch(/name/)
    expect(check('  padded ')).toMatch(/spaces/)
    expect(check('a'.repeat(101))).toMatch(/100/)
  })

  it('sets the name, so replaying it changes nothing', () => {
    const before = makeSnapshot({}, 'owner')
    const once = apply(before, rename('Retreat'), 'owner')
    const twice = apply(once, rename('Retreat'), 'owner')
    expect(once.state.board.name).toBe('Retreat')
    expect(once.state.decisions).toBe(before.state.decisions)
    // Same object, so the room knows not to broadcast or write again.
    expect(twice).toBe(once)
  })

  it('shows rename and delete to the owner only', () => {
    const snapshot = makeSnapshot()
    expect(
      toBoardDetails({ ...snapshot, role: 'owner' }, 'owner', NOW).board
        .canManage,
    ).toBe(true)
    for (const role of ['editor', 'voter', 'viewer'] as const) {
      expect(
        toBoardDetails({ ...snapshot, role }, 'x', NOW).board.canManage,
        role,
      ).toBe(false)
    }
  })
})
