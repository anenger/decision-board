import { del } from 'idb-keyval'

/** Where a board's unconfirmed changes are kept in IndexedDB. */
export function queueKey(boardId: string) {
  return `board-sync:${boardId}`
}

/**
 * Forgets a board's offline changes, so nothing is replayed to a board that
 * no longer exists.
 */
export async function clearBoardQueue(boardId: string) {
  try {
    await del(queueKey(boardId))
  } catch {
    // IndexedDB may be unavailable, in which case nothing was stored.
  }
}
