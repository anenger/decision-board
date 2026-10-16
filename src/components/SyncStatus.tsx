import { X } from 'lucide-react'
import { Mascot } from './Mascot'
import type { ConnectionStatus } from '@/lib/board-sync/board-client'

const labels: Record<ConnectionStatus, string> = {
  live: 'Live',
  connecting: 'Connecting',
  offline: 'Offline',
}

export function SyncStatus({
  status,
  pendingCount,
}: {
  status: ConnectionStatus
  pendingCount: number
}) {
  const pending =
    pendingCount > 0
      ? ` · ${pendingCount} ${status === 'live' ? 'saving' : 'waiting'}`
      : ''

  return (
    <span
      role="status"
      data-testid="sync-status"
      className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-bold"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          status === 'live'
            ? 'anim-pulse-dot bg-[#2fbf7f]'
            : status === 'connecting'
              ? 'animate-pulse bg-[#f5b700]'
              : 'bg-ink-faint'
        }`}
      />
      {labels[status]}
      {pending}
    </span>
  )
}

/** A friendly toast that floats above the Ask button. */
export function SyncError({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-8">
      <div
        role="alert"
        className="anim-pop sticker pointer-events-auto flex w-full max-w-md items-center gap-3 bg-white py-2.5 pr-2 pl-3"
      >
        <Mascot mood="surprised" size={36} color="#ffd0e2" />
        <p className="min-w-0 flex-1 text-sm font-semibold">
          <span className="font-display">Whoops! </span>
          {message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="btn-icon focus-ring h-10 w-10 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
