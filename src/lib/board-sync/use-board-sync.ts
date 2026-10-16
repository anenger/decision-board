import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { BoardSyncClient } from './board-client'
import { toBoardDetails } from './reducer'
import type { BoardSnapshot } from './protocol'
import { sessionQuery } from '@/data/queries'
import { ensureSession } from '@/server/boards'

export function useBoardSync(
  boardId: string,
  initial: BoardSnapshot,
  viewerId: string | null,
) {
  const queryClient = useQueryClient()
  const [client] = useState(
    () =>
      new BoardSyncClient({
        boardId,
        initial,
        viewerId,
        ensureViewer: async () => {
          const session = await ensureSession()
          await queryClient.invalidateQueries(sessionQuery)
          return session.viewerId
        },
      }),
  )

  useEffect(() => {
    client.start()
    return () => client.stop()
  }, [client])

  const view = useSyncExternalStore(
    client.subscribe,
    client.getView,
    client.getView,
  )
  const details = useMemo(
    () => toBoardDetails(view.snapshot, view.viewerId),
    [view.snapshot, view.viewerId],
  )

  return {
    details,
    myVotes: view.snapshot.myVotes,
    status: view.status,
    pendingCount: view.pendingCount,
    error: view.error,
    people: view.people,
    you: view.you,
    activity: view.activity,
    submit: client.submit,
    dismissError: client.dismissError,
  }
}
