import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import DecisionBoardHeader from '@/components/DecisionBoardHeader'
import DecisionCard from '@/components/DecisionCard'
import DecisionCreateModal from '@/components/DecisionCreateModal'

const voterStorageKey = 'decision-board-voter-id'

const getOrCreateVoterId = () => {
  if (typeof window === 'undefined') {
    return 'server'
  }
  const existing = window.localStorage.getItem(voterStorageKey)
  if (existing) {
    return existing
  }
  const generated = crypto.randomUUID()
  window.localStorage.setItem(voterStorageKey, generated)
  return generated
}

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(convexQuery(api.decisions.list, {}))
  },
  component: DecisionBoard,
})

type OptionWithVotes = Doc<'options'> & {
  votes: number
}

type DecisionWithOptions = Doc<'decisions'> & {
  options: Array<OptionWithVotes>
  selectedOptionId?: Id<'options'> | null
}

type DecisionDraft = {
  title: string
  options: Array<string>
}

const initialDraft: DecisionDraft = {
  title: '',
  options: [''],
}

function DecisionBoard() {
  const voterId = useMemo(() => getOrCreateVoterId(), [])

  const { data: decisions } = useSuspenseQuery(
    convexQuery(api.decisions.list, { voterId }),
  )
  const addDecision = useConvexMutation(api.decisions.add)
  const removeDecision = useConvexMutation(api.decisions.remove)
  const updateDecision = useConvexMutation(api.decisions.update)
  const addOption = useConvexMutation(api.decisions.addOption)
  const removeOption = useConvexMutation(api.decisions.removeOption)
  const voteOption = useConvexMutation(api.decisions.voteOption)
  const clearVote = useConvexMutation(api.decisions.clearVote)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft>(initialDraft)
  const [selected, setSelected] = useState<Record<string, Id<'options'>>>({})

  if (Object.keys(selected).length === 0 && decisions.length > 0) {
    const seeded = decisions.reduce<Record<string, Id<'options'>>>(
      (acc, decision) => {
        if (decision.selectedOptionId) {
          acc[decision._id] = decision.selectedOptionId
        }
        return acc
      },
      {},
    )

    if (Object.keys(seeded).length > 0) {
      setSelected(seeded)
    }
  }

  const sanitizedDraftOptions = useMemo(
    () =>
      draft.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [draft.options],
  )

  const canSubmit =
    draft.title.trim().length > 0 && sanitizedDraftOptions.length >= 1

  const handleCreateDecision = async () => {
    if (!canSubmit) return
    const title = draft.title.trim()

    await addDecision({
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

  const handleVote = async (decisionId: string, optionId: Id<'options'>) => {
    const previousVote = selected[decisionId]

    if (previousVote === optionId) {
      await clearVote({ decisionId: decisionId as Id<'decisions'>, voterId })
      setSelected((prev) => {
        const next = { ...prev }
        delete next[decisionId]
        return next
      })
      return
    }

    if (previousVote) {
      await clearVote({ decisionId: decisionId as Id<'decisions'>, voterId })
    }

    setSelected((prev) => ({ ...prev, [decisionId]: optionId }))
    await voteOption({ optionId, voterId })
  }

  const handleRemoveDecision = async (decisionId: Id<'decisions'>) => {
    await removeDecision({ id: decisionId })
  }

  const handleUpdateDecision = async (
    decision: DecisionWithOptions,
    payload: { title: string; options: Array<string> },
  ) => {
    await updateDecision({
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

    await Promise.all(
      removeTargets.map((option) => removeOption({ id: option._id })),
    )

    const existingTexts = new Set(existingOptions.map((option) => option.text))
    const nextOptions = trimmedOptions.filter(
      (option) => !existingTexts.has(option),
    )

    await Promise.all(
      nextOptions.map((text, index) =>
        addOption({
          decisionId: decision._id,
          text,
          position: existingOptions.length + index,
        }),
      ),
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <DecisionBoardHeader onCreate={() => setIsModalOpen(true)} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-20 pt-10">
        {decisions.length === 0 ? (
          <div className="rounded-4xl border border-white/70 bg-white/80 p-10 text-center text-sm text-slate-500 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            No decisions yet. Start by creating one.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {decisions.map((decision) => (
              <DecisionCard
                key={decision._id}
                decision={decision}
                selectedOptionId={selected[decision._id]}
                onVote={(optionId: Id<'options'>) =>
                  handleVote(decision._id, optionId)
                }
                onDelete={() => handleRemoveDecision(decision._id)}
                onSave={(payload: { title: string; options: Array<string> }) =>
                  handleUpdateDecision(decision, payload)
                }
              />
            ))}
          </div>
        )}
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
