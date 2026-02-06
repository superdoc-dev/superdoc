import { z } from 'zod';

/**
 * Schema for selecting text content via a regex pattern.
 *
 * @example
 * ```typescript
 * const selector = textSelectorSchema.parse({
 *   type: 'text',
 *   pattern: 'hello\\s+world',
 *   flags: 'gi',
 * });
 * ```
 */
export const textSelectorSchema = z.object({
  type: z.literal('text'),
  pattern: z
    .string()
    .min(1)
    .refine(
      (p) => {
        try {
          new RegExp(p);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid regular expression' },
    ),
  flags: z
    .string()
    .regex(/^[gimsuy]*$/, 'Flags must be valid regex flags (g, i, m, s, u, y)')
    .optional(),
});

/**
 * Schema for addressing a specific block by its ID.
 *
 * @example
 * ```typescript
 * const address = blockAddressSchema.parse({
 *   kind: 'block',
 *   blockId: 'abc-123',
 * });
 * ```
 */
export const blockAddressSchema = z.object({
  kind: z.literal('block'),
  blockId: z.string().min(1),
});
