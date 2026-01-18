import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import DecisionBoardHeader from '@/components/DecisionBoardHeader'
import DecisionCard from '@/components/DecisionCard'
import DecisionCreateModal from '@/components/DecisionCreateModal'
import { login } from '@/lib/session'
import { Loader } from '@/components/Loader'
import {
  decisionQueries,
  useAddOptionMutation,
  useCreateDecisionMutation,
  useDeleteDecisionMutation,
  useRemoveOptionMutation,
  useUpdateDecisionMutation,
  useVoteMutation,
} from '@/data/queries'

export const Route = createFileRoute('/')({
  pendingComponent: () => <Loader />,
  loader: async ({ context: { queryClient } }) => {
    const voterId = await login()
    queryClient.ensureQueryData(decisionQueries.list(voterId))
    return { voterId }
  },
  component: DecisionBoard,
})

type OptionWithVotes = Doc<'options'> & {
  votes: number
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

function DecisionBoard() {
  const { voterId } = Route.useLoaderData()
  const { data: decisions } = useSuspenseQuery(decisionQueries.list(voterId))
  const { mutate: addDecision } = useCreateDecisionMutation()
  const { mutate: removeDecision } = useDeleteDecisionMutation()
  const { mutate: updateDecision } = useUpdateDecisionMutation()
  const { mutate: addOption } = useAddOptionMutation()
  const { mutate: removeOption } = useRemoveOptionMutation()
  const { mutate: vote } = useVoteMutation()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft>(initialDraft)

  const sanitizedDraftOptions = useMemo(
    () =>
      draft.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [draft.options],
  )

  const canSubmit =
    draft.title.trim().length > 0 && sanitizedDraftOptions.length >= 1

  const handleCreateDecision = () => {
    if (!canSubmit) return
    const title = draft.title.trim()

    addDecision({
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
                onVote={(optionId: Id<'options'>) => {
                  vote({
                    optionId,
                    voterId,
                    decisionId: decision._id,
                  })
                }}
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
