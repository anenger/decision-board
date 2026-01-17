# CRDT Local-First Plan (Automerge + IndexedDB + Convex)

## Goals

- Local-first UX: all changes apply instantly and work offline.
- CRDT-based merge: no hard conflicts, deterministic resolution.
- Convex used only for syncing change logs and snapshots.

## 1) Data Model + CRDT Shape

- Automerge document schema:
  - `decisions` (map): keyed by decisionId with fields: `title`, `options[]`, `createdAt`.
  - `votes` (map): decisionId -> map of voterId -> optionId.
  - `meta`: `localClientId`, `lastSyncAt` (optional).
- Conflict semantics:
  - Decision fields use LWW per field.
  - Options array merges by index with LWW on item text.
  - Votes are LWW per `{decisionId, voterId}`.

## 2) Local Storage (IndexedDB)

- Use a small storage module (`idb` or `dexie`).
- Persist:
  - Current Automerge doc bytes.
  - Pending change queue (array of change bytes).
  - Sync cursor (last server change timestamp/sequence).
- On app load: open IndexedDB, load doc bytes, apply into Automerge doc.

## 3) Automerge Integration

- Create local helper utilities:
  - `loadDoc()`, `saveDoc(doc)`
  - `applyChanges(doc, changes)`
  - `createChange(doc, mutator) -> { doc, changes }`
- Wrap all mutations (create decision, vote, edit) to:
  - Apply change locally.
  - Persist updated doc to IndexedDB.
  - Enqueue change bytes for sync.

## 4) Convex Sync API

- Add tables:
  - `crdtChanges`: `{ changeBytes, clientId, createdAt }`.
  - Optional `crdtSnapshots`: `{ snapshotBytes, createdAt }`.
- Add mutations:
  - `pushChanges({ clientId, changes[] })` to append changes.
  - Optional `compactSnapshot({ snapshotBytes })` for compaction.
- Add queries:
  - `pullChanges({ since, clientId })` returning changes after cursor.

## 5) Sync Engine (Client)

- Background sync loop:
  - Push: drain pending queue and call `pushChanges`.
  - Pull: subscribe to `pullChanges`, apply changes to Automerge doc.
- Merge strategy:
  - Apply remote changes into local doc.
  - Remove acknowledged pending changes using server cursor.

## 6) App Wiring

- Replace direct Convex CRUD with local CRDT operations:
  - Create decision: local change + enqueue.
  - Vote: local change + enqueue.
  - Edit/delete: local change + enqueue.
- UI reads from Automerge doc state via selector hooks.

## 7) Offline Behavior

- App is functional offline using IndexedDB.
- Pending changes persist; re-sync on reconnect.

## 8) Data Compaction

- Periodically write a snapshot on the server.
- Clients can bootstrap from snapshot + newer changes.
- Clean old change logs after snapshot.

## 9) Observability

- Debug info panel: pending queue size, last sync time, doc hash.

## 10) Testing Plan

- Unit tests for Automerge mutation helpers.
- Integration tests for sync loop (offline -> online merge).
- Conflict simulations with two clients editing same decision.
