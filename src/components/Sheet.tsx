import { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { Mascot } from './Mascot'
import type { FormEvent, ReactNode } from 'react'

/**
 * A bottom sheet on phones and a springy dialog on wider screens. Pass
 * `onSubmit` to make the panel a form, with the submit button in `footer`.
 */
export function Sheet({
  title,
  mood = 'happy',
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string
  mood?: 'happy' | 'wink' | 'surprised'
  onClose: () => void
  onSubmit?: (event: FormEvent) => void
  footer?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()

  // Lock the page behind the sheet and close on Escape.
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const Panel = onSubmit ? 'form' : 'div'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="anim-fade absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />

      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] border-2 border-b-0 border-ink bg-paper sm:max-w-lg sm:rounded-[2rem] sm:border-b-2 sm:shadow-sticker-lg"
      >
        {/* Grab handle, a phone-sheet cue */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-ink/20 sm:hidden"
        />

        <div className="flex items-center gap-3 px-5 pt-3 sm:px-6 sm:pt-6">
          <Mascot mood={mood} size={44} className="shrink-0" />
          <h2 id={titleId} className="flex-1 text-2xl font-semibold">
            {title}
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

        <div
          className={`flex-1 space-y-5 overflow-y-auto px-5 pt-5 sm:px-6 ${
            footer ? 'pb-2' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="border-t-2 border-ink/10 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
            {footer}
          </div>
        )}
      </Panel>
    </div>
  )
}
