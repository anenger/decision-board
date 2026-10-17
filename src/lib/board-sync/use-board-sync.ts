import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { BoardSyncClient } from './board-client'
import { nextDeadline, toBoardDetails } from './reducer'
import type { BoardSnapshot, BoardState } from './protocol'
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
  const now = useDeadlineClock(view.snapshot.state)
  const details = useMemo(
    () => toBoardDetails(view.snapshot, view.viewerId, now),
    [view.snapshot, view.viewerId, now],
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
    deleted: view.deleted,
    submit: client.submit,
    dismissError: client.dismissError,
    reconnect: client.reconnect,
  }
}

/**
 * The current time, re-rendered the moment the next deadline passes, so a
 * question flips to closed on time even before the server's reveal arrives.
 */
function useDeadlineClock(state: BoardState) {
  const [now, setNow] = useState(() => Date.now())
  const deadline = nextDeadline(state, now)

  useEffect(() => {
    if (deadline === null) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      // Timers can fire early; a little slack avoids a second wake-up.
      Math.max(0, deadline - Date.now()) + 50,
    )
    return () => clearTimeout(timer)
  }, [deadline])

  return now
}
