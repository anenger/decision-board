import { describe, expect, it } from 'vitest'
import { canManageDecision } from './board'

describe('canManageDecision', () => {
  const decision = { createdById: 'author' }

  it('allows the owner on any question', () => {
    expect(canManageDecision('owner', 'owner', decision)).toBe(true)
  })

  it('allows the author while they can still take part', () => {
    expect(canManageDecision('author', 'editor', decision)).toBe(true)
    expect(canManageDecision('author', 'voter', decision)).toBe(true)
    expect(canManageDecision('author', 'viewer', decision)).toBe(false)
  })

  it('rejects other people and signed-out visitors', () => {
    expect(canManageDecision('someone-else', 'editor', decision)).toBe(false)
    expect(canManageDecision(null, 'viewer', decision)).toBe(false)
  })
})
