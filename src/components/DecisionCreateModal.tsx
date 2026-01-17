import { Plus, X } from 'lucide-react'

import type { Dispatch, SetStateAction } from 'react'

type DecisionDraft = {
  title: string
  options: Array<string>
}

type DecisionCreateModalProps = {
  isOpen: boolean
  draft: DecisionDraft
  onDraftChange: Dispatch<SetStateAction<DecisionDraft>>
  onAddOption: () => void
  onClose: () => void
  onCreate: () => void
  canSubmit: boolean
}

export default function DecisionCreateModal({
  isOpen,
  draft,
  onDraftChange,
  onAddOption,
  onClose,
  onCreate,
  canSubmit,
}: DecisionCreateModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 px-4 py-10 backdrop-blur">
      <div className="relative w-full max-w-lg rounded-4xl border border-white/80 bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full border border-slate-100 bg-white p-2 text-slate-400 shadow-[0_10px_25px_rgba(15,23,42,0.08)] transition hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-300">
            New decision
          </p>
          <h2 className="text-2xl font-semibold text-slate-900">
            Ask a question
          </h2>
        </div>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Question
            </label>
            <input
              className="w-full rounded-3xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] outline-none transition focus:border-slate-200"
              placeholder="What flavor of ice cream do you want?"
              value={draft.title}
              onChange={(event) =>
                onDraftChange((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Options
            </label>
            <div className="space-y-3">
              {draft.options.map((option, index) => (
                <input
                  key={`draft-option-${index}`}
                  className="w-full rounded-3xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] outline-none transition focus:border-slate-200"
                  placeholder="Add an option"
                  value={option}
                  onChange={(event) =>
                    onDraftChange((prev) => ({
                      ...prev,
                      options: prev.options.map((entry, entryIndex) =>
                        entryIndex === index ? event.target.value : entry,
                      ),
                    }))
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onAddOption}
              className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            >
              <Plus size={16} />
              Add option
            </button>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canSubmit}
            className={`flex-1 rounded-full px-6 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition ${
              canSubmit
                ? 'bg-slate-900 text-white hover:-translate-y-0.5'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-500 shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
