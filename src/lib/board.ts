export type BoardSummary = {
  id: string
  name: string
  createdAt: number
}

export type BoardView = BoardSummary & {
  isOwner: boolean
}

export type OptionView = {
  id: string
  text: string
  votes: number
  isSelected: boolean
}

export type DecisionView = {
  id: string
  title: string
  canEdit: boolean
  options: Array<OptionView>
}

export type BoardDetails = {
  board: BoardView
  decisions: Array<DecisionView>
}

/** The board owner and a decision's author may rename or delete it. */
export function canEditDecision(
  viewerId: string | null,
  decision: { createdById: string; ownerId: string },
) {
  return (
    viewerId !== null &&
    (viewerId === decision.ownerId || viewerId === decision.createdById)
  )
}
