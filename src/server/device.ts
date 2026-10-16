import { getCookie, setCookie } from '@tanstack/react-start/server'

/**
 * A random id per browser, used only to pick a stable animal persona for
 * guests and visitors, so someone keeps the same animal before and after
 * their first change creates a guest account. It is not an identity: all
 * permissions use the session.
 */
const DEVICE_COOKIE = 'db_device'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function getOrCreateDeviceSeed() {
  const existing = getCookie(DEVICE_COOKIE)
  if (existing && UUID_PATTERN.test(existing)) return existing

  const seed = crypto.randomUUID()
  setCookie(DEVICE_COOKIE, seed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return seed
}

/** Reads the seed from a raw Cookie header, e.g. on a WebSocket upgrade. */
export function readDeviceSeed(cookieHeader: string | null) {
  const match = cookieHeader?.match(/(?:^|;\s*)db_device=([^;]+)/)
  const seed = match?.[1]
  return seed && UUID_PATTERN.test(seed) ? seed : null
}
