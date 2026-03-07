import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const listMine = query({
  args: { voterId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('boards')
      .withIndex('by_owner', (q) => q.eq('ownerVoterId', args.voterId))
      .order('desc')
      .collect()
  },
})

export const get = query({
  args: { boardId: v.id('boards') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.boardId)
  },
})

export const create = mutation({
  args: {
    voterId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim()
    const fallbackName = 'Untitled board'

    return await ctx.db.insert('boards', {
      ownerVoterId: args.voterId,
      name: trimmedName.length > 0 ? trimmedName : fallbackName,
    })
  },
})
