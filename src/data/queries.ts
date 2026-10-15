import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createBoard,
  getBoard,
  getSessionInfo,
  listMyBoards,
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
  /** First paint only; the board's socket keeps it live after that. */
  detail: (boardId: string) =>
    queryOptions({
      queryKey: ['boards', 'detail', boardId],
      queryFn: () => getBoard({ data: { boardId } }),
    }),
}

export function useCreateBoardMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string }) => createBoard({ data }),
    // A visitor's first board creates their guest account.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(boardQueries.mine()),
        queryClient.invalidateQueries(sessionQuery),
      ]),
  })
}
