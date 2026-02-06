import { z } from 'zod';

const traceMessageStepSchema = z.object({
  type: z.literal('message'),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});

const traceToolCallStepSchema = z.object({
  type: z.literal('tool_call'),
  name: z.string().min(1),
  args: z.unknown(),
});

const traceToolResultStepSchema = z.object({
  type: z.literal('tool_result'),
  name: z.string().min(1),
  result: z.unknown(),
});

const traceErrorStepSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

const traceFinalStateStepSchema = z.object({
  type: z.literal('final_state'),
  state: z.unknown(),
});

/** Discriminated union of all trace step types, keyed on `type`. */
export const traceStepSchema = z.discriminatedUnion('type', [
  traceMessageStepSchema,
  traceToolCallStepSchema,
  traceToolResultStepSchema,
  traceErrorStepSchema,
  traceFinalStateStepSchema,
]);

/** Schema for a complete normalized trace produced by a runner. */
export const normalizedTraceSchema = z
  .object({
    testId: z.string().min(1),
    runner: z.string().min(1),
    model: z.string().min(1).optional(),
    steps: z.array(traceStepSchema),
    finalState: z.unknown().optional(),
    metadata: z.record(z.unknown()).optional(),
    startedAt: z.string().datetime().optional(),
    finishedAt: z.string().datetime().optional(),
  })
  .strict();
