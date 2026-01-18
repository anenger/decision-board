import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'

export const decisionQueries = {
  list: (voterId: string) => convexQuery(api.decisions.list, { voterId }),
}

export function useCreateDecisionMutation() {
  const addDecision = useConvexMutation(api.decisions.addDecision)
  return useMutation({ mutationFn: addDecision })
}

export function useDeleteDecisionMutation() {
  const removeDecision = useConvexMutation(api.decisions.removeDecision)
  return useMutation({ mutationFn: removeDecision })
}

export function useUpdateDecisionMutation() {
  const updateDecision = useConvexMutation(api.decisions.updateDecision)
  return useMutation({ mutationFn: updateDecision })
}

export function useAddOptionMutation() {
  const addOption = useConvexMutation(api.decisions.addOption)
  return useMutation({ mutationFn: addOption })
}

export function useRemoveOptionMutation() {
  const removeOption = useConvexMutation(api.decisions.removeOption)
  return useMutation({ mutationFn: removeOption })
}

export function useVoteMutation() {
  const mutationFn = useConvexMutation(api.decisions.vote).withOptimisticUpdate(
    (localStore, args) => {
      const { decisionId, optionId, voterId: localVoterId } = args
      const currentValue = localStore.getQuery(api.decisions.list, {
        voterId: localVoterId,
      })
      if (currentValue !== undefined) {
        localStore.setQuery(
          api.decisions.list,
          { voterId: localVoterId },
          currentValue.map((decision) => {
            if (decision._id !== decisionId) return decision
            return {
              ...decision,
              options: decision.options.map((option) => {
                if (option._id !== optionId) return option
                return {
                  ...option,
                  isSelected: true,
                  votes: option.votes,
                }
              }),
            }
          }),
        )
      }
    },
  )

  return useMutation({ mutationFn })
}
