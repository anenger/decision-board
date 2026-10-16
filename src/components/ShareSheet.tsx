import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Check, Copy, RefreshCw, Share } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { Sheet } from './Sheet'
import type { InviteRole, Role } from '@/lib/board-sync/protocol'
import type { BoardMember } from '@/server/board-access'
import {
  boardQueries,
  sessionQuery,
  useResetInvitesMutation,
  useUpdateMemberRoleMutation,
} from '@/data/queries'
import { personaFor } from '@/lib/board-sync/persona'

const ROLE_LABELS: Record<Role, string> = {
  owner: '👑 Owner',
  editor: '✏️ Editor',
  voter: '🗳️ Voter',
  viewer: '👀 Watching',
}

/** Invite links and who's on the board. For editors and the owner. */
export function ShareSheet({
  boardId,
  boardName,
  onClose,
}: {
  boardId: string
  boardName: string
  onClose: () => void
}) {
  const sharing = useQuery(boardQueries.sharing(boardId))
  const reset = useResetInvitesMutation(boardId)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const isOwner = sharing.data?.role === 'owner'

  return (
    <Sheet title="Invite people" mood="happy" onClose={onClose}>
      {sharing.isPending ? (
        <p className="py-6 text-center text-ink-soft">Fetching your links…</p>
      ) : sharing.isError ? (
        <p className="py-6 text-center text-ink-soft">
          {sharing.error.message}
        </p>
      ) : (
        <>
          {sharing.data.invites.voter && (
            <InviteLink
              role="voter"
              title="🗳️ Invite voters"
              description="They can vote and add options."
              boardId={boardId}
              boardName={boardName}
              token={sharing.data.invites.voter}
            />
          )}
          {sharing.data.invites.editor && (
            <InviteLink
              role="editor"
              title="✏️ Invite editors"
              description="They can also ask questions."
              boardId={boardId}
              boardName={boardName}
              token={sharing.data.invites.editor}
            />
          )}

          {isOwner &&
            (confirmingReset ? (
              <div className="anim-rise rounded-2xl border-2 border-ink bg-white p-3.5">
                <p className="text-sm font-semibold">
                  Old links stop working right away. People already on the board
                  stay.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={reset.isPending}
                    onClick={async () => {
                      await reset.mutateAsync()
                      setConfirmingReset(false)
                    }}
                    className="btn-chunky focus-ring flex-1 bg-tomato text-white"
                  >
                    {reset.isPending ? 'Resetting…' : 'Reset links'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="btn-chunky focus-ring bg-white px-5"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-display font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <RefreshCw size={16} />
                Reset invite links
              </button>
            ))}

          <People
            boardId={boardId}
            members={sharing.data.members}
            canManage={isOwner}
          />
        </>
      )}
    </Sheet>
  )
}

function InviteLink({
  role,
  title,
  description,
  boardId,
  boardName,
  token,
}: {
  role: InviteRole
  title: string
  description: string
  boardId: string
  boardName: string
  token: string
}) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/boards/${boardId}?invite=${encodeURIComponent(token)}`
  const canShare = 'share' in navigator

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this invite link', url)
    }
  }

  return (
    <section aria-labelledby={`invite-${role}`}>
      <h3 id={`invite-${role}`} className="text-lg font-semibold">
        {title}
      </h3>
      <p className="text-sm text-ink-soft">{description}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label={`${title} link`}
          onFocus={(event) => event.target.select()}
          className="focus-ring min-h-11 min-w-0 flex-1 truncate rounded-2xl border-2 border-ink/20 bg-white px-3 text-base text-ink-soft"
        />
        <button
          type="button"
          onClick={copy}
          aria-label="Copy link"
          className="btn-chunky focus-ring h-11 w-11 shrink-0 bg-butter p-0"
        >
          {copied ? <Check size={18} strokeWidth={3} /> : <Copy size={18} />}
        </button>
        {canShare && (
          <button
            type="button"
            aria-label="Share link"
            onClick={() =>
              navigator
                .share({
                  url,
                  title: boardName,
                  text: `Come vote on “${boardName}”`,
                })
                .catch(() => {})
            }
            className="btn-chunky focus-ring h-11 w-11 shrink-0 bg-white p-0"
          >
            <Share size={18} />
          </button>
        )}
      </div>
      {copied && (
        <p role="status" className="anim-pop mt-1.5 text-sm font-bold">
          Copied! Send it to the group 🎉
        </p>
      )}
    </section>
  )
}

function People({
  boardId,
  members,
  canManage,
}: {
  boardId: string
  members: Array<BoardMember>
  canManage: boolean
}) {
  const updateRole = useUpdateMemberRoleMutation(boardId)
  const { data: session } = useSuspenseQuery(sessionQuery)

  return (
    <section aria-labelledby="board-people">
      <h3 id="board-people" className="text-lg font-semibold">
        People
      </h3>
      <ul className="mt-2 space-y-1">
        {members.map((member) => {
          const persona = personaFor(member.userId)
          return (
            <li
              key={member.userId}
              className="flex min-h-12 items-center gap-3 rounded-2xl py-1"
            >
              <Avatar
                size={36}
                person={{
                  name: member.name,
                  image: member.isGuest ? null : member.image,
                  emoji: member.isGuest ? '👤' : persona.emoji,
                  color: persona.color,
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {member.userId === session.viewer?.id
                    ? 'You'
                    : member.isGuest
                      ? 'Guest'
                      : member.name}
                </span>
                {member.isGuest && (
                  <span className="block text-xs text-ink-faint">
                    joined{' '}
                    {new Date(member.joinedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </span>
              {canManage && member.role !== 'owner' ? (
                <select
                  aria-label={`Role for ${member.isGuest ? 'guest' : member.name}`}
                  value={member.role}
                  disabled={updateRole.isPending}
                  onChange={(event) =>
                    updateRole.mutate({
                      userId: member.userId,
                      role:
                        event.target.value === 'remove'
                          ? null
                          : (event.target.value as InviteRole),
                    })
                  }
                  className="focus-ring min-h-11 shrink-0 rounded-full border-2 border-ink bg-white px-3 text-base font-semibold"
                >
                  <option value="editor">✏️ Editor</option>
                  <option value="voter">🗳️ Voter</option>
                  <option value="remove">Remove</option>
                </select>
              ) : (
                <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
                  {ROLE_LABELS[member.role]}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {updateRole.isError && (
        <p className="mt-2 text-sm font-semibold text-tomato-deep">
          {updateRole.error.message}
        </p>
      )}
    </section>
  )
}
