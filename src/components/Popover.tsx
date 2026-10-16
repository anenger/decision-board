import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * A button that opens a small card below it. Closes on outside tap or
 * Escape, and stays inside the screen on narrow phones.
 */
export function Popover({
  label,
  trigger,
  children,
  triggerClassName = '',
}: {
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  triggerClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={`focus-ring ${triggerClassName}`}
      >
        {trigger}
      </button>
      {isOpen && (
        <div
          id={panelId}
          // Pinned to the screen edges on phones, so a trigger in the middle
          // of the header can't push it off-screen; anchored to it above sm.
          className="anim-pop sticker fixed inset-x-4 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 origin-top bg-white p-3 sm:absolute sm:inset-x-auto sm:top-[calc(100%+0.6rem)] sm:right-0 sm:w-72 sm:origin-top-right"
        >
          {children(() => setIsOpen(false))}
        </div>
      )}
    </div>
  )
}
