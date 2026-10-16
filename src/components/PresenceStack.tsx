import { Avatar } from './Avatar'
import { Popover } from './Popover'
import type { Person } from '@/lib/board-sync/protocol'

const MAX_SHOWN = 3

/** Everyone else looking at the board, as overlapping stickers. */
export function PresenceStack({
  people,
  you,
}: {
  people: Array<Person>
  you: string | null
}) {
  const others = people.filter((person) => person.key !== you)
  if (others.length === 0) return null

  const shown = others.slice(0, MAX_SHOWN)
  const extra = others.length - shown.length
  const label =
    others.length === 1
      ? `${others[0]?.name} is here too`
      : `${others.length} other people are here`

  return (
    <Popover
      label={label}
      triggerClassName="flex items-center rounded-full py-1 pl-1.5 pr-1"
      trigger={
        <span className="flex items-center">
          {shown.map((person, index) => (
            <span
              key={person.key}
              className="anim-pop -ml-2.5 first:ml-0"
              style={{ zIndex: MAX_SHOWN - index }}
            >
              <Avatar person={person} size={32} />
            </span>
          ))}
          {extra > 0 && (
            <span className="anim-pop -ml-2.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-ink bg-butter px-1.5 font-display text-xs font-semibold">
              +{extra}
            </span>
          )}
        </span>
      }
    >
      {() => (
        <div>
          <p className="px-1 pb-2 font-display text-sm font-semibold text-ink-soft">
            Here right now
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {people.map((person) => (
              <li
                key={person.key}
                className="flex items-center gap-3 rounded-2xl px-1 py-1.5"
              >
                <Avatar person={person} size={34} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {person.name}
                </span>
                {person.key === you ? (
                  <span className="rounded-full bg-butter px-2 py-0.5 text-xs font-bold">
                    you
                  </span>
                ) : person.isGuest ? (
                  <span className="text-xs text-ink-faint">guest</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  )
}
