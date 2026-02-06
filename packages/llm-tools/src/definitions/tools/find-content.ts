import { z } from 'zod';
import { defineTool } from '../types.js';
import { textSelectorSchema, blockAddressSchema } from '../schemas/common.js';

const findContentParams = z.object({
  selector: textSelectorSchema,
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
});

const findContentResult = z.object({
  matches: z.array(
    z.object({
      address: blockAddressSchema,
      text: z.string().optional(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

/** Tool definition for searching text content within a document. */
export const findContentTool = defineTool({
  name: 'find_content',
  description: 'Find text content in the document using a selector.',
  parameters: findContentParams,
  returns: findContentResult,
});
