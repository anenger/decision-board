export type NotificationView = {
  id: string
  kind: 'decisionClosed'
  boardId: string
  boardName: string
  decisionId: string
  title: string
  createdAt: number
  isRead: boolean
  /**
   * The winning options (ties included; empty if nobody voted), or null when
   * the board isn't showing results for this close, e.g. after a reopen.
   */
  winners: Array<string> | null
}

export type NotificationList = {
  items: Array<NotificationView>
  /** Across all of the viewer's notifications, not just the listed ones. */
  unreadCount: number
}

/** What a notification says. Only names a winner the server chose to send. */
export function describeNotification(notification: NotificationView): {
  headline: string
  result: string | null
} {
  const headline = `Voting closed on “${notification.title}” in ${notification.boardName}`
  const { winners } = notification
  if (winners === null) return { headline, result: null }
  if (winners.length === 0) return { headline, result: 'Nobody voted' }
  if (winners.length === 1) return { headline, result: `👑 ${winners[0]} won` }
  return { headline, result: `👑 Tie: ${listFormatter.format(winners)}` }
}

const listFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
})
