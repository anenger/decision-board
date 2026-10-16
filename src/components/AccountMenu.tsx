import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Github, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { Popover } from './Popover'
import { authClient } from '@/lib/auth-client'
import { sessionQuery } from '@/data/queries'
import { personaFor } from '@/lib/board-sync/persona'

/** You, as a sticker. Opens sign-in or sign-out. */
export function AccountMenu() {
  const queryClient = useQueryClient()
  const {
    data: { viewer, githubEnabled, deviceSeed },
  } = useSuspenseQuery(sessionQuery)
  const [isPending, setIsPending] = useState(false)

  const isSignedIn = viewer !== null && !viewer.isAnonymous
  // Same choice as the board's presence list (src/server/presence.ts).
  const persona = personaFor(isSignedIn ? viewer.id : deviceSeed)
  const person = {
    name: isSignedIn ? viewer.name : persona.name,
    image: isSignedIn ? viewer.image : null,
    emoji: persona.emoji,
    color: persona.color,
  }

  const signInWithGitHub = async () => {
    setIsPending(true)
    // Redirects to GitHub. A guest's boards and votes move to the account.
    await authClient.signIn.social({
      provider: 'github',
      callbackURL: window.location.pathname,
    })
  }

  const signOut = async () => {
    setIsPending(true)
    await authClient.signOut()
    await queryClient.invalidateQueries()
    setIsPending(false)
  }

  return (
    <Popover
      label="Your account"
      triggerClassName="btn-icon h-11 w-11"
      trigger={<Avatar person={person} size={34} />}
    >
      {(close) => (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar person={person} size={44} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">
                {person.name}
              </p>
              <p className="text-sm text-ink-soft">
                {isSignedIn
                  ? 'Signed in with GitHub'
                  : viewer
                    ? "That's you! You're a guest"
                    : "That's you, just looking around"}
              </p>
            </div>
          </div>

          {!isSignedIn && (
            <p className="text-sm leading-snug text-ink-soft">
              {githubEnabled
                ? 'Sign in to keep your boards on every device. Anything you made as a guest comes with you.'
                : 'Your boards live in this browser for now.'}
            </p>
          )}

          {isSignedIn ? (
            <button
              type="button"
              disabled={isPending}
              onClick={async () => {
                await signOut()
                close()
              }}
              className="btn-chunky focus-ring w-full bg-white text-sm"
            >
              <LogOut size={16} />
              Sign out
            </button>
          ) : githubEnabled ? (
            <button
              type="button"
              disabled={isPending}
              onClick={signInWithGitHub}
              className="btn-chunky focus-ring w-full bg-ink text-sm text-white"
            >
              <Github size={16} />
              Sign in with GitHub
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  )
}
