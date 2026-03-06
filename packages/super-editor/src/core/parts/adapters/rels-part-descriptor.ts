/**
 * Part descriptor for `word/_rels/document.xml.rels`.
 *
 * Phase 2 migration: routes relationship mutations through the centralized parts system.
 */

import type { PartDescriptor } from '../types.js';

const RELS_PART_ID = 'word/_rels/document.xml.rels' as const;
const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';

export const relsPartDescriptor: PartDescriptor = {
  id: RELS_PART_ID,

  ensurePart() {
    return {
      type: 'element',
      name: 'document',
      elements: [
        {
          type: 'element',
          name: 'Relationships',
          attributes: { xmlns: RELS_XMLNS },
          elements: [],
        },
      ],
    };
  },
};
