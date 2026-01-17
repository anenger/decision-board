import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  decisions: defineTable({
    title: v.string(),
    description: v.string(),
    kind: v.union(v.literal('multiple'), v.literal('binary')),
  }),
  options: defineTable({
    decisionId: v.id('decisions'),
    text: v.string(),
    votes: v.number(),
    position: v.number(),
  })
    .index('by_decision', ['decisionId'])
    .index('by_decision_position', ['decisionId', 'position']),
  decisionVotes: defineTable({
    decisionId: v.id('decisions'),
    optionId: v.id('options'),
    voterId: v.string(),
  })
    .index('by_decision', ['decisionId'])
    .index('by_voter', ['voterId'])
    .index('by_decision_voter', ['decisionId', 'voterId'])
    .index('by_option', ['optionId']),
})
