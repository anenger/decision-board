import { X } from 'lucide-react'
import type { ConnectionStatus } from '@/lib/board-sync/board-client'

const labels: Record<ConnectionStatus, string> = {
  live: 'Live',
  connecting: 'Connecting',
  offline: 'Offline',
}

const dotStyles: Record<ConnectionStatus, string> = {
  live: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  offline: 'bg-[#9a9daa]',
}

export function SyncStatus({
  status,
  pendingCount,
}: {
  status: ConnectionStatus
  pendingCount: number
}) {
  const pendingLabel =
    pendingCount > 0
      ? ` · ${pendingCount} change${pendingCount === 1 ? '' : 's'} ${status === 'live' ? 'saving' : 'pending'}`
      : ''

  return (
    <span
      role="status"
      data-testid="sync-status"
      className="inline-flex items-center gap-1.5 font-['IBM_Plex_Mono',monospace] text-[11px] text-[#6b6f80]"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {labels[status]}
      {pendingLabel}
    </span>
  )
}

export function SyncError({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      className="anim-fade-rise mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded-md text-red-500 hover:bg-red-100"
      >
        <X size={13} />
      </button>
    </div>
  )
}
