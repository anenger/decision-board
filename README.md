# Decision Board

**Live:** <https://decision-board.andrew-enger48.workers.dev>

Collaborative boards for making group decisions. Create a board, share the link, and vote on options together. No sign-up is needed to start, and you can sign in with GitHub to keep your boards.

## Run locally

Requires [bun](https://bun.sh).

```sh
bun install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
bun run db:migrate               # creates the local D1 database
bun run dev                      # http://localhost:3000
```

GitHub sign-in is optional locally. To enable it, create an OAuth app at <https://github.com/settings/developers> with the callback URL `http://localhost:3000/api/auth/callback/github`, and add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.dev.vars`. The button only appears when both are set.

```sh
bun run test    # unit and database tests
bun run lint
bun run build
```

## How auth works

- **Guest first.** Visitors can browse boards without an account. Their first write (creating a board, voting, adding a decision) quietly creates a guest account using Better Auth's [anonymous plugin](https://www.better-auth.com/docs/plugins/anonymous). Page views never create accounts, so link previews and crawlers don't leave guest rows behind.
- **Upgrade to GitHub.** When a guest signs in with GitHub, their boards, decisions and votes move to the GitHub account before the guest is deleted (`src/server/guest-data.ts`). If both accounts voted on the same decision, the GitHub account's vote is kept.
- **Server-side permissions.** The server works out who you are from the session cookie and never trusts a user id sent by the browser, over HTTP or WebSocket. Anyone with a board link can view it, vote, and add decisions or options. Only the board owner or a decision's author can rename or delete that decision. The database allows one vote per person per decision.

## Live sync

Boards update live for everyone viewing them and keep working through dropped connections. There's no CRDT library: the client sends small operations and one server process per board has the final say. Linear and Figma work the same way.

- **One room per board.** Each board has a `BoardRoom` Durable Object, built on [PartyServer](https://github.com/cloudflare/partykit), at `/parties/board-room/:boardId`. Hibernatable WebSockets mean idle boards cost nothing.
- **Operations, not documents.** The browser sends `createDecision`, `renameDecision`, `deleteDecision`, `addOption` and `setVote`, with ids it generates itself. Votes *set* a choice rather than toggling it, so every operation can be replayed safely after a dropped connection.
- **Instant updates, server confirmation.** The client shows the last confirmed server state with its pending operations applied on top, using the same reducer the server runs (`src/lib/board-sync/reducer.ts`). When the server acknowledges or rejects an operation, it leaves the queue.
- **The server checks every change.** The room validates each message, checks permissions with the same rule the UI uses, saves to D1, then broadcasts the new state. Changes run one at a time per board, so a check and its write can't interleave with another change.
- **Offline.** Pending operations are saved in IndexedDB and resent when the socket reconnects, including after the tab is closed and reopened. The header shows the connection state and how many changes are waiting.
- **Accounts.** WebSockets can't set cookies, so a visitor's first change creates a guest session over HTTP and reconnects. The Worker identifies each socket from its session cookie before it reaches the room, and replaces any user id the client sends.

D1 stays the source of truth, so server rendering and the boards list read it directly.

## Roles and invites

| Role | Can |
| --- | --- |
| 👑 Owner | Everything, plus invite editors, change roles and reset invite links |
| ✏️ Editor | Ask questions, vote, add options, manage their own questions, invite voters |
| 🗳️ Voter | Vote and add options |
| 👀 Viewer | Watch. Anyone who opens a plain board link without being a member |

The share button hands out invite links (`/boards/:id?invite=…`), one per role. Opening one makes you a member after the page loads in your browser, so link previews and crawlers never join. Invites never demote anyone, and resetting the links stops old ones from working without removing anyone. Every operation is checked against the sender's role in the board's Durable Object, and role changes reach open tabs immediately (`BoardRoom.refreshAccess`).

## Deadlines and secret results

A question can close at a set time, or be closed and reopened by its author or the board owner. When voting closes, the winning options get a crown (ties included).

A question can also keep its results secret until voting closes. The room never sends per-option counts for those questions, only the total number of votes, so the secret can't leak through the network tab. At the deadline, a Durable Object alarm wakes the room and broadcasts the revealed results, even if nobody touches the board.

## Notifications

When voting on a question closes, at its deadline or by hand, everyone on the board (the owner and invited members) gets a notification, except the person who closed it. The 🔔 in the header shows the unread count and opens the list. It refreshes when the window regains focus, and updates immediately when the close happens on a board you have open.

- **Written with the close.** The board's room writes notifications in the same D1 batch that closes the question, so the room stays the only writer of a board's contents. Recipients are read from D1 in that same statement, so someone removed from the board stops being notified even if the room hasn't caught up yet.
- **Exactly once per close.** Each question records the close its members were last told about (`decisions.notified_close_at`), and a unique index covers each person and close. A retried alarm or repeated message adds nothing. Reopening and closing again is a new close and notifies again. If a question is reopened after its deadline passed but before the alarm ran, the reopen announces that close first, in the same write.
- **Never ahead of the board.** A notification only points at the question. Its text is worked out when you read it, and it names the winner only while that close is still the current one; that check and the vote counts come from the same statement, so a reopen can't slip in between. Reopen a secret question and its notification goes back to just "Voting closed on…". People removed from a board stop seeing its notifications, and get them back if they're re-added.

## Presence

Everyone viewing a board appears as a sticker in the header. Signed-in people show their GitHub name and avatar. Guests and visitors get a made-up animal ("Sleepy Otter 🦦"), picked from a per-browser cookie so it stays the same before and after their first vote creates a guest account. The room tracks people per connection, survives hibernation, and lists each person once however many tabs they have open (`src/server/presence.ts`).

When someone else changes a question, its card wiggles and briefly shows who did what ("Bouncy Fox voted!"). It never says which option they picked.

## Architecture

- **TanStack Start** (React 19, file-based routing, server functions) running on **Cloudflare Workers**.
- **Cloudflare D1** with **Drizzle ORM**. The schema is in `src/db/schema.ts`, and migrations generated by `drizzle-kit` are in `drizzle/`.
- **Better Auth** with the Drizzle adapter, mounted at `/api/auth/*`.
- **PartyServer + partysocket** on Durable Objects for live sync. The board page's JavaScript is about 10 KB gzipped, sync included.

| Path | Purpose |
| --- | --- |
| `src/server.ts` | Worker entry: tags board sockets with the signed-in user, routes the rest to TanStack Start |
| `src/server/board-room.ts` | `BoardRoom` Durable Object: connections, the per-board change queue, broadcasts |
| `src/server/board-store.ts` | Loads a board from D1 and commits operations (check, save, apply) |
| `src/server/operation-schema.ts` | Validates incoming messages |
| `src/lib/board-sync/protocol.ts` | Message and operation types shared by client and server |
| `src/lib/board-sync/reducer.ts` | Permission checks and the operation reducer, shared by client and server |
| `src/lib/board-sync/board-client.ts` | Browser sync client: pending queue, IndexedDB, reconnects |
| `src/server/auth.ts` | Better Auth config, `getViewer` / `requireViewer` |
| `src/server/boards.ts` | Server functions for reads, creating boards and starting a session |
| `src/server/guest-data.ts` | Moves a guest's data to their account when they sign in |
| `src/server/board-access.ts` | Roles, invite links and members |
| `src/server/notifications.ts` | Writes close notifications and reads the viewer's own |
| `src/components/NotificationBell.tsx` | The header bell and its list |

## Deploy

```sh
bunx wrangler login
bunx wrangler d1 create decision-board        # put the printed database_id in wrangler.jsonc
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_URL      # e.g. https://decision-board.<you>.workers.dev
bunx wrangler secret put GITHUB_CLIENT_ID     # optional; use a separate production OAuth app
bunx wrangler secret put GITHUB_CLIENT_SECRET
bun run deploy                                # builds, applies remote migrations, deploys
```
