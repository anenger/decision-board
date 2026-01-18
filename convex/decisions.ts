import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

export const list = query({
  args: { voterId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { voterId } = args

    const decisions = await ctx.db.query('decisions').order('asc').collect()
    const options = await ctx.db.query('options').order('asc').collect()
    const votes = await ctx.db.query('votes').collect()

    const optionsByDecisionId = decisions.reduce((map, decision) => {
      map.set(
        decision._id,
        options.filter((option) => option.decisionId === decision._id),
      )
      return map
    }, new Map<Id<'decisions'>, Array<Doc<'options'>>>())

    const voteCountsByOption = options.reduce((map, option) => {
      const count = votes.filter((vote) => vote.optionId === option._id).length
      map.set(option._id, count)
      return map
    }, new Map<Id<'options'>, number>())

    return decisions.map((decision) => {
      const decisionOptions = optionsByDecisionId.get(decision._id) ?? []
      return {
        ...decision,
        options: decisionOptions.map((option) => ({
          ...option,
          isSelected: voterId
            ? votes.some(
                (vote) =>
                  vote.optionId === option._id && vote.voterId === voterId,
              )
            : false,
          votes: voteCountsByOption.get(option._id) ?? 0,
        })),
      }
    })
  },
})

export const addDecision = mutation({
  args: {
    title: v.string(),
    options: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const decisionId = await ctx.db.insert('decisions', {
      title: args.title,
    })

    await Promise.all(
      args.options.map((text: string, index: number) =>
        ctx.db.insert('options', {
          decisionId,
          text,
          position: index,
        }),
      ),
    )

    return decisionId
  },
})

export const removeDecision = mutation({
  args: { id: v.id('decisions') },
  handler: async (ctx, args) => {
    const options = await ctx.db
      .query('options')
      .withIndex('by_decision', (q) => q.eq('decisionId', args.id))
      .collect()

    const votes = await ctx.db
      .query('votes')
      .withIndex('by_decision', (q) => q.eq('decisionId', args.id))
      .collect()

    await Promise.all(options.map((option) => ctx.db.delete(option._id)))
    await Promise.all(votes.map((vote) => ctx.db.delete(vote._id)))
    return await ctx.db.delete(args.id)
  },
})

export const updateDecision = mutation({
  args: {
    id: v.id('decisions'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
    })
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

export const vote = mutation({
  args: {
    decisionId: v.id('decisions'),
    optionId: v.id('options'),
    voterId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingVote = await ctx.db
      .query('votes')
      .withIndex('by_decision_voter', (q) =>
        q.eq('decisionId', args.decisionId).eq('voterId', args.voterId),
      )
      .first()

    if (existingVote) {
      // If a vote already exists for this voter and decision, remove it
      await ctx.db.delete(existingVote._id)
    }

    // If the existing vote is for the same option, we are done
    if (existingVote && existingVote.optionId === args.optionId) {
      return
    }

    // Insert the new vote
    await ctx.db.insert('votes', {
      optionId: args.optionId,
      decisionId: args.decisionId,
      voterId: args.voterId,
    })
  },
})
