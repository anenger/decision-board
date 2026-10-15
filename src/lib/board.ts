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

/**
 * Applies a vote the way the server does: voting for your current choice
 * removes the vote, and voting for another option moves it.
 */
export function applyVote(
  decision: DecisionView,
  optionId: string,
): DecisionView {
  const previousId = decision.options.find((option) => option.isSelected)?.id
  const isRemoving = previousId === optionId

  return {
    ...decision,
    options: decision.options.map((option) => {
      if (option.id === previousId) {
        return { ...option, isSelected: false, votes: option.votes - 1 }
      }
      if (option.id === optionId && !isRemoving) {
        return { ...option, isSelected: true, votes: option.votes + 1 }
      }
      return option
    }),
  }
}
