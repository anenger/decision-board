import { hasRole } from './board-sync/protocol'
import type { Role } from './board-sync/protocol'

export type BoardSummary = {
  id: string
  name: string
  createdAt: number
  role: Role
}

export type BoardView = {
  id: string
  name: string
  createdAt: number
  role: Role
  /** Editors and owners can ask new questions. */
  canAsk: boolean
}

export type OptionView = {
  id: string
  text: string
  /** Null while results are hidden. */
  votes: number | null
  isSelected: boolean
  /** Top of the count once voting has closed (ties included). */
  isWinner: boolean
}

export type DecisionView = {
  id: string
  title: string
  isOpen: boolean
  closesAt: number | null
  hideResults: boolean
  totalVotes: number
  /** Rename, delete, close and reopen. */
  canManage: boolean
  /** Vote and add options. */
  canVote: boolean
  options: Array<OptionView>
}

export type BoardDetails = {
  board: BoardView
  decisions: Array<DecisionView>
}

/**
 * The board owner can manage any question; its author can manage their own
 * unless they've since been reduced to watching.
 */
export function canManageDecision(
  viewerId: string | null,
  role: Role,
  decision: { createdById: string },
) {
  return (
    role === 'owner' ||
    (viewerId !== null &&
      viewerId === decision.createdById &&
      hasRole(role, 'voter'))
  )
}
