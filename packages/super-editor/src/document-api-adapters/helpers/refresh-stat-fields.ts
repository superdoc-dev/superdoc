/**
 * Internal export-preparation helper for document statistic fields.
 *
 * Computes fresh field values keyed by field type. All fields of the same
 * type display the same document-level value (e.g. every NUMWORDS field
 * shows the same word count), so the cache map is keyed by field type,
 * not by position.
 *
 * This cache map is consumed by translators during export — the live PM
 * document is never mutated by this helper.
 */

import type { Editor } from '../../core/Editor.js';
import { getWordStatistics, resolveDocumentStatFieldValue, resolveMainBodyEditor } from './word-statistics.js';

/** Maps uppercase field type (e.g. 'NUMWORDS') to its fresh string value. */
export type StatFieldCacheMap = Map<string, string>;

/**
 * Computes fresh cached values for all document-statistic field types.
 * Returns a map from field type → fresh display value.
 *
 * Always resolves to the main body editor before computing stats, so this
 * function is safe to call with a header/footer sub-editor — it will still
 * return document-level counts.
 */
export function refreshAllStatFields(editor: Editor): StatFieldCacheMap {
  const cacheMap: StatFieldCacheMap = new Map();
  const mainEditor = resolveMainBodyEditor(editor);
  const stats = getWordStatistics(mainEditor);

  for (const fieldType of ['NUMWORDS', 'NUMCHARS', 'NUMPAGES'] as const) {
    const freshValue = resolveDocumentStatFieldValue(fieldType, stats);
    if (freshValue != null) {
      cacheMap.set(fieldType, freshValue);
    }
  }

  return cacheMap;
}
