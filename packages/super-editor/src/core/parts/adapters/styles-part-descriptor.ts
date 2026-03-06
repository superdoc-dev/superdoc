/**
 * Part descriptor for `word/styles.xml`.
 *
 * Phase 1 migration: routes style mutations through the centralized parts system.
 *
 * The mutation callback modifies `translatedLinkedStyles.docDefaults` and syncs
 * changes back to the OOXML JSON in the store. The `afterCommit` hook emits
 * `stylesDefaultsChanged` so the layout pipeline re-renders.
 */

import type { PartDescriptor, CommitContext } from '../types.js';

const STYLES_PART_ID = 'word/styles.xml' as const;

export const stylesPartDescriptor: PartDescriptor = {
  id: STYLES_PART_ID,

  ensurePart(editor) {
    const converter = (editor as unknown as { converter?: { convertedXml: Record<string, unknown> } }).converter;
    if (converter?.convertedXml[STYLES_PART_ID]) {
      return converter.convertedXml[STYLES_PART_ID];
    }
    return {
      type: 'element',
      name: 'document',
      elements: [{ type: 'element', name: 'w:styles', elements: [] }],
    };
  },

  afterCommit(ctx: CommitContext) {
    // Notify layout pipeline to re-render with updated style defaults
    (ctx.editor as unknown as { emit: (name: string) => void }).emit('stylesDefaultsChanged');
  },
};
