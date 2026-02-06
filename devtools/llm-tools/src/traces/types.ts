import type { z } from 'zod';
import type { traceStepSchema, normalizedTraceSchema } from './schema.js';

// Re-export schemas for consumers that need runtime validation.
export { traceStepSchema, normalizedTraceSchema } from './schema.js';

/** A single step in a normalized trace. */
export type TraceStep = z.infer<typeof traceStepSchema>;

/** A complete normalized trace produced by a runner. */
export type NormalizedTrace = z.infer<typeof normalizedTraceSchema>;

// Named step variants for consumers that discriminate on `type`.
export type TraceMessageStep = Extract<TraceStep, { type: 'message' }>;
export type TraceToolCallStep = Extract<TraceStep, { type: 'tool_call' }>;
export type TraceToolResultStep = Extract<TraceStep, { type: 'tool_result' }>;
export type TraceErrorStep = Extract<TraceStep, { type: 'error' }>;
export type TraceFinalStateStep = Extract<TraceStep, { type: 'final_state' }>;
