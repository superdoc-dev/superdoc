import type { Editor } from '../../core/Editor.js';
import { TrackInsertMarkName } from '../../extensions/track-changes/constants.js';
import { buildTrackedChangeCanonicalIdMap } from './tracked-change-resolver.js';
import { toNonEmptyString } from './value-utils.js';

type ReceiptInsert = { kind: 'entity'; entityType: 'trackedChange'; entityId: string };

type PmMarkLike = { readonly type: { readonly name: string }; readonly attrs?: Readonly<Record<string, unknown>> };

/**
 * Collects tracked-insert mark references within a document range.
 *
 * @param editor - The editor instance to query.
 * @param from - Start position in the document.
 * @param to - End position in the document.
 * @returns Deduplicated tracked-change entity refs, or `undefined` if none found.
 */
export function collectTrackInsertRefsInRange(editor: Editor, from: number, to: number): ReceiptInsert[] | undefined {
  if (to <= from) return undefined;

  // ProseMirror Node exposes nodesBetween but the Editor type doesn't surface it directly.
  const doc = editor.state.doc as {
    nodesBetween?: (from: number, to: number, callback: (node: { marks?: readonly PmMarkLike[] }) => void) => void;
  };
  if (typeof doc.nodesBetween !== 'function') return undefined;

  const canonicalIdByAlias = buildTrackedChangeCanonicalIdMap(editor);
  const ids = new Set<string>();
  doc.nodesBetween(from, to, (node) => {
    const marks = node.marks ?? [];
    for (const mark of marks) {
      if (mark.type.name !== TrackInsertMarkName) continue;
      const id = toNonEmptyString(mark.attrs?.id);
      if (!id) continue;
      ids.add(canonicalIdByAlias.get(id) ?? id);
    }
  });

  if (ids.size === 0) return undefined;
  return Array.from(ids).map((id) => ({ kind: 'entity', entityType: 'trackedChange', entityId: id }));
}
