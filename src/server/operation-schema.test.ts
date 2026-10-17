import { describe, expect, it } from 'vitest'
import { clientMessageSchema } from './operation-schema'

const message = (name: unknown) => ({
  type: 'op',
  opId: crypto.randomUUID(),
  op: { kind: 'renameBoard', name },
})

describe('renameBoard messages', () => {
  it('trims the name', () => {
    const parsed = clientMessageSchema.parse(message('  Team offsite  '))
    expect(parsed.op).toEqual({ kind: 'renameBoard', name: 'Team offsite' })
  })

  it('refuses empty, blank, too long and non-string names', () => {
    for (const name of ['', '   ', 'a'.repeat(101), 42, null]) {
      expect(
        clientMessageSchema.safeParse(message(name)).success,
        `${name}`,
      ).toBe(false)
    }
    expect(
      clientMessageSchema.safeParse(message('a'.repeat(100))).success,
    ).toBe(true)
  })
})
