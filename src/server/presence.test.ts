import { describe, expect, it } from 'vitest'
import { personFor, presenceList } from './presence'
import { readViewerHeaders, writeViewerHeaders } from './viewer-headers'
import { personaFor } from '@/lib/board-sync/persona'

const DEVICE = '0b9f2a4e-6a1c-4b8e-9f3d-2c7e5a1b4d6f'

describe('personFor', () => {
  it('shows signed-in people as themselves', () => {
    const person = personFor(
      { id: 'u1', name: 'Andrew', image: 'https://x/a.png', isGuest: false },
      'conn-1',
      DEVICE,
    )
    expect(person).toMatchObject({
      key: 'u1',
      name: 'Andrew',
      image: 'https://x/a.png',
      isGuest: false,
    })
  })

  it('keeps the same animal before and after a visitor becomes a guest', () => {
    const visitor = personFor(null, 'conn-1', DEVICE)
    const guest = personFor(
      { id: 'guest-1', name: 'Guest', image: null, isGuest: true },
      'conn-2',
      DEVICE,
    )
    expect(visitor.name).toBe(personaFor(DEVICE).name)
    expect(guest.name).toBe(visitor.name)
    expect(guest.emoji).toBe(visitor.emoji)
    // Identity still comes from the session, not the device.
    expect(guest.key).toBe('guest-1')
  })

  it('never shows a guest as "Guest"', () => {
    const guest = personFor(
      { id: 'g', name: 'Guest', image: null, isGuest: true },
      'c',
      null,
    )
    expect(guest.name).not.toBe('Guest')
    expect(guest.isGuest).toBe(true)
  })
})

describe('presenceList', () => {
  const alice = personFor(
    { id: 'alice', name: 'Alice', image: null, isGuest: false },
    'a',
    null,
  )
  const visitor = personFor(null, 'v', DEVICE)

  it('lists each person once, however many tabs they have open', () => {
    const list = presenceList([
      { id: 'a1', person: alice },
      { id: 'v1', person: visitor },
      { id: 'a2', person: alice },
      { id: 'v2', person: personFor(null, 'v2', DEVICE) },
    ])
    expect(list.map((p) => p.key)).toEqual(['alice', `visitor:${DEVICE}`])
  })

  it('drops a closing connection, but keeps the person if another tab is open', () => {
    const connections = [
      { id: 'a1', person: alice },
      { id: 'a2', person: alice },
      { id: 'v1', person: visitor },
    ]
    expect(presenceList(connections, 'v1').map((p) => p.key)).toEqual(['alice'])
    expect(presenceList(connections, 'a1').map((p) => p.key)).toEqual([
      'alice',
      `visitor:${DEVICE}`,
    ])
  })
})

describe('viewer headers', () => {
  it('round-trips non-ASCII names and overwrites forged values', () => {
    const headers = new Headers({
      'x-viewer-id': 'forged',
      'x-viewer-guest': '0',
    })
    writeViewerHeaders(
      headers,
      { id: 'u1', name: 'Zoë 🌸 Ångström', image: null, isAnonymous: true },
      DEVICE,
    )
    expect(readViewerHeaders(headers)).toEqual({
      viewer: { id: 'u1', name: 'Zoë 🌸 Ångström', image: null, isGuest: true },
      deviceSeed: DEVICE,
    })

    writeViewerHeaders(headers, null, null)
    expect(readViewerHeaders(headers)).toEqual({
      viewer: null,
      deviceSeed: null,
    })
  })
})
