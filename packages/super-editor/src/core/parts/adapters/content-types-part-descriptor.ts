/**
 * Part descriptor for `[Content_Types].xml`.
 *
 * Ensures content-types mutations route through the centralized parts system.
 * This part is typically modified during import validation and when
 * structural operations add new media or part types.
 */

import type { PartDescriptor } from '../types.js';

const CONTENT_TYPES_PART_ID = '[Content_Types].xml' as const;
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

export const contentTypesPartDescriptor: PartDescriptor = {
  id: CONTENT_TYPES_PART_ID,

  ensurePart() {
    return {
      type: 'element',
      name: 'document',
      elements: [
        {
          type: 'element',
          name: 'Types',
          attributes: { xmlns: CONTENT_TYPES_NS },
          elements: [],
        },
      ],
    };
  },
};
