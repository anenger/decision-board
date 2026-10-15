import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { anonymous } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { moveGuestData } from './guest-data'
import { db } from '@/db'
import * as schema from '@/db/schema'

export type Viewer = {
  id: string
  name: string
  image: string | null
  isAnonymous: boolean
}

export const githubEnabled = Boolean(
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,
)

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // D1 has no interactive transactions; multi-statement writes use db.batch.
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
    transaction: false,
  }),
  socialProviders: githubEnabled
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
      }
    : {},
  plugins: [
    anonymous({
      generateName: () => 'Guest',
      // Better Auth awaits this before deleting the guest user.
      onLinkAccount: ({ anonymousUser, newUser }) =>
        moveGuestData(db, anonymousUser.user.id, newUser.user.id),
    }),
    // Must stay last so it can forward cookies set by the plugins above.
    tanstackStartCookies(),
  ],
})

function toViewer(user: {
  id: string
  name: string
  image?: string | null
  isAnonymous?: boolean | null
}): Viewer {
  return {
    id: user.id,
    name: user.name,
    image: user.image ?? null,
    isAnonymous: Boolean(user.isAnonymous),
  }
}

export async function getViewer(): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session ? toViewer(session.user) : null
}

/**
 * Returns the signed-in user, creating a guest account on a visitor's first
 * write. Reads never create accounts, so link previews and crawlers don't
 * leave guest rows behind.
 */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (viewer) return viewer

  const { user } = await auth.api.signInAnonymous({
    headers: getRequestHeaders(),
  })
  return toViewer(user)
}
