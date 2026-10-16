import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Plus, Share2 } from 'lucide-react'
import type { BoardSnapshot } from '@/lib/board-sync/protocol'
import type { Activity } from '@/lib/board-sync/board-client'
import DecisionCard from '@/components/DecisionCard'
import { NewDecisionSheet } from '@/components/NewDecisionSheet'
import { Loader } from '@/components/Loader'
import { AccountMenu } from '@/components/AccountMenu'
import { Mascot } from '@/components/Mascot'
import { PresenceStack } from '@/components/PresenceStack'
import { SyncError, SyncStatus } from '@/components/SyncStatus'
import { boardQueries, sessionQuery } from '@/data/queries'
import { useBoardSync } from '@/lib/board-sync/use-board-sync'
import { useHydrated } from '@/lib/use-hydrated'

export const Route = createFileRoute('/boards/$boardId')({
  pendingComponent: () => <Loader />,
  loader: async ({ context: { queryClient }, params: { boardId } }) => {
    const [snapshot] = await Promise.all([
      queryClient.ensureQueryData(boardQueries.detail(boardId)),
      queryClient.ensureQueryData(sessionQuery),
    ])

    if (!snapshot) {
      throw notFound()
    }
  },
  component: BoardRoute,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

function BoardRoute() {
  const { boardId } = Route.useParams()
  const { data: snapshot } = useSuspenseQuery(boardQueries.detail(boardId))
  const { data: session } = useSuspenseQuery(sessionQuery)

  if (!snapshot) return null

  // Keyed so switching boards opens a fresh connection.
  return (
    <LiveBoard
      key={boardId}
      boardId={boardId}
      initial={snapshot}
      viewerId={session.viewer?.id ?? null}
    />
  )
}

function LiveBoard({
  boardId,
  initial,
  viewerId,
}: {
  boardId: string
  initial: BoardSnapshot
  viewerId: string | null
}) {
  const {
    details,
    myVotes,
    status,
    pendingCount,
    error,
    submit,
    dismissError,
    people,
    you,
    activity,
  } = useBoardSync(boardId, initial, viewerId)
  const { board, decisions } = details
  const [isAsking, setIsAsking] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleOffscreen = useIsOffscreen(titleRef)
  const hydrated = useHydrated()

  const totalVotes = useMemo(
    () =>
      decisions.reduce(
        (sum, decision) =>
          sum + decision.options.reduce((inner, o) => inner + o.votes, 0),
        0,
      ),
    [decisions],
  )

  const activityByDecision = useMemo(() => {
    const latest = new Map<string, Activity>()
    for (const entry of activity) latest.set(entry.decisionId, entry)
    return latest
  }, [activity])

  const createDecision = useCallback(
    (title: string, options: Array<string>) => {
      submit({
        kind: 'createDecision',
        decisionId: crypto.randomUUID(),
        title,
        options: options.map((text) => ({ id: crypto.randomUUID(), text })),
      })
      setIsAsking(false)
    },
    [submit],
  )
  const closeSheet = useCallback(() => setIsAsking(false), [])

  return (
    <div className="min-h-dvh pb-28 sm:pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-1 px-2 sm:gap-2 sm:px-5">
          <Link
            to="/"
            aria-label="All boards"
            className="btn-icon focus-ring h-11 w-11 shrink-0"
          >
            <ArrowLeft size={22} />
          </Link>
          {/* Shown once the big title scrolls away, so it isn't there twice. */}
          <p
            aria-hidden={!titleOffscreen}
            className={`min-w-0 flex-1 truncate font-display text-lg font-semibold transition duration-300 sm:text-xl ${
              titleOffscreen ? 'opacity-100' : 'translate-y-1 opacity-0'
            }`}
          >
            {board.name}
          </p>
          <PresenceStack people={people} you={you} />
          <ShareButton />
          <AccountMenu />
          <button
            type="button"
            onClick={() => setIsAsking(true)}
            className="btn-chunky focus-ring ml-1 hidden bg-tomato px-5 text-white sm:inline-flex"
          >
            <Plus size={18} strokeWidth={2.75} />
            Ask a question
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-7 sm:px-5 sm:pt-10">
        <h1
          ref={titleRef}
          className="anim-rise text-[2rem] leading-[1.1] font-semibold wrap-anywhere sm:text-5xl"
        >
          {board.name}
        </h1>
        <div className="anim-rise mt-4 flex flex-wrap items-center gap-2 [animation-delay:60ms]">
          <SyncStatus status={status} pendingCount={pendingCount} />
          <Chip>
            💡 {decisions.length} question{decisions.length === 1 ? '' : 's'}
          </Chip>
          <Chip>
            🗳️ {totalVotes} vote{totalVotes === 1 ? '' : 's'}
          </Chip>
          {/* Local date, so only after hydration (the server renders UTC). */}
          {hydrated && (
            <Chip>📅 {dateFormatter.format(new Date(board.createdAt))}</Chip>
          )}
        </div>

        {decisions.length === 0 ? (
          <EmptyBoard onAsk={() => setIsAsking(true)} />
        ) : (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
            {decisions.map((decision, index) => (
              <div
                key={decision.id}
                // min-w-0 lets a long unbroken word wrap instead of widening
                // the grid column past the screen.
                className="anim-pop min-w-0"
                style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
              >
                <DecisionCard
                  decision={decision}
                  activity={activityByDecision.get(decision.id)}
                  onVote={(optionId) =>
                    submit({
                      kind: 'setVote',
                      decisionId: decision.id,
                      // Voting for your current choice removes the vote.
                      optionId:
                        myVotes[decision.id] === optionId ? null : optionId,
                    })
                  }
                  onDelete={() =>
                    submit({ kind: 'deleteDecision', decisionId: decision.id })
                  }
                  onRename={(title) =>
                    submit({
                      kind: 'renameDecision',
                      decisionId: decision.id,
                      title,
                    })
                  }
                  onAddOption={(text) =>
                    submit({
                      kind: 'addOption',
                      decisionId: decision.id,
                      optionId: crypto.randomUUID(),
                      text,
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Thumb-reachable on phones; the header has its own button above sm. */}
      <button
        type="button"
        onClick={() => setIsAsking(true)}
        className="btn-chunky focus-ring fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 bg-tomato px-6 py-3 text-lg text-white shadow-sticker-lg sm:hidden"
      >
        <Plus size={22} strokeWidth={2.75} />
        Ask
      </button>

      {isAsking && (
        <NewDecisionSheet onClose={closeSheet} onCreate={createDecision} />
      )}
      {error && <SyncError message={error} onDismiss={dismissError} />}
    </div>
  )
}

/** True once the element has scrolled up under the sticky header. */
function useIsOffscreen(ref: React.RefObject<HTMLElement | null>) {
  const [isOffscreen, setIsOffscreen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => setIsOffscreen(!entries.some((e) => e.isIntersecting)),
      // The sticky header is 4rem tall.
      { rootMargin: '-64px 0px 0px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return isOffscreen
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink/15 bg-white/70 px-3 py-1 text-sm font-bold whitespace-nowrap text-ink-soft">
      {children}
    </span>
  )
}

function EmptyBoard({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="anim-pop sticker mt-8 flex flex-col items-center bg-white px-6 py-12 text-center sm:py-16">
      <Mascot mood="sleepy" size={96} className="anim-float" />
      <h2 className="mt-5 text-2xl font-semibold">It's quiet in here…</h2>
      <p className="mt-2 max-w-xs text-ink-soft">
        Ask the group something and watch the votes roll in.
      </p>
      <button
        type="button"
        onClick={onAsk}
        className="btn-chunky focus-ring mt-6 bg-tomato px-6 text-white"
      >
        <Plus size={18} strokeWidth={2.75} />
        Ask the first question
      </button>
    </div>
  )
}

/** Uses the phone's share sheet when there is one, otherwise copies the link. */
function ShareButton() {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = window.location.href
    // Typed as always present, but many desktop browsers lack it.
    const canShare = 'share' in navigator
    if (canShare && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ url, title: document.title })
        return
      } catch {
        // Cancelled, or not allowed; fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this board link', url)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={share}
        aria-label="Share board"
        className="btn-icon focus-ring h-11 w-11"
      >
        {copied ? (
          <Check size={20} className="text-[#2fbf7f]" strokeWidth={3} />
        ) : (
          <Share2 size={20} />
        )}
      </button>
      {copied && (
        <span
          role="status"
          className="anim-pop absolute top-[calc(100%+0.4rem)] right-0 rounded-full border-2 border-ink bg-butter px-3 py-1 text-sm font-bold whitespace-nowrap shadow-sticker"
        >
          Link copied! 🎉
        </span>
      )}
    </div>
  )
}
