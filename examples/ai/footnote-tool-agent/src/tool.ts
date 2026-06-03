/**
 * Custom Document API tool. The model sees a JSON schema for this; the
 * browser is what actually executes it because `editor.doc` lives here.
 *
 * Wraps three `editor.doc.*` calls:
 *   1. selection.current   - capture where the cursor is
 *   2. footnotes.insert    - drop the footnote reference + body
 *   3. footnotes.list      - look up the rendered number, return a receipt
 *
 * Adapter exceptions are caught and translated into `{ ok: false, reason }`
 * so the tool result we send back to the model is always structured.
 */

import type { DocumentApi } from 'superdoc';

export type FootnoteCitationApi = Pick<DocumentApi, 'selection' | 'footnotes'>;

export type FootnoteCitationReceipt =
  | { ok: true; noteId: string; displayNumber: string; totalFootnotes: number }
  | { ok: false; reason: string };

export function addFootnoteCitation(
  api: FootnoteCitationApi,
  input: { sourceText: string },
): FootnoteCitationReceipt {
  const sourceText = input.sourceText.trim();
  if (!sourceText) return { ok: false, reason: 'sourceText is empty' };

  try {
    const selection = api.selection.current({ includeText: true });
    if (!selection.target) {
      return { ok: false, reason: 'place the cursor in the document first' };
    }

    const insertResult = api.footnotes.insert({
      at: selection.target,
      type: 'footnote',
      content: sourceText,
    });
    if (!insertResult.success) {
      return { ok: false, reason: insertResult.failure.message };
    }

    const list = api.footnotes.list({ type: 'footnote' });
    const inserted = list.items.find((item) => item.noteId === insertResult.footnote.noteId);
    return {
      ok: true,
      noteId: insertResult.footnote.noteId,
      displayNumber: inserted?.displayNumber ?? '?',
      totalFootnotes: list.total,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
