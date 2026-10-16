type Mood = 'happy' | 'sleepy' | 'surprised' | 'wink'

/** A little ballot blob with a face, used for the logo and empty states. */
export function Mascot({
  mood = 'happy',
  size = 40,
  color = '#ffd34d',
  className = '',
}: {
  mood?: Mood
  size?: number
  color?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
    >
      {/* Body: a squishy rounded square */}
      <path
        d="M14 9c10-4 26-4 36 0 6 2.5 7.5 7 8 14 .6 9 .6 16 0 25-.5 7-3 10-9 11.5-11 2-23 2-34 0C9 58 6.5 55 6 48c-.6-9-.6-16 0-25 .5-7 2-11.5 8-14Z"
        fill={color}
        stroke="#2a2238"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Cheeks */}
      <ellipse cx="17" cy="38" rx="5" ry="3" fill="#ff8fb3" opacity="0.7" />
      <ellipse cx="47" cy="38" rx="5" ry="3" fill="#ff8fb3" opacity="0.7" />
      <Face mood={mood} />
    </svg>
  )
}

function Face({ mood }: { mood: Mood }) {
  const stroke = {
    stroke: '#2a2238',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    fill: 'none',
  }

  switch (mood) {
    case 'sleepy':
      return (
        <>
          <path d="M18 30q4 3 8 0" {...stroke} />
          <path d="M38 30q4 3 8 0" {...stroke} />
          <path d="M28 42q4 2 8 0" {...stroke} />
        </>
      )
    case 'surprised':
      return (
        <>
          <circle cx="22" cy="29" r="3.2" fill="#2a2238" />
          <circle cx="42" cy="29" r="3.2" fill="#2a2238" />
          <ellipse cx="32" cy="43" rx="4" ry="5" fill="#2a2238" />
        </>
      )
    case 'wink':
      return (
        <>
          <circle cx="22" cy="29" r="3.2" fill="#2a2238" />
          <path d="M38 30q4-3 8 0" {...stroke} />
          <path d="M24 40q8 8 16 0" {...stroke} />
        </>
      )
    default:
      return (
        <>
          <circle cx="22" cy="29" r="3.2" fill="#2a2238" />
          <circle cx="42" cy="29" r="3.2" fill="#2a2238" />
          <path d="M24 40q8 8 16 0" {...stroke} />
        </>
      )
  }
}
