/** One row in a popover menu, like a question's or the board's ⋯ menu. */
export function MenuItem({
  icon,
  children,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left font-display font-semibold transition-colors hover:bg-ink/5 ${
        destructive ? 'text-tomato-deep' : ''
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
