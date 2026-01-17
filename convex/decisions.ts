import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const decisionKind = v.union(v.literal('multiple'), v.literal('binary'))

export const list = query({
  args: { voterId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_creation_time')
      .order('desc')
      .collect()

    const options = await Promise.all(
      decisions.map((decision) =>
        ctx.db
          .query('options')
          .withIndex('by_decision_position', (q) =>
            q.eq('decisionId', decision._id),
          )
          .collect(),
      ),
    )

    const votes = args.voterId
      ? await ctx.db
          .query('decisionVotes')
          .withIndex('by_voter', (q) => q.eq('voterId', args.voterId as string))
          .collect()
      : []

    const voteByDecision = new Map(
      votes.map((vote) => [vote.decisionId, vote.optionId]),
    )

    return decisions.map((decision, index) => ({
      ...decision,
      options: options[index] ?? [],
      selectedOptionId: voteByDecision.get(decision._id) ?? null,
    }))
  },
})

export const add = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    kind: decisionKind,
    options: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const decisionId = await ctx.db.insert('decisions', {
      title: args.title,
      description: args.description ?? '',
      kind: args.kind,
    })

    await Promise.all(
      args.options.map((text, index) =>
        ctx.db.insert('options', {
          decisionId,
          text,
          votes: 0,
          position: index,
        }),
      ),
    )

    return decisionId
  },
})

export const remove = mutation({
  args: { id: v.id('decisions') },
  handler: async (ctx, args) => {
    const options = await ctx.db
      .query('options')
      .withIndex('by_decision', (q) => q.eq('decisionId', args.id))
      .collect()

    await Promise.all(options.map((option) => ctx.db.delete(option._id)))
    return await ctx.db.delete(args.id)
  },
})

export const addOption = mutation({
  args: {
    decisionId: v.id('decisions'),
    text: v.string(),
    position: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('options', {
      decisionId: args.decisionId,
      text: args.text,
      votes: 0,
      position: args.position,
    })
  },
})

export const removeOption = mutation({
  args: { id: v.id('options') },
  handler: async (ctx, args) => {
    return await ctx.db.delete(args.id)
  },
})

export const voteOption = mutation({
  args: { optionId: v.id('options'), voterId: v.string() },
  handler: async (ctx, args) => {
    const option = await ctx.db.get(args.optionId)
    if (!option) {
      throw new Error('Option not found')
    }

    const existingVote = await ctx.db
      .query('decisionVotes')
      .withIndex('by_decision_voter', (q) =>
        q.eq('decisionId', option.decisionId).eq('voterId', args.voterId),
      )
      .unique()

    if (existingVote?.optionId === args.optionId) {
      return
    }

    if (existingVote) {
      const previousOption = await ctx.db.get(existingVote.optionId)
      if (previousOption) {
        await ctx.db.patch(previousOption._id, {
          votes: Math.max(0, previousOption.votes - 1),
        })
      }
      await ctx.db.delete(existingVote._id)

      const remaining = await ctx.db
        .query('decisionVotes')
        .withIndex('by_decision_voter', (q) =>
          q.eq('decisionId', option.decisionId).eq('voterId', args.voterId),
        )
        .unique()

      if (remaining) {
        await ctx.db.delete(remaining._id)
      }
    }

    await ctx.db.insert('decisionVotes', {
      decisionId: option.decisionId,
      optionId: args.optionId,
      voterId: args.voterId,
    })

    const freshOption = await ctx.db.get(args.optionId)
    if (!freshOption) {
      return
    }

    await ctx.db.patch(args.optionId, {
      votes: freshOption.votes + 1,
    })
  },
})

export const clearVote = mutation({
  args: { decisionId: v.id('decisions'), voterId: v.string() },
  handler: async (ctx, args) => {
    const existingVote = await ctx.db
      .query('decisionVotes')
      .withIndex('by_decision_voter', (q) =>
        q.eq('decisionId', args.decisionId).eq('voterId', args.voterId),
      )
      .unique()

    if (!existingVote) {
      return
    }

    const option = await ctx.db.get(existingVote.optionId)
    if (option) {
      await ctx.db.patch(option._id, {
        votes: Math.max(0, option.votes - 1),
      })
    }

    await ctx.db.delete(existingVote._id)
  },
})

export const update = mutation({
  args: {
    id: v.id('decisions'),
    title: v.string(),
    description: v.optional(v.string()),
    kind: decisionKind,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
      description: args.description ?? '',
      kind: args.kind,
    })
  },
})
