import PartySocket from 'partysocket'
import { del, get, set } from 'idb-keyval'
import { BOARD_PARTY } from './protocol'
import { applyOperation, checkOperation } from './reducer'
import type {
  ActivityKind,
  BoardSnapshot,
  ClientMessage,
  Operation,
  Person,
  ServerMessage,
} from './protocol'

export type ConnectionStatus = 'connecting' | 'live' | 'offline'

export type BoardSyncView = {
  /** Confirmed server state with pending local changes applied on top. */
  snapshot: BoardSnapshot
  viewerId: string | null
  status: ConnectionStatus
  pendingCount: number
  error: string | null
  /** Everyone viewing the board, including you. */
  people: Array<Person>
  /** Your own presence key, once connected. */
  you: string | null
  /** Changes other people made in the last few seconds. */
  activity: Array<Activity>
}

export type Activity = {
  id: string
  person: Person
  decisionId: string
  kind: ActivityKind
}

/** How long someone else's change stays highlighted. */
const ACTIVITY_MS = 2_800

type PendingOperation = { opId: string; op: Operation }

type StoredQueue = {
  viewerId: string | null
  pending: Array<PendingOperation>
}

type BoardSyncOptions = {
  boardId: string
  initial: BoardSnapshot
  viewerId: string | null
  /** Creates a (guest) session if needed and returns the user id. */
  ensureViewer: () => Promise<string>
}

/** Stands in for the viewer in optimistic updates before they have an account. */
const LOCAL_ACTOR = 'local'

const BOARD_NOT_FOUND_CODE = 4404

/**
 * Keeps one board in sync with its BoardRoom. Changes show immediately, are
 * queued in IndexedDB so they survive reloads and dropped connections, and
 * are sent until the server confirms or rejects them.
 */
export class BoardSyncClient {
  private confirmed: BoardSnapshot
  private pending: Array<PendingOperation> = []
  private viewerId: string | null
  private status: ConnectionStatus = 'connecting'
  private error: string | null = null
  private people: Array<Person> = []
  private you: string | null = null
  private activity: Array<Activity> = []
  private socket: PartySocket | null = null
  /** Who the current socket is signed in as; undefined until its snapshot. */
  private socketViewerId: string | null | undefined
  private isAuthenticating = false
  /** Set while we deliberately reconnect, so the drop isn't shown as offline. */
  private isReconnecting = false
  private view: BoardSyncView
  private listeners = new Set<() => void>()

  constructor(private options: BoardSyncOptions) {
    this.confirmed = options.initial
    this.viewerId = options.viewerId
    this.view = this.computeView()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getView = () => this.view

  start() {
    const socket = new PartySocket({
      host: window.location.host,
      party: BOARD_PARTY,
      room: this.options.boardId,
      // The pending queue is resent after each reconnect, so don't let the
      // socket buffer copies of its own.
      maxEnqueuedMessages: 0,
    })
    this.socket = socket

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.receive(JSON.parse(event.data) as ServerMessage)
    })
    socket.addEventListener('close', (event: CloseEvent) => {
      this.socketViewerId = undefined
      if (event.code === BOARD_NOT_FOUND_CODE) {
        socket.close()
        this.error = 'This board no longer exists'
      }
      // Who's here is unknown until the next snapshot.
      if (!this.isReconnecting) this.people = []
      this.update({ status: this.isReconnecting ? 'connecting' : 'offline' })
    })

    void this.restoreQueue()
  }

  stop() {
    this.socket?.close()
    this.socket = null
    this.socketViewerId = undefined
  }

  submit = (op: Operation) => {
    const pending = { opId: crypto.randomUUID(), op }
    this.pending = [...this.pending, pending]
    void this.saveQueue()
    this.update({})

    if (this.socketViewerId) {
      this.send(pending)
    } else if (this.socketViewerId === null) {
      void this.authenticate()
    }
  }

  dismissError = () => {
    this.error = null
    this.update({})
  }

  private receive(message: ServerMessage) {
    switch (message.type) {
      case 'snapshot':
        this.people = message.people
        this.you = message.you
        this.confirmed = message.snapshot
        this.socketViewerId = message.viewerId
        this.isReconnecting = false
        if (message.viewerId) this.viewerId = message.viewerId
        this.update({ status: 'live' })
        this.flush()
        return
      case 'state':
        this.confirmed = { ...this.confirmed, state: message.state }
        break
      case 'myVotes':
        this.confirmed = { ...this.confirmed, myVotes: message.myVotes }
        break
      case 'ack':
        this.removePending(message.opId)
        break
      case 'reject':
        this.removePending(message.opId)
        this.error = message.reason
        break
      case 'presence':
        this.people = message.people
        break
      case 'activity':
        this.recordActivity(message)
        break
    }
    this.update({})
  }

  private recordActivity({
    personKey,
    decisionId,
    kind,
  }: Extract<ServerMessage, { type: 'activity' }>) {
    const person = this.people.find((p) => p.key === personKey)
    // Your other tabs are you, not someone else.
    if (!person || personKey === this.you) return

    const entry: Activity = {
      id: crypto.randomUUID(),
      person,
      decisionId,
      kind,
    }
    this.activity = [
      ...this.activity.filter((a) => a.decisionId !== decisionId),
      entry,
    ]
    setTimeout(() => {
      this.activity = this.activity.filter((a) => a.id !== entry.id)
      this.update({})
    }, ACTIVITY_MS)
  }

  /** Sends every pending change on a freshly synced socket. */
  private flush() {
    if (this.pending.length === 0) return
    if (this.socketViewerId) {
      for (const pending of this.pending) this.send(pending)
    } else {
      void this.authenticate()
    }
  }

  /**
   * Board sockets can't set cookies, so create the session over HTTP and
   * reconnect; the new socket's snapshot then flushes the queue.
   */
  private async authenticate() {
    if (this.isAuthenticating) return
    this.isAuthenticating = true
    try {
      this.viewerId = await this.options.ensureViewer()
      await this.saveQueue()
      this.isReconnecting = true
      this.socket?.reconnect()
    } catch {
      // Probably offline. The next snapshot after reconnecting retries.
    } finally {
      this.isAuthenticating = false
      this.update({})
    }
  }

  private send({ opId, op }: PendingOperation) {
    const message: ClientMessage = { type: 'op', opId, op }
    this.socket?.send(JSON.stringify(message))
  }

  private removePending(opId: string) {
    this.pending = this.pending.filter((pending) => pending.opId !== opId)
    void this.saveQueue()
  }

  private get storageKey() {
    return `board-sync:${this.options.boardId}`
  }

  private async restoreQueue() {
    const stored = await get<StoredQueue>(this.storageKey).catch(
      () => undefined,
    )
    if (!stored?.pending.length) return
    // Changes queued by a different signed-in user aren't ours to send.
    if (stored.viewerId && this.viewerId && stored.viewerId !== this.viewerId) {
      return
    }

    const known = new Set(this.pending.map((pending) => pending.opId))
    const restored = stored.pending.filter(
      (pending) => !known.has(pending.opId),
    )
    this.pending = [...restored, ...this.pending]
    this.update({})

    // If the socket synced first, the restored changes weren't sent yet.
    if (this.socketViewerId) {
      for (const pending of restored) this.send(pending)
    } else if (this.socketViewerId === null) {
      void this.authenticate()
    }
  }

  private async saveQueue() {
    try {
      if (this.pending.length === 0) {
        await del(this.storageKey)
      } else {
        await set(this.storageKey, {
          viewerId: this.viewerId,
          pending: this.pending,
        } satisfies StoredQueue)
      }
    } catch {
      // Private browsing can block IndexedDB; changes still sync while open.
    }
  }

  private update(next: Partial<Pick<BoardSyncView, 'status'>>) {
    if (next.status) this.status = next.status
    this.view = this.computeView()
    for (const listener of this.listeners) listener()
  }

  private computeView(): BoardSyncView {
    const actor = this.viewerId ?? LOCAL_ACTOR
    const now = Date.now()
    const snapshot = this.pending.reduce(
      (current, { op }) =>
        // Skip changes the server will reject, such as edits to a decision
        // someone else deleted.
        checkOperation(current.state, op, actor) === null
          ? applyOperation(current, op, actor, now)
          : current,
      this.confirmed,
    )

    return {
      snapshot,
      viewerId: this.viewerId,
      status: this.status,
      pendingCount: this.pending.length,
      error: this.error,
      people: this.people,
      you: this.you,
      activity: this.activity,
    }
  }
}
