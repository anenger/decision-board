import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, CircleDot, LayoutGrid, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Loader } from '@/components/Loader'
import { AccountMenu } from '@/components/AccountMenu'
import {
  boardQueries,
  sessionQuery,
  useCreateBoardMutation,
} from '@/data/queries'

const relativeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatRelativeDate(timestamp: number) {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 30) return dateFormatter.format(new Date(timestamp))
  if (days > 0) return relativeFormatter.format(-days, 'day')
  if (hours > 0) return relativeFormatter.format(-hours, 'hour')
  if (minutes > 0) return relativeFormatter.format(-minutes, 'minute')
  return 'Just now'
}

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
  const boardNameRef = useRef<HTMLInputElement | null>(null)

  const canCreate = boardName.trim().length > 0 && !isPending

  const handleCreateBoard = async () => {
    if (!canCreate) return

    const { id: boardId } = await createBoard({ name: boardName.trim() })

    setBoardName('')
    navigate({ to: '/boards/$boardId', params: { boardId } })
  }

  const handleBoardNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void handleCreateBoard()
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="border-b border-[#e2e4ea] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4f6df5]">
              <LayoutGrid size={14} className="text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
              Decision Board
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-[#6b6f80] sm:inline">
              {boards.length} board{boards.length === 1 ? '' : 's'}
            </span>
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-5 py-8">
        {/* Page heading + create row */}
        <div className="anim-fade-rise flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a2e]">
              Your boards
            </h1>
            <p className="mt-1 text-[13px] text-[#6b6f80]">
              Create and manage collaborative decision boards
            </p>
          </div>

          <div className="flex gap-2">
            <input
              ref={boardNameRef}
              type="text"
              placeholder="Board name…"
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              onKeyDown={handleBoardNameKeyDown}
              className="focus-ring h-9 w-full rounded-lg border border-[#e2e4ea] bg-white px-3 text-[13px] text-[#1a1a2e] placeholder:text-[#a0a3b1] sm:w-56"
            />
            <button
              type="button"
              onClick={handleCreateBoard}
              disabled={!canCreate}
              className={`focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium transition-colors ${
                canCreate
                  ? 'bg-[#4f6df5] text-white hover:bg-[#4059d9]'
                  : 'cursor-not-allowed bg-[#e2e4ea] text-[#a0a3b1]'
              }`}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New board</span>
            </button>
          </div>
        </div>

        {/* Board list */}
        <div className="mt-6">
          {boards.length === 0 ? (
            <div className="anim-fade-rise rounded-xl border border-dashed border-[#d0d3db] bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f1f4]">
                <LayoutGrid size={18} className="text-[#6b6f80]" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">
                No boards yet
              </h2>
              <p className="mt-1.5 text-[13px] text-[#6b6f80]">
                Create your first board to start making decisions together.
              </p>
              <button
                type="button"
                onClick={() => boardNameRef.current?.focus()}
                className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-[#4f6df5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4059d9]"
              >
                Create a board
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="anim-fade-rise overflow-hidden rounded-xl border border-[#e2e4ea] bg-white">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-[#e2e4ea] bg-[#fafbfc] px-5 py-2.5 text-[11px] font-medium tracking-[0.04em] uppercase text-[#6b6f80]">
                <span>Name</span>
                <span className="hidden w-28 text-right sm:block">Created</span>
                <span className="w-16" />
              </div>

              {/* Board rows */}
              {boards.map((board, index) => (
                <Link
                  key={board.id}
                  to="/boards/$boardId"
                  params={{ boardId: board.id }}
                  className={`hover-lift group grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5 ${
                    index < boards.length - 1 ? 'border-b border-[#f0f1f4]' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CircleDot size={15} className="shrink-0 text-[#4f6df5]" />
                    <span className="truncate text-[14px] font-medium text-[#1a1a2e]">
                      {board.name}
                    </span>
                  </div>

                  <span className="hidden w-28 text-right font-['IBM_Plex_Mono',monospace] text-[12px] text-[#9a9daa] sm:block">
                    {formatRelativeDate(board.createdAt)}
                  </span>

                  <span className="flex w-16 items-center justify-end gap-1 text-[13px] text-[#9a9daa] transition-colors group-hover:text-[#4f6df5]">
                    Open
                    <ArrowRight size={13} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
