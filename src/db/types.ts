import type { BatchItem } from 'drizzle-orm/batch'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type * as schema from './schema'

/** Any async SQLite database with batch support: D1 in the app, libSQL in tests. */
export type BatchingDb = BaseSQLiteDatabase<'async', unknown, typeof schema> & {
  batch: (
    queries: readonly [BatchItem<'sqlite'>, ...Array<BatchItem<'sqlite'>>],
  ) => Promise<unknown>
}
