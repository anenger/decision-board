import { DurableObject } from 'cloudflare:workers'
import * as Automerge from '@automerge/automerge'
import type { LabDoc } from '@/lib/sync/protocol'

const DOC_KEY = 'doc'

type SocketAttachment = {
  viewerId: string | null
  /** Encoded per-connection sync state, so it survives hibernation. */
  syncState: Uint8Array | null
}

/**
 * One instance per room. Holds the room's Automerge document and syncs it
 * with every connected client over hibernatable WebSockets.
 */
export class BoardRoom extends DurableObject<Env> {
  private doc: Automerge.Doc<LabDoc> = Automerge.init()
  private syncStates = new Map<WebSocket, Automerge.SyncState>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Uint8Array>(DOC_KEY)
      if (saved) {
        this.doc = Automerge.load(saved)
        return
      }
      // The server creates the root fields once. If each client created its
      // own `counter`, they would be conflicting values rather than one
      // counter, and increments on the losing side would be dropped.
      this.doc = Automerge.from<LabDoc>({
        counter: new Automerge.Counter(0),
        notes: [],
      })
      await this.persist()
    })
  }

  override fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    this.setSyncState(server, Automerge.initSyncState(), {
      viewerId: request.headers.get('x-viewer-id') || null,
      syncState: null,
    })
    this.sendSyncMessage(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: ArrayBuffer | string,
  ) {
    if (typeof message === 'string') return

    const headsBefore = Automerge.getHeads(this.doc).join()
    const [doc, syncState] = Automerge.receiveSyncMessage(
      this.doc,
      this.getSyncState(ws),
      new Uint8Array(message),
    )
    this.doc = doc
    this.setSyncState(ws, syncState)

    if (Automerge.getHeads(doc).join() === headsBefore) {
      this.sendSyncMessage(ws)
      return
    }

    // TODO(phase 3): store incremental changes and compact, instead of
    // rewriting the whole document on every change.
    await this.persist()
    for (const socket of this.ctx.getWebSockets()) {
      this.sendSyncMessage(socket)
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.syncStates.delete(ws)
    // Complete the close handshake, or the client hangs in CLOSING. A close
    // without a status arrives as 1005, which is reserved and can't be sent
    // back, so echo only codes that may be sent and use 1000 otherwise.
    const replyCode =
      code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000
    try {
      ws.close(replyCode, reason)
    } catch {
      // Already closed.
    }
  }

  override webSocketError(ws: WebSocket) {
    this.syncStates.delete(ws)
  }

  private persist() {
    return this.ctx.storage.put(DOC_KEY, Automerge.save(this.doc))
  }

  private sendSyncMessage(ws: WebSocket) {
    const [syncState, message] = Automerge.generateSyncMessage(
      this.doc,
      this.getSyncState(ws),
    )
    this.setSyncState(ws, syncState)
    if (message) ws.send(message)
  }

  /**
   * In-memory states are lost when the object hibernates. Fall back to the
   * encoded copy on the socket, which keeps only the heads both sides share
   * and is safe to resume from.
   */
  private getSyncState(ws: WebSocket) {
    const cached = this.syncStates.get(ws)
    if (cached) return cached

    const attachment = this.getAttachment(ws)
    const restored = attachment?.syncState
      ? Automerge.decodeSyncState(attachment.syncState)
      : Automerge.initSyncState()
    this.syncStates.set(ws, restored)
    return restored
  }

  private setSyncState(
    ws: WebSocket,
    syncState: Automerge.SyncState,
    attachment = this.getAttachment(ws),
  ) {
    this.syncStates.set(ws, syncState)
    ws.serializeAttachment({
      viewerId: attachment?.viewerId ?? null,
      syncState: Automerge.encodeSyncState(syncState),
    } satisfies SocketAttachment)
  }

  private getAttachment(ws: WebSocket) {
    return ws.deserializeAttachment() as SocketAttachment | null
  }
}
