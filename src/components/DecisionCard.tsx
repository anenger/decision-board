import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { Burst } from './Burst'
import type { FormEvent, KeyboardEvent } from 'react'
import type { DecisionView, OptionView } from '@/lib/board'
import type { Activity } from '@/lib/board-sync/board-client'
import { hashString } from '@/lib/board-sync/persona'

const CARD_THEMES = [
  { card: 'bg-bubblegum', fill: '#ffb3cf' },
  { card: 'bg-tangerine', fill: '#ffbf8f' },
  { card: 'bg-butter', fill: '#ffe07d' },
  { card: 'bg-mint', fill: '#9fe3c0' },
  { card: 'bg-sky', fill: '#a8d1ff' },
  { card: 'bg-lilac', fill: '#cbb7ff' },
]

const ACTIVITY_LABELS: Record<Activity['kind'], string> = {
  setVote: 'voted!',
  addOption: 'added an option',
  createDecision: 'asked this',
  renameDecision: 'renamed this',
  deleteDecision: 'deleted this',
}

type DecisionCardProps = {
  decision: DecisionView
  /** Someone else's most recent change to this decision, if any. */
  activity: Activity | undefined
  onVote: (optionId: string) => void
  onDelete: () => void
  onRename: (title: string) => void
  onAddOption: (text: string) => void
}

export default function DecisionCard({
  decision,
  activity,
  onVote,
  onDelete,
  onRename,
  onAddOption,
}: DecisionCardProps) {
  const theme =
    CARD_THEMES[hashString(decision.id) % CARD_THEMES.length] ?? CARD_THEMES[0]
  const cardRef = useRef<HTMLElement>(null)
  const totalVotes = decision.options.reduce((sum, o) => sum + o.votes, 0)

  // A little shake when someone else touches this card.
  useEffect(() => {
    if (!activity || !cardRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    cardRef.current.animate(
      [
        { transform: 'rotate(0)' },
        { transform: 'rotate(-1.4deg) scale(1.01)' },
        { transform: 'rotate(1.2deg) scale(1.01)' },
        { transform: 'rotate(-0.6deg)' },
        { transform: 'rotate(0)' },
      ],
      { duration: 550, easing: 'ease-in-out' },
    )
  }, [activity?.id])

  return (
    <article
      ref={cardRef}
      className={`sticker relative p-4 sm:p-5 ${theme.card}`}
      aria-labelledby={`decision-${decision.id}`}
    >
      {activity && (
        <div
          key={activity.id}
          role="status"
          className="anim-pop absolute -top-4 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border-2 border-ink bg-white py-1 pl-1 pr-3 text-sm font-bold shadow-sticker"
        >
          <Avatar person={activity.person} size={24} />
          <span className="truncate">
            {activity.person.name} {ACTIVITY_LABELS[activity.kind]}
          </span>
        </div>
      )}

      <CardHeader decision={decision} onRename={onRename} onDelete={onDelete} />

      <p className="mt-1 text-sm font-semibold text-ink-soft">
        {totalVotes === 0
          ? 'No votes yet, be the first!'
          : `${totalVotes} vote${totalVotes === 1 ? '' : 's'} so far`}
      </p>

      <ul className="mt-4 space-y-2.5">
        {decision.options.map((option) => (
          <li key={option.id}>
            <OptionPill
              option={option}
              totalVotes={totalVotes}
              fill={theme.fill}
              onVote={onVote}
            />
          </li>
        ))}
      </ul>

      <AddOptionForm onAddOption={onAddOption} />
    </article>
  )
}

function CardHeader({
  decision,
  onRename,
  onDelete,
}: {
  decision: DecisionView
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(decision.title)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // A second tap is needed to delete; the first one arms it for a moment.
  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

  const save = () => {
    const title = draft.trim()
    if (title && title !== decision.title) onRename(title)
    setIsEditing(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      setDraft(decision.title)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label="Question"
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={save}
          className="focus-ring min-w-0 flex-1 rounded-2xl border-2 border-ink bg-white px-3 py-2 font-display text-lg font-semibold"
        />
        <button
          type="button"
          aria-label="Cancel editing"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setDraft(decision.title)
            setIsEditing(false)
          }}
          className="btn-icon focus-ring h-11 w-11 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <h3
        id={`decision-${decision.id}`}
        className="min-w-0 flex-1 pt-1.5 text-xl leading-tight font-semibold wrap-anywhere sm:text-2xl"
      >
        {decision.title}
      </h3>
      {decision.canEdit && (
        <div className="-mr-1.5 -mt-0.5 flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Rename question"
            onClick={() => {
              setDraft(decision.title)
              setIsEditing(true)
            }}
            className="btn-icon focus-ring h-11 w-11 text-ink-soft"
          >
            <Pencil size={17} />
          </button>
          {confirmingDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="anim-pop focus-ring h-9 rounded-full border-2 border-ink bg-tomato px-3 font-display text-sm font-semibold text-white"
            >
              Delete?
            </button>
          ) : (
            <button
              type="button"
              aria-label="Delete question"
              onClick={() => setConfirmingDelete(true)}
              className="btn-icon focus-ring h-11 w-11 text-ink-soft"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const OptionPill = memo(function OptionPill({
  option,
  totalVotes,
  fill,
  onVote,
}: {
  option: OptionView
  totalVotes: number
  fill: string
  onVote: (optionId: string) => void
}) {
  const [burst, setBurst] = useState(0)
  const share = totalVotes > 0 ? option.votes / totalVotes : 0
  const percent = Math.round(share * 100)

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={option.isSelected}
        onClick={() => {
          if (!option.isSelected) setBurst((n) => n + 1)
          onVote(option.id)
        }}
        className={`focus-ring relative flex min-h-[3.25rem] w-full items-center overflow-hidden rounded-2xl border-2 border-ink bg-white text-left transition-transform duration-150 active:scale-[0.97] ${
          option.isSelected ? 'shadow-sticker' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="vote-fill absolute inset-y-0 left-0"
          style={{ width: `${share * 100}%`, backgroundColor: fill }}
        />
        <span className="relative flex w-full items-center gap-3 px-3 py-2.5">
          <span
            key={String(option.isSelected)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink ${
              option.isSelected ? 'anim-pop bg-tomato' : 'bg-white'
            }`}
          >
            {option.isSelected && (
              <Check size={14} strokeWidth={3.5} className="text-white" />
            )}
          </span>
          <span className="min-w-0 flex-1 font-semibold wrap-anywhere">
            {option.text}
          </span>
          <span className="shrink-0 text-right">
            <span
              key={option.votes}
              className="anim-bump inline-block font-display text-lg font-semibold tabular-nums"
            >
              {option.votes}
            </span>
            {totalVotes > 0 && (
              <span className="ml-1 hidden text-xs font-semibold text-ink-soft min-[380px]:inline">
                {percent}%
              </span>
            )}
          </span>
        </span>
      </button>
      {burst > 0 && (
        <Burst key={burst} seed={burst} className="left-6 top-1/2" />
      )}
    </div>
  )
})

function AddOptionForm({
  onAddOption,
}: {
  onAddOption: (text: string) => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canAdd = useMemo(() => text.trim().length > 0, [text])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canAdd) return
    onAddOption(text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="mt-3 flex items-center gap-2">
      <input
        ref={inputRef}
        value={text}
        maxLength={200}
        onChange={(event) => setText(event.target.value)}
        placeholder="Add another option…"
        aria-label="Add another option"
        className="focus-ring min-h-11 min-w-0 flex-1 rounded-2xl border-2 border-dashed border-ink/40 bg-white/60 px-3.5 py-2 text-base placeholder:text-ink-faint focus:border-solid focus:border-ink focus:bg-white"
      />
      <button
        type="submit"
        aria-label="Add option"
        disabled={!canAdd}
        className="btn-chunky focus-ring h-11 w-11 shrink-0 bg-white p-0"
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </form>
  )
}
