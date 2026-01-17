import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
  args: { voterId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_creation_time')
      .order('desc')
      .collect()

    const optionsByDecision = await Promise.all(
      decisions.map((decision) =>
        ctx.db
          .query('options')
          .withIndex('by_decision_position', (q) =>
            q.eq('decisionId', decision._id),
          )
          .collect(),
      ),
    )

    const allOptions = optionsByDecision.flat()
    const voteCounts = await Promise.all(
      allOptions.map((option) =>
        ctx.db
          .query('votes')
          .withIndex('by_option', (q) => q.eq('optionId', option._id))
          .collect(),
      ),
    )

    const optionVoteCounts = new Map(
      allOptions.map((option, index) => [
        option._id,
        voteCounts[index]?.length ?? 0,
      ]),
    )

    const votes = args.voterId
      ? await ctx.db
          .query('votes')
          .withIndex('by_voter', (q) => q.eq('voterId', args.voterId ?? ''))
          .collect()
      : []

    const optionDecisionMap = new Map(
      allOptions.map((option) => [option._id, option.decisionId]),
    )

    const voteByDecision = new Map(
      votes
        .map((vote) => {
          const decisionId = optionDecisionMap.get(vote.optionId)
          return decisionId ? [decisionId, vote.optionId] : null
        })
        .filter(
          (
            entry,
          ): entry is [
            (typeof decisions)[number]['_id'],
            (typeof votes)[number]['optionId'],
          ] => entry !== null,
        ),
    )

    return decisions.map((decision, index) => ({
      ...decision,
      options: (optionsByDecision[index] ?? []).map((option) => ({
        ...option,
        votes: optionVoteCounts.get(option._id) ?? 0,
      })),
      selectedOptionId: voteByDecision.get(decision._id) ?? null,
    }))
  },
})

export const add = mutation({
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

    const decisionOptions = await ctx.db
      .query('options')
      .withIndex('by_decision', (q) => q.eq('decisionId', option.decisionId))
      .collect()

    const decisionOptionIds = new Set(
      decisionOptions.map((decisionOption) => decisionOption._id),
    )

    const voterVotes = await ctx.db
      .query('votes')
      .withIndex('by_voter', (q) => q.eq('voterId', args.voterId))
      .collect()

    const existingVote = voterVotes.find((vote) =>
      decisionOptionIds.has(vote.optionId),
    )

    if (existingVote?.optionId === args.optionId) {
      return
    }

    if (existingVote) {
      await ctx.db.delete(existingVote._id)
    }

    await ctx.db.insert('votes', {
      optionId: args.optionId,
      voterId: args.voterId,
    })
  },
})

export const clearVote = mutation({
  args: { decisionId: v.id('decisions'), voterId: v.string() },
  handler: async (ctx, args) => {
    const decisionOptions = await ctx.db
      .query('options')
      .withIndex('by_decision', (q) => q.eq('decisionId', args.decisionId))
      .collect()

    const decisionOptionIds = new Set(
      decisionOptions.map((option) => option._id),
    )

    const voterVotes = await ctx.db
      .query('votes')
      .withIndex('by_voter', (q) => q.eq('voterId', args.voterId))
      .collect()

    const existingVote = voterVotes.find((vote) =>
      decisionOptionIds.has(vote.optionId),
    )

    if (!existingVote) {
      return
    }

    await ctx.db.delete(existingVote._id)
  },
})

export const update = mutation({
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
