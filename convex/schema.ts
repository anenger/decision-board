import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  boards: defineTable({
    name: v.string(),
    ownerVoterId: v.string(),
  }).index('by_owner', ['ownerVoterId']),
  decisions: defineTable({
    boardId: v.id('boards'),
    title: v.string(),
  }).index('by_board', ['boardId']),
  options: defineTable({
    decisionId: v.id('decisions'),
    text: v.string(),
    position: v.number(),
  })
    .index('by_decision', ['decisionId'])
    .index('by_decision_position', ['decisionId', 'position']),
  votes: defineTable({
    optionId: v.id('options'),
    decisionId: v.id('decisions'),
    voterId: v.string(),
  })
    .index('by_voter', ['voterId'])
    .index('by_option', ['optionId'])
    .index('by_decision', ['decisionId'])
    .index('by_decision_voter', ['decisionId', 'voterId']),
})
