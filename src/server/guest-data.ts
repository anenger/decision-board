import { and, eq, inArray } from 'drizzle-orm'
import type { BatchingDb } from '@/db/types'
import * as schema from '@/db/schema'

/**
 * Moves a guest's boards, memberships, decisions, options and votes to the
 * account they signed in with. Must run before Better Auth deletes the guest,
 * whose rows would otherwise be removed by cascading deletes. Where both
 * accounts voted on the same decision, the signed-in account's vote wins;
 * where both are members of a board, the higher role wins.
 */
export async function moveGuestData(
  db: BatchingDb,
  guestId: string,
  userId: string,
) {
  const { boardMembers, boards, decisions, options, votes } = schema
  const decisionsUserVotedOn = db
    .select({ decisionId: votes.decisionId })
    .from(votes)
    .where(eq(votes.userId, userId))
  const boardsOwnedBy = (ownerId: string) =>
    db.select({ id: boards.id }).from(boards).where(eq(boards.ownerId, ownerId))
  const boardsWhereMember = (memberId: string, role?: 'editor') =>
    db
      .select({ boardId: boardMembers.boardId })
      .from(boardMembers)
      .where(
        role
          ? and(eq(boardMembers.userId, memberId), eq(boardMembers.role, role))
          : eq(boardMembers.userId, memberId),
      )

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

    // Memberships: keep the higher role where both accounts belong to a board,
    // and drop memberships of boards the merged account will own.
    db
      .update(boardMembers)
      .set({ role: 'editor' })
      .where(
        and(
          eq(boardMembers.userId, userId),
          inArray(boardMembers.boardId, boardsWhereMember(guestId, 'editor')),
        ),
      ),
    db
      .delete(boardMembers)
      .where(
        and(
          eq(boardMembers.userId, userId),
          inArray(boardMembers.boardId, boardsOwnedBy(guestId)),
        ),
      ),
    db
      .delete(boardMembers)
      .where(
        and(
          eq(boardMembers.userId, guestId),
          inArray(boardMembers.boardId, boardsWhereMember(userId)),
        ),
      ),
    db
      .delete(boardMembers)
      .where(
        and(
          eq(boardMembers.userId, guestId),
          inArray(boardMembers.boardId, boardsOwnedBy(userId)),
        ),
      ),
    db
      .update(boardMembers)
      .set({ userId })
      .where(eq(boardMembers.userId, guestId)),

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
