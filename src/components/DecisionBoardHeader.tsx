import { ArrowLeft, Plus, Share2 } from 'lucide-react'

type DecisionBoardHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  onShare?: () => void
  onCreate: () => void
}

export default function DecisionBoardHeader({
  title,
  subtitle,
  onBack,
  onShare,
  onCreate,
}: DecisionBoardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/78 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <span className="text-[12px] font-medium text-slate-500 font-['IBM_Plex_Mono',monospace]">
            {subtitle ?? 'Decision Board'}
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="glass-panel inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <ArrowLeft size={14} />
              Boards
            </button>
          ) : null}
          {onShare ? (
            <button
              type="button"
              onClick={onShare}
              className="glass-panel inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              <Share2 size={14} />
              Share
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-950 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            <Plus size={14} />
            New decision
          </button>
        </div>
      </div>
    </header>
  )
}
