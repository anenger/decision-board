/**
 * Identity the Worker attaches to a board socket after checking the session
 * cookie. Every header is overwritten, so a client can't claim to be someone
 * else by sending its own.
 */
const HEADERS = {
  id: 'x-viewer-id',
  name: 'x-viewer-name',
  image: 'x-viewer-image',
  guest: 'x-viewer-guest',
  seed: 'x-viewer-seed',
} as const

export type SocketViewer = {
  id: string
  name: string
  image: string | null
  isGuest: boolean
}

type SessionUser = {
  id: string
  name: string
  image?: string | null
  isAnonymous?: boolean | null
}

export function writeViewerHeaders(
  headers: Headers,
  user: SessionUser | null,
  deviceSeed: string | null,
) {
  headers.set(HEADERS.id, user?.id ?? '')
  // Header values must be ASCII, and names often aren't.
  headers.set(HEADERS.name, encodeURIComponent(user?.name.slice(0, 80) ?? ''))
  headers.set(
    HEADERS.image,
    user?.image?.startsWith('https://') ? encodeURIComponent(user.image) : '',
  )
  headers.set(HEADERS.guest, user?.isAnonymous ? '1' : '0')
  headers.set(HEADERS.seed, deviceSeed ?? '')
}

export function readViewerHeaders(headers: Headers): {
  viewer: SocketViewer | null
  /** Stable per-browser seed for picking a guest's animal. */
  deviceSeed: string | null
} {
  const id = headers.get(HEADERS.id)
  return {
    viewer: id
      ? {
          id,
          name: decodeURIComponent(headers.get(HEADERS.name) ?? ''),
          image: decodeURIComponent(headers.get(HEADERS.image) ?? '') || null,
          isGuest: headers.get(HEADERS.guest) === '1',
        }
      : null,
    deviceSeed: headers.get(HEADERS.seed) || null,
  }
}
