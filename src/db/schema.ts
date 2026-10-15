import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
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
  },
  (table) => [index('decisions_board_idx').on(table.boardId)],
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
    index('options_decision_position_idx').on(
      table.decisionId,
      table.position,
    ),
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
