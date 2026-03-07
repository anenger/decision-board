import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, LayoutGrid, Plus, Share2 } from 'lucide-react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import DecisionCard from '@/components/DecisionCard'
import DecisionCreateModal from '@/components/DecisionCreateModal'
import { login } from '@/lib/session'
import { Loader } from '@/components/Loader'
import {
  boardQueries,
  decisionQueries,
  useAddOptionMutation,
  useCreateDecisionMutation,
  useDeleteDecisionMutation,
  useRemoveOptionMutation,
  useUpdateDecisionMutation,
  useVoteMutation,
} from '@/data/queries'

export const Route = createFileRoute('/boards/$boardId')({
  pendingComponent: () => <Loader />,
  loader: async ({ context: { queryClient }, params: { boardId } }) => {
    const voterId = await login()
    const typedBoardId = boardId as Id<'boards'>
    const board = await queryClient.ensureQueryData(
      boardQueries.get(typedBoardId),
    )

    if (!board) {
      throw notFound()
    }

    await queryClient.ensureQueryData(
      decisionQueries.listByBoard(typedBoardId, voterId),
    )

    return {
      voterId,
      boardId: typedBoardId,
    }
  },
  component: BoardRoute,
})

type OptionWithVotes = Doc<'options'> & {
  votes: number
  isSelected: boolean
}

type DecisionWithOptions = Doc<'decisions'> & {
  options: Array<OptionWithVotes>
}

type DecisionDraft = {
  title: string
  options: Array<string>
}

const initialDraft: DecisionDraft = {
  title: '',
  options: [''],
}

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function BoardRoute() {
  const navigate = useNavigate({ from: '/boards/$boardId' })
  const { boardId, voterId } = Route.useLoaderData()
  const { data: board } = useSuspenseQuery(boardQueries.get(boardId))
  const { data: decisions } = useSuspenseQuery(
    decisionQueries.listByBoard(boardId, voterId),
  )

  const { mutate: addDecision } = useCreateDecisionMutation()
  const { mutate: removeDecision } = useDeleteDecisionMutation()
  const { mutate: updateDecision } = useUpdateDecisionMutation()
  const { mutate: addOption } = useAddOptionMutation()
  const { mutate: removeOption } = useRemoveOptionMutation()
  const { mutate: vote } = useVoteMutation()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft>(initialDraft)
  const [copied, setCopied] = useState(false)

  const sanitizedDraftOptions = useMemo(
    () =>
      draft.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [draft.options],
  )

  const canSubmit =
    draft.title.trim().length > 0 && sanitizedDraftOptions.length >= 1

  const totalVotes = useMemo(
    () =>
      decisions.reduce(
        (sum, decision) =>
          sum +
          decision.options.reduce(
            (innerSum, option) => innerSum + option.votes,
            0,
          ),
        0,
      ),
    [decisions],
  )

  const handleCreateDecision = () => {
    if (!canSubmit) return
    const title = draft.title.trim()

    addDecision({
      boardId,
      title,
      options: sanitizedDraftOptions,
    })

    setDraft(initialDraft)
    setIsModalOpen(false)
  }

  const handleCloseModal = () => {
    setDraft(initialDraft)
    setIsModalOpen(false)
  }

  const handleRemoveDecision = useCallback(
    (decisionId: Id<'decisions'>) => {
      removeDecision({ id: decisionId })
    },
    [removeDecision],
  )

  const handleUpdateDecision = (
    decision: DecisionWithOptions,
    payload: { title: string; options: Array<string> },
  ) => {
    updateDecision({
      id: decision._id,
      title: payload.title,
    })

    const existingOptions = decision.options
    const trimmedOptions = payload.options
      .map((option) => option.trim())
      .filter((option) => option.length > 0)

    const removeTargets = existingOptions.filter(
      (option) => !trimmedOptions.includes(option.text),
    )

    Promise.all(removeTargets.map((option) => removeOption({ id: option._id })))

    const existingTexts = new Set(existingOptions.map((option) => option.text))
    const nextOptions = trimmedOptions.filter(
      (option) => !existingTexts.has(option),
    )

    Promise.all(
      nextOptions.map((text, index) =>
        addOption({
          decisionId: decision._id,
          text,
          position: existingOptions.length + index,
        }),
      ),
    )
  }

  const handleShareBoard = useCallback(async () => {
    if (typeof window === 'undefined') return

    const shareUrl = window.location.href
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this board URL', shareUrl)
    }
  }, [])

  if (!board) {
    return null
  }

  const boardCreatedLabel = fullDateFormatter.format(
    new Date(board._creationTime),
  )

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="border-b border-[#e2e4ea] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/' })}
              className="focus-ring inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[#6b6f80] transition-colors hover:bg-[#f0f1f4] hover:text-[#1a1a2e]"
            >
              <ArrowLeft size={14} />
              Boards
            </button>

            <span className="text-[#d0d3db]">/</span>

            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4f6df5]">
                <LayoutGrid size={12} className="text-white" />
              </div>
              <span className="text-[14px] font-semibold text-[#1a1a2e]">
                {board.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareBoard}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4ea] bg-white px-3 text-[13px] font-medium text-[#3a3a4a] transition-colors hover:bg-[#fafbfc]"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 size={13} />
                  Share
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#4f6df5] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#4059d9]"
            >
              <Plus size={14} />
              New decision
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-5 py-8">
        {/* Board meta */}
        <div className="anim-fade-rise flex items-baseline gap-4">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a2e]">
            {board.name}
          </h1>
          <div className="flex gap-3 font-['IBM_Plex_Mono',monospace] text-[11px] text-[#9a9daa]">
            <span>
              {decisions.length} decision{decisions.length === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>
              {totalVotes} vote{totalVotes === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>{boardCreatedLabel}</span>
          </div>
        </div>

        {/* Decisions */}
        <div className="mt-6">
          {decisions.length === 0 ? (
            <div className="anim-fade-rise rounded-xl border border-dashed border-[#d0d3db] bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f1f4]">
                <LayoutGrid size={18} className="text-[#6b6f80]" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">
                No decisions yet
              </h2>
              <p className="mt-1.5 text-[13px] text-[#6b6f80]">
                Add your first decision to start collecting votes.
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-[#4f6df5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#4059d9]"
              >
                <Plus size={14} />
                Add the first decision
              </button>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {decisions.map((decision, index) => (
                <div
                  key={decision._id}
                  className={`anim-fade-rise stagger-${Math.min(index + 1, 8)}`}
                >
                  <DecisionCard
                    decision={decision}
                    onVote={(optionId: Id<'options'>) => {
                      vote({
                        boardId,
                        optionId,
                        voterId,
                        decisionId: decision._id,
                      })
                    }}
                    onDelete={() => handleRemoveDecision(decision._id)}
                    onSave={(payload: {
                      title: string
                      options: Array<string>
                    }) => handleUpdateDecision(decision, payload)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <DecisionCreateModal
        isOpen={isModalOpen}
        draft={draft}
        onDraftChange={setDraft}
        onAddOption={() =>
          setDraft((prev) => ({
            ...prev,
            options: [...prev.options, ''],
          }))
        }
        onClose={handleCloseModal}
        onCreate={handleCreateDecision}
        canSubmit={canSubmit}
      />
    </div>
  )
}
