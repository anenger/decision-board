const DOTS = ['bg-tomato', 'bg-[#f5b700]', 'bg-[#3a9bff]']

export function Loader() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-dvh items-center justify-center gap-3"
    >
      {DOTS.map((color, index) => (
        <span
          key={color}
          className={`anim-bounce-dot h-4 w-4 rounded-full border-2 border-ink ${color}`}
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  )
}
