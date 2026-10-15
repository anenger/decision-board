import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { BoardDetails } from '@/lib/board'
import { applyVote } from '@/lib/board'
import {
  addOption,
  createBoard,
  createDecision,
  deleteDecision,
  getBoard,
  getSessionInfo,
  listMyBoards,
  renameDecision,
  vote,
} from '@/server/boards'

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => getSessionInfo(),
})

export const boardQueries = {
  mine: () =>
    queryOptions({
      queryKey: ['boards', 'mine'],
      queryFn: () => listMyBoards(),
    }),
  // Polling stands in for live updates until boards sync over WebSockets.
  detail: (boardId: string) =>
    queryOptions({
      queryKey: ['boards', 'detail', boardId],
      queryFn: () => getBoard({ data: { boardId } }),
      refetchInterval: 5_000,
    }),
}

/**
 * A visitor's first write creates their guest account, so every mutation
 * refreshes the session along with the data it changed.
 */
function useBoardMutation<TVariables>(
  boardId: string,
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(boardQueries.detail(boardId)),
        queryClient.invalidateQueries(sessionQuery),
      ]),
  })
}

export function useCreateBoardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) => createBoard({ data }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(boardQueries.mine()),
        queryClient.invalidateQueries(sessionQuery),
      ]),
  })
}

export function useCreateDecisionMutation(boardId: string) {
  return useBoardMutation(
    boardId,
    (data: { title: string; options: Array<string> }) =>
      createDecision({ data: { boardId, ...data } }),
  )
}

export function useRenameDecisionMutation(boardId: string) {
  return useBoardMutation(
    boardId,
    (data: { decisionId: string; title: string }) => renameDecision({ data }),
  )
}

export function useDeleteDecisionMutation(boardId: string) {
  return useBoardMutation(boardId, (data: { decisionId: string }) =>
    deleteDecision({ data }),
  )
}

export function useAddOptionMutation(boardId: string) {
  return useBoardMutation(
    boardId,
    (data: { decisionId: string; text: string }) => addOption({ data }),
  )
}

export function useVoteMutation(boardId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = boardQueries.detail(boardId)

  return useMutation({
    mutationFn: (data: { decisionId: string; optionId: string }) =>
      vote({ data }),
    onMutate: async ({ decisionId, optionId }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<BoardDetails | null>(queryKey)

      queryClient.setQueryData<BoardDetails | null>(queryKey, (current) =>
        current
          ? {
              ...current,
              decisions: current.decisions.map((decision) =>
                decision.id === decisionId
                  ? applyVote(decision, optionId)
                  : decision,
              ),
            }
          : current,
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries(sessionQuery),
      ]),
  })
}
