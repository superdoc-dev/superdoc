import { z } from 'zod';

export const caseAssertionSchema = z
  .object({
    type: z.string().min(1),
    description: z.string().min(1).optional(),
  })
  .passthrough();

export const caseDefinitionSchema = z
  .object({
    testId: z.string().min(1),
    fixture: z.string().min(1),
    user: z.string().min(1),
    allowedSequences: z.array(z.array(z.string().min(1))).min(1),
    assertions: z.array(caseAssertionSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
