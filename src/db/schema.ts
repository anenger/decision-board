import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

export * from './auth-schema'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull()

// Rows reference `user` with cascading deletes. Linking a guest to a real
// account moves its rows to the new user before Better Auth deletes the guest
// (see `moveGuestData` in src/server/auth.ts).

export const boards = sqliteTable(
  'boards',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [index('boards_owner_idx').on(table.ownerId)],
)

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdById: text('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    /** Voting stops at this time, if set. */
    closesAt: integer('closes_at', { mode: 'timestamp_ms' }),
    /** Set when someone closes voting by hand. */
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
    /** Per-option counts stay secret until voting closes. */
    hideResults: integer('hide_results', { mode: 'boolean' })
      .default(false)
      .notNull(),
    /**
     * The close (closed_at, or the deadline once it passed) that board members
     * were last notified about, so a retried alarm doesn't notify twice.
     */
    notifiedCloseAt: integer('notified_close_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('decisions_board_idx').on(table.boardId)],
)

/**
 * People invited to a board, other than its owner (boards.owner_id).
 * Anyone else who opens the board can only watch.
 */
export const boardMembers = sqliteTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['editor', 'voter'] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index('board_members_user_idx').on(table.userId),
  ],
)

/** One active invite link per board and role; resetting replaces the token. */
export const boardInvites = sqliteTable(
  'board_invites',
  {
    token: text('token').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['editor', 'voter'] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('board_invites_board_role_idx').on(table.boardId, table.role),
  ],
)

export const options = sqliteTable(
  'options',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    position: integer('position').notNull(),
    createdById: text('created_by_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('options_decision_position_idx').on(table.decisionId, table.position),
  ],
)

// One vote per user per decision, enforced by the primary key.
export const votes = sqliteTable(
  'votes',
  {
    decisionId: text('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    optionId: text('option_id')
      .notNull()
      .references(() => options.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.decisionId, table.userId] }),
    index('votes_option_idx').on(table.optionId),
    index('votes_user_idx').on(table.userId),
  ],
)

/**
 * In-app notifications, written by the board's Durable Object in the same
 * batch as the change that caused them. Rows only point at the question; the
 * text is worked out when read, so it never shows what the board would hide.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    decisionId: text('decision_id')
      .notNull()
      .references(() => decisions.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['decisionClosed'] }).notNull(),
    /** Which close this is about; closing again after a reopen is a new one. */
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('notifications_event_idx').on(
      table.userId,
      table.decisionId,
      table.kind,
      table.closedAt,
    ),
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    index('notifications_decision_idx').on(table.decisionId),
    index('notifications_board_idx').on(table.boardId),
  ],
)
