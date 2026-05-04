import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { SelectionCurrentInput, SelectionInfo, TextTarget, TextSegment } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { NodeSelection } from 'prosemirror-state';
import { pmPositionToTextOffset } from './text-offset-resolver.js';
import { groupTrackedChanges } from './tracked-change-resolver.js';
import { resolveCommentIdFromAttrs } from './value-utils.js';

/**
 * Mark names that anchor live entities the UI cares about. We collect
 * the entity ids in the same selection walk that produces
 * `activeMarks` so consumers can answer "is there a comment / tracked
 * change under the cursor?" without overlap-filtering `comments.list()`
 * on every keystroke.
 *
 * Kept inline rather than imported from extension constants because
 * the selection resolver lives one package up the dependency graph
 * from the comment / track-changes extensions, and we'd rather not
 * pull those (and their PM plugins) into the resolver's import graph.
 */
const COMMENT_MARK_NAME = 'commentMark';
const TRACK_CHANGE_MARK_NAMES = new Set(['trackInsert', 'trackDelete', 'trackFormat']);

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
    return { empty: true, target: null, activeMarks: [], activeCommentIds: [], activeChangeIds: [] };
  }

  const sel = state.selection;
  const { from, to, empty } = sel;

  // `collectTextSegments` returns null when any selected block lacks a
  // stable id — in that case the caller should treat the selection as
  // unaddressable rather than receive a partial TextTarget.
  const segments = shouldProjectTextTarget(sel) ? collectTextSegments(state.doc, from, to) : null;
  const target: TextTarget | null = segments && segments.length > 0 ? buildTextTarget(segments) : null;

  const activeMarks = collectActiveMarks(state, from, to);
  const { commentIds: activeCommentIds, changeIds: activeChangeRawIds } = collectActiveEntityIds(state, from, to);

  // Tracked-change marks store their PM `attrs.id` (raw id), but the
  // Document API's canonical id (`trackChanges.list().items[].id`) is a
  // derived hash from `groupTrackedChanges`. Consumers compare the
  // active ids against `list()` output to highlight the active sidebar
  // card; returning raw ids would silently miss every match. Translate
  // raw → canonical here so `activeChangeIds` matches the public
  // contract.
  const activeChangeIds = mapRawChangeIdsToCanonical(editor, activeChangeRawIds);

  const info: SelectionInfo = {
    empty,
    target,
    activeMarks,
    activeCommentIds,
    activeChangeIds,
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

function shouldProjectTextTarget(selection: unknown): boolean {
  if (!selection || typeof selection !== 'object') return false;
  if (selection instanceof NodeSelection) return false;
  if ('$anchorCell' in selection) return false;
  return true;
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

/**
 * Translate raw PM-mark `attrs.id`s to the canonical Document API
 * tracked-change ids that `trackChanges.list()` returns.
 *
 * `groupTrackedChanges(editor)` is the single source of truth for the
 * raw → canonical mapping; it's already cached per
 * `editor.state.doc`, so a typical selection.current() call hits the
 * cache and runs O(grouped). Unmapped raw ids (a partial editor or
 * a mark that wasn't grouped for some reason) are dropped from the
 * result rather than emitted as raw — leaking raw ids past this point
 * would re-introduce the silent-no-match bug consumers report.
 */
function mapRawChangeIdsToCanonical(editor: Editor, rawIds: string[]): string[] {
  if (rawIds.length === 0) return rawIds;
  let grouped: ReturnType<typeof groupTrackedChanges>;
  try {
    grouped = groupTrackedChanges(editor);
  } catch {
    // Defensive: a partial editor mid-tear-down shouldn't wedge
    // selection.current(). Fall back to dropping the change ids.
    return [];
  }
  const rawToCanonical = new Map<string, string>();
  for (const change of grouped) {
    rawToCanonical.set(change.rawId, change.id);
  }
  // Dedupe through a Set: when two raw ids in `rawIds` group to the
  // same canonical (e.g. paired tracked-change pieces — insert + delete
  // halves of a tracked replace, or an undo step that produced a stale
  // raw alias), the canonical should appear once. Without this, an
  // overlapping selection across both halves would emit a duplicate
  // in `activeChangeIds` and double-count in any UI driven by it.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawIds) {
    const canonical = rawToCanonical.get(raw);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/**
 * Collect comment and tracked-change ids that touch the selection.
 *
 * Union semantics (NOT intersection): an id is included when *any*
 * character in the range carries that mark. For an empty selection
 * (caret), this resolves to ids on the marks at the caret position,
 * including stored marks the user is about to apply.
 *
 * Walks text nodes in one pass; bounded allocation. Co-located with
 * `collectActiveMarks` so the resolver only walks the selection
 * range twice (once for mark-name intersection, once here for
 * id-attribute union) — the controller substrate dedups subscribers
 * with `shallowEqual`, keeping this cheap on the hot path.
 */
function collectActiveEntityIds(
  state: { selection: any; storedMarks?: any; doc: ProseMirrorNode },
  from: number,
  to: number,
): { commentIds: string[]; changeIds: string[] } {
  const commentIds = new Set<string>();
  const changeIds = new Set<string>();

  const collectFromMark = (markType: string, attrs: Record<string, unknown> | undefined) => {
    if (markType === COMMENT_MARK_NAME) {
      // Imported / legacy comment marks may carry the id on
      // `importedId` or `w:id` instead of `commentId`. The rest of
      // the comment adapter graph (`comments.list`, `comments.patch`,
      // etc.) treats those as the canonical id; without the same
      // fallback, `selection.current().activeCommentIds` would stay
      // empty over an imported anchor while `comments.list` reports
      // the comment — breaking sidebar highlight / disable logic for
      // legacy DOCX imports.
      const id = resolveCommentIdFromAttrs((attrs ?? {}) as Record<string, unknown>);
      if (typeof id === 'string' && id.length > 0) commentIds.add(id);
    } else if (TRACK_CHANGE_MARK_NAMES.has(markType)) {
      const id = attrs?.id;
      if (typeof id === 'string' && id.length > 0) changeIds.add(id);
    }
  };

  if (from === to) {
    // Caret-only: include stored marks (sticky formatting the user is
    // about to apply) plus the marks resolved at the position itself.
    if (state.storedMarks) {
      for (const mark of state.storedMarks) collectFromMark(mark.type.name, mark.attrs);
    }
    const $pos = state.doc.resolve(from);
    for (const mark of $pos.marks()) collectFromMark(mark.type.name, mark.attrs);
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      if (end <= start) return false;
      for (const mark of node.marks) collectFromMark(mark.type.name, mark.attrs);
      return false;
    });
  }

  return { commentIds: Array.from(commentIds), changeIds: Array.from(changeIds) };
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
