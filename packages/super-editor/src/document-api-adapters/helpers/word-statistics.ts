/**
 * Word-compatible document statistics helper.
 *
 * Provides counts that align with Word's NUMWORDS, NUMCHARS, and NUMPAGES
 * field semantics. Reuses the existing text projection and word-counting
 * infrastructure from live-document-counts.ts — only character-counting
 * formulas are new.
 *
 * Count scope: main document body only (headers/footers, footnotes, and
 * field display text are already excluded by the text projection).
 *
 * **Important**: When called from a header/footer sub-editor, the caller
 * must pass the main body editor via `mainBodyEditor` so that counts
 * reflect the document body, not the header/footer text.
 */

import type { Editor } from '../../core/Editor.js';
import { getTextAdapter } from '../get-text-adapter.js';
import { countWordsFromText, countPages } from './live-document-counts.js';

export interface WordStatistics {
  /** Word count — matches NUMWORDS / ap:Words semantics. */
  words: number;
  /** Character count excluding spaces — matches ap:Characters / NUMCHARS semantics. */
  characters: number;
  /** Character count including spaces — matches ap:CharactersWithSpaces. */
  charactersWithSpaces: number;
  /** Page count from the layout engine (undefined when pagination is inactive). */
  pages: number | undefined;
}

/**
 * Computes Word-compatible document statistics.
 *
 * @param editor - The editor to compute stats from. For header/footer
 *   sub-editors this should be the **main body editor**, not the sub-editor,
 *   because stat fields always display document-level counts.
 */
export function getWordStatistics(editor: Editor): WordStatistics {
  const text = getTextAdapter(editor, {});

  return {
    words: countWordsFromText(text),
    characters: countCharactersExcludingSpaces(text),
    charactersWithSpaces: countCharactersWithSpaces(text),
    pages: countPages(editor),
  };
}

/**
 * Resolves the live display value for a document-statistic field.
 *
 * Word's NUMCHARS field reads from the `Characters` metric (excluding
 * spaces), not from `CharactersWithSpaces`.
 */
export function resolveDocumentStatFieldValue(fieldType: string, stats: WordStatistics): string | null {
  switch (fieldType) {
    case 'NUMWORDS':
      return String(stats.words);
    case 'NUMCHARS':
      return String(stats.characters);
    case 'NUMPAGES':
      return stats.pages != null ? String(stats.pages) : null;
    default:
      return null;
  }
}

/**
 * Resolves the correct editor for computing document-level statistics.
 *
 * If the given editor is a header/footer sub-editor, returns the parent
 * (main body) editor. Otherwise returns the editor itself.
 */
export function resolveMainBodyEditor(editor: Editor): Editor {
  const parentEditor = (editor as any).options?.parentEditor;
  return parentEditor ?? editor;
}

/**
 * Counts characters excluding whitespace — approximates Word's ap:Characters.
 *
 * Word's "Characters" count excludes spaces but includes punctuation.
 * The text projection uses '\n' as block and leaf separators, which should
 * not count as characters.
 *
 * **Semantics note**: This formula (`text.replace(/\s/g, '').length`) is an
 * approximation. The exact Word counting rules are not publicly documented
 * and may vary by Word version. The formula should be verified against
 * Word-authored fixtures and adjusted if drift is detected.
 */
function countCharactersExcludingSpaces(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * Counts characters with spaces — approximates Word's ap:CharactersWithSpaces.
 *
 * Word's "CharactersWithSpaces" counts all visible characters plus spaces,
 * but not paragraph marks. The text projection inserts '\n' between blocks,
 * which we exclude.
 *
 * **Semantics note**: Same caveat as above — the formula should be verified
 * against Word-authored fixtures.
 */
function countCharactersWithSpaces(text: string): number {
  return text.replace(/\n/g, '').length;
}
