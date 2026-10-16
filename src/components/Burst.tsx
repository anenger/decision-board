const PARTICLES = ['✨', '🎉', '⭐', '💖', '✨', '🌟', '🎈', '💫']

/**
 * A one-off puff of sparkles from a point; position it with `className`.
 * Render it with a new `key` to fire again.
 */
export function Burst({
  seed,
  className = '',
}: {
  seed: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 h-0 w-0 ${className}`}
    >
      {PARTICLES.map((particle, index) => {
        const angle = (index / PARTICLES.length) * Math.PI * 2 + seed
        const distance = 34 + ((seed * 7 + index * 13) % 22)
        return (
          <span
            key={index}
            className="anim-burst absolute left-0 top-0 text-base"
            style={
              {
                '--dx': `${Math.cos(angle) * distance}px`,
                '--dy': `${Math.sin(angle) * distance * 0.7}px`,
                '--spin': `${(index % 2 ? 1 : -1) * 90}deg`,
              } as React.CSSProperties
            }
          >
            {particle}
          </span>
        )
      })}
    </span>
  )
}
