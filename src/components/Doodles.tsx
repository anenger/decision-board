/**
 * Soft shapes drifting behind every page. On phones only two peek in from
 * the edges, clear of the content padding; the rest appear on wider screens.
 */
export function Doodles() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Shape
        className="top-24 -left-8 w-11 sm:top-28 sm:left-6 sm:w-24"
        tilt={-12}
        duration={7}
      >
        <path
          d="M50 6l11 27 29 2-22 19 7 29-25-16-25 16 7-29L10 35l29-2Z"
          fill="#ffd0e2"
          stroke="#2a2238"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </Shape>
      <Shape
        className="top-[22rem] -right-8 w-11 sm:top-40 sm:right-10 sm:w-20"
        tilt={10}
        duration={8}
      >
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="#c8f0db"
          stroke="#2a2238"
          strokeWidth="3"
        />
        <circle cx="50" cy="50" r="14" fill="#2a2238" opacity="0.12" />
      </Shape>
      <Shape
        className="bottom-16 left-16 hidden w-28 sm:block"
        tilt={6}
        duration={9}
      >
        <path
          d="M8 60c10-22 20-22 28 0s18 22 28 0 20-22 28 0"
          fill="none"
          stroke="#ff9a62"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </Shape>
      <Shape
        className="right-24 bottom-28 hidden w-20 sm:block"
        tilt={-8}
        duration={6.5}
      >
        <rect
          x="16"
          y="16"
          width="68"
          height="68"
          rx="18"
          fill="#cfe6ff"
          stroke="#2a2238"
          strokeWidth="3"
          transform="rotate(14 50 50)"
        />
      </Shape>
    </div>
  )
}

function Shape({
  className,
  tilt,
  duration,
  children,
}: {
  className: string
  tilt: number
  duration: number
  children: React.ReactNode
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`anim-float absolute opacity-70 ${className}`}
      style={
        {
          '--tilt': `${tilt}deg`,
          '--float-duration': `${duration}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </svg>
  )
}
