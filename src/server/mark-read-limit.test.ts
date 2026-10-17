import { describe, expect, it } from 'vitest'
import {
  MARK_READ_MAX_IDS,
  markReadInputSchema,
  markReadStatement,
} from './notifications'
import { createTestDb } from '@/db/test-db'

/** https://developers.cloudflare.com/d1/platform/limits/ */
const D1_MAX_BOUND_PARAMETERS = 100

describe('marking notifications read', () => {
  it('never binds more parameters than D1 allows', async () => {
    const db = await createTestDb()
    const ids = Array.from({ length: MARK_READ_MAX_IDS }, (_, i) => `id-${i}`)

    // The largest request the server function accepts...
    expect(markReadInputSchema.safeParse({ ids }).success).toBe(true)
    expect(
      markReadInputSchema.safeParse({ ids: [...ids, 'one-more'] }).success,
    ).toBe(false)
    // ...still fits in one D1 statement.
    const { params } = markReadStatement(db, 'user', ids, 0).toSQL()
    expect(params.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS)
  })
})
