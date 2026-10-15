import { describe, expect, it } from 'vitest'
import { canEditDecision } from './board'

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
