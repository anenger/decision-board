import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  decisions: defineTable({
    title: v.string(),
  }),
  options: defineTable({
    decisionId: v.id('decisions'),
    text: v.string(),
    position: v.number(),
  })
    .index('by_decision', ['decisionId'])
    .index('by_decision_position', ['decisionId', 'position']),
  votes: defineTable({
    optionId: v.id('options'),
    voterId: v.string(),
  })
    .index('by_voter', ['voterId'])
    .index('by_option', ['optionId']),
})
