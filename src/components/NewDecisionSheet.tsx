import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Mascot } from './Mascot'
import type { FormEvent, KeyboardEvent } from 'react'

const MAX_OPTIONS = 20

/**
 * Asks a new question. A bottom sheet on phones, a dialog on wider screens.
 */
export function NewDecisionSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (title: string, options: Array<string>) => void
}) {
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState(['', ''])
  const optionRefs = useRef<Array<HTMLInputElement | null>>([])
  const focusIndex = useRef<number | null>(null)

  const filledOptions = options.map((o) => o.trim()).filter(Boolean)
  const canCreate = title.trim().length > 0 && filledOptions.length > 0

  // Lock the page behind the sheet and close on Escape.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

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
    if (canCreate) onCreate(title.trim(), filledOptions)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="anim-fade absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-decision-title"
        onSubmit={submit}
        className="anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] border-2 border-b-0 border-ink bg-paper sm:max-w-lg sm:rounded-[2rem] sm:border-b-2 sm:shadow-sticker-lg"
      >
        {/* Grab handle, a phone-sheet cue */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-ink/20 sm:hidden"
        />

        <div className="flex items-center gap-3 px-5 pt-3 sm:px-6 sm:pt-6">
          <Mascot mood="wink" size={44} className="shrink-0" />
          <h2 id="new-decision-title" className="flex-1 text-2xl font-semibold">
            Ask the group
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="btn-icon focus-ring h-11 w-11 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 pt-5 pb-2 sm:px-6">
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
                      ['Tacos 🌮', 'Pizza 🍕', 'Ramen 🍜'][index] ??
                      'Another idea'
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
        </div>

        <div className="border-t-2 border-ink/10 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <button
            type="submit"
            disabled={!canCreate}
            className="btn-chunky focus-ring w-full bg-tomato py-3 text-lg text-white"
          >
            Ask everyone
          </button>
        </div>
      </form>
    </div>
  )
}
