import { LIMITS, hasRole, isDecisionOpen } from './protocol'
import type {
  BoardSnapshot,
  BoardState,
  DecisionState,
  Operation,
  Role,
} from './protocol'
import type { BoardDetails } from '@/lib/board'
import { boardNameError, canManageBoard, canManageDecision } from '@/lib/board'

export type Actor = { id: string; role: Role }

/**
 * Returns why `actor` may not apply `op` to `state` at time `now`, or null if
 * allowed. The Durable Object enforces this; the client uses it to skip
 * pending changes that would be rejected.
 */
export function checkOperation(
  state: BoardState,
  op: Operation,
  actor: Actor,
  now: number,
): string | null {
  if (actor.role === 'viewer') {
    return "You're watching this board. Ask for an invite link to join in."
  }

  if (op.kind === 'renameBoard') {
    if (!canManageBoard(actor.role)) {
      return 'Only the board owner can rename it'
    }
    return boardNameError(op.name)
  }

  const decision = findDecision(state, op.decisionId)

  switch (op.kind) {
    case 'createDecision':
      if (decision) {
        // A replay of our own create is fine; anything else is a collision.
        return decision.createdById === actor.id ? null : 'That id is taken'
      }
      if (!hasRole(actor.role, 'editor')) {
        return 'Only editors can ask questions on this board'
      }
      if (state.decisions.length >= LIMITS.decisionsPerBoard) {
        return 'This board has reached its question limit'
      }
      if (
        op.closesAt !== null &&
        (op.closesAt <= now || op.closesAt > now + LIMITS.maxDeadlineMs)
      ) {
        return 'Pick a deadline in the future (within 90 days)'
      }
      return null

    case 'renameDecision':
    case 'deleteDecision':
    case 'setDecisionClosed':
      // Deleting something already gone is a no-op, so replays succeed.
      if (!decision) {
        return op.kind === 'deleteDecision' ? null : 'This question was deleted'
      }
      if (!canManageDecision(actor.id, actor.role, decision)) {
        return "Only the board owner or the question's author can change it"
      }
      return null

    case 'addOption':
      if (!decision) return 'This question was deleted'
      if (decision.options.some((option) => option.id === op.optionId)) {
        return null
      }
      if (!isDecisionOpen(decision, now)) return 'Voting has closed'
      if (decision.options.length >= LIMITS.optionsPerDecision) {
        return 'This question has reached its option limit'
      }
      return null

    case 'setVote':
      if (!decision) return 'This question was deleted'
      if (!isDecisionOpen(decision, now)) return 'Voting has closed'
      if (
        op.optionId !== null &&
        !decision.options.some((option) => option.id === op.optionId)
      ) {
        return 'That option no longer exists'
      }
      return null
  }
}

/**
 * Applies an allowed operation. Applying the same operation twice gives the
 * same result as applying it once, so a change can be both confirmed by the
 * server and still pending locally without being counted twice.
 */
export function applyOperation(
  snapshot: BoardSnapshot,
  op: Operation,
  actorId: string,
  now: number,
): BoardSnapshot {
  const { state, myVotes } = snapshot

  if (op.kind === 'renameBoard') {
    // Sets rather than edits the name, so a replay changes nothing.
    if (state.board.name === op.name) return snapshot
    return {
      ...snapshot,
      state: { ...state, board: { ...state.board, name: op.name } },
    }
  }

  const decision = findDecision(state, op.decisionId)

  switch (op.kind) {
    case 'createDecision': {
      if (decision) return snapshot
      const created: DecisionState = {
        id: op.decisionId,
        title: op.title,
        createdById: actorId,
        createdAt: now,
        closesAt: op.closesAt,
        closedAt: null,
        hideResults: op.hideResults,
        totalVotes: 0,
        options: op.options.map((option) => ({ ...option, votes: 0 })),
      }
      return withDecisions(snapshot, [...state.decisions, created])
    }

    case 'renameDecision':
      return updateDecision(snapshot, op.decisionId, (d) =>
        d.title === op.title ? d : { ...d, title: op.title },
      )

    case 'deleteDecision': {
      if (!decision) return snapshot
      const { [op.decisionId]: _removed, ...remainingVotes } = myVotes
      return {
        ...snapshot,
        state: {
          ...state,
          decisions: state.decisions.filter((d) => d.id !== op.decisionId),
        },
        myVotes: remainingVotes,
      }
    }

    case 'setDecisionClosed':
      return updateDecision(snapshot, op.decisionId, (d) => {
        if (op.closed) {
          return isDecisionOpen(d, now) ? { ...d, closedAt: now } : d
        }
        // Reopening clears the deadline too, or it would close again at once.
        return d.closedAt === null && d.closesAt === null
          ? d
          : { ...d, closedAt: null, closesAt: null }
      })

    case 'addOption':
      return updateDecision(snapshot, op.decisionId, (d) =>
        d.options.some((option) => option.id === op.optionId)
          ? d
          : {
              ...d,
              options: [
                ...d.options,
                { id: op.optionId, text: op.text, votes: 0 },
              ],
            },
      )

    case 'setVote': {
      const previous = myVotes[op.decisionId] as string | undefined
      if ((previous ?? null) === op.optionId) return snapshot

      const totalChange =
        previous === undefined ? 1 : op.optionId === null ? -1 : 0
      const next = updateDecision(snapshot, op.decisionId, (d) => ({
        ...d,
        totalVotes: d.totalVotes + totalChange,
        // Hidden counts (null) stay hidden; only the total moves.
        options: d.options.map((option) => {
          if (option.votes === null) return option
          if (option.id === previous) {
            return { ...option, votes: option.votes - 1 }
          }
          if (option.id === op.optionId) {
            return { ...option, votes: option.votes + 1 }
          }
          return option
        }),
      }))

      const { [op.decisionId]: _previous, ...otherVotes } = myVotes
      return {
        ...next,
        myVotes:
          op.optionId === null
            ? otherVotes
            : { ...otherVotes, [op.decisionId]: op.optionId },
      }
    }
  }
}

/**
 * The state everyone may see: per-option counts are removed from questions
 * that hide their results until voting closes.
 */
export function publicState(state: BoardState, now: number): BoardState {
  if (!state.decisions.some((d) => d.hideResults && isDecisionOpen(d, now))) {
    return state
  }
  return {
    ...state,
    decisions: state.decisions.map((d) =>
      d.hideResults && isDecisionOpen(d, now)
        ? { ...d, options: d.options.map((o) => ({ ...o, votes: null })) }
        : d,
    ),
  }
}

/** The next moment a question's deadline passes, if any. */
export function nextDeadline(state: BoardState, now: number) {
  let next: number | null = null
  for (const d of state.decisions) {
    if (d.closedAt === null && d.closesAt !== null && d.closesAt > now) {
      next = next === null ? d.closesAt : Math.min(next, d.closesAt)
    }
  }
  return next
}

/** Shapes a snapshot into the view model the board UI renders. */
export function toBoardDetails(
  { state, myVotes, role }: BoardSnapshot,
  viewerId: string | null,
  now: number,
): BoardDetails {
  return {
    board: {
      id: state.board.id,
      name: state.board.name,
      createdAt: state.board.createdAt,
      role,
      canAsk: hasRole(role, 'editor'),
      canManage: canManageBoard(role),
    },
    decisions: state.decisions.map((decision) => {
      const isOpen = isDecisionOpen(decision, now)
      const resultsHidden = decision.hideResults && isOpen
      const counts = decision.options.map((o) =>
        resultsHidden ? null : o.votes,
      )
      const topCount = Math.max(0, ...counts.map((c) => c ?? 0))

      return {
        id: decision.id,
        title: decision.title,
        isOpen,
        closesAt: decision.closesAt,
        hideResults: decision.hideResults,
        totalVotes: decision.totalVotes,
        canManage: canManageDecision(viewerId, role, decision),
        canVote: isOpen && hasRole(role, 'voter'),
        options: decision.options.map((option, index) => {
          const votes = counts[index] ?? null
          return {
            id: option.id,
            text: option.text,
            votes,
            isSelected: myVotes[decision.id] === option.id,
            isWinner: !isOpen && topCount > 0 && votes === topCount,
          }
        }),
      }
    }),
  }
}

function findDecision(state: BoardState, decisionId: string) {
  return state.decisions.find((decision) => decision.id === decisionId)
}

function withDecisions(
  snapshot: BoardSnapshot,
  decisions: Array<DecisionState>,
): BoardSnapshot {
  return { ...snapshot, state: { ...snapshot.state, decisions } }
}

function updateDecision(
  snapshot: BoardSnapshot,
  decisionId: string,
  update: (decision: DecisionState) => DecisionState,
): BoardSnapshot {
  const current = findDecision(snapshot.state, decisionId)
  if (!current) return snapshot
  const updated = update(current)
  // Keep the same object for no-ops, so the server can tell nothing changed.
  if (updated === current) return snapshot
  return withDecisions(
    snapshot,
    snapshot.state.decisions.map((decision) =>
      decision.id === decisionId ? updated : decision,
    ),
  )
}
