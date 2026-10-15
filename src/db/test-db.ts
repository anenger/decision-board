import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/** A fresh SQLite database built from the real migrations, for tests. */
export async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'decision-board-'))
  const client = createClient({ url: `file:${join(dir, 'test.db')}` })
  await client.execute('PRAGMA foreign_keys = ON')

  // Build the schema from the real migrations so tests cover what D1 runs.
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join('drizzle', file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.execute(statement)
    }
  }

  return drizzle(client, { schema })
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
