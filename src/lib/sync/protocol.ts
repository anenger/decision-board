import type { Counter } from '@automerge/automerge/slim'

/** Room ids double as Durable Object names, so keep them short and URL-safe. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/

export const SYNC_PATH_PATTERN = /^\/api\/sync\/([A-Za-z0-9-]{1,64})$/

export function syncUrl(roomId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/sync/${roomId}`
}

/** Document used by the /lab sync demo. */
export type LabDoc = {
  counter: Counter
  notes: Array<string>
}
