type AvatarPerson = {
  name: string
  image: string | null
  emoji: string
  color: string
}

/** A round sticker: a profile photo, or an animal emoji for guests. */
export function Avatar({
  person,
  size = 36,
  className = '',
}: {
  person: AvatarPerson
  size?: number
  className?: string
}) {
  return (
    <span
      title={person.name}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 2.5px ${person.color}`,
        fontSize: size * 0.55,
      }}
    >
      {person.image ? (
        <img
          src={person.image}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span aria-hidden="true" className="leading-none">
          {person.emoji}
        </span>
      )}
    </span>
  )
}
