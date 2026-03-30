import type {
  PermissionRangesListInput,
  PermissionRangesListResult,
  PermissionRangesGetInput,
  PermissionRangeInfo,
  PermissionRangesCreateInput,
  PermissionRangesRemoveInput,
  PermissionRangesUpdatePrincipalInput,
  PermissionRangeMutationResult,
  PermissionRangeRemoveResult,
  PermissionRangePrincipal,
  PermissionRangeKind,
  MutationOptions,
  Position,
} from '@superdoc/document-api';
import { buildDiscoveryResult, buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Editor } from '../core/Editor.js';
import { DocumentApiAdapterError } from './errors.js';
import { rejectTrackedMode } from './helpers/mutation-helpers.js';
import { getRevision } from './plan-engine/revision-tracker.js';
import { paginate } from './helpers/adapter-utils.js';
import { resolveSelectionTarget } from './helpers/selection-target-resolver.js';
import { PERMISSION_MUTATION_META } from '../extensions/permission-ranges/permission-ranges.js';

// ---------------------------------------------------------------------------
// Internal types for allRanges stored in extension storage
// ---------------------------------------------------------------------------

export interface PermissionRangeEntry {
  id: string;
  principal: PermissionRangePrincipal;
  kind: PermissionRangeKind;
  from: number; // PM position (start of editable content, after permStart node)
  to: number; // PM position (before permEnd node)
  startPos: number; // PM position of the permStart node itself
  endPos: number; // PM position of the permEnd node itself
}

// ---------------------------------------------------------------------------
// PM position ↔ Document API Position conversion
// ---------------------------------------------------------------------------

/**
 * Convert a PM position to a Document API Position using the sdBlockId attribute.
 * Follows the same pattern as bookmark-resolver.ts:nodePositionToPosition.
 */
function pmPosToPosition(doc: ProseMirrorNode, pos: number): Position {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) {
      return { blockId, offset: pos - resolved.start(depth) };
    }
  }
  return { blockId: '', offset: pos };
}

// ---------------------------------------------------------------------------
// Storage access
// ---------------------------------------------------------------------------

interface PermissionRangesStorage {
  allRanges: PermissionRangeEntry[];
  allowedRanges: PermissionRangeEntry[];
  hasAllowedRanges: boolean;
  ranges: PermissionRangeEntry[];
}

function getPermRangesStorage(editor: Editor): PermissionRangesStorage | undefined {
  return editor.storage.permissionRanges as PermissionRangesStorage | undefined;
}

function getAllRanges(editor: Editor): PermissionRangeEntry[] {
  return getPermRangesStorage(editor)?.allRanges ?? [];
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toRangeInfo(entry: PermissionRangeEntry, doc: ProseMirrorNode): PermissionRangeInfo {
  return {
    id: entry.id,
    principal: entry.principal,
    kind: entry.kind,
    start: pmPosToPosition(doc, entry.from),
    end: pmPosToPosition(doc, entry.to),
  };
}

function principalToAttrs(principal: PermissionRangePrincipal): { edGrp?: string; ed?: string } {
  if (principal.kind === 'everyone') return { edGrp: 'everyone' };
  return { ed: principal.id };
}

function generatePermissionId(): string {
  return String(Math.floor(Math.random() * 2000000000));
}

// ---------------------------------------------------------------------------
// permissionRanges.list
// ---------------------------------------------------------------------------

export function permissionRangesListAdapter(
  editor: Editor,
  input?: PermissionRangesListInput,
): PermissionRangesListResult {
  const revision = getRevision(editor);
  const doc = editor.state.doc;
  const allRanges = getAllRanges(editor);

  const allItems = allRanges.map((entry) =>
    buildDiscoveryItem(
      entry.id,
      buildResolvedHandle(`perm:${entry.id}`, 'ephemeral', 'ext:permissionRange'),
      toRangeInfo(entry, doc),
    ),
  );

  const { total, items: paged } = paginate(allItems, input?.offset, input?.limit);
  const effectiveLimit = input?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: input?.offset ?? 0, returned: paged.length },
  });
}

// ---------------------------------------------------------------------------
// permissionRanges.get
// ---------------------------------------------------------------------------

export function permissionRangesGetAdapter(editor: Editor, input: PermissionRangesGetInput): PermissionRangeInfo {
  const allRanges = getAllRanges(editor);
  const entry = allRanges.find((r) => r.id === input.id);
  if (!entry) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Permission range '${input.id}' not found.`);
  }
  return toRangeInfo(entry, editor.state.doc);
}

// ---------------------------------------------------------------------------
// permissionRanges.create
// ---------------------------------------------------------------------------

export function permissionRangesCreateAdapter(
  editor: Editor,
  input: PermissionRangesCreateInput,
  options?: MutationOptions,
): PermissionRangeMutationResult {
  rejectTrackedMode('permissionRanges.create', options);

  const { target, principal, id: callerSuppliedId } = input;
  const id = callerSuppliedId ?? generatePermissionId();

  // Duplicate ID check
  const allRanges = getAllRanges(editor);
  if (allRanges.some((r) => r.id === id)) {
    throw new DocumentApiAdapterError('INVALID_INPUT', `Permission range ID '${id}' already exists.`);
  }

  // Resolve SelectionTarget to absolute PM positions using the standard resolver
  const resolved = resolveSelectionTarget(editor, target);
  const from = resolved.absFrom;
  const to = resolved.absTo;

  const doc = editor.state.doc;
  if (from >= to || from < 0 || to > doc.content.size) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Target range is invalid or empty.');
  }

  const attrs = { id, ...principalToAttrs(principal) };

  // Determine if block or inline based on whether target spans multiple blocks
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const spansMultipleBlocks = $from.parent !== $to.parent || $from.depth === 0;

  if (options?.dryRun) {
    const kind: PermissionRangeKind = spansMultipleBlocks ? 'block' : 'inline';
    const entry: PermissionRangeEntry = {
      id,
      principal,
      kind,
      from,
      to,
      startPos: from,
      endPos: to,
    };
    return { success: true, range: toRangeInfo(entry, doc) };
  }

  // Create the transaction
  const { tr } = editor.state;
  tr.setMeta(PERMISSION_MUTATION_META, true);
  tr.setMeta('addToHistory', false);
  setTrackChangesSkip(editor, tr);

  const schema = editor.state.schema;

  if (spansMultipleBlocks) {
    const startNode = schema.nodes.permStartBlock?.create(attrs);
    const endNode = schema.nodes.permEndBlock?.create({ id });
    if (!startNode || !endNode) {
      throw new DocumentApiAdapterError(
        'CAPABILITY_UNAVAILABLE',
        'Block-level permission range nodes are not available in the schema.',
      );
    }
    // Insert end first (so positions stay valid), then start
    tr.insert(to, endNode);
    tr.insert(from, startNode);
  } else {
    const startNode = schema.nodes.permStart?.create(attrs);
    const endNode = schema.nodes.permEnd?.create({ id });
    if (!startNode || !endNode) {
      throw new DocumentApiAdapterError(
        'CAPABILITY_UNAVAILABLE',
        'Inline permission range nodes are not available in the schema.',
      );
    }
    tr.insert(to, endNode);
    tr.insert(from, startNode);
  }

  if (editor.view) {
    editor.view.dispatch(tr);
  } else {
    editor.dispatch(tr);
  }

  // Read back the created range from storage
  const updatedRanges = getAllRanges(editor);
  const created = updatedRanges.find((r) => r.id === id);
  if (created) {
    return { success: true, range: toRangeInfo(created, editor.state.doc) };
  }

  // Fallback: construct from known positions
  return {
    success: true,
    range: {
      id,
      principal,
      kind: spansMultipleBlocks ? 'block' : 'inline',
      start: pmPosToPosition(editor.state.doc, from),
      end: pmPosToPosition(editor.state.doc, to),
    },
  };
}

// ---------------------------------------------------------------------------
// permissionRanges.remove
// ---------------------------------------------------------------------------

export function permissionRangesRemoveAdapter(
  editor: Editor,
  input: PermissionRangesRemoveInput,
  options?: MutationOptions,
): PermissionRangeRemoveResult {
  rejectTrackedMode('permissionRanges.remove', options);

  const { id } = input;

  if (options?.dryRun) {
    const allRanges = getAllRanges(editor);
    if (!allRanges.some((r) => r.id === id)) {
      const hasMarker = findMarkerPositions(editor, id);
      if (!hasMarker.start && !hasMarker.end) {
        throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Permission range '${id}' not found.`);
      }
    }
    return { success: true, id };
  }

  const positions = findMarkerPositions(editor, id);
  if (!positions.start && !positions.end) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Permission range '${id}' not found.`);
  }

  const { tr } = editor.state;
  tr.setMeta(PERMISSION_MUTATION_META, true);
  tr.setMeta('addToHistory', false);
  setTrackChangesSkip(editor, tr);

  // Remove markers in reverse position order to keep positions valid
  const toDelete = [...(positions.end ? [positions.end] : []), ...(positions.start ? [positions.start] : [])].sort(
    (a, b) => b.pos - a.pos,
  );

  for (const marker of toDelete) {
    tr.delete(marker.pos, marker.pos + marker.nodeSize);
  }

  if (editor.view) {
    editor.view.dispatch(tr);
  } else {
    editor.dispatch(tr);
  }

  return { success: true, id };
}

// ---------------------------------------------------------------------------
// permissionRanges.updatePrincipal
// ---------------------------------------------------------------------------

export function permissionRangesUpdatePrincipalAdapter(
  editor: Editor,
  input: PermissionRangesUpdatePrincipalInput,
  options?: MutationOptions,
): PermissionRangeMutationResult {
  rejectTrackedMode('permissionRanges.updatePrincipal', options);

  const { id, principal } = input;

  const positions = findMarkerPositions(editor, id);
  if (!positions.start) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Permission range start marker '${id}' not found.`);
  }

  if (options?.dryRun) {
    const allRanges = getAllRanges(editor);
    const existing = allRanges.find((r) => r.id === id);
    if (existing) {
      return { success: true, range: toRangeInfo({ ...existing, principal }, editor.state.doc) };
    }
    return {
      success: true,
      range: {
        id,
        principal,
        kind: 'inline',
        start: pmPosToPosition(editor.state.doc, positions.start.pos),
        end: pmPosToPosition(editor.state.doc, positions.start.pos),
      },
    };
  }

  const { tr } = editor.state;
  tr.setMeta(PERMISSION_MUTATION_META, true);
  tr.setMeta('addToHistory', false);
  setTrackChangesSkip(editor, tr);

  // Update the start marker's attributes
  const { pos, node } = positions.start;
  const newAttrs = {
    ...node.attrs,
    ...principalToAttrs(principal),
    // Clear the opposite field when switching principal kind
    ...(principal.kind === 'everyone' ? { ed: undefined } : { edGrp: undefined }),
  };

  tr.setNodeMarkup(pos, undefined, newAttrs);
  if (editor.view) {
    editor.view.dispatch(tr);
  } else {
    editor.dispatch(tr);
  }

  // Read back
  const allRanges = getAllRanges(editor);
  const updated = allRanges.find((r) => r.id === id);
  if (updated) {
    return { success: true, range: toRangeInfo(updated, editor.state.doc) };
  }

  return {
    success: true,
    range: {
      id,
      principal,
      kind: 'inline',
      start: pmPosToPosition(editor.state.doc, pos),
      end: pmPosToPosition(editor.state.doc, pos),
    },
  };
}

// ---------------------------------------------------------------------------
// Track-changes skip helper
// ---------------------------------------------------------------------------

function setTrackChangesSkip(editor: Editor, tr: { setMeta(key: unknown, value: unknown): unknown }): void {
  try {
    const trackPlugin = editor.state.plugins.find((p) => (p as { key?: string }).key?.includes('trackChangesBase$'));
    if (trackPlugin) {
      tr.setMeta(trackPlugin, { skip: true });
    }
  } catch {
    // Plugin not present
  }
}

// ---------------------------------------------------------------------------
// Marker scanning helpers
// ---------------------------------------------------------------------------

interface MarkerPosition {
  pos: number;
  nodeSize: number;
  node: { attrs: Record<string, unknown> };
}

function findMarkerPositions(editor: Editor, id: string): { start: MarkerPosition | null; end: MarkerPosition | null } {
  let start: MarkerPosition | null = null;
  let end: MarkerPosition | null = null;

  const permStartTypes = new Set(['permStart', 'permStartBlock']);
  const permEndTypes = new Set(['permEnd', 'permEndBlock']);

  editor.state.doc.descendants((node, pos) => {
    if (start && end) return false;

    const typeName = node.type.name;
    const nodeId = node.attrs?.id;

    if (nodeId === id) {
      if (permStartTypes.has(typeName)) {
        start = { pos, nodeSize: node.nodeSize, node: { attrs: { ...node.attrs } } };
      } else if (permEndTypes.has(typeName)) {
        end = { pos, nodeSize: node.nodeSize, node: { attrs: { ...node.attrs } } };
      }
    }

    return true;
  });

  return { start, end };
}
