## Decision Board Project

A full-stack web app built with TanStack Start on Cloudflare Workers, Cloudflare D1 (via Drizzle), Better Auth, and bun.

ALWAYS DO:

- Use `bun` when running any commands from the package.json, such as `bun run test` or `bun run dev`.
- After changing `src/db/schema.ts`, run `bun run db:generate` and `bun run db:migrate`.
- Check permissions on the server (`src/server/boards.ts`). Never trust a user id sent by the client; use `requireViewer()` / `getViewer()`.

NEVER DO:
