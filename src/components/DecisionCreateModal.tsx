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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-[#e2e4ea] bg-white p-6 shadow-[0_24px_48px_rgba(0,0,0,0.12)]">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="focus-ring absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9a9daa] transition-colors hover:bg-[#f0f1f4] hover:text-[#3a3a4a]"
        >
          <X size={15} />
        </button>

        {/* Header */}
        <div>
          <p className="font-['IBM_Plex_Mono',monospace] text-[11px] font-medium tracking-[0.04em] uppercase text-[#9a9daa]">
            New decision
          </p>
          <h2 className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1a1a2e]">
            Ask one clear question
          </h2>
        </div>

        {/* Form */}
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="font-['IBM_Plex_Mono',monospace] text-[11px] font-medium tracking-[0.04em] uppercase text-[#9a9daa]">
              Question
            </label>
            <input
              className="focus-ring w-full rounded-lg border border-[#e2e4ea] bg-[#fafbfc] px-3 py-2.5 text-[14px] text-[#1a1a2e] placeholder:text-[#a0a3b1]"
              placeholder="Where should we host the launch party?"
              value={draft.title}
              onChange={(event) =>
                onDraftChange((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-['IBM_Plex_Mono',monospace] text-[11px] font-medium tracking-[0.04em] uppercase text-[#9a9daa]">
              Options
            </label>

            <div className="space-y-2">
              {draft.options.map((option, index) => (
                <input
                  key={`draft-option-${index}`}
                  className="focus-ring w-full rounded-lg border border-[#e2e4ea] bg-[#fafbfc] px-3 py-2.5 text-[14px] text-[#1a1a2e] placeholder:text-[#a0a3b1]"
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
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#6b6f80] transition-colors hover:bg-[#f0f1f4] hover:text-[#3a3a4a]"
            >
              <Plus size={12} />
              Add option
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canSubmit}
            className={`focus-ring flex-1 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors ${
              canSubmit
                ? 'bg-[#4f6df5] text-white hover:bg-[#4059d9]'
                : 'cursor-not-allowed bg-[#f0f1f4] text-[#a0a3b1]'
            }`}
          >
            Create decision
          </button>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg border border-[#e2e4ea] bg-white px-4 py-2.5 text-[13px] font-medium text-[#3a3a4a] transition-colors hover:bg-[#fafbfc]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
