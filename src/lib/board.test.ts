import { describe, expect, it } from 'vitest'
import { applyVote, canEditDecision } from './board'
import type { DecisionView } from './board'

describe('canEditDecision', () => {
  const decision = { createdById: 'author', ownerId: 'owner' }

  it('allows the board owner and the decision author', () => {
    expect(canEditDecision('owner', decision)).toBe(true)
    expect(canEditDecision('author', decision)).toBe(true)
  })

  it('rejects other users and signed-out visitors', () => {
    expect(canEditDecision('someone-else', decision)).toBe(false)
    expect(canEditDecision(null, decision)).toBe(false)
  })
})

describe('applyVote', () => {
  const decision: DecisionView = {
    id: 'd1',
    title: 'Lunch?',
    canEdit: false,
    options: [
      { id: 'pizza', text: 'Pizza', votes: 2, isSelected: false },
      { id: 'tacos', text: 'Tacos', votes: 1, isSelected: false },
    ],
  }

  const summarize = (view: DecisionView) =>
    view.options.map(({ id, votes, isSelected }) => ({ id, votes, isSelected }))

  it('casts a first vote', () => {
    expect(summarize(applyVote(decision, 'tacos'))).toEqual([
      { id: 'pizza', votes: 2, isSelected: false },
      { id: 'tacos', votes: 2, isSelected: true },
    ])
  })

  it('moves an existing vote to another option', () => {
    const votedPizza = applyVote(decision, 'pizza')
    expect(summarize(applyVote(votedPizza, 'tacos'))).toEqual([
      { id: 'pizza', votes: 2, isSelected: false },
      { id: 'tacos', votes: 2, isSelected: true },
    ])
  })

  it('removes the vote when voting for the current choice again', () => {
    const votedPizza = applyVote(decision, 'pizza')
    expect(summarize(applyVote(votedPizza, 'pizza'))).toEqual(
      summarize(decision),
    )
  })

  it('does not mutate the input', () => {
    const before = structuredClone(decision)
    applyVote(decision, 'pizza')
    expect(decision).toEqual(before)
  })
})
