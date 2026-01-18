import { createServerFn } from '@tanstack/react-start'

const VOTER_ID_COOKIE = 'voterId'
const VOTER_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export const login = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie, setCookie } = await import('@tanstack/react-start/server')

  const existing = getCookie(VOTER_ID_COOKIE)
  if (existing) {
    return existing
  }

  const voterId = crypto.randomUUID()
  setCookie(VOTER_ID_COOKIE, voterId, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    path: '/',
    maxAge: VOTER_ID_MAX_AGE_SECONDS,
  })

  return voterId
})
