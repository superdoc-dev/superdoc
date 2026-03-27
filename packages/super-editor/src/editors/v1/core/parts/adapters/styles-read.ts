/**
 * Centralized reader for translated linked styles.
 *
 * All runtime reads of the style catalog (`converter.translatedLinkedStyles`)
 * should go through this module. Centralizing access here means the read path
 * can be enhanced (e.g., lazy re-translation from the part store) without
 * modifying call sites.
 *
 * Consumers: query-match-adapter, tables-adapter, normalizeNewTableAttrs.
 */

import type { Editor } from '../../Editor.js';
import type { StylesDocumentProperties } from '@superdoc/style-engine/ooxml';

interface ConverterWithStyles {
  translatedLinkedStyles?: StylesDocumentProperties | null;
}

function getConverter(editor: Editor): ConverterWithStyles | undefined {
  return (editor as unknown as { converter?: ConverterWithStyles }).converter;
}

/**
 * Read the translated linked styles from the editor's converter cache.
 *
 * Returns `null` when the converter is unavailable or styles have not
 * been loaded (e.g., headless/test contexts without a full document).
 */
export function readTranslatedLinkedStyles(editor: Editor): StylesDocumentProperties | null {
  return getConverter(editor)?.translatedLinkedStyles ?? null;
}
