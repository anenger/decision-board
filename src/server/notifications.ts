import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
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
 * The viewer's latest notifications, worked out against the board as it is
 * now: the winner is only included while the close it announces is still in
 * effect, which is exactly when the board shows the results.
 */
export async function listNotifications(
  db: BatchingDb,
  userId: string,
  now: number,
): Promise<NotificationList> {
  const mine = eq(notifications.userId, userId)
  const [rows, unread] = (await db.batch([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        closedAt: notifications.closedAt,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        boardId: notifications.boardId,
        boardName: boards.name,
        decisionId: notifications.decisionId,
        title: decisions.title,
        // D1 returns rows by position and mixes up columns that share a
        // name, so nothing selected here may repeat one (closed_at, id).
        decisionClosedAt: sql`${decisions.closedAt}`
          .mapWith(decisions.closedAt)
          .as('decision_closed_at'),
        decisionClosesAt: decisions.closesAt,
      })
      .from(notifications)
      .innerJoin(decisions, eq(decisions.id, notifications.decisionId))
      .innerJoin(boards, eq(boards.id, notifications.boardId))
      .where(mine)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(NOTIFICATION_LIST_LIMIT),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(mine, isNull(notifications.readAt))),
  ])) as [
    Array<{
      id: string
      kind: 'decisionClosed'
      closedAt: Date
      createdAt: Date
      readAt: Date | null
      boardId: string
      boardName: string
      decisionId: string
      title: string
      decisionClosedAt: Date | null
      decisionClosesAt: Date | null
    }>,
    Array<{ count: number }>,
  ]

  // Closed questions always show their results (see publicState), so the
  // winner is safe to include while this close is the current one.
  const showsResults = new Set(
    rows
      .filter(
        (row) =>
          closeTimeOf(
            {
              closedAt: row.decisionClosedAt?.getTime() ?? null,
              closesAt: row.decisionClosesAt?.getTime() ?? null,
            },
            now,
          ) === row.closedAt.getTime(),
      )
      .map((row) => row.id),
  )
  const winners = await winnersOf(db, [
    ...new Set(
      rows.filter((row) => showsResults.has(row.id)).map((r) => r.decisionId),
    ),
  ])

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
        winners: showsResults.has(row.id)
          ? (winners.get(row.decisionId) ?? [])
          : null,
      }),
    ),
  }
}

/** The top options of each question (ties included); none without votes. */
async function winnersOf(db: BatchingDb, decisionIds: Array<string>) {
  const winners = new Map<string, Array<string>>()
  if (decisionIds.length === 0) return winners

  const counts = await db
    .select({
      decisionId: options.decisionId,
      text: options.text,
      votes: sql<number>`count(${votes.userId})`,
    })
    .from(options)
    .leftJoin(votes, eq(votes.optionId, options.id))
    .where(inArray(options.decisionId, decisionIds))
    .groupBy(options.id)
    .orderBy(options.position, options.id)

  for (const decisionId of decisionIds) {
    const own = counts.filter((c) => c.decisionId === decisionId)
    const top = Math.max(0, ...own.map((c) => c.votes))
    winners.set(
      decisionId,
      top === 0 ? [] : own.filter((c) => c.votes === top).map((c) => c.text),
    )
  }
  return winners
}

/** Marks some of the user's notifications read; other people's are untouched. */
export async function markNotificationsRead(
  db: BatchingDb,
  userId: string,
  ids: Array<string>,
  now: number,
) {
  if (ids.length === 0) return
  await db
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
