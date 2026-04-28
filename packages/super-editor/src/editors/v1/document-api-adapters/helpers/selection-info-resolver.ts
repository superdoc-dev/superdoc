import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  SelectionCurrentInput,
  SelectionInfo,
  SelectionChangeListener,
  TextTarget,
  TextSegment,
} from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { pmPositionToTextOffset } from './text-offset-resolver.js';

/**
 * Reads the current ProseMirror selection and projects it into the Document
 * API's {@link SelectionInfo} shape, including a multi-segment
 * {@link TextTarget} for selections that span more than one block.
 *
 * Positions within a textblock are mapped to the flattened text model used
 * by {@link computeTextContentLength} (text = length, leaf atoms = 1, block
 * separators = 1 between children). For text-only blocks this collapses to
 * a direct position-within-block mapping.
 */
export function resolveCurrentSelectionInfo(editor: Editor, input: SelectionCurrentInput): SelectionInfo {
  const state = editor.state;
  if (!state) {
    return { empty: true, target: null, activeMarks: [] };
  }

  const sel = state.selection;
  const { from, to, empty } = sel;

  // `collectTextSegments` returns null when any selected block lacks a
  // stable id — in that case the caller should treat the selection as
  // unaddressable rather than receive a partial TextTarget.
  const segments = collectTextSegments(state.doc, from, to);
  const target: TextTarget | null = segments && segments.length > 0 ? buildTextTarget(segments) : null;

  const activeMarks = collectActiveMarks(state, from, to);

  const info: SelectionInfo = {
    empty,
    target,
    activeMarks,
  };

  if (input.includeText && !empty) {
    info.text = state.doc.textBetween(from, to, ' ');
  }

  return info;
}

function buildTextTarget(segments: TextSegment[]): TextTarget {
  // TextTarget requires a non-empty segments array — we already checked above.
  return {
    kind: 'text',
    segments: segments as [TextSegment, ...TextSegment[]],
  };
}

/**
 * Walk every textblock touched by [from, to] and emit one segment per block
 * with block-relative flattened-text offsets.
 *
 * Returns `null` if any selected textblock lacks an addressable id. The
 * resulting `TextTarget` would silently miss part of the user's selection,
 * which is worse than reporting no target at all — the caller can then
 * decide whether to refuse the action or fall back to a different scope.
 */
function collectTextSegments(doc: ProseMirrorNode, from: number, to: number): TextSegment[] | null {
  const segments: TextSegment[] = [];
  let abort = false;

  doc.nodesBetween(from, to, (node, pos) => {
    if (abort) return false;
    if (!node.isTextblock) return true; // descend

    const blockId = readBlockId(node);
    if (!blockId) {
      // A selected textblock has no stable id we can address. Returning
      // a partial TextTarget would silently drop part of the user's
      // selection from any downstream operation (comments.create, etc).
      // Bail out of the walk and surface an empty/null result instead.
      abort = true;
      return false;
    }

    const blockStart = pos + 1; // first position inside the block
    const blockEnd = pos + node.nodeSize - 1;

    // Clamp the selection to this block in PM-position space, then convert
    // each endpoint to the flattened text-offset model. Subtracting PM
    // positions directly would be wrong for blocks with inline wrappers
    // (e.g. `run` marks) or leaf atoms whose PM boundary tokens do not
    // count in the flattened model.
    const selStart = Math.max(from, blockStart);
    const selEnd = Math.min(to, blockEnd);

    const start = pmPositionToTextOffset(node, pos, selStart);
    const end = Math.max(start, pmPositionToTextOffset(node, pos, selEnd));

    segments.push({ blockId, range: { start, end } });
    return false; // don't descend into a textblock we've already captured
  });

  if (abort) return null;
  return segments;
}

function readBlockId(node: ProseMirrorNode): string | null {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const id = attrs.sdBlockId ?? attrs.id ?? attrs.blockId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function collectActiveMarks(
  state: { selection: any; storedMarks?: any; doc: ProseMirrorNode },
  from: number,
  to: number,
): string[] {
  const names = new Set<string>();

  // Stored marks at the caret (sticky formatting before typing).
  const stored = state.storedMarks;
  if (stored) {
    for (const mark of stored) names.add(mark.type.name);
  }

  // Marks present on every character of the selection.
  if (from === to) {
    const $pos = state.doc.resolve(from);
    const marks = $pos.marks();
    for (const mark of marks) names.add(mark.type.name);
  } else {
    const common = markTypesPresentEverywhere(state.doc, from, to);
    for (const name of common) names.add(name);
  }

  return Array.from(names);
}

/**
 * Subscribe to selection changes on the editor.
 *
 * - Microtask coalescing so a single user action that dispatches multiple
 *   PM transactions fires the listener at most once per tick.
 * - Content dedupe so doc-only transactions (typing without moving the
 *   caret) don't re-fire the listener with an identical SelectionInfo.
 *   The transaction event is needed to catch programmatic selection
 *   changes that don't emit `selectionUpdate`, but it also fires on
 *   every keystroke; without dedupe the listener runs per character.
 */
export function subscribeToSelection(editor: Editor, listener: SelectionChangeListener): () => void {
  let scheduled = false;
  let cancelled = false;
  let lastEmittedKey: string | null = null;
  const flush = () => {
    scheduled = false;
    if (cancelled) return;
    const info = resolveCurrentSelectionInfo(editor, {});
    const key = selectionInfoKey(info);
    if (key === lastEmittedKey) return;
    lastEmittedKey = key;
    listener(info);
  };
  const schedule = () => {
    if (scheduled || cancelled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  editor.on('selectionUpdate', schedule);
  editor.on('transaction', schedule);

  return () => {
    // Mark cancelled first so a microtask already queued by `schedule`
    // no-ops when it finally fires — otherwise the listener can be invoked
    // after unsubscribe returns (stale state updates during unmount).
    cancelled = true;
    editor.off?.('selectionUpdate', schedule);
    editor.off?.('transaction', schedule);
  };
}

/**
 * Build a stable string key from a SelectionInfo for content-dedupe.
 * Two infos that produce the same key represent the same observable
 * selection state — the listener can skip the second one.
 */
function selectionInfoKey(info: SelectionInfo): string {
  const target = info.target;
  let targetKey: string;
  if (!target) {
    targetKey = 'null';
  } else {
    targetKey = target.segments.map((s) => `${s.blockId}:${s.range.start}-${s.range.end}`).join('|');
  }
  const marks = [...info.activeMarks].sort().join(',');
  return `${info.empty ? '1' : '0'}:${targetKey}:${marks}`;
}

function markTypesPresentEverywhere(doc: ProseMirrorNode, from: number, to: number): Set<string> {
  // Intersect mark-name sets per text node, not per character. `selection.
  // onChange` fires frequently during editing, so allocating one Set per
  // character of a large selection (and iterating them again to intersect)
  // produced noticeable jank. A running intersection over text nodes is
  // equivalent and runs in O(number of text nodes) with bounded allocation.
  let common: Set<string> | null = null;
  let aborted = false;

  doc.nodesBetween(from, to, (node, pos) => {
    if (aborted) return false;
    if (!node.isText) return true;
    // Skip text nodes that don't actually overlap the selection. This can
    // happen at block boundaries where nodesBetween visits the adjacent
    // textblock but the intersection is empty.
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return false;

    const names = new Set<string>();
    for (const m of node.marks) names.add(m.type.name);

    if (common === null) {
      common = names;
    } else {
      for (const name of common) {
        if (!names.has(name)) common.delete(name);
      }
      // Once the running intersection is empty it can never grow again —
      // stop descending and return the empty result.
      if (common.size === 0) aborted = true;
    }
    return false;
  });

  return common ?? new Set<string>();
}
