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
import { translateStyleDefinitions } from '../../super-converter/v2/importer/docxImporter.js';

const STYLES_PART_ID = 'word/styles.xml' as const;

interface ConverterForStyles {
  convertedXml: Record<string, unknown>;
  translatedLinkedStyles?: unknown;
}

function getConverter(editor: unknown): ConverterForStyles | undefined {
  return (editor as { converter?: ConverterForStyles }).converter;
}

export const stylesPartDescriptor: PartDescriptor = {
  id: STYLES_PART_ID,

  ensurePart(editor) {
    const converter = getConverter(editor);
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
    // For remote full-part replacements, rebuild the translated styles cache
    if (ctx.source.startsWith('collab:remote:')) {
      const converter = getConverter(ctx.editor);
      if (converter) {
        try {
          converter.translatedLinkedStyles = translateStyleDefinitions(converter.convertedXml);
        } catch (err) {
          console.warn('[parts] Failed to rebuild translatedLinkedStyles:', err);
        }
      }
    }

    // Notify layout pipeline to re-render with updated style defaults
    (ctx.editor as unknown as { emit: (name: string) => void }).emit('stylesDefaultsChanged');
  },
};
