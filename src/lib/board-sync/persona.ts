const ADJECTIVES = [
  'Sleepy',
  'Bouncy',
  'Curious',
  'Sneaky',
  'Cheerful',
  'Fluffy',
  'Brave',
  'Giggly',
  'Wobbly',
  'Sunny',
  'Cozy',
  'Zippy',
]

const ANIMALS: Array<[name: string, emoji: string]> = [
  ['Otter', '🦦'],
  ['Panda', '🐼'],
  ['Fox', '🦊'],
  ['Frog', '🐸'],
  ['Penguin', '🐧'],
  ['Koala', '🐨'],
  ['Hedgehog', '🦔'],
  ['Octopus', '🐙'],
  ['Bunny', '🐰'],
  ['Duck', '🦆'],
  ['Turtle', '🐢'],
  ['Owl', '🦉'],
]

/** Saturated enough to read as a ring around an avatar on cream paper. */
export const PERSONA_COLORS = [
  '#ff6fa3',
  '#ff8a3d',
  '#f5b700',
  '#2fbf7f',
  '#3a9bff',
  '#9b6bff',
]

export type Persona = {
  /** e.g. "Sleepy Otter", used for guests and visitors without an account. */
  name: string
  emoji: string
  color: string
}

/** The same seed always gets the same persona, across tabs and reconnects. */
export function personaFor(seed: string): Persona {
  const hash = hashString(seed)
  const [animal, emoji] = ANIMALS[hash % ANIMALS.length] ?? ANIMALS[0]
  const adjective = ADJECTIVES[(hash >>> 8) % ADJECTIVES.length]
  return {
    name: `${adjective} ${animal}`,
    emoji,
    color: PERSONA_COLORS[(hash >>> 16) % PERSONA_COLORS.length],
  }
}

/** Small stable string hash for picking colors and personas. */
export function hashString(input: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
