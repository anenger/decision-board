import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

import type { Doc, Id } from '../../convex/_generated/dataModel'

type OptionWithVotes = Doc<'options'> & {
  votes: number
}

type DecisionWithOptions = Doc<'decisions'> & {
  options: Array<OptionWithVotes>
}

type DecisionCardProps = {
  decision: DecisionWithOptions
  selectedOptionId?: Id<'options'>
  onVote: (optionId: Id<'options'>) => void
  onDelete: () => void
  onSave: (payload: { title: string; options: Array<string> }) => void
}

type DecisionDraft = {
  title: string
  options: Array<string>
}

export default function DecisionCard({
  decision,
  selectedOptionId,
  onVote,
  onDelete,
  onSave,
}: DecisionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft>({
    title: decision.title,
    options: decision.options.map((option) => option.text),
  })

  const totalVotes = useMemo(
    () => decision.options.reduce((sum, option) => sum + option.votes, 0),
    [decision.options],
  )

  const sanitizedOptions = useMemo(
    () =>
      draft.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
    [draft.options],
  )

  const canSave = draft.title.trim().length > 0 && sanitizedOptions.length >= 1

  const startEdit = () => {
    setDraft({
      title: decision.title,
      options: decision.options.map((option) => option.text),
    })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setDraft({
      title: decision.title,
      options: decision.options.map((option) => option.text),
    })
  }

  const handleSave = () => {
    if (!canSave) return
    onSave({
      title: draft.title.trim(),
      options: sanitizedOptions,
    })
    setIsEditing(false)
  }

  return (
    <article className="rounded-4xl border border-white/80 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          {isEditing ? (
            <input
              className="w-full rounded-3xl border border-slate-100 bg-white px-4 py-2 text-lg font-semibold text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] outline-none"
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
          ) : (
            <h3 className="text-xl font-semibold text-slate-900">
              {decision.title}
            </h3>
          )}
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300">
            {totalVotes} votes
          </p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-full border border-slate-100 bg-white p-2 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="rounded-full border border-slate-100 bg-white p-2 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-slate-100 bg-white p-2 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {isEditing ? (
          <div className="space-y-3">
            {draft.options.map((option, index) => (
              <div key={`${decision._id}-option-${index}`}>
                <input
                  className="w-full rounded-3xl border border-slate-100 bg-white px-4 py-2 text-sm text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] outline-none"
                  value={option}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      options: prev.options.map((entry, entryIndex) =>
                        entryIndex === index ? event.target.value : entry,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  options: [...prev.options, ''],
                }))
              }
              className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            >
              <Plus size={16} />
              Add option
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`w-full rounded-full px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition ${
                canSave
                  ? 'bg-slate-900 text-white'
                  : 'cursor-not-allowed bg-slate-200 text-slate-400'
              }`}
            >
              Save changes
            </button>
          </div>
        ) : (
          decision.options.map((option) => {
            const isSelected = selectedOptionId === option._id

            return (
              <button
                key={option._id}
                type="button"
                onClick={() => onVote(option._id)}
                className={`flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-left text-sm font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition ${
                  isSelected
                    ? 'border-slate-200 bg-slate-900 text-white'
                    : 'border-slate-100 bg-white text-slate-700 hover:-translate-y-0.5'
                }`}
              >
                <span className="flex items-center gap-2">
                  {isSelected && <Check size={16} />}
                  {option.text}
                </span>
                <span className="text-xs text-slate-400">{option.votes}</span>
              </button>
            )
          })
        )}
      </div>
    </article>
  )
}
