import type { SocketViewer } from './viewer-headers'
import type { Person } from '@/lib/board-sync/protocol'
import { personaFor } from '@/lib/board-sync/persona'

/**
 * Signed-in people appear as themselves. Guests and visitors without a
 * session get an animal picked from their device, so they keep the same one
 * before and after their first change creates a guest account, and the room
 * never shows "Guest" five times.
 */
export function personFor(
  viewer: SocketViewer | null,
  connectionId: string,
  deviceSeed: string | null,
): Person {
  const isSignedIn = viewer !== null && !viewer.isGuest && viewer.name !== ''
  // Visitors without a session are keyed by device so their tabs count once.
  const key =
    viewer?.id ??
    (deviceSeed ? `visitor:${deviceSeed}` : `visitor:${connectionId}`)
  const persona = personaFor(
    isSignedIn ? viewer.id : (deviceSeed ?? viewer?.id ?? connectionId),
  )

  return {
    key,
    name: isSignedIn ? viewer.name : persona.name,
    image: isSignedIn ? viewer.image : null,
    emoji: persona.emoji,
    color: persona.color,
    isGuest: !isSignedIn,
  }
}

/** One entry per person, in the order they arrived, however many tabs they have open. */
export function presenceList(
  connections: Iterable<{ id: string; person: Person | undefined }>,
  leavingConnectionId?: string,
): Array<Person> {
  const people = new Map<string, Person>()
  for (const { id, person } of connections) {
    if (id === leavingConnectionId || !person || people.has(person.key)) {
      continue
    }
    people.set(person.key, person)
  }
  return [...people.values()]
}
