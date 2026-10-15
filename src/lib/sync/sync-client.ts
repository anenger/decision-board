import type { ChangeFn, Doc, SyncState } from '@automerge/automerge/slim'
import type { AutomergeApi } from './automerge-browser'

export type SyncStatus = 'connecting' | 'online' | 'offline'

export type SyncSnapshot<T> = {
  doc: Doc<T>
  status: SyncStatus
}

const RECONNECT_DELAY_MS = 1_000

/**
 * Keeps a local Automerge document in sync with a room over a WebSocket.
 * Changes apply locally first and sync whenever the socket is open, so edits
 * made while offline merge when the connection returns.
 */
export class SyncClient<T> {
  private snapshot: SyncSnapshot<T>
  private socket: WebSocket | null = null
  private syncState: SyncState
  private shouldBeOnline = false
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private listeners = new Set<() => void>()

  constructor(
    private automerge: AutomergeApi,
    private url: string,
  ) {
    this.snapshot = { doc: automerge.init<T>(), status: 'offline' }
    this.syncState = automerge.initSyncState()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  connect() {
    this.shouldBeOnline = true
    if (!this.socket) this.open()
  }

  disconnect() {
    this.shouldBeOnline = false
    clearTimeout(this.reconnectTimer)
    this.socket?.close()
  }

  change(changeFn: ChangeFn<T>) {
    this.update({ doc: this.automerge.change(this.snapshot.doc, changeFn) })
    this.sendSyncMessage()
  }

  private open() {
    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    // Each connection is a new sync session; the protocol works out which
    // changes each side is missing.
    this.syncState = this.automerge.initSyncState()
    this.update({ status: 'connecting' })

    socket.onopen = () => {
      this.update({ status: 'online' })
      this.sendSyncMessage()
    }

    socket.onmessage = (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) return

      const [doc, syncState] = this.automerge.receiveSyncMessage(
        this.snapshot.doc,
        this.syncState,
        new Uint8Array(event.data),
      )
      this.syncState = syncState
      this.update({ doc })
      this.sendSyncMessage()
    }

    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.update({ status: 'offline' })
      if (this.shouldBeOnline) {
        this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS)
      }
    }
  }

  private sendSyncMessage() {
    const socket = this.socket
    if (socket?.readyState !== WebSocket.OPEN) return

    const [syncState, message] = this.automerge.generateSyncMessage(
      this.snapshot.doc,
      this.syncState,
    )
    this.syncState = syncState
    if (message) socket.send(message)
  }

  private update(next: Partial<SyncSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }
}
