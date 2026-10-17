const relativeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** "3 hours ago", or a date once it's over a month old. */
export function formatRelativeDate(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 30) return dateFormatter.format(new Date(timestamp))
  if (days > 0) return relativeFormatter.format(-days, 'day')
  if (hours > 0) return relativeFormatter.format(-hours, 'hour')
  if (minutes > 0) return relativeFormatter.format(-minutes, 'minute')
  return 'just now'
}
