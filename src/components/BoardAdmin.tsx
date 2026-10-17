import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Mascot } from './Mascot'
import { MenuItem } from './MenuItem'
import { Popover } from './Popover'
import { Sheet } from './Sheet'
import type { FormEvent, KeyboardEvent } from 'react'
import { useDeleteBoardMutation } from '@/data/queries'
import { boardNameError } from '@/lib/board'
import { LIMITS } from '@/lib/board-sync/protocol'

/**
 * The board's big title. Its owner gets a ⋯ menu, like a question's, to
 * rename the board in place or delete it.
 */
export function BoardTitle({
  name,
  canManage,
  onRename,
  onDelete,
}: {
  name: string
  canManage: boolean
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft !== null) {
    return (
      <RenameForm
        draft={draft}
        current={name}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={(next) => {
          if (next !== name) onRename(next)
          setDraft(null)
        }}
      />
    )
  }

  return (
    <div className="flex items-start gap-2">
      <h1 className="min-w-0 flex-1 text-[2rem] leading-[1.1] font-semibold wrap-anywhere sm:text-5xl">
        {name}
      </h1>
      {canManage && (
        <div className="shrink-0 pt-0.5 sm:pt-2">
          <Popover
            label="Board options"
            anchored
            triggerClassName="btn-icon h-11 w-11"
            trigger={<MoreHorizontal size={22} />}
          >
            {(close) => (
              <div className="space-y-1">
                <MenuItem
                  icon={<Pencil size={17} />}
                  onClick={() => {
                    close()
                    setDraft(name)
                  }}
                >
                  Rename board
                </MenuItem>
                <MenuItem
                  icon={<Trash2 size={17} />}
                  destructive
                  onClick={() => {
                    close()
                    onDelete()
                  }}
                >
                  Delete board…
                </MenuItem>
              </div>
            )}
          </Popover>
        </div>
      )}
    </div>
  )
}

function RenameForm({
  draft,
  current,
  onChange,
  onCancel,
  onSave,
}: {
  draft: string
  current: string
  onChange: (draft: string) => void
  onCancel: () => void
  onSave: (name: string) => void
}) {
  const errorId = useId()
  const name = draft.trim()
  const error = boardNameError(name)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!error) onSave(name)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onCancel()
  }

  return (
    <form onSubmit={submit} className="anim-pop">
      <input
        autoFocus
        aria-label="Board name"
        aria-invalid={error !== null}
        aria-describedby={errorId}
        value={draft}
        maxLength={LIMITS.boardNameLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="focus-ring min-h-14 w-full rounded-2xl border-2 border-ink bg-white px-4 font-display text-2xl font-semibold sm:text-4xl"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={error !== null}
          className="btn-chunky focus-ring bg-tomato px-5 text-white"
        >
          {name === current ? 'Done' : 'Save name'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-chunky focus-ring bg-white px-5"
        >
          Cancel
        </button>
        <p
          id={errorId}
          className="min-w-0 flex-1 text-sm font-semibold text-ink-soft"
        >
          {error ?? `${name.length}/${LIMITS.boardNameLength}`}
        </p>
      </div>
    </form>
  )
}

/**
 * Confirms deleting a board by having its owner type the board's name, so it
 * can't happen with a stray tap.
 */
export function DeleteBoardSheet({
  boardId,
  name,
  questionCount,
  voteCount,
  onClose,
  onDeleted,
}: {
  boardId: string
  name: string
  questionCount: number
  voteCount: number
  onClose: () => void
  onDeleted: () => void
}) {
  const remove = useDeleteBoardMutation(boardId)
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const matches = typed.trim() === name

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!matches || remove.isPending) return
    remove.mutate(undefined, { onSuccess: onDeleted })
  }

  return (
    <Sheet
      title="Delete this board?"
      mood="surprised"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!matches || remove.isPending}
            className="btn-chunky focus-ring flex-1 bg-tomato text-white"
          >
            <Trash2 size={18} />
            {remove.isPending ? 'Deleting…' : 'Delete forever'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-chunky focus-ring bg-white px-5"
          >
            Keep it
          </button>
        </div>
      }
    >
      <p className="leading-snug">
        This deletes{' '}
        <strong className="font-display wrap-anywhere">“{name}”</strong> for
        everyone, with its {plural(questionCount, 'question')} and{' '}
        {plural(voteCount, 'vote')}. Invite links stop working, and anyone
        looking at it now is sent home. There's no undo.
      </p>
      <div>
        <label htmlFor={inputId} className="block font-semibold">
          Type the board's name to confirm
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={name}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="focus-ring mt-2 min-h-12 w-full rounded-2xl border-2 border-ink bg-white px-4 text-base"
        />
      </div>
      {remove.isError && (
        <p role="alert" className="text-sm font-semibold text-tomato-deep">
          {remove.error.message}
        </p>
      )}
    </Sheet>
  )
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** How long the "deleted" note stays up before heading home. */
const GO_HOME_MS = 4_000

/** Shown in every open tab once the board is deleted, then heads home. */
export function BoardDeleted({
  name,
  onGoHome,
}: {
  name: string
  onGoHome: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onGoHome, GO_HOME_MS)
    return () => clearTimeout(timer)
  }, [onGoHome])

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <Mascot mood="sleepy" size={110} className="anim-float" />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">
        This board was deleted
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft wrap-anywhere">
        “{name}” is gone, along with its questions and votes. Taking you home…
      </p>
      <Link
        to="/"
        className="btn-chunky focus-ring mt-7 bg-tomato px-6 text-white"
      >
        Take me home
      </Link>
    </div>
  )
}
