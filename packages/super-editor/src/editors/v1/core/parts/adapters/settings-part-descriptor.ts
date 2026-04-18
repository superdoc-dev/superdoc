/**
 * Part descriptor for `word/settings.xml`.
 *
 * Phase 2 migration: routes settings mutations through the centralized parts system.
 */

import type { PartDescriptor } from '../types.js';

const SETTINGS_PART_ID = 'word/settings.xml' as const;

export const settingsPartDescriptor: PartDescriptor = {
  id: SETTINGS_PART_ID,

  ensurePart() {
    return {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:settings', elements: [] }],
    };
  },
};
