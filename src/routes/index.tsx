import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Loader } from '@/components/Loader'
import { AccountMenu } from '@/components/AccountMenu'
import { Mascot } from '@/components/Mascot'
import {
  boardQueries,
  sessionQuery,
  useCreateBoardMutation,
} from '@/data/queries'
import { hashString } from '@/lib/board-sync/persona'
import { useHydrated } from '@/lib/use-hydrated'

const relativeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatRelativeDate(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 30) return dateFormatter.format(new Date(timestamp))
  if (days > 0) return relativeFormatter.format(-days, 'day')
  if (hours > 0) return relativeFormatter.format(-hours, 'hour')
  if (minutes > 0) return relativeFormatter.format(-minutes, 'minute')
  return 'just now'
}

const TILE_COLORS = [
  'bg-bubblegum',
  'bg-tangerine',
  'bg-butter',
  'bg-mint',
  'bg-sky',
  'bg-lilac',
]
const TILE_EMOJI = ['🍕', '🎉', '🏕️', '🎬', '🎨', '🌮', '🎲', '🚀', '🌈', '🍩']

const IDEAS = ['Friday lunch', 'Team offsite', 'Movie night', 'Trip to Lisbon']

export const Route = createFileRoute('/')({
  pendingComponent: () => <Loader />,
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(boardQueries.mine()),
      queryClient.ensureQueryData(sessionQuery),
    ]),
  component: BoardsHome,
})

function BoardsHome() {
  const navigate = useNavigate({ from: '/' })
  const { data: boards } = useSuspenseQuery(boardQueries.mine())
  const { mutateAsync: createBoard, isPending } = useCreateBoardMutation()
  const [boardName, setBoardName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const hydrated = useHydrated()

  const canCreate = boardName.trim().length > 0 && !isPending

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!canCreate) return
    const { id: boardId } = await createBoard({ name: boardName.trim() })
    setBoardName('')
    navigate({ to: '/boards/$boardId', params: { boardId } })
  }

  return (
    <div className="min-h-dvh pb-16">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-5">
        <Link
          to="/"
          className="focus-ring group flex min-h-11 items-center gap-2 rounded-full"
        >
          <Mascot
            size={34}
            className="transition-transform duration-300 group-hover:-rotate-12"
          />
          <span className="font-display text-xl font-semibold tracking-tight">
            decision board
          </span>
        </Link>
        <AccountMenu />
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-5">
        <section className="relative pt-8 pb-10 sm:pt-16 sm:pb-14">
          <Mascot
            mood="wink"
            size={84}
            color="#ffd0e2"
            className="anim-float mb-5 sm:absolute sm:top-12 sm:right-4 sm:mb-0 sm:h-36 sm:w-36"
          />
          <h1 className="anim-rise max-w-2xl text-[2.6rem] leading-[1.02] font-semibold sm:text-7xl">
            What are we{' '}
            <span className="relative inline-block">
              <span className="relative z-10">deciding</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 -z-0 h-3 -rotate-1 rounded-full bg-butter sm:h-5"
              />
            </span>
            ?
          </h1>
          <p className="anim-rise mt-4 max-w-md text-lg text-ink-soft [animation-delay:80ms]">
            Make a board, share the link, and let everyone vote together, live.
            No sign-up needed.
          </p>

          <form
            onSubmit={handleCreate}
            className="anim-rise mt-7 flex max-w-xl flex-col gap-3 [animation-delay:140ms] sm:flex-row"
          >
            <input
              ref={inputRef}
              value={boardName}
              maxLength={100}
              onChange={(event) => setBoardName(event.target.value)}
              placeholder="Name your board…"
              aria-label="Board name"
              className="focus-ring min-h-14 min-w-0 flex-1 rounded-full border-2 border-ink bg-white px-5 font-display text-lg placeholder:text-ink-faint"
            />
            <button
              type="submit"
              disabled={!canCreate}
              className="btn-chunky focus-ring min-h-14 bg-tomato px-7 text-lg text-white"
            >
              <Sparkles size={20} />
              {isPending ? 'Making it…' : 'Make a board'}
            </button>
          </form>
          <div className="anim-rise mt-3 flex flex-wrap gap-2 [animation-delay:200ms]">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => {
                  setBoardName(idea)
                  inputRef.current?.focus()
                }}
                className="focus-ring min-h-10 rounded-full border-2 border-dashed border-ink/30 px-3 text-sm font-semibold text-ink-soft transition hover:-rotate-2 hover:border-ink hover:bg-white hover:text-ink"
              >
                {idea}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="your-boards">
          <h2 id="your-boards" className="text-2xl font-semibold">
            Your boards
          </h2>

          {boards.length === 0 ? (
            <div className="anim-pop sticker mt-4 flex items-center gap-4 bg-white p-5">
              <Mascot mood="sleepy" size={56} className="shrink-0" />
              <p className="text-ink-soft">
                Nothing here yet. Name a board above and it'll show up here. ☝️
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((board, index) => {
                const hash = hashString(board.id)
                return (
                  <li
                    key={board.id}
                    className="anim-pop min-w-0"
                    style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
                  >
                    <Link
                      to="/boards/$boardId"
                      params={{ boardId: board.id }}
                      className={`sticker lift focus-ring group flex h-full items-center gap-4 p-4 ${
                        TILE_COLORS[hash % TILE_COLORS.length]
                      }`}
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink bg-white text-3xl transition-transform duration-300 group-hover:rotate-12">
                        {TILE_EMOJI[(hash >>> 4) % TILE_EMOJI.length]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-lg leading-tight font-semibold wrap-anywhere">
                          {board.name}
                        </span>
                        <span className="mt-0.5 block min-h-5 text-sm font-semibold text-ink-soft">
                          {/* Relative to the viewer's clock, so only after hydration. */}
                          {hydrated && formatRelativeDate(board.createdAt)}
                        </span>
                      </span>
                      <ArrowRight
                        size={20}
                        className="shrink-0 transition-transform group-hover:translate-x-1"
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
