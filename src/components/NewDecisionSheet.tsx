import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Sheet } from './Sheet'
import type { FormEvent, KeyboardEvent } from 'react'

const MAX_OPTIONS = 20
const HOUR = 60 * 60 * 1000

const DEADLINES = [
  { id: 'none', label: 'No deadline', ms: null },
  { id: '1h', label: '1 hour', ms: HOUR },
  { id: '1d', label: '1 day', ms: 24 * HOUR },
  { id: '3d', label: '3 days', ms: 72 * HOUR },
  { id: 'custom', label: 'Pick a time', ms: null },
] as const

type DeadlineChoice = (typeof DEADLINES)[number]['id']

export type NewDecision = {
  title: string
  options: Array<string>
  closesAt: number | null
  hideResults: boolean
}

/** Asks a new question, with an optional deadline and secret results. */
export function NewDecisionSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (decision: NewDecision) => void
}) {
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [deadline, setDeadline] = useState<DeadlineChoice>('none')
  const [customTime, setCustomTime] = useState('')
  const [hideResults, setHideResults] = useState(false)
  const optionRefs = useRef<Array<HTMLInputElement | null>>([])
  const focusIndex = useRef<number | null>(null)

  const filledOptions = options.map((o) => o.trim()).filter(Boolean)
  const closesAt = resolveDeadline(deadline, customTime)
  const deadlineValid = deadline !== 'custom' || closesAt !== null
  const canCreate =
    title.trim().length > 0 && filledOptions.length > 0 && deadlineValid

  // Focus a newly added option once it has rendered.
  useEffect(() => {
    if (focusIndex.current === null) return
    optionRefs.current[focusIndex.current]?.focus()
    focusIndex.current = null
  }, [options.length])

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return
    focusIndex.current = options.length
    setOptions((current) => [...current, ''])
  }

  const onOptionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (index === options.length - 1 && options[index]?.trim()) {
      addOption()
    } else {
      optionRefs.current[index + 1]?.focus()
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canCreate) return
    onCreate({
      title: title.trim(),
      options: filledOptions,
      // Recomputed at submit time so "1 hour" means an hour from now.
      closesAt: resolveDeadline(deadline, customTime),
      hideResults,
    })
  }

  return (
    <Sheet
      title="Ask the group"
      mood="wink"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <button
          type="submit"
          disabled={!canCreate}
          className="btn-chunky focus-ring w-full bg-tomato py-3 text-lg text-white"
        >
          Ask everyone
        </button>
      }
    >
      <label className="block">
        <span className="font-display text-sm font-semibold text-ink-soft">
          What are we deciding?
        </span>
        <input
          autoFocus
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Where should we eat?"
          className="focus-ring mt-1.5 w-full rounded-2xl border-2 border-ink bg-white px-4 py-3 font-display text-lg placeholder:text-ink-faint"
        />
      </label>

      <fieldset>
        <legend className="font-display text-sm font-semibold text-ink-soft">
          Options
        </legend>
        <ul className="mt-1.5 space-y-2">
          {options.map((option, index) => (
            <li key={index} className="anim-rise flex items-center gap-2">
              <input
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                value={option}
                maxLength={200}
                aria-label={`Option ${index + 1}`}
                placeholder={
                  ['Tacos 🌮', 'Pizza 🍕', 'Ramen 🍜'][index] ?? 'Another idea'
                }
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((entry, i) =>
                      i === index ? event.target.value : entry,
                    ),
                  )
                }
                onKeyDown={(event) => onOptionKeyDown(event, index)}
                className="focus-ring min-h-12 min-w-0 flex-1 rounded-2xl border-2 border-ink bg-white px-4 py-2.5 text-base placeholder:text-ink-faint"
              />
              {options.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  className="btn-icon focus-ring h-11 w-11 shrink-0 text-ink-soft"
                >
                  <X size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            className="focus-ring mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-display font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <Plus size={18} />
            Add an option
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="font-display text-sm font-semibold text-ink-soft">
          ⏰ Voting ends
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DEADLINES.map((choice) => (
            <label key={choice.id} className="cursor-pointer">
              <input
                type="radio"
                name="deadline"
                value={choice.id}
                checked={deadline === choice.id}
                onChange={() => setDeadline(choice.id)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-10 items-center rounded-full border-2 border-ink/20 bg-white px-3.5 text-sm font-bold text-ink-soft transition peer-checked:border-ink peer-checked:bg-butter peer-checked:text-ink peer-checked:shadow-sticker peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tomato">
                {choice.label}
              </span>
            </label>
          ))}
        </div>
        {deadline === 'custom' && (
          <>
            <input
              type="datetime-local"
              aria-label="Voting ends at"
              value={customTime}
              // Matches the server, which accepts any time in the future.
              min={toLocalInputValue(Date.now())}
              onChange={(event) => setCustomTime(event.target.value)}
              className="focus-ring anim-rise mt-2 min-h-12 w-full rounded-2xl border-2 border-ink bg-white px-4 text-base"
            />
            {customTime && closesAt === null && (
              <p
                role="alert"
                className="mt-1.5 text-sm font-semibold text-tomato-deep"
              >
                Pick a time in the future.
              </p>
            )}
          </>
        )}
      </fieldset>

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink/15 bg-white/70 p-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-display font-semibold">
            🙈 Keep results secret
          </span>
          <span className="block text-sm text-ink-soft">
            {deadline === 'none'
              ? 'Nobody sees the counts until you close voting.'
              : 'Nobody sees the counts until voting ends.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={hideResults}
          onChange={(event) => setHideResults(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-8 w-14 shrink-0 rounded-full border-2 border-ink bg-ink/10 transition-colors peer-checked:bg-tomato peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tomato after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:border-2 after:border-ink after:bg-white after:transition-transform after:duration-300 after:ease-[var(--ease-spring)] peer-checked:after:translate-x-6"
        />
      </label>
    </Sheet>
  )
}

function resolveDeadline(choice: DeadlineChoice, customTime: string) {
  if (choice === 'custom') {
    const time = customTime ? new Date(customTime).getTime() : NaN
    return Number.isFinite(time) && time > Date.now() ? time : null
  }
  const ms = DEADLINES.find((d) => d.id === choice)?.ms ?? null
  return ms === null ? null : Date.now() + ms
}

/** "2026-10-16T14:30" in the viewer's time zone, for datetime-local inputs. */
function toLocalInputValue(time: number) {
  const date = new Date(time)
  const offset = date.getTimezoneOffset() * 60 * 1000
  return new Date(time - offset).toISOString().slice(0, 16)
}
