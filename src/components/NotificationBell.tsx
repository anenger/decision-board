import { Link } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { Mascot } from './Mascot'
import { Popover } from './Popover'
import type { NotificationView } from '@/lib/notifications'
import {
  notificationQueries,
  sessionQuery,
  useMarkNotificationsReadMutation,
} from '@/data/queries'
import { describeNotification } from '@/lib/notifications'
import { formatRelativeDate } from '@/lib/time'

/**
 * A bell with your unread count, opening the list of what you missed.
 * Visitors without an account have nothing to be told, so they get no bell.
 */
export function NotificationBell() {
  const {
    data: { viewer },
  } = useSuspenseQuery(sessionQuery)
  if (!viewer) return null
  return <BellMenu viewerId={viewer.id} />
}

function BellMenu({ viewerId }: { viewerId: string }) {
  // Not prefetched on the server, so the page never waits on it.
  const { data } = useQuery(notificationQueries.list(viewerId))
  const { mutate: markRead } = useMarkNotificationsReadMutation(viewerId)
  const unread = data?.unreadCount ?? 0

  return (
    <Popover
      wide
      label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      triggerClassName="btn-icon relative h-11 w-11"
      trigger={
        <>
          <Bell size={21} />
          {unread > 0 && (
            <span
              // Pops again whenever the count changes.
              key={unread}
              aria-hidden="true"
              className="anim-pop absolute top-0.5 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-tomato px-1 font-display text-[0.7rem] leading-none font-semibold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <div>
          <div className="flex min-h-11 items-center gap-2 pb-1 pl-1">
            <p className="flex-1 font-display text-lg font-semibold">
              Notifications
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead(undefined)}
                className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft hover:bg-ink/5 hover:text-ink"
              >
                <CheckCheck size={16} />
                Mark all read
              </button>
            )}
          </div>

          {!data ? (
            <p className="px-1 py-4 text-sm text-ink-soft">Checking…</p>
          ) : data.items.length === 0 ? (
            <div className="flex items-center gap-3 px-1 py-3">
              <Mascot mood="sleepy" size={44} className="shrink-0" />
              <p className="text-sm text-ink-soft">
                Nothing yet. You'll hear here when voting closes on your boards.
              </p>
            </div>
          ) : (
            <ul className="-mx-1 max-h-[min(24rem,calc(100dvh-9rem))] space-y-1 overflow-y-auto px-1 pb-1">
              {data.items.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (!item.isRead) markRead([item.id])
                    close()
                  }}
                  onMarkRead={() => markRead([item.id])}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}

function NotificationItem({
  item,
  onOpen,
  onMarkRead,
}: {
  item: NotificationView
  onOpen: () => void
  onMarkRead: () => void
}) {
  const { headline, result } = describeNotification(item)

  return (
    <li
      className={`flex items-start gap-1 rounded-2xl ${
        item.isRead ? '' : 'bg-butter/60'
      }`}
    >
      <Link
        to="/boards/$boardId"
        params={{ boardId: item.boardId }}
        hash={`decision-${item.decisionId}`}
        onClick={onOpen}
        className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded-2xl px-2 py-2 hover:bg-ink/5"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-base"
        >
          🗳️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug font-semibold wrap-anywhere">
            {headline}
          </span>
          {result && (
            <span className="mt-0.5 block text-sm leading-snug font-bold wrap-anywhere">
              {result}
            </span>
          )}
          <span className="mt-0.5 block text-xs font-semibold text-ink-faint">
            {item.isRead ? '' : <span className="sr-only">Unread. </span>}
            {formatRelativeDate(item.createdAt)}
          </span>
        </span>
      </Link>
      {!item.isRead && (
        <button
          type="button"
          onClick={onMarkRead}
          aria-label={`Mark as read: ${item.title}`}
          title="Mark as read"
          className="btn-icon focus-ring h-11 w-11 shrink-0 text-ink-soft hover:text-ink"
        >
          <Check size={18} strokeWidth={2.75} />
        </button>
      )}
    </li>
  )
}
