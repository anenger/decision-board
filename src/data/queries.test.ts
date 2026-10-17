import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteBoardMutationOptions } from './queries'
import { queueKey } from '@/lib/board-sync/offline-queue'

const { store, deleteBoard } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  deleteBoard: vi.fn(),
}))

// Server functions need the Worker runtime; only deleteBoard matters here.
vi.mock('@/server/boards', () => ({ deleteBoard }))
vi.mock('idb-keyval', () => ({
  del: (key: string) =>
    // A little slower than the request, as IndexedDB can be.
    new Promise<void>((resolve) =>
      setTimeout(() => {
        store.delete(key)
        resolve()
      }, 5),
    ),
}))

const BOARD = 'b1'

/** Runs the delete like the sheet does, noting what the queue looked like
 * when the caller's onSuccess (which navigates home) ran. */
async function deleteFromSheet() {
  const queryClient = new QueryClient()
  const observer = new MutationObserver(
    queryClient,
    deleteBoardMutationOptions(queryClient, BOARD),
  )
  // Like useMutation; per-call callbacks only run for a subscribed observer.
  const unsubscribe = observer.subscribe(() => {})
  let queuedWhenLeaving: boolean | undefined
  await observer
    .mutate(undefined, {
      onSuccess: () => {
        queuedWhenLeaving = store.has(queueKey(BOARD))
      },
    })
    .catch(() => {})
  // Per-call callbacks are scheduled just after the mutation settles.
  await new Promise((resolve) => setTimeout(resolve, 0))
  unsubscribe()
  return queuedWhenLeaving
}

afterEach(() => {
  store.clear()
  deleteBoard.mockReset()
})

describe('deleting a board from the owner’s tab', () => {
  it('clears its offline queue before leaving, even if the socket never heard', async () => {
    store.set(queueKey(BOARD), { viewerId: 'owner', pending: [{}] })
    deleteBoard.mockResolvedValue(undefined)

    expect(await deleteFromSheet()).toBe(false)
    expect(store.has(queueKey(BOARD))).toBe(false)
    expect(deleteBoard).toHaveBeenCalledWith({ data: { boardId: BOARD } })
  })

  it('keeps the queue if the delete was refused', async () => {
    store.set(queueKey(BOARD), { viewerId: 'owner', pending: [{}] })
    deleteBoard.mockRejectedValue(
      new Error('Only the board owner can delete it'),
    )

    expect(await deleteFromSheet()).toBeUndefined()
    expect(store.has(queueKey(BOARD))).toBe(true)
  })
})
