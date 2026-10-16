import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createBoard,
  getBoard,
  getBoardSharing,
  getSessionInfo,
  listMyBoards,
  resetBoardInvites,
  updateMemberRole,
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
  /** Invite links and members, for editors and the owner. */
  sharing: (boardId: string) =>
    queryOptions({
      queryKey: ['boards', 'sharing', boardId],
      queryFn: () => getBoardSharing({ data: { boardId } }),
      // People join at any moment, so always refresh when the sheet opens.
      staleTime: 0,
      refetchOnMount: 'always',
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

export function useResetInvitesMutation(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => resetBoardInvites({ data: { boardId } }),
    onSettled: () =>
      queryClient.invalidateQueries(boardQueries.sharing(boardId)),
  })
}

export function useUpdateMemberRoleMutation(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { userId: string; role: 'editor' | 'voter' | null }) =>
      updateMemberRole({ data: { boardId, ...data } }),
    onSettled: () =>
      queryClient.invalidateQueries(boardQueries.sharing(boardId)),
  })
}
