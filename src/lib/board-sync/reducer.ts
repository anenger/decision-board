import { LIMITS } from './protocol'
import type {
  BoardSnapshot,
  BoardState,
  DecisionState,
  Operation,
} from './protocol'
import type { BoardDetails } from '@/lib/board'
import { canEditDecision } from '@/lib/board'

/**
 * Returns why `actorId` may not apply `op` to `state`, or null if allowed.
 * The Durable Object enforces this; the client uses it to skip pending
 * changes that would be rejected.
 */
export function checkOperation(
  state: BoardState,
  op: Operation,
  actorId: string,
): string | null {
  const decision = findDecision(state, op.decisionId)

  switch (op.kind) {
    case 'createDecision':
      if (decision) {
        // A replay of our own create is fine; anything else is a collision.
        return decision.createdById === actorId ? null : 'That id is taken'
      }
      if (state.decisions.length >= LIMITS.decisionsPerBoard) {
        return 'This board has reached its decision limit'
      }
      return null

    case 'renameDecision':
    case 'deleteDecision':
      // Deleting something already gone is a no-op, so replays succeed.
      if (!decision) {
        return op.kind === 'deleteDecision' ? null : 'This decision was deleted'
      }
      if (
        !canEditDecision(actorId, {
          createdById: decision.createdById,
          ownerId: state.board.ownerId,
        })
      ) {
        return "Only the board owner or the decision's author can change it"
      }
      return null

    case 'addOption':
      if (!decision) return 'This decision was deleted'
      if (decision.options.some((option) => option.id === op.optionId)) {
        return null
      }
      if (decision.options.length >= LIMITS.optionsPerDecision) {
        return 'This decision has reached its option limit'
      }
      return null

    case 'setVote':
      if (!decision) return 'This decision was deleted'
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
  const decision = findDecision(state, op.decisionId)

  switch (op.kind) {
    case 'createDecision': {
      if (decision) return snapshot
      const created: DecisionState = {
        id: op.decisionId,
        title: op.title,
        createdById: actorId,
        createdAt: now,
        options: op.options.map((option) => ({ ...option, votes: 0 })),
      }
      return withDecisions(snapshot, [...state.decisions, created])
    }

    case 'renameDecision':
      return updateDecision(snapshot, op.decisionId, (d) => ({
        ...d,
        title: op.title,
      }))

    case 'deleteDecision': {
      if (!decision) return snapshot
      const { [op.decisionId]: _removed, ...remainingVotes } = myVotes
      return {
        state: {
          ...state,
          decisions: state.decisions.filter((d) => d.id !== op.decisionId),
        },
        myVotes: remainingVotes,
      }
    }

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

      const next = updateDecision(snapshot, op.decisionId, (d) => ({
        ...d,
        options: d.options.map((option) => {
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
        state: next.state,
        myVotes:
          op.optionId === null
            ? otherVotes
            : { ...otherVotes, [op.decisionId]: op.optionId },
      }
    }
  }
}

/** Shapes a snapshot into the view model the board UI renders. */
export function toBoardDetails(
  { state, myVotes }: BoardSnapshot,
  viewerId: string | null,
): BoardDetails {
  return {
    board: {
      id: state.board.id,
      name: state.board.name,
      createdAt: state.board.createdAt,
      isOwner: viewerId !== null && viewerId === state.board.ownerId,
    },
    decisions: state.decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      canEdit: canEditDecision(viewerId, {
        createdById: decision.createdById,
        ownerId: state.board.ownerId,
      }),
      options: decision.options.map((option) => ({
        ...option,
        isSelected: myVotes[decision.id] === option.id,
      })),
    })),
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
  return withDecisions(
    snapshot,
    snapshot.state.decisions.map((decision) =>
      decision.id === decisionId ? update(decision) : decision,
    ),
  )
}
