import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardSyncClient } from './board-client'
import { queueKey } from './offline-queue'
import type { BoardSnapshot, Operation, ServerMessage } from './protocol'

// IndexedDB and the socket, faked so the client's own logic runs for real.
// Hoisted because the mocks below are, and they need these.
const { store, sockets, FakeSocket } = vi.hoisted(() => {
  type Listener = (event: { data?: string; code?: number }) => void

  class Fake {
    listeners = new Map<string, Array<Listener>>()
    sent: Array<unknown> = []
    closeCount = 0
    reconnectCount = 0
    constructor() {
      instances.push(this)
    }
    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }
    send(data: string) {
      this.sent.push(JSON.parse(data))
    }
    close() {
      this.closeCount++
    }
    reconnect() {
      this.reconnectCount++
    }
    receive(message: unknown) {
      for (const l of this.listeners.get('message') ?? []) {
        l({ data: JSON.stringify(message) })
      }
    }
    dropWith(code: number) {
      for (const l of this.listeners.get('close') ?? []) l({ code })
    }
  }

  const instances: Array<Fake> = []
  return {
    store: new Map<string, unknown>(),
    sockets: instances,
    FakeSocket: Fake,
  }
})

vi.mock('partysocket', () => ({ default: FakeSocket }))
vi.mock('idb-keyval', () => ({
  get: (key: string) => Promise.resolve(store.get(key)),
  set: (key: string, value: unknown) => {
    store.set(key, structuredClone(value))
    return Promise.resolve()
  },
  del: (key: string) => {
    store.delete(key)
    return Promise.resolve()
  },
}))

const BOARD = 'b1'
const NOW = 1_700_000_000_000

const initial: BoardSnapshot = {
  state: {
    board: { id: BOARD, name: 'Offsite', ownerId: 'owner', createdAt: NOW },
    decisions: [],
  },
  myVotes: {},
  role: 'owner',
}

const ask: Operation = {
  kind: 'createDecision',
  decisionId: 'd1',
  title: 'Lunch?',
  options: [{ id: 'o1', text: 'Pizza' }],
  closesAt: null,
  hideResults: false,
}

/** Lets pending promise callbacks (fake IndexedDB, restoreQueue) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function connect(
  viewerId: string | null,
  ensureViewer = () => Promise.resolve('owner'),
) {
  const client = new BoardSyncClient({
    boardId: BOARD,
    initial,
    viewerId,
    ensureViewer,
    onNotification: () => {},
  })
  client.start()
  const socket = sockets.at(-1)
  if (!socket) throw new Error('no socket')
  return { client, socket }
}

function snapshot(viewerId: string | null): ServerMessage {
  return {
    type: 'snapshot',
    viewerId,
    snapshot: initial,
    you: 'me',
    people: [],
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { host: 'localhost' } })
})

afterEach(() => {
  store.clear()
  sockets.length = 0
  vi.unstubAllGlobals()
})

describe('BoardSyncClient when the board is deleted', () => {
  it('drops queued changes, here and in IndexedDB, when the room says so', async () => {
    const { client, socket } = connect('owner')
    socket.receive(snapshot('owner'))
    client.submit(ask)
    await settle()
    expect(store.has(queueKey(BOARD))).toBe(true)

    socket.receive({ type: 'deleted' })
    await settle()

    expect(client.getView()).toMatchObject({ deleted: true, pendingCount: 0 })
    expect(store.has(queueKey(BOARD))).toBe(false)
    expect(socket.closeCount).toBe(1)

    // Nothing more goes out, and nothing brings the socket back.
    client.submit(ask)
    client.reconnect()
    expect(client.getView().pendingCount).toBe(0)
    expect(socket.reconnectCount).toBe(0)
    expect(socket.sent).toHaveLength(1)
  })

  it('treats a 4404 on reconnect the same, for tabs that missed the news', async () => {
    store.set(queueKey(BOARD), {
      viewerId: 'owner',
      pending: [{ opId: 'queued', op: ask }],
    })
    const { client, socket } = connect('owner')
    await settle()
    expect(client.getView().pendingCount).toBe(1)

    socket.dropWith(4404)
    await settle()

    expect(client.getView()).toMatchObject({ deleted: true, pendingCount: 0 })
    expect(store.has(queueKey(BOARD))).toBe(false)
    expect(socket.closeCount).toBe(1)
  })

  it('clears the queue when told by the owner’s own delete request', async () => {
    // Offline: no snapshot ever arrived, so the room can't tell this tab.
    const { client, socket } = connect('owner')
    client.submit(ask)
    await settle()
    expect(store.has(queueKey(BOARD))).toBe(true)

    await client.markDeleted()

    expect(store.has(queueKey(BOARD))).toBe(false)
    expect(client.getView()).toMatchObject({ deleted: true, pendingCount: 0 })
    expect(socket.closeCount).toBe(1)
  })

  it("doesn't reconnect when signing in finishes after the delete", async () => {
    let finishSignIn: (id: string) => void = () => {}
    const { client, socket } = connect(
      null,
      () => new Promise<string>((resolve) => (finishSignIn = resolve)),
    )
    socket.receive(snapshot(null))
    // A visitor's first change starts creating their guest session.
    client.submit(ask)
    await settle()

    socket.receive({ type: 'deleted' })
    finishSignIn('guest')
    await settle()

    expect(socket.reconnectCount).toBe(0)
    expect(store.has(queueKey(BOARD))).toBe(false)
    expect(client.getView().status).toBe('offline')
  })

  it('stops the socket on every terminal close, even once already deleted', async () => {
    const { client, socket } = connect('owner')
    socket.receive(snapshot('owner'))
    socket.receive({ type: 'deleted' })
    // Something restarted the socket anyway and it was refused again.
    socket.dropWith(4404)
    await settle()

    expect(socket.closeCount).toBe(2)
    expect(client.getView().deleted).toBe(true)

    // Late messages from before the delete change nothing.
    socket.receive(snapshot('owner'))
    expect(client.getView().status).toBe('offline')
  })
})
