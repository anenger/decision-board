import { and, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from '@/db/schema'

// Any async SQLite database with batch support: D1 in the app, libSQL in tests.
type BatchingDb = BaseSQLiteDatabase<'async', unknown, typeof schema> & {
  batch: (
    queries: readonly [BatchItem<'sqlite'>, ...Array<BatchItem<'sqlite'>>],
  ) => Promise<unknown>
}

/**
 * Moves a guest's boards, decisions, options and votes to the account they
 * signed in with. Must run before Better Auth deletes the guest, whose rows
 * would otherwise be removed by cascading deletes. Where both accounts voted
 * on the same decision, the signed-in account's vote wins.
 */
export async function moveGuestData(
  db: BatchingDb,
  guestId: string,
  userId: string,
) {
  const { boards, decisions, options, votes } = schema
  const decisionsUserVotedOn = db
    .select({ decisionId: votes.decisionId })
    .from(votes)
    .where(eq(votes.userId, userId))

  await db.batch([
    db
      .delete(votes)
      .where(
        and(
          eq(votes.userId, guestId),
          inArray(votes.decisionId, decisionsUserVotedOn),
        ),
      ),
    db.update(votes).set({ userId }).where(eq(votes.userId, guestId)),
    db
      .update(boards)
      .set({ ownerId: userId })
      .where(eq(boards.ownerId, guestId)),
    db
      .update(decisions)
      .set({ createdById: userId })
      .where(eq(decisions.createdById, guestId)),
    db
      .update(options)
      .set({ createdById: userId })
      .where(eq(options.createdById, guestId)),
  ])
}
