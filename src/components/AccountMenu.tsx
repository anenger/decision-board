import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { sessionQuery } from '@/data/queries'

export function AccountMenu() {
  const queryClient = useQueryClient()
  const {
    data: { viewer, githubEnabled },
  } = useSuspenseQuery(sessionQuery)
  const [isPending, setIsPending] = useState(false)

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

  if (viewer && !viewer.isAnonymous) {
    return (
      <div className="flex items-center gap-2">
        {viewer.image ? (
          <img
            src={viewer.image}
            alt=""
            className="h-6 w-6 rounded-full border border-[#e2e4ea]"
          />
        ) : (
          <UserRound size={15} className="text-[#6b6f80]" />
        )}
        <span className="hidden text-[13px] font-medium text-[#3a3a4a] sm:inline">
          {viewer.name}
        </span>
        <button
          type="button"
          onClick={signOut}
          disabled={isPending}
          aria-label="Sign out"
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9a9daa] transition-colors hover:bg-[#f0f1f4] hover:text-[#3a3a4a]"
        >
          <LogOut size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {viewer && (
        <span className="hidden text-[13px] text-[#6b6f80] sm:inline">
          Guest
        </span>
      )}
      {githubEnabled && (
        <button
          type="button"
          onClick={signInWithGitHub}
          disabled={isPending}
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4ea] bg-white px-3 text-[13px] font-medium text-[#3a3a4a] transition-colors hover:bg-[#fafbfc]"
        >
          <LogIn size={13} />
          Sign in with GitHub
        </button>
      )}
    </div>
  )
}
