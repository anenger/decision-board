import { Server } from 'partyserver'
import { commitOperation, loadBoard, snapshotFor } from './board-store'
import { clientMessageSchema } from './operation-schema'
import { personFor, presenceList } from './presence'
import { readViewerHeaders } from './viewer-headers'
import type { Connection, ConnectionContext, WSMessage } from 'partyserver'
import type { LoadedBoard } from './board-store'
import type {
  ClientMessage,
  Person,
  ServerMessage,
} from '@/lib/board-sync/protocol'
import { db } from '@/db'
import { LIMITS } from '@/lib/board-sync/protocol'
import { nextDeadline, publicState } from '@/lib/board-sync/reducer'

type ConnectionState = {
  viewerId: string | null
  person: Person
}

/**
 * One instance per board, named by board id. It is the only writer for its
 * board: it checks each operation, saves it to D1, then broadcasts the new
 * state. D1 stays the source of truth, so the home page and server
 * rendering keep reading it directly. It also tracks who's viewing, and
 * wakes itself at each voting deadline to reveal results.
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
    await this.reload()
  }

  override getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const viewerId = readViewerHeaders(ctx.request.headers).viewer?.id
    return viewerId ? [viewerId] : []
  }

  override onConnect(
    connection: Connection<ConnectionState>,
    ctx: ConnectionContext,
  ) {
    const { viewer, deviceSeed } = readViewerHeaders(ctx.request.headers)
    const person = personFor(viewer, connection.id, deviceSeed)
    // Stored on the socket so it survives hibernation.
    connection.setState({ viewerId: viewer?.id ?? null, person })

    return this.serialize(async () => {
      // Reload so changes made outside this room, like a guest linking their
      // account or accepting an invite, are picked up.
      await this.reload()
      if (!this.board) {
        connection.close(4404, 'Board not found')
        return
      }

      const people = this.people()
      this.sendSnapshot(connection, people)
      this.broadcast(encode({ type: 'presence', people }), [connection.id])
    })
  }

  override onClose(connection: Connection) {
    this.broadcast(
      encode({ type: 'presence', people: this.people(connection.id) }),
    )
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

  /** A deadline passed: everyone gets the state with results revealed. */
  override onAlarm() {
    return this.serialize(async () => {
      if (!this.board) return
      this.broadcastState()
      await this.scheduleDeadline()
    })
  }

  /**
   * Called by the Worker after invites or roles change, so open tabs pick
   * up what they're now allowed to do without a reload.
   */
  async refreshAccess() {
    await this.serialize(async () => {
      await this.reload()
      const people = this.people()
      for (const connection of this.getConnections<ConnectionState>()) {
        this.sendSnapshot(connection, people)
      }
    })
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
      this.broadcastState()
      const personKey = connection.state?.person.key
      if (personKey) {
        this.broadcast(
          encode({
            type: 'activity',
            personKey,
            decisionId: op.decisionId,
            kind: op.kind,
          }),
          [connection.id],
        )
      }
      if (op.kind === 'createDecision' || op.kind === 'setDecisionClosed') {
        await this.scheduleDeadline()
      }
    }
    if (op.kind === 'setVote' || op.kind === 'deleteDecision') {
      for (const own of this.getConnections(viewerId)) {
        send(own, { type: 'myVotes', myVotes: result.myVotes })
      }
    }
    send(connection, { type: 'ack', opId })
  }

  private async reload() {
    this.board = await loadBoard(db, this.name)
    await this.scheduleDeadline()
  }

  private broadcastState() {
    if (!this.board) return
    this.broadcast(
      encode({
        type: 'state',
        state: publicState(this.board.state, Date.now()),
      }),
    )
  }

  /** Wake up at the next deadline, if there is one. */
  private async scheduleDeadline() {
    const next = this.board ? nextDeadline(this.board.state, Date.now()) : null
    if (next === null) {
      await this.ctx.storage.deleteAlarm()
    } else {
      await this.ctx.storage.setAlarm(next)
    }
  }

  private sendSnapshot(
    connection: Connection<ConnectionState>,
    people: Array<Person>,
  ) {
    if (!this.board || !connection.state) return
    const { viewerId, person } = connection.state
    send(connection, {
      type: 'snapshot',
      viewerId,
      snapshot: snapshotFor(this.board, viewerId, Date.now()),
      you: person.key,
      people,
    })
  }

  private people(leavingConnectionId?: string) {
    const connections = [...this.getConnections<ConnectionState>()].map(
      (connection) => ({
        id: connection.id,
        person: connection.state?.person,
      }),
    )
    return presenceList(connections, leavingConnectionId)
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
