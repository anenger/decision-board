import { z } from 'zod'
import type { ClientMessage, Operation } from '@/lib/board-sync/protocol'

const id = z.uuid()
const title = z.string().trim().min(1).max(200)
const optionText = z.string().trim().min(1).max(200)

const operationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('createDecision'),
    decisionId: id,
    title,
    options: z
      .array(z.object({ id, text: optionText }))
      .min(1)
      .max(20),
    closesAt: z.number().int().positive().nullable(),
    hideResults: z.boolean(),
  }),
  z.object({ kind: z.literal('renameDecision'), decisionId: id, title }),
  z.object({ kind: z.literal('deleteDecision'), decisionId: id }),
  z.object({
    kind: z.literal('addOption'),
    decisionId: id,
    optionId: id,
    text: optionText,
  }),
  z.object({
    kind: z.literal('setVote'),
    decisionId: id,
    optionId: id.nullable(),
  }),
  z.object({
    kind: z.literal('setDecisionClosed'),
    decisionId: id,
    closed: z.boolean(),
  }),
])

export const clientMessageSchema = z.object({
  type: z.literal('op'),
  opId: id,
  op: operationSchema,
})

// Fail to compile if the schema and the protocol types drift apart.
type Parsed = z.infer<typeof clientMessageSchema>
true satisfies Parsed extends ClientMessage ? true : false
true satisfies ClientMessage extends Parsed ? true : false
true satisfies z.infer<typeof operationSchema> extends Operation ? true : false
