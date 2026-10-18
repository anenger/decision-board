import {
  mutationOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { NotificationList } from '@/lib/notifications'
import {
  createBoard,
  deleteBoard,
  getBoard,
  getBoardSharing,
  getSessionInfo,
  listMyBoards,
  listMyNotifications,
  markMyNotificationsRead,
  resetBoardInvites,
  updateMemberRole,
} from '@/server/boards'
import { clearBoardQueue } from '@/lib/board-sync/offline-queue'

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

export const notificationQueries = {
  /** Prefix for invalidating every notification query. */
  all: ['notifications'] as const,
  /** Keyed by viewer, so signing in or out never shows someone else's. */
  list: (viewerId: string) =>
    queryOptions({
      queryKey: ['notifications', viewerId],
      queryFn: () => listMyNotifications(),
      refetchOnWindowFocus: 'always',
    }),
}

/** Marks some notifications read, or all of them without `ids`. */
export function useMarkNotificationsReadMutation(viewerId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = notificationQueries.list(viewerId)
  return useMutation({
    mutationFn: (ids?: Array<string>) =>
      markMyNotificationsRead({ data: { ids } }),
    // The badge drops at once; the refetch below corrects any drift.
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (list?: NotificationList) => {
        if (!list) return list
        const marking = (id: string) => !ids || ids.includes(id)
        const newlyRead = list.items.filter(
          (item) => !item.isRead && marking(item.id),
        ).length
        return {
          items: list.items.map((item) =>
            marking(item.id) ? { ...item, isRead: true } : item,
          ),
          unreadCount: ids ? Math.max(0, list.unreadCount - newlyRead) : 0,
        }
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
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

export function useDeleteBoardMutation(boardId: string) {
  const queryClient = useQueryClient()
  return useMutation(deleteBoardMutationOptions(queryClient, boardId))
}

export function deleteBoardMutationOptions(
  queryClient: QueryClient,
  boardId: string,
) {
  return mutationOptions({
    mutationFn: () => deleteBoard({ data: { boardId } }),
    // Finishes before the caller's own onSuccess, which leaves the page.
    // The room also tells this tab to clear its queue, but its socket may be
    // down, so don't count on it.
    onSuccess: async () => {
      await clearBoardQueue(boardId)
      await forgetBoard(queryClient, boardId)
    },
  })
}

/**
 * Drops a deleted board from the cache, so "Your boards" no longer lists it
 * and its link loads fresh (and finds nothing) instead of the old copy.
 */
export function forgetBoard(queryClient: QueryClient, boardId: string) {
  queryClient.removeQueries(boardQueries.detail(boardId))
  queryClient.removeQueries(boardQueries.sharing(boardId))
  return queryClient.invalidateQueries(boardQueries.mine())
}
