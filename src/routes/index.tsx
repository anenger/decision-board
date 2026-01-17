import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ConvexHttpClient } from 'convex/browser'
import { useMutation, useQuery } from 'convex/react'

import { api as convexApi } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { env } from '@/env'
import DecisionBoardHeader from '@/components/DecisionBoardHeader'
import DecisionCard from '@/components/DecisionCard'
import DecisionCreateModal from '@/components/DecisionCreateModal'

const fetchDecisions = async () => {
  const convexUrl = env.VITE_CONVEX_URL
  if (!convexUrl) {
    return [] as Array<DecisionWithOptions>
  }
  const convex = new ConvexHttpClient(convexUrl)
  return await convex.query(convexApi.decisions.list, {})
}

export const Route = createFileRoute('/')({
  loader: fetchDecisions,
  component: DecisionBoard,
})

type DecisionWithOptions = Doc<'decisions'> & {
  options: Array<Doc<'options'>>
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

function DecisionBoard() {
  const [voterId] = useState(() => getOrCreateVoterId())

  const initialDecisions = Route.useLoaderData()
  const liveDecisions = useQuery(convexApi.decisions.list, { voterId }) as
    | Array<DecisionWithOptions>
    | undefined
  const decisions = liveDecisions ?? initialDecisions

  const addDecision = useMutation(convexApi.decisions.add)
  const removeDecision = useMutation(convexApi.decisions.remove)
  const updateDecision = useMutation(convexApi.decisions.update)
  const addOption = useMutation(convexApi.decisions.addOption)
  const removeOption = useMutation(convexApi.decisions.removeOption)
  const voteOption = useMutation(convexApi.decisions.voteOption)
  const clearVote = useMutation(convexApi.decisions.clearVote)

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
      description: '',
      kind: 'multiple',
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
      description: decision.description,
      kind: decision.kind,
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
