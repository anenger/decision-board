import { Server } from 'partyserver'
import { commitOperation, loadBoard, snapshotFor } from './board-store'
import { clientMessageSchema } from './operation-schema'
import type { Connection, ConnectionContext, WSMessage } from 'partyserver'
import type { LoadedBoard } from './board-store'
import type { ClientMessage, ServerMessage } from '@/lib/board-sync/protocol'
import { db } from '@/db'
import { LIMITS } from '@/lib/board-sync/protocol'

/** Set by the Worker from the session cookie; any client-sent value is replaced. */
export const VIEWER_ID_HEADER = 'x-viewer-id'

type ConnectionState = { viewerId: string | null }

/**
 * One instance per board, named by board id. It is the only writer for its
 * board: it checks each operation, saves it to D1, then broadcasts the new
 * state. D1 stays the source of truth, so the home page and server
 * rendering keep reading it directly.
 */
export class BoardRoom extends Server<Env> {
  static override options = { hibernate: true }

  private board: LoadedBoard | null = null
  /**
   * Awaiting D1 lets other messages start, so changes run one at a time to
   * keep each check, write and in-memory update together.
   */
  private queue: Promise<unknown> = Promise.resolve()

  override async onStart() {
    this.board = await loadBoard(db, this.name)
  }

  override getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const viewerId = ctx.request.headers.get(VIEWER_ID_HEADER)
    return viewerId ? [viewerId] : []
  }

  override onConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext,
  ) {
    const viewerId = ctx.request.headers.get(VIEWER_ID_HEADER) || null
    connection.setState({ viewerId })

    return this.serialize(async () => {
      // Reload so changes made outside this room, like a guest linking their
      // account, are picked up.
      this.board = await loadBoard(db, this.name)
      if (!this.board) {
        connection.close(4404, 'Board not found')
        return
      }
      send(connection, {
        type: 'snapshot',
        viewerId,
        snapshot: snapshotFor(this.board, viewerId),
      })
    })
  }

  override onMessage(connection: Connection<ConnectionState>, raw: WSMessage) {
    if (typeof raw !== 'string' || raw.length > LIMITS.messageBytes) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    const result = clientMessageSchema.safeParse(parsed)
    if (!result.success) {
      const opId = (parsed as { opId?: unknown } | null)?.opId
      if (typeof opId === 'string') {
        send(connection, { type: 'reject', opId, reason: 'Invalid change' })
      }
      return
    }

    return this.serialize(() => this.handleOperation(connection, result.data))
  }

  private async handleOperation(
    connection: Connection<ConnectionState>,
    { opId, op }: ClientMessage,
  ) {
    const reject = (reason: string) =>
      send(connection, { type: 'reject', opId, reason })

    const viewerId = connection.state?.viewerId
    if (!viewerId) return reject('Sign in to make changes')
    if (!this.board) return reject('Board not found')

    const result = await commitOperation(
      db,
      this.board,
      op,
      viewerId,
      Date.now(),
    )
    if (!result.ok) return reject(result.reason)

    if (result.stateChanged) {
      this.broadcast(encode({ type: 'state', state: this.board.state }))
    }
    if (op.kind === 'setVote' || op.kind === 'deleteDecision') {
      for (const own of this.getConnections(viewerId)) {
        send(own, { type: 'myVotes', myVotes: result.myVotes })
      }
    }
    send(connection, { type: 'ack', opId })
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }
}

function encode(message: ServerMessage) {
  return JSON.stringify(message)
}

function send(connection: Connection, message: ServerMessage) {
  connection.send(encode(message))
}
