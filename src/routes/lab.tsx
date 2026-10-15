import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowLeft, FlaskConical, Plus, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import type { AutomergeApi } from '@/lib/sync/automerge-browser'
import type { LabDoc } from '@/lib/sync/protocol'
import type { SyncStatus } from '@/lib/sync/sync-client'
import { loadAutomerge } from '@/lib/sync/automerge-browser'
import { ROOM_ID_PATTERN, syncUrl } from '@/lib/sync/protocol'
import { SyncClient } from '@/lib/sync/sync-client'

export const Route = createFileRoute('/lab')({
  validateSearch: (search): { room?: string } => ({
    room:
      typeof search.room === 'string' && ROOM_ID_PATTERN.test(search.room)
        ? search.room
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (!search.room) {
      throw redirect({
        to: '/lab',
        search: { room: `lab-${crypto.randomUUID().slice(0, 8)}` },
        replace: true,
      })
    }
  },
  head: () => ({ meta: [{ title: 'Sync lab · Decision Board' }] }),
  component: SyncLab,
})

function SyncLab() {
  const { room = '' } = Route.useSearch()
  const [automerge, setAutomerge] = useState<AutomergeApi | null>(null)

  useEffect(() => {
    void loadAutomerge().then(setAutomerge)
  }, [])

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="border-b border-[#e2e4ea] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="focus-ring inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-[#6b6f80] transition-colors hover:bg-[#f0f1f4] hover:text-[#1a1a2e]"
            >
              <ArrowLeft size={14} />
              Boards
            </Link>
            <span className="text-[#d0d3db]">/</span>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4f6df5]">
                <FlaskConical size={12} className="text-white" />
              </div>
              <span className="text-[14px] font-semibold text-[#1a1a2e]">
                Sync lab
              </span>
            </div>
          </div>
          <span className="font-['IBM_Plex_Mono',monospace] text-[12px] text-[#9a9daa]">
            {room}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a2e]">
          Two clients, one document
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[#6b6f80]">
          Each panel has its own Automerge document and WebSocket to the same
          Durable Object. Take both offline, make changes on each side, then
          bring them back online: increments add up and notes from both sides
          survive. Open this URL in another tab or device to add more clients.
        </p>

        {automerge ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <LabPeer automerge={automerge} room={room} name="Alice" />
            <LabPeer automerge={automerge} room={room} name="Bob" />
          </div>
        ) : (
          <p className="mt-6 text-[13px] text-[#9a9daa]">
            Loading sync engine…
          </p>
        )}
      </main>
    </div>
  )
}

const statusStyles: Record<SyncStatus, string> = {
  online: 'bg-emerald-50 text-emerald-700',
  connecting: 'bg-amber-50 text-amber-700',
  offline: 'bg-[#f0f1f4] text-[#6b6f80]',
}

function LabPeer({
  automerge,
  room,
  name,
}: {
  automerge: AutomergeApi
  room: string
  name: string
}) {
  const [client] = useState(
    () => new SyncClient<LabDoc>(automerge, syncUrl(room)),
  )
  const { doc, status } = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  )
  const [wantsOnline, setWantsOnline] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!wantsOnline) return
    client.connect()
    return () => client.disconnect()
  }, [client, wantsOnline])

  // Edits wait for the first sync, which delivers the document's root fields.
  const isReady = 'counter' in doc

  const addNote = (event: FormEvent) => {
    event.preventDefault()
    const text = note.trim()
    if (!text || !isReady) return
    client.change((d) => {
      d.notes.push(`${name}: ${text}`)
    })
    setNote('')
  }

  return (
    <section className="rounded-xl border border-[#e2e4ea] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{name}</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 font-['IBM_Plex_Mono',monospace] text-[11px] ${statusStyles[status]}`}
          >
            {status}
          </span>
          <button
            type="button"
            onClick={() => setWantsOnline((value) => !value)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e2e4ea] bg-white px-3 text-[13px] font-medium text-[#3a3a4a] transition-colors hover:bg-[#fafbfc]"
          >
            {wantsOnline ? <WifiOff size={13} /> : <Wifi size={13} />}
            {wantsOnline ? 'Go offline' : 'Go online'}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-[#e2e4ea] bg-[#fafbfc] px-4 py-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.04em] uppercase text-[#6b6f80]">
            Counter
          </p>
          <p
            data-testid={`${name}-counter`}
            className="font-['IBM_Plex_Mono',monospace] text-[28px] font-medium tabular-nums text-[#1a1a2e]"
          >
            {isReady ? doc.counter.value : '–'}
          </p>
        </div>
        <button
          type="button"
          disabled={!isReady}
          onClick={() => client.change((d) => d.counter.increment(1))}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4f6df5] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#4059d9] disabled:cursor-not-allowed disabled:bg-[#e2e4ea] disabled:text-[#a0a3b1]"
        >
          <Plus size={14} />
          Increment
        </button>
      </div>

      <form onSubmit={addNote} className="mt-4 flex gap-2">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`Note from ${name}…`}
          disabled={!isReady}
          className="focus-ring h-9 w-full rounded-lg border border-[#e2e4ea] bg-white px-3 text-[13px] text-[#1a1a2e] placeholder:text-[#a0a3b1]"
        />
        <button
          type="submit"
          disabled={!isReady || !note.trim()}
          className="focus-ring h-9 shrink-0 rounded-lg border border-[#e2e4ea] px-3 text-[13px] font-medium text-[#3a3a4a] transition-colors hover:bg-[#fafbfc] disabled:cursor-not-allowed disabled:text-[#a0a3b1]"
        >
          Add
        </button>
      </form>

      <ul data-testid={`${name}-notes`} className="mt-3 space-y-1.5">
        {isReady && doc.notes.length === 0 && (
          <li className="text-[13px] text-[#9a9daa]">No notes yet</li>
        )}
        {isReady &&
          doc.notes.map((text, index) => (
            <li
              key={`${index}-${text}`}
              className="rounded-md bg-[#fafbfc] px-3 py-2 text-[13px] text-[#3a3a4a]"
            >
              {text}
            </li>
          ))}
      </ul>
    </section>
  )
}
