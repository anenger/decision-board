import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

export const listByBoard = query({
  args: {
    boardId: v.id('boards'),
    voterId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { boardId, voterId } = args

    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_board', (q) => q.eq('boardId', boardId))
      .order('asc')
      .collect()

    const optionsByDecisionId = new Map<
      Id<'decisions'>,
      Array<Doc<'options'>>
    >()
    const voteCountsByOption = new Map<Id<'options'>, number>()
    const selectedOptionIds = new Set<Id<'options'>>()

    await Promise.all(
      decisions.map(async (decision) => {
        const [options, votes] = await Promise.all([
          ctx.db
            .query('options')
            .withIndex('by_decision_position', (q) =>
              q.eq('decisionId', decision._id),
            )
            .collect(),
          ctx.db
            .query('votes')
            .withIndex('by_decision', (q) => q.eq('decisionId', decision._id))
            .collect(),
        ])

        optionsByDecisionId.set(decision._id, options)

        const decisionVoteCounts = new Map<Id<'options'>, number>()
        for (const vote of votes) {
          decisionVoteCounts.set(
            vote.optionId,
            (decisionVoteCounts.get(vote.optionId) ?? 0) + 1,
          )
        }

        for (const option of options) {
          voteCountsByOption.set(
            option._id,
            decisionVoteCounts.get(option._id) ?? 0,
          )
        }

        if (voterId) {
          for (const vote of votes) {
            if (vote.voterId === voterId) {
              selectedOptionIds.add(vote.optionId)
            }
          }
        }
      }),
    )

    return decisions.map((decision) => {
      const decisionOptions = optionsByDecisionId.get(decision._id) ?? []
      return {
        ...decision,
        options: decisionOptions.map((option) => ({
          ...option,
          isSelected: selectedOptionIds.has(option._id),
          votes: voteCountsByOption.get(option._id) ?? 0,
        })),
      }
    })
  },
})

export const addDecision = mutation({
  args: {
    boardId: v.id('boards'),
    title: v.string(),
    options: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const board = await ctx.db.get(args.boardId)
    if (!board) {
      throw new Error('Board not found')
    }

    const decisionId = await ctx.db.insert('decisions', {
      boardId: args.boardId,
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
    boardId: v.id('boards'),
    decisionId: v.id('decisions'),
    optionId: v.id('options'),
    voterId: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await ctx.db.get(args.decisionId)
    if (!decision || decision.boardId !== args.boardId) {
      throw new Error('Decision not found for this board')
    }

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
