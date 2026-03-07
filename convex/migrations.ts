import { Migrations } from '@convex-dev/migrations'
import { components, internal } from './_generated/api'
import type { DataModel, Id } from './_generated/dataModel'

export const migrations = new Migrations<DataModel>(components.migrations)

export const clearLegacyDecisions = migrations.define({
  table: 'decisions',
  migrateOne: async (ctx, decision) => {
    const boardId = (decision as { boardId?: Id<'boards'> }).boardId
    if (boardId !== undefined) {
      return
    }

    const [options, votes] = await Promise.all([
      ctx.db
        .query('options')
        .withIndex('by_decision', (q) => q.eq('decisionId', decision._id))
        .collect(),
      ctx.db
        .query('votes')
        .withIndex('by_decision', (q) => q.eq('decisionId', decision._id))
        .collect(),
    ])

    await Promise.all([
      ...options.map((option) => ctx.db.delete(option._id)),
      ...votes.map((vote) => ctx.db.delete(vote._id)),
    ])

    await ctx.db.delete(decision._id)
  },
})

export const run = migrations.runner()
export const runClearLegacyDecisions = migrations.runner(
  internal.migrations.clearLegacyDecisions,
)
