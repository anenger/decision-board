import { LIMITS, hasRole } from './board-sync/protocol'
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
  /** Only the owner can rename or delete the board. */
  canManage: boolean
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

/** Renaming and deleting a board are for its owner alone. */
export function canManageBoard(role: Role) {
  return role === 'owner'
}

/**
 * Why `name` can't be a board's name, or null if it can. Names arrive
 * trimmed: the server's message schema trims them and the UI trims before
 * sending.
 */
export function boardNameError(name: string): string | null {
  if (name.trim() !== name) return 'Board names can’t start or end with spaces'
  if (name.length === 0) return 'Give the board a name'
  if (name.length > LIMITS.boardNameLength) {
    return `Keep board names to ${LIMITS.boardNameLength} characters or fewer`
  }
  return null
}
