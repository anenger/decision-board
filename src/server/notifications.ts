import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { BatchingDb } from '@/db/types'
import type { DecisionState } from '@/lib/board-sync/protocol'
import type { NotificationList, NotificationView } from '@/lib/notifications'
import {
  boardMembers,
  boards,
  decisions,
  notifications,
  options,
  votes,
} from '@/db/schema'

/** How many notifications the bell lists; the unread count covers them all. */
export const NOTIFICATION_LIST_LIMIT = 30

/**
 * When voting on a question closed: by hand, or at its deadline once that has
 * passed. Null while it's open. Each close is a separate event, since
 * reopening clears both times.
 */
export function closeTimeOf(
  decision: Pick<DecisionState, 'closesAt' | 'closedAt'>,
  now: number,
): number | null {
  if (decision.closedAt !== null) return decision.closedAt
  if (decision.closesAt !== null && decision.closesAt <= now) {
    return decision.closesAt
  }
  return null
}

/**
 * Notifies everyone on the board (the owner and current members, read from
 * the database in the same statement) that voting closed, except whoever
 * closed it. Returns the user ids that got a new notification; running it
 * again for the same close adds nothing. Meant for a db.batch alongside the
 * write that closed the question.
 */
export function insertCloseNotifications(
  db: BatchingDb,
  close: {
    boardId: string
    decisionId: string
    closedAt: number
    exceptUserId: string | null
    now: number
  },
) {
  const notInvolved = (column: SQLiteColumn) =>
    close.exceptUserId === null ? undefined : ne(column, close.exceptUserId)

  // Columns must be selected in the table's order.
  const constants = {
    boardId: sql<string>`${close.boardId}`.as('board_id'),
    decisionId: sql<string>`${close.decisionId}`.as('decision_id'),
    kind: sql<'decisionClosed'>`'decisionClosed'`.as('kind'),
    closedAt: sql<Date>`${close.closedAt}`.as('closed_at'),
    createdAt: sql<Date>`${close.now}`.as('created_at'),
    readAt: sql<Date | null>`null`.as('read_at'),
  }
  const id = sql<string>`lower(hex(randomblob(16)))`.as('id')

  return db
    .insert(notifications)
    .select((qb) =>
      qb
        .select({ id, userId: boards.ownerId, ...constants })
        .from(boards)
        .where(and(eq(boards.id, close.boardId), notInvolved(boards.ownerId)))
        .union(
          qb
            .select({ id, userId: boardMembers.userId, ...constants })
            .from(boardMembers)
            .where(
              and(
                eq(boardMembers.boardId, close.boardId),
                notInvolved(boardMembers.userId),
              ),
            ),
        ),
    )
    .onConflictDoNothing()
    .returning({ userId: notifications.userId })
}

/**
 * The viewer's latest notifications on boards they're still on, worked out
 * against the board as it is now. A winner is only included while the close
 * it announces is still in effect, which is exactly when the board shows the
 * results. That check and the vote counts are read by the same statement, so
 * a reopen can't slip in between and reveal counts that are secret again.
 */
export async function listNotifications(
  db: BatchingDb,
  userId: string,
  now: number,
): Promise<NotificationList> {
  // Removed members keep their rows, but only see them again if re-added.
  const mine = and(
    eq(notifications.userId, userId),
    or(
      eq(boards.ownerId, userId),
      exists(
        db
          .select({ userId: boardMembers.userId })
          .from(boardMembers)
          .where(
            and(
              eq(boardMembers.boardId, notifications.boardId),
              eq(boardMembers.userId, userId),
            ),
          ),
      ),
    ),
  )
  const latest = db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(boards, eq(boards.id, notifications.boardId))
    .where(mine)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(NOTIFICATION_LIST_LIMIT)
  // Same rule as closeTimeOf: closed by hand, or the deadline has passed.
  const closeIsCurrent = sql`coalesce(${decisions.closedAt}, case when ${decisions.closesAt} <= ${now} then ${decisions.closesAt} end) = ${notifications.closedAt}`

  // A batch is one transaction, so all three see the same moment.
  const [rows, counts, unread] = (await db.batch([
    // D1 returns rows by position and mixes up columns that share a name, so
    // no select here may repeat one (id, closed_at, ...).
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        boardId: notifications.boardId,
        boardName: boards.name,
        decisionId: notifications.decisionId,
        title: decisions.title,
      })
      .from(notifications)
      .innerJoin(decisions, eq(decisions.id, notifications.decisionId))
      .innerJoin(boards, eq(boards.id, notifications.boardId))
      .where(inArray(notifications.id, latest))
      .orderBy(desc(notifications.createdAt), desc(notifications.id)),
    // Per-option counts, only for notifications whose close is current.
    db
      .select({
        notificationId: notifications.id,
        text: options.text,
        votes: sql<number>`count(${votes.userId})`,
      })
      .from(notifications)
      .innerJoin(decisions, eq(decisions.id, notifications.decisionId))
      .innerJoin(options, eq(options.decisionId, notifications.decisionId))
      .leftJoin(votes, eq(votes.optionId, options.id))
      .where(and(inArray(notifications.id, latest), closeIsCurrent))
      .groupBy(notifications.id, options.id)
      .orderBy(options.position, options.id),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .innerJoin(boards, eq(boards.id, notifications.boardId))
      .where(and(mine, isNull(notifications.readAt))),
  ])) as [
    Array<{
      id: string
      kind: 'decisionClosed'
      createdAt: Date
      readAt: Date | null
      boardId: string
      boardName: string
      decisionId: string
      title: string
    }>,
    Array<{ notificationId: string; text: string; votes: number }>,
    Array<{ count: number }>,
  ]

  return {
    unreadCount: unread[0]?.count ?? 0,
    items: rows.map(
      (row): NotificationView => ({
        id: row.id,
        kind: row.kind,
        boardId: row.boardId,
        boardName: row.boardName,
        decisionId: row.decisionId,
        title: row.title,
        createdAt: row.createdAt.getTime(),
        isRead: row.readAt !== null,
        winners: winnersOf(counts.filter((c) => c.notificationId === row.id)),
      }),
    ),
  }
}

/**
 * The top options (ties included; none if nobody voted), or null if no
 * counts came back because the close is no longer current.
 */
function winnersOf(counts: Array<{ text: string; votes: number }>) {
  if (counts.length === 0) return null
  const top = Math.max(...counts.map((c) => c.votes))
  return top === 0
    ? []
    : counts.filter((c) => c.votes === top).map((c) => c.text)
}

/**
 * Most ids one mark-read request may carry. D1 binds at most 100 parameters
 * per statement, and the update also binds the time and the user id. The
 * list never shows more than NOTIFICATION_LIST_LIMIT, so this is plenty.
 */
export const MARK_READ_MAX_IDS = 50

/** Ids to mark read, or none for all of them. */
export const markReadInputSchema = z.object({
  ids: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(MARK_READ_MAX_IDS)
    .optional(),
})

/** Marks some of the user's notifications read; other people's are untouched. */
export async function markNotificationsRead(
  db: BatchingDb,
  userId: string,
  ids: Array<string>,
  now: number,
) {
  if (ids.length === 0) return
  await markReadStatement(db, userId, ids, now)
}

export function markReadStatement(
  db: BatchingDb,
  userId: string,
  ids: Array<string>,
  now: number,
) {
  return db
    .update(notifications)
    .set({ readAt: new Date(now) })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      ),
    )
}

export async function markAllNotificationsRead(
  db: BatchingDb,
  userId: string,
  now: number,
) {
  await db
    .update(notifications)
    .set({ readAt: new Date(now) })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
}
