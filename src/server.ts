import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { auth } from './server/auth'
import { SYNC_PATH_PATTERN } from './lib/sync/protocol'

export { BoardRoom } from './server/board-room'

/**
 * Sync sockets bypass TanStack Start so the 101 response, and the WebSocket
 * attached to it, reach the browser untouched.
 */
async function handleSync(request: Request, roomId: string) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426 })
  }

  let session
  try {
    session = await auth.api.getSession({
      headers: request.headers,
      // A 101 response can't deliver a refreshed session cookie, so leave
      // refreshing to regular page requests.
      query: { disableRefresh: true },
    })
  } catch (error) {
    // Clients retry, so report the failure instead of crashing the request.
    console.error('Failed to read session for sync socket', error)
    return new Response('Session lookup failed', { status: 503 })
  }

  const headers = new Headers(request.headers)
  // Overwrite rather than append so clients can't claim another identity.
  headers.set('x-viewer-id', session?.user.id ?? '')

  return env.BOARD_ROOM.getByName(roomId).fetch(
    new Request(request, { headers }),
  )
}

export default {
  fetch(request: Request) {
    const roomId = SYNC_PATH_PATTERN.exec(new URL(request.url).pathname)?.[1]
    if (roomId) return handleSync(request, roomId)
    return handler.fetch(request)
  },
}
