import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { Burst } from './Burst'
import { MenuItem } from './MenuItem'
import { Popover } from './Popover'
import type { FormEvent, KeyboardEvent } from 'react'
import type { DecisionView, OptionView } from '@/lib/board'
import type { Activity } from '@/lib/board-sync/board-client'
import { hashString } from '@/lib/board-sync/persona'
import { useHydrated } from '@/lib/use-hydrated'

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
  // Replaced below with "closed voting" or "reopened voting".
  setDecisionClosed: 'changed voting',
}

function activityLabel(activity: Activity, isOpen: boolean) {
  if (activity.kind === 'setDecisionClosed') {
    return isOpen ? 'reopened voting' : 'closed voting'
  }
  return ACTIVITY_LABELS[activity.kind]
}

type DecisionCardProps = {
  decision: DecisionView
  /** Someone else's most recent change to this decision, if any. */
  activity: Activity | undefined
  onVote: (optionId: string) => void
  onDelete: () => void
  onRename: (title: string) => void
  onAddOption: (text: string) => void
  onSetClosed: (closed: boolean) => void
}

export default function DecisionCard({
  decision,
  activity,
  onVote,
  onDelete,
  onRename,
  onAddOption,
  onSetClosed,
}: DecisionCardProps) {
  const theme =
    CARD_THEMES[hashString(decision.id) % CARD_THEMES.length] ?? CARD_THEMES[0]
  const cardRef = useRef<HTMLElement>(null)
  const revealCount = useRevealCount(decision.isOpen, cardRef)

  // A little shake when someone else touches this card.
  useEffect(() => {
    if (!activity || !cardRef.current) return
    if (prefersReducedMotion()) return
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
          className="anim-pop absolute -top-4 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border-2 border-ink bg-white py-1 pr-3 pl-1 text-sm font-bold shadow-sticker"
        >
          <Avatar person={activity.person} size={24} />
          <span className="truncate">
            {activity.person.name} {activityLabel(activity, decision.isOpen)}
          </span>
        </div>
      )}

      <CardHeader
        decision={decision}
        onRename={onRename}
        onDelete={onDelete}
        onSetClosed={onSetClosed}
      />
      <DecisionStatus decision={decision} />
      {!decision.isOpen && (
        <WinnerBanner decision={decision} revealCount={revealCount} />
      )}

      <ul className="mt-4 space-y-2.5">
        {decision.options.map((option) => (
          <li key={option.id}>
            <OptionPill
              option={option}
              decision={decision}
              fill={theme.fill}
              revealCount={revealCount}
              onVote={onVote}
            />
          </li>
        ))}
      </ul>

      {decision.canVote && <AddOptionForm onAddOption={onAddOption} />}
    </article>
  )
}

/**
 * Counts how many times this card's results have been revealed while on
 * screen (voting closing), and gives the card a little hop each time.
 */
function useRevealCount(
  isOpen: boolean,
  cardRef: React.RefObject<HTMLElement | null>,
) {
  const [count, setCount] = useState(0)
  const wasOpen = useRef(isOpen)
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      setCount((n) => n + 1)
      if (!prefersReducedMotion()) {
        cardRef.current?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.035) rotate(-1deg)' },
            { transform: 'scale(1)' },
          ],
          { duration: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        )
      }
    }
    wasOpen.current = isOpen
  }, [isOpen, cardRef])
  return count
}

/** What's going on with this question: votes, deadline, secrecy, outcome. */
function DecisionStatus({ decision }: { decision: DecisionView }) {
  const hydrated = useHydrated()
  const now = useTicker(decision.isOpen ? decision.closesAt : null)
  const total = decision.totalVotes
  const votes = `${total} vote${total === 1 ? '' : 's'}`

  let text: string
  if (!decision.isOpen) {
    text =
      total === 0
        ? '🏁 Voting closed · nobody voted'
        : `🏁 Voting closed · ${votes}`
  } else if (decision.hideResults) {
    text = `🙈 Secret until it closes · ${votes} in`
  } else {
    text = total === 0 ? 'No votes yet, be the first!' : `${votes} so far`
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-sm font-semibold text-ink-soft wrap-anywhere">
        {text}
      </p>
      {/* Counts down from the viewer's clock, so only after hydration. */}
      {decision.isOpen && decision.closesAt !== null && hydrated && (
        <span className="inline-flex items-center rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold whitespace-nowrap">
          ⏰ {formatCountdown(decision.closesAt - now)}
        </span>
      )}
    </div>
  )
}

const listFormatter = new Intl.ListFormat('en', { type: 'conjunction' })

/**
 * The outcome of a closed question, big enough to read at a glance. Pops in
 * again each time results are revealed while the card is on screen.
 */
function WinnerBanner({
  decision,
  revealCount,
}: {
  decision: DecisionView
  revealCount: number
}) {
  const winners = decision.options.filter((o) => o.isWinner)
  if (winners.length === 0) return null

  const isTie = winners.length > 1
  const votes = winners[0]?.votes ?? 0
  const share =
    decision.totalVotes > 0
      ? Math.round((votes / decision.totalVotes) * 100)
      : 0

  return (
    <div
      key={revealCount}
      className="anim-pop mt-3 flex items-center gap-3 rounded-2xl border-2 border-ink bg-white px-3.5 py-2.5 shadow-sticker"
    >
      <span aria-hidden="true" className="shrink-0 text-3xl">
        {isTie ? '🤝' : '🏆'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">
          {isTie ? "It's a tie" : 'Winner'}
        </p>
        <p className="font-display text-xl leading-tight font-semibold wrap-anywhere">
          {listFormatter.format(winners.map((w) => w.text))}
        </p>
      </div>
      <p className="shrink-0 text-right text-sm leading-tight font-semibold text-ink-soft">
        <span className="block font-display text-lg text-ink tabular-nums">
          {share}%
        </span>
        {votes} vote{votes === 1 ? '' : 's'}
        {isTie ? ' each' : ''}
      </p>
    </div>
  )
}

function CardHeader({
  decision,
  onRename,
  onDelete,
  onSetClosed,
}: {
  decision: DecisionView
  onRename: (title: string) => void
  onDelete: () => void
  onSetClosed: (closed: boolean) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(decision.title)

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
      {decision.canManage && (
        <CardMenu
          isOpen={decision.isOpen}
          onRename={() => {
            setDraft(decision.title)
            setIsEditing(true)
          }}
          onSetClosed={onSetClosed}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

function CardMenu({
  isOpen,
  onRename,
  onSetClosed,
  onDelete,
}: {
  isOpen: boolean
  onRename: () => void
  onSetClosed: (closed: boolean) => void
  onDelete: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="-mt-0.5 -mr-1.5 shrink-0">
      <Popover
        label="Question options"
        anchored
        triggerClassName="btn-icon h-11 w-11 text-ink-soft"
        trigger={<MoreHorizontal size={20} />}
      >
        {(close) => (
          <div className="space-y-1">
            <MenuItem
              icon={<Pencil size={17} />}
              onClick={() => {
                close()
                onRename()
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              icon={isOpen ? <Lock size={17} /> : <LockOpen size={17} />}
              onClick={() => {
                close()
                onSetClosed(isOpen)
              }}
            >
              {isOpen ? 'Close voting now' : 'Reopen voting'}
            </MenuItem>
            {confirmingDelete ? (
              <button
                type="button"
                onClick={() => {
                  close()
                  onDelete()
                }}
                className="anim-pop focus-ring flex min-h-11 w-full items-center gap-3 rounded-2xl bg-tomato px-3 font-display font-semibold text-white"
              >
                <Trash2 size={17} />
                Tap again to delete
              </button>
            ) : (
              <MenuItem
                icon={<Trash2 size={17} />}
                destructive
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </MenuItem>
            )}
          </div>
        )}
      </Popover>
    </div>
  )
}

const OptionPill = memo(function OptionPill({
  option,
  decision,
  fill,
  revealCount,
  onVote,
}: {
  option: OptionView
  decision: DecisionView
  fill: string
  revealCount: number
  onVote: (optionId: string) => void
}) {
  const [burst, setBurst] = useState(0)
  const countsVisible = option.votes !== null
  const share =
    countsVisible && decision.totalVotes > 0
      ? (option.votes ?? 0) / decision.totalVotes
      : 0
  const isLoser = !decision.isOpen && !option.isWinner

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={option.isSelected}
        disabled={!decision.canVote}
        onClick={() => {
          if (!option.isSelected) setBurst((n) => n + 1)
          onVote(option.id)
        }}
        className={`focus-ring relative flex min-h-[3.25rem] w-full items-center overflow-hidden rounded-2xl border-2 border-ink bg-white text-left transition-[transform,opacity,filter] duration-200 enabled:active:scale-[0.97] disabled:cursor-default ${
          option.isSelected || option.isWinner ? 'shadow-sticker' : ''
        } ${option.isWinner ? 'ring-[3px] ring-tomato' : ''} ${
          isLoser ? 'opacity-50 grayscale' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="vote-fill absolute inset-y-0 left-0"
          style={{ width: `${share * 100}%`, backgroundColor: fill }}
        />
        <span className="relative flex w-full items-center gap-3 px-3 py-2.5">
          {option.isWinner ? (
            <span
              key={revealCount}
              className="anim-pop flex h-6 w-6 shrink-0 items-center justify-center text-xl"
              aria-label="Winner"
            >
              👑
            </span>
          ) : (
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
          )}
          <span className="min-w-0 flex-1 font-semibold wrap-anywhere">
            {option.text}
            {option.isSelected && !decision.canVote && (
              <span className="ml-1.5 text-xs font-bold text-ink-soft">
                your vote
              </span>
            )}
          </span>
          {countsVisible ? (
            <span className="shrink-0 text-right">
              <span
                key={option.votes}
                className="anim-bump inline-block font-display text-lg font-semibold tabular-nums"
              >
                {option.votes}
              </span>
              {decision.totalVotes > 0 && (
                <span className="ml-1 hidden text-xs font-semibold text-ink-soft min-[380px]:inline">
                  {Math.round(share * 100)}%
                </span>
              )}
            </span>
          ) : (
            <span aria-label="Hidden" className="shrink-0 text-lg">
              🙈
            </span>
          )}
        </span>
      </button>
      {burst > 0 && (
        <Burst key={burst} seed={burst} className="top-1/2 left-6" />
      )}
      {option.isWinner && revealCount > 0 && (
        <Burst
          key={`reveal-${revealCount}`}
          seed={revealCount + 3}
          className="top-1/2 left-6"
        />
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

/**
 * The current time, ticking every second in the last minute before a
 * deadline and every 30 seconds before that; still when there's none.
 */
function useTicker(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const remaining = deadline - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      remaining <= 60_000 ? 1_000 : Math.min(30_000, remaining - 59_000),
    )
    return () => clearTimeout(timer)
  }, [deadline, now])
  return now
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'closing…'
  const minutes = Math.ceil(ms / 60_000)
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s left`
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m left`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h left`
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
