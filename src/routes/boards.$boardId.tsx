import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Plus, Share2 } from 'lucide-react'
import type { BoardSnapshot, Role } from '@/lib/board-sync/protocol'
import type { Activity } from '@/lib/board-sync/board-client'
import type { NewDecision } from '@/components/NewDecisionSheet'
import { clearBoardQueue } from '@/lib/board-sync/board-client'
import DecisionCard from '@/components/DecisionCard'
import { Burst } from '@/components/Burst'
import {
  BoardDeleted,
  BoardTitle,
  DeleteBoardSheet,
} from '@/components/BoardAdmin'
import { NewDecisionSheet } from '@/components/NewDecisionSheet'
import { ShareSheet } from '@/components/ShareSheet'
import { Loader } from '@/components/Loader'
import { NotFound } from '@/components/NotFound'
import { AccountMenu } from '@/components/AccountMenu'
import { Mascot } from '@/components/Mascot'
import { PresenceStack } from '@/components/PresenceStack'
import { SyncError, SyncStatus } from '@/components/SyncStatus'
import { boardQueries, forgetBoard, sessionQuery } from '@/data/queries'
import { useBoardSync } from '@/lib/board-sync/use-board-sync'
import { hasRole } from '@/lib/board-sync/protocol'
import { useHydrated } from '@/lib/use-hydrated'
import { acceptBoardInvite } from '@/server/boards'

export const Route = createFileRoute('/boards/$boardId')({
  validateSearch: (search): { invite?: string } => ({
    invite:
      typeof search.invite === 'string' && search.invite.length <= 64
        ? search.invite
        : undefined,
  }),
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
  notFoundComponent: BoardNotFound,
})

/** A deleted board, or a mistyped link. Invite links land here too. */
function BoardNotFound() {
  const { boardId } = Route.useParams()
  // A tab closed while offline may have left changes queued for this board.
  useEffect(() => {
    void clearBoardQueue(boardId)
  }, [boardId])
  return <NotFound />
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const ROLE_CHIPS: Record<Role, string> = {
  owner: "👑 You're the owner",
  editor: '✏️ Editor',
  voter: '🗳️ Voter',
  viewer: '👀 Watching',
}

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
    reconnect,
    deleted,
  } = useBoardSync(boardId, initial, viewerId)
  const { board, decisions } = details
  const [isAsking, setIsAsking] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const invite = useInvite(boardId, reconnect)
  const canInvite = hasRole(board.role, 'editor')
  const titleRef = useRef<HTMLDivElement>(null)
  const titleOffscreen = useIsOffscreen(titleRef)
  const hydrated = useHydrated()

  const totalVotes = useMemo(
    () => decisions.reduce((sum, decision) => sum + decision.totalVotes, 0),
    [decisions],
  )

  const activityByDecision = useMemo(() => {
    const latest = new Map<string, Activity>()
    for (const entry of activity) latest.set(entry.decisionId, entry)
    return latest
  }, [activity])

  const createDecision = useCallback(
    ({ title, options, closesAt, hideResults }: NewDecision) => {
      submit({
        kind: 'createDecision',
        decisionId: crypto.randomUUID(),
        title,
        options: options.map((text) => ({ id: crypto.randomUUID(), text })),
        closesAt,
        hideResults,
      })
      setIsAsking(false)
    },
    [submit],
  )
  const closeSheet = useCallback(() => setIsAsking(false), [])
  const closeShare = useCallback(() => setIsSharing(false), [])
  const closeDelete = useCallback(() => setIsDeleting(false), [])
  const goHome = useBoardAdminSync(boardId, board.name, pendingCount, deleted)

  // Whoever deleted it heads straight home; everyone else gets a moment to
  // read what happened.
  useEffect(() => {
    if (deleted && isDeleting) goHome()
  }, [deleted, isDeleting, goHome])

  if (deleted) return <BoardDeleted name={board.name} onGoHome={goHome} />

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
          {canInvite ? (
            <button
              type="button"
              onClick={() => setIsSharing(true)}
              aria-label="Invite people"
              className="btn-icon focus-ring h-11 w-11"
            >
              <Share2 size={20} />
            </button>
          ) : (
            <ShareButton />
          )}
          <AccountMenu />
          {board.canAsk && (
            <button
              type="button"
              onClick={() => setIsAsking(true)}
              className="btn-chunky focus-ring ml-1 hidden bg-tomato px-5 text-white sm:inline-flex"
            >
              <Plus size={18} strokeWidth={2.75} />
              Ask a question
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-7 sm:px-5 sm:pt-10">
        {/* Raised while its menu is open, above the chips row below it. */}
        <div
          ref={titleRef}
          className="anim-rise relative has-[[aria-expanded=true]]:z-20"
        >
          <BoardTitle
            name={board.name}
            canManage={board.canManage}
            onRename={(name) => submit({ kind: 'renameBoard', name })}
            onDelete={() => setIsDeleting(true)}
          />
        </div>
        <div className="anim-rise mt-4 flex flex-wrap items-center gap-2 [animation-delay:60ms]">
          <SyncStatus status={status} pendingCount={pendingCount} />
          <Chip>{ROLE_CHIPS[board.role]}</Chip>
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

        <InviteBanner state={invite} role={board.role} />

        {decisions.length === 0 ? (
          <EmptyBoard
            onAsk={board.canAsk ? () => setIsAsking(true) : undefined}
          />
        ) : (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
            {decisions.map((decision, index) => (
              <div
                key={decision.id}
                // min-w-0 lets a long unbroken word wrap instead of widening
                // the grid column past the screen.
                // Raised while its menu is open, so the menu sits above the
                // cards below it.
                className="anim-pop relative min-w-0 has-[[aria-expanded=true]]:z-20"
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
                  onSetClosed={(closed) =>
                    submit({
                      kind: 'setDecisionClosed',
                      decisionId: decision.id,
                      closed,
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Thumb-reachable on phones; the header has its own button above sm. */}
      {board.canAsk && (
        <button
          type="button"
          onClick={() => setIsAsking(true)}
          className="btn-chunky focus-ring fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 bg-tomato px-6 py-3 text-lg text-white shadow-sticker-lg sm:hidden"
        >
          <Plus size={22} strokeWidth={2.75} />
          Ask
        </button>
      )}

      {isAsking && (
        <NewDecisionSheet onClose={closeSheet} onCreate={createDecision} />
      )}
      {isSharing && (
        <ShareSheet
          boardId={boardId}
          boardName={board.name}
          onClose={closeShare}
        />
      )}
      {isDeleting && board.canManage && (
        <DeleteBoardSheet
          boardId={boardId}
          name={board.name}
          questionCount={decisions.length}
          voteCount={totalVotes}
          onClose={closeDelete}
          onDeleted={goHome}
        />
      )}
      {error && <SyncError message={error} onDismiss={dismissError} />}
    </div>
  )
}

/**
 * Keeps cached board lists in step with renames and deletes, from this tab
 * or any other, and returns a way home.
 */
function useBoardAdminSync(
  boardId: string,
  name: string,
  pendingCount: number,
  deleted: boolean,
) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const savedName = useRef(name)

  // Waits for pending changes to be confirmed, so the refetch sees the new
  // name in the database rather than racing the save.
  useEffect(() => {
    if (pendingCount > 0 || savedName.current === name) return
    savedName.current = name
    void queryClient.invalidateQueries(boardQueries.mine())
    void queryClient.invalidateQueries(boardQueries.detail(boardId))
  }, [boardId, name, pendingCount, queryClient])

  useEffect(() => {
    if (deleted) void forgetBoard(queryClient, boardId)
  }, [boardId, deleted, queryClient])

  return useCallback(() => navigate({ to: '/', replace: true }), [navigate])
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

function EmptyBoard({ onAsk }: { onAsk?: () => void }) {
  return (
    <div className="anim-pop sticker mt-8 flex flex-col items-center bg-white px-6 py-12 text-center sm:py-16">
      <Mascot mood="sleepy" size={96} className="anim-float" />
      <h2 className="mt-5 text-2xl font-semibold">It's quiet in here…</h2>
      <p className="mt-2 max-w-xs text-ink-soft">
        {onAsk
          ? 'Ask the group something and watch the votes roll in.'
          : 'No questions yet. They’ll pop up here the moment someone asks.'}
      </p>
      {onAsk && (
        <button
          type="button"
          onClick={onAsk}
          className="btn-chunky focus-ring mt-6 bg-tomato px-6 text-white"
        >
          <Plus size={18} strokeWidth={2.75} />
          Ask the first question
        </button>
      )}
    </div>
  )
}

type InviteState =
  | { status: 'idle' }
  | { status: 'joining' }
  | { status: 'joined'; role: Role }
  | { status: 'failed'; message: string }

/**
 * Joins the board when the URL has an invite token, then removes the token
 * from the address bar. Runs in the browser only, so link previews and
 * crawlers never become members.
 */
function useInvite(boardId: string, reconnect: () => void): InviteState {
  const { invite } = Route.useSearch()
  const navigate = useNavigate({ from: '/boards/$boardId' })
  const queryClient = useQueryClient()
  const [state, setState] = useState<InviteState>({ status: 'idle' })

  useEffect(() => {
    if (!invite) return
    setState({ status: 'joining' })
    acceptBoardInvite({ data: { boardId, token: invite } })
      .then(async ({ role }) => {
        // Joining may have created a guest account; the socket must
        // reconnect with the new session to get the new role.
        await queryClient.invalidateQueries(sessionQuery)
        void queryClient.invalidateQueries(boardQueries.mine())
        reconnect()
        setState({ status: 'joined', role })
      })
      .catch((error: unknown) =>
        setState({
          status: 'failed',
          message:
            error instanceof Error ? error.message : 'That invite didn’t work',
        }),
      )
      .finally(() =>
        navigate({ search: {}, replace: true, resetScroll: false }),
      )
  }, [invite, boardId, navigate, queryClient, reconnect])

  // The welcome note fades after a few seconds.
  useEffect(() => {
    if (state.status !== 'joined') return
    const timer = setTimeout(() => setState({ status: 'idle' }), 5000)
    return () => clearTimeout(timer)
  }, [state.status])

  return state
}

const JOINED_MESSAGES: Record<Role, string> = {
  owner: 'This is your board. Welcome back! 👑',
  editor: "You're in! Ask questions and vote away. ✏️",
  voter: "You're in! Tap an option to vote. 🗳️",
  viewer: "You're in! 👀",
}

function InviteBanner({ state, role }: { state: InviteState; role: Role }) {
  if (state.status === 'joining') {
    return <Banner mood="🎟️">Joining the board…</Banner>
  }
  if (state.status === 'joined') {
    return (
      <div className="relative">
        <Banner mood="🎉" tone="bg-mint">
          {JOINED_MESSAGES[state.role]}
        </Banner>
        <Burst seed={7} className="top-1/2 left-8" />
      </div>
    )
  }
  if (state.status === 'failed') {
    return (
      <Banner mood="😬" tone="bg-bubblegum">
        {state.message}
      </Banner>
    )
  }
  if (role === 'viewer') {
    return (
      <Banner mood="👀">
        You're watching this board. Ask someone on it for an invite link to join
        in.
      </Banner>
    )
  }
  return null
}

function Banner({
  mood,
  tone = 'bg-white',
  children,
}: {
  mood: string
  tone?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={`anim-pop sticker mt-6 flex items-center gap-3 px-4 py-3 ${tone}`}
    >
      <span aria-hidden="true" className="text-2xl">
        {mood}
      </span>
      <p className="font-semibold">{children}</p>
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
          Link copied! They can watch 👀
        </span>
      )}
    </div>
  )
}
