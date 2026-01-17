type DecisionBoardHeaderProps = {
  onCreate: () => void
}

export default function DecisionBoardHeader({
  onCreate,
}: DecisionBoardHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-[0.5em] text-slate-300">
            Decision Board
          </span>
          <h1 className="text-2xl font-semibold text-slate-900">
            Open Decisions
          </h1>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-900 shadow-[0_14px_34px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.2)]"
        >
          Create
        </button>
      </div>
    </header>
  )
}
