import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { routePartykitRequest } from 'partyserver'
import { auth } from './server/auth'
import { VIEWER_ID_HEADER } from './server/board-room'

export { BoardRoom } from './server/board-room'

const BOARD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Tags a board socket with the signed-in user before it reaches the room. */
async function attachViewer(request: Request, lobby: { name: string }) {
  if (!BOARD_ID_PATTERN.test(lobby.name)) {
    return new Response('Board not found', { status: 404 })
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
    console.error('Failed to read session for board socket', error)
    return new Response('Session lookup failed', { status: 503 })
  }

  const headers = new Headers(request.headers)
  // Overwrite rather than append so clients can't claim another identity.
  headers.set(VIEWER_ID_HEADER, session?.user.id ?? '')
  return new Request(request, { headers })
}

export default {
  async fetch(request: Request) {
    const roomResponse = await routePartykitRequest(request, env, {
      onBeforeConnect: attachViewer,
      // Rooms only speak WebSocket; reads go through server functions.
      onBeforeRequest: () => new Response('Not found', { status: 404 }),
    })
    return roomResponse ?? handler.fetch(request)
  },
}
