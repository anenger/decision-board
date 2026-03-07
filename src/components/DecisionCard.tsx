import { memo, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Doc, Id } from '../../convex/_generated/dataModel'

type OptionWithVotes = Doc<'options'> & {
  votes: number
  isSelected: boolean
}

type DecisionWithOptions = Doc<'decisions'> & {
  options: Array<OptionWithVotes>
}

type DecisionCardProps = {
  decision: DecisionWithOptions
  onVote: (optionId: Id<'options'>) => void
  onDelete: () => void
  onSave: (payload: { title: string; options: Array<string> }) => void
}

type DecisionDraft = {
  title: string
  options: Array<string>
}

type DecisionOptionRowProps = {
  option: OptionWithVotes
  fillWidth: string
  onVote: (optionId: Id<'options'>) => void
}

type VoteMetrics = {
  totalVotes: number
  totalOptions: number
  rows: Array<{ option: OptionWithVotes; fillWidth: string }>
}

function createDraft(decision: DecisionWithOptions): DecisionDraft {
  return {
    title: decision.title,
    options: decision.options.map((option) => option.text),
  }
}

function sanitizeOptions(options: Array<string>) {
  return options
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
}

function calculateVoteMetrics(options: Array<OptionWithVotes>): VoteMetrics {
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0)

  return {
    totalVotes,
    totalOptions: options.length,
    rows: options.map((option) => {
      const votePercentage = totalVotes > 0 ? option.votes / totalVotes : 0
      const fillPercentage = Math.max(0, Math.min(1, votePercentage))

      return {
        option,
        fillWidth: `${fillPercentage * 100}%`,
      }
    }),
  }
}

function IconButton({
  children,
  onClick,
  destructive = false,
  label,
}: {
  children: ReactNode
  onClick: () => void
  destructive?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        destructive
          ? 'text-[#9a9daa] hover:bg-red-50 hover:text-red-500'
          : 'text-[#9a9daa] hover:bg-[#f0f1f4] hover:text-[#3a3a4a]'
      }`}
    >
      {children}
    </button>
  )
}

const DecisionOptionRow = memo(function DecisionOptionRow({
  option,
  fillWidth,
  onVote,
}: DecisionOptionRowProps) {
  const isSelected = option.isSelected

  return (
    <button
      type="button"
      onClick={() => onVote(option._id)}
      className={`focus-ring group relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${
        isSelected
          ? 'border-[#4f6df5]/30 bg-[#4f6df5]/4 text-[#1a1a2e]'
          : 'border-[#e2e4ea] bg-white text-[#3a3a4a] hover:border-[#d0d3db] hover:bg-[#fafbfc]'
      }`}
    >
      {/* Vote fill bar */}
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 transition-all duration-300 ${
          isSelected ? 'bg-[#4f6df5]/8' : 'bg-[#f0f1f4]'
        }`}
        style={{ width: fillWidth }}
      />

      <span className="relative z-10 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          {isSelected ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4f6df5]">
              <Check size={10} className="text-white" />
            </span>
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-full border border-[#d0d3db] transition-colors group-hover:border-[#9a9daa]" />
          )}
          <span className="truncate">{option.text}</span>
        </span>
        <span className="shrink-0 font-['IBM_Plex_Mono',monospace] text-[11px] tabular-nums text-[#9a9daa]">
          {option.votes}
        </span>
      </span>
    </button>
  )
})

export default function DecisionCard({
  decision,
  onVote,
  onDelete,
  onSave,
}: DecisionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft>(() => createDraft(decision))

  const voteMetrics = useMemo(
    () => calculateVoteMetrics(decision.options),
    [decision.options],
  )

  const sanitizedOptions = useMemo(
    () => sanitizeOptions(draft.options),
    [draft.options],
  )

  const canSave = draft.title.trim().length > 0 && sanitizedOptions.length >= 1

  const resetDraft = () => {
    setDraft(createDraft(decision))
  }

  const startEdit = () => {
    resetDraft()
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    resetDraft()
  }

  const updateDraftOption = (index: number, value: string) => {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ),
    }))
  }

  const addDraftOption = () => {
    setDraft((prev) => ({
      ...prev,
      options: [...prev.options, ''],
    }))
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
    <article className="rounded-xl border border-[#e2e4ea] bg-white p-5">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isEditing ? (
            <input
              className="focus-ring w-full rounded-lg border border-[#e2e4ea] bg-[#fafbfc] px-3 py-2 text-[15px] font-semibold text-[#1a1a2e] placeholder:text-[#a0a3b1]"
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
          ) : (
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
              {decision.title}
            </h3>
          )}

          <p className="mt-1.5 font-['IBM_Plex_Mono',monospace] text-[11px] text-[#9a9daa]">
            {voteMetrics.totalVotes} vote
            {voteMetrics.totalVotes === 1 ? '' : 's'} ·{' '}
            {voteMetrics.totalOptions} option
            {voteMetrics.totalOptions === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5">
          {isEditing ? (
            <IconButton onClick={cancelEdit} label="Cancel editing">
              <X size={14} />
            </IconButton>
          ) : (
            <IconButton onClick={startEdit} label="Edit decision">
              <Pencil size={13} />
            </IconButton>
          )}

          <IconButton onClick={onDelete} destructive label="Delete decision">
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>

      {/* Options */}
      <div className="mt-4 space-y-2">
        {isEditing ? (
          <div className="space-y-2">
            {draft.options.map((option, index) => (
              <input
                key={`${decision._id}-option-${index}`}
                className="focus-ring w-full rounded-lg border border-[#e2e4ea] bg-[#fafbfc] px-3 py-2 text-[13px] text-[#1a1a2e] placeholder:text-[#a0a3b1]"
                placeholder="Option text…"
                value={option}
                onChange={(event) =>
                  updateDraftOption(index, event.target.value)
                }
              />
            ))}

            <button
              type="button"
              onClick={addDraftOption}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#6b6f80] transition-colors hover:bg-[#f0f1f4] hover:text-[#3a3a4a]"
            >
              <Plus size={12} />
              Add option
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`focus-ring w-full rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                canSave
                  ? 'bg-[#4f6df5] text-white hover:bg-[#4059d9]'
                  : 'cursor-not-allowed bg-[#f0f1f4] text-[#a0a3b1]'
              }`}
            >
              Save changes
            </button>
          </div>
        ) : (
          voteMetrics.rows.map(({ option, fillWidth }) => (
            <DecisionOptionRow
              key={option._id}
              option={option}
              fillWidth={fillWidth}
              onVote={onVote}
            />
          ))
        )}
      </div>
    </article>
  )
}
