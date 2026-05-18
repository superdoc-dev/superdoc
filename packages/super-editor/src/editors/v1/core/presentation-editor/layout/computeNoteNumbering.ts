import type { EditorState } from 'prosemirror-state';

/**
 * Computes visible footnote/endnote numbering by first appearance in the document.
 *
 * Per ECMA-376 §17.11.14: refs with `customMarkFollows="1"` shall not increment
 * the numbering counter — the custom mark does not consume an ordinal.
 *
 * @param editorState - PM editor state whose doc carries the refs
 * @param noteTypeName - 'footnoteReference' or 'endnoteReference'
 * @param startCounter - initial counter value (from numStart, default 1)
 */
export function computeNoteNumbering(
  editorState: EditorState | null | undefined,
  noteTypeName: 'footnoteReference' | 'endnoteReference',
  startCounter: number,
): { numberById: Record<string, number>; order: string[] } {
  const numberById: Record<string, number> = {};
  const order: string[] = [];
  if (!editorState) return { numberById, order };

  const seen = new Set<string>();
  let counter = startCounter;

  try {
    editorState.doc?.descendants?.((node: any) => {
      if (node?.type?.name !== noteTypeName) return;
      const rawId = node?.attrs?.id;
      if (rawId == null) return;
      const key = String(rawId);
      if (!key || seen.has(key)) return;
      seen.add(key);
      order.push(key);
      // §17.11.14 — customMarkFollows refs do not consume an ordinal.
      if (isCustomMarkFollows(node?.attrs?.customMarkFollows)) return;
      numberById[key] = counter;
      counter += 1;
    });
  } catch (_) {
    // Surface a degraded result rather than crashing the layout pipeline.
  }

  return { numberById, order };
}

/** OOXML on/off — accepts the same truthy forms as the inline ref converter. */
export function isCustomMarkFollows(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
