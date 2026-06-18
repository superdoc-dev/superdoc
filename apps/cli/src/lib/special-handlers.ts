/**
 * Special-handlers registry — explicit per-operation exception hooks.
 *
 * Operations NOT in these maps use the fully generic path.
 * Every entry must have a comment explaining why it exists.
 *
 * Boundary rule: if this file grows past ~15 entries, that signals
 * capability should move into document-api.
 */

import { createHash } from 'node:crypto';
import { INLINE_PROPERTY_REGISTRY } from '@superdoc/document-api';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { CliError } from './errors.js';

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

/**
 * Hooks receive a runtime-neutral `invoke` function (the same surface
 * orchestrators dispatch through). They MUST NOT reach for engine internals
 * such as `editor.state` or `editor.commands`.
 */
export type SpecialHandlerInvoke = (request: { operationId: string; input?: unknown; options?: unknown }) => unknown;

type HookContext = {
  invoke?: SpecialHandlerInvoke;
  editor?: {
    doc?: {
      invoke?: SpecialHandlerInvoke;
    };
  };
  apiInput?: unknown;
};

type PreInvokeHook = (input: unknown, context: HookContext) => unknown;

type PostInvokeHook = (result: unknown, context: HookContext) => unknown;

const FORMAT_RECEIPT_OPERATION_IDS: readonly CliExposedOperationId[] = [
  'formatRange',
  'format.apply',
  ...INLINE_PROPERTY_REGISTRY.map((entry) => `format.${entry.key}` as CliExposedOperationId),
];

// ---------------------------------------------------------------------------
// Track-changes stable-ID helpers
// ---------------------------------------------------------------------------

type TrackChangeScopeState = {
  rawToStableTrackChangeIds: Map<string, string>;
  resolvedStableTrackChangeIds: Set<string>;
};

const TRACK_CHANGE_SCOPE_STATES = new WeakMap<object, TrackChangeScopeState>();

function getTrackChangeScopeKey(context: HookContext): object | null {
  if (context.editor?.doc && typeof context.editor.doc === 'object') return context.editor.doc as object;
  if (typeof context.invoke === 'function') return context.invoke as unknown as object;
  return null;
}

function getTrackChangeScopeState(context: HookContext): TrackChangeScopeState | null {
  const key = getTrackChangeScopeKey(context);
  if (!key) return null;
  let state = TRACK_CHANGE_SCOPE_STATES.get(key);
  if (!state) {
    state = {
      rawToStableTrackChangeIds: new Map<string, string>(),
      resolvedStableTrackChangeIds: new Set<string>(),
    };
    TRACK_CHANGE_SCOPE_STATES.set(key, state);
  }
  return state;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asTrackChangeAddress(value: unknown): { kind: string; entityType: string; entityId: string } | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.kind !== 'entity' || record.entityType !== 'trackedChange') return null;
  if (typeof record.entityId !== 'string' || record.entityId.length === 0) return null;
  return {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: record.entityId,
  };
}

function invokeFromContext(context: HookContext): SpecialHandlerInvoke {
  if (typeof context.invoke === 'function') return context.invoke;
  const editorDoc = context.editor?.doc;
  if (editorDoc && typeof editorDoc.invoke === 'function') return editorDoc.invoke.bind(editorDoc);
  throw new CliError('COMMAND_FAILED', 'Special handler requires document invocation context.');
}

function publicTrackChangeIdForRawId(rawId: string, signatureCounts: Map<string, number>): string {
  const compactPublicId = rawId.length <= 64 && !/[|/\\]/.test(rawId);
  const signature = compactPublicId ? rawId : createHash('sha1').update(rawId).digest('hex').slice(0, 24);
  const nextCount = (signatureCounts.get(signature) ?? 0) + 1;
  signatureCounts.set(signature, nextCount);
  return nextCount === 1 ? signature : `${signature}-${nextCount}`;
}

/**
 * Builds stable-ID ↔ raw-ID mappings from a track-changes list result.
 * The CLI preserves compact adapter ids and shortens runtime-internal ids,
 * keying both forms off the raw logical id so in-place edits do not remint
 * the public id.
 */
function buildStableIdMappings(
  rawListResult: unknown,
  scopeState: TrackChangeScopeState | null = null,
): {
  normalizedResult: unknown;
  stableToRawId: Map<string, string>;
  rawToStableId: Map<string, string>;
} {
  const record = asRecord(rawListResult);
  if (!record) {
    return { normalizedResult: rawListResult, stableToRawId: new Map(), rawToStableId: new Map() };
  }

  const stableToRawId = new Map<string, string>();
  const rawToStableId = new Map<string, string>();
  const signatureCounts = new Map<string, number>();
  scopeState?.rawToStableTrackChangeIds.clear();

  const rawItems = asArray(record.items)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  for (const entry of rawItems) {
    const rawId =
      (typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : undefined) ??
      asTrackChangeAddress(entry.address)?.entityId;
    if (!rawId) continue;

    const stableId = publicTrackChangeIdForRawId(rawId, signatureCounts);

    stableToRawId.set(stableId, rawId);
    rawToStableId.set(rawId, stableId);
    scopeState?.rawToStableTrackChangeIds.set(rawId, stableId);
  }

  const normalizedItems = rawItems.map((entry) => normalizeTrackChangeResultIds(entry, rawToStableId));

  return {
    normalizedResult: {
      ...record,
      items: normalizedItems.length > 0 ? normalizedItems : record.items,
    },
    stableToRawId,
    rawToStableId,
  };
}

function remapTrackChangeId(value: unknown, rawToStableId: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  return rawToStableId.get(value) ?? value;
}

function normalizeTrackChangeAddress(value: unknown, rawToStableId: Map<string, string>): unknown {
  const address = asTrackChangeAddress(value);
  if (!address) return value;
  const stableEntityId = remapTrackChangeId(address.entityId, rawToStableId);
  return stableEntityId === address.entityId ? value : { ...address, entityId: stableEntityId };
}

function normalizeTrackChangeTarget(value: unknown, rawToStableId: Map<string, string>): unknown {
  const target = asRecord(value);
  if (!target) return value;
  const address = normalizeTrackChangeAddress(target.address, rawToStableId);
  return address === target.address ? value : { ...target, address };
}

function normalizeOverlapLayer(value: unknown, rawToStableId: Map<string, string>): unknown {
  const layer = asRecord(value);
  if (!layer) return value;
  const id = remapTrackChangeId(layer.id, rawToStableId);
  return id === layer.id ? value : { ...layer, id };
}

function normalizeOverlap(value: unknown, rawToStableId: Map<string, string>): unknown {
  const overlap = asRecord(value);
  if (!overlap) return value;

  const visualLayers = asArray(overlap.visualLayers).map((layer) => normalizeOverlapLayer(layer, rawToStableId));
  const preferredContextTarget = normalizeOverlapLayer(overlap.preferredContextTarget, rawToStableId);
  const preferredContextTargetId = remapTrackChangeId(overlap.preferredContextTargetId, rawToStableId);
  const parentId = remapTrackChangeId(overlap.parentId, rawToStableId);

  return {
    ...overlap,
    ...(Array.isArray(overlap.visualLayers) ? { visualLayers } : {}),
    ...(preferredContextTarget !== overlap.preferredContextTarget ? { preferredContextTarget } : {}),
    ...(preferredContextTargetId !== overlap.preferredContextTargetId ? { preferredContextTargetId } : {}),
    ...(parentId !== overlap.parentId ? { parentId } : {}),
  };
}

function normalizeTrackChangeResultIds(
  record: Record<string, unknown>,
  rawToStableId: Map<string, string>,
): Record<string, unknown> {
  const id = remapTrackChangeId(record.id, rawToStableId);
  const address = normalizeTrackChangeAddress(record.address, rawToStableId);
  const target = normalizeTrackChangeTarget(record.target, rawToStableId);
  const overlap = normalizeOverlap(record.overlap, rawToStableId);
  const handleRecord = asRecord(record.handle);
  const next: Record<string, unknown> = {
    ...record,
    ...(id !== record.id ? { id } : {}),
    ...(address !== record.address ? { address } : {}),
    ...(target !== record.target ? { target } : {}),
    ...(overlap !== record.overlap ? { overlap } : {}),
  };

  if (handleRecord && typeof id === 'string' && id !== record.id) {
    next.handle = { ...handleRecord, ref: `tc:${id}` };
  }

  return next;
}

// ---------------------------------------------------------------------------
// Pre-invoke hooks
// ---------------------------------------------------------------------------

/**
 * Track-changes get needs stable-ID → raw-ID translation
 * because the CLI uses SHA-1-based stable IDs.
 */
const resolveTrackChangeId: PreInvokeHook = (input, context) => {
  const record = asRecord(input);
  if (!record) return input;

  const stableId = typeof record.id === 'string' ? record.id : undefined;
  if (!stableId) return input;

  // List all track changes to build the stable → raw mapping
  const { stableToRawId } = buildCurrentTrackChangeIdMappings(context);
  const rawId = stableToRawId.get(stableId) ?? stableId;

  return { ...record, id: rawId };
};

/**
 * Rewrites track-changes target fields that can carry a stable CLI id back to
 * the raw adapter id expected by document-api implementations.
 */
function translateTrackChangeTargetIds(
  target: Record<string, unknown>,
  stableToRawId: Map<string, string>,
): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = { ...target };

  const translateField = (field: 'id' | 'anchor') => {
    const value = target[field];
    if (typeof value !== 'string') return;
    const rawId = stableToRawId.get(value);
    if (!rawId || rawId === value) return;
    next[field] = rawId;
    changed = true;
  };

  translateField('id');
  translateField('anchor');

  const range = asRecord(target.range);
  if (range && typeof range.anchor === 'string') {
    const rawAnchor = stableToRawId.get(range.anchor);
    if (rawAnchor && rawAnchor !== range.anchor) {
      next.range = { ...range, anchor: rawAnchor };
      changed = true;
    }
  }

  return changed ? next : target;
}

function hasTrackChangeTargetId(target: Record<string, unknown>): boolean {
  if (typeof target.id === 'string') return true;
  if (typeof target.anchor === 'string') return true;
  const range = asRecord(target.range);
  return typeof range?.anchor === 'string';
}

function collectTrackChangeTargetIds(target: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  if (typeof target.id === 'string') ids.add(target.id);
  if (typeof target.anchor === 'string') ids.add(target.anchor);
  const range = asRecord(target.range);
  if (typeof range?.anchor === 'string') ids.add(range.anchor);
  return Array.from(ids);
}

function buildCurrentTrackChangeIdMappings(context: HookContext): {
  stableToRawId: Map<string, string>;
  rawToStableId: Map<string, string>;
} {
  const scopeState = getTrackChangeScopeState(context);
  const listResult = invokeFromContext(context)({
    operationId: 'trackChanges.list',
    input: {},
  });
  const { stableToRawId, rawToStableId } = buildStableIdMappings(listResult, scopeState);
  return { stableToRawId, rawToStableId };
}

function translateCommentTrackedChangeTargetIds(
  target: Record<string, unknown>,
  stableToRawId: Map<string, string>,
): Record<string, unknown> {
  const trackedChangeId = target.trackedChangeId;
  if (typeof trackedChangeId !== 'string') return target;
  const rawId = stableToRawId.get(trackedChangeId);
  if (!rawId || rawId === trackedChangeId) return target;
  return { ...target, trackedChangeId: rawId };
}

function normalizeCommentTrackedChangeIds(value: unknown, rawToStableId: Map<string, string>): unknown {
  const record = asRecord(value);
  if (!record) return value;

  let changed = false;
  const next: Record<string, unknown> = { ...record };
  const trackedChangeParentId = remapTrackChangeId(record.trackedChangeParentId, rawToStableId);
  if (trackedChangeParentId !== record.trackedChangeParentId) {
    next.trackedChangeParentId = trackedChangeParentId;
    changed = true;
  }

  const link = asRecord(record.trackedChangeLink);
  if (link) {
    const trackedChangeId = remapTrackChangeId(link.trackedChangeId, rawToStableId);
    if (trackedChangeId !== link.trackedChangeId) {
      next.trackedChangeLink = { ...link, trackedChangeId };
      changed = true;
    }
  }

  return changed ? next : value;
}

/**
 * trackChanges.decide needs stable-ID → raw-ID translation on every target
 * field that can identify a tracked change.
 */
const resolveReviewDecideId: PreInvokeHook = (input, context) => {
  const record = asRecord(input);
  if (!record) return input;

  const target = asRecord(record.target);
  if (!target) return input;

  if (!hasTrackChangeTargetId(target)) return input;

  const scopeState = getTrackChangeScopeState(context);
  const { stableToRawId } = buildCurrentTrackChangeIdMappings(context);
  const translatedTarget = translateTrackChangeTargetIds(target, stableToRawId);
  if (translatedTarget === target) {
    const resolvedId = collectTrackChangeTargetIds(target).find((id) =>
      scopeState?.resolvedStableTrackChangeIds.has(id),
    );
    if (resolvedId) {
      throw new CliError('NO_OP', `Tracked change "${resolvedId}" has already been resolved.`);
    }
  }
  if (translatedTarget === target) return input;

  return { ...record, target: translatedTarget };
};

/**
 * comments.create/patch can target a tracked change by id. The CLI exposes
 * stable track-change ids, so translate them back to the raw adapter id before
 * invoking the v2 comment adapter.
 */
const resolveCommentTrackedChangeTargetId: PreInvokeHook = (input, context) => {
  const record = asRecord(input);
  if (!record) return input;

  const target = asRecord(record.target);
  if (!target || typeof target.trackedChangeId !== 'string') return input;

  const { stableToRawId } = buildCurrentTrackChangeIdMappings(context);
  const translatedTarget = translateCommentTrackedChangeTargetIds(target, stableToRawId);
  return translatedTarget === target ? input : { ...record, target: translatedTarget };
};

// ---------------------------------------------------------------------------
// Post-invoke hooks
// ---------------------------------------------------------------------------

/**
 * Track-changes list returns raw adapter IDs — normalize to stable IDs.
 */
const normalizeTrackChangesListIds: PostInvokeHook = (result) => {
  return buildStableIdMappings(result).normalizedResult;
};

/**
 * Track-changes get returns a single change with a raw adapter ID — normalize.
 */
const normalizeTrackChangeGetId: PostInvokeHook = (result, context) => {
  const record = asRecord(result);
  if (!record) return result;

  // We need the full list to build the raw → stable mapping
  const listResult = invokeFromContext(context)({
    operationId: 'trackChanges.list',
    input: {},
  });
  const { rawToStableId } = buildStableIdMappings(listResult);

  const rawId = typeof record.id === 'string' ? record.id : undefined;
  if (!rawId) return result;

  return normalizeTrackChangeResultIds(record, rawToStableId);
};

const normalizeCommentTrackedChangeResultIds: PostInvokeHook = (result, context) => {
  const record = asRecord(result);
  if (!record) return result;

  const { rawToStableId } = buildCurrentTrackChangeIdMappings(context);
  const items = asArray(record.items);
  if (items.length > 0) {
    const normalizedItems = items.map((item) => normalizeCommentTrackedChangeIds(item, rawToStableId));
    return { ...record, items: normalizedItems };
  }
  return normalizeCommentTrackedChangeIds(record, rawToStableId);
};

const rememberResolvedTrackChangeIds: PostInvokeHook = (result, context) => {
  const record = asRecord(result);
  if (!record || record.success !== true) return result;
  const scopeState = getTrackChangeScopeState(context);

  const remember = (value: unknown) => {
    if (typeof value !== 'string' || value.length === 0) return;
    const stableId = scopeState?.rawToStableTrackChangeIds.get(value) ?? value;
    scopeState?.resolvedStableTrackChangeIds.add(stableId);
  };

  const input = asRecord(context.apiInput);
  const target = asRecord(input?.target);
  if (target) {
    for (const id of collectTrackChangeTargetIds(target)) remember(id);
  }

  for (const key of ['removed', 'invalidatedRefs']) {
    for (const entry of asArray(record[key])) {
      const item = asRecord(entry);
      if (!item || item.entityType !== 'trackedChange') continue;
      remember(item.entityId);
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// Text-mutation receipt flattening
// ---------------------------------------------------------------------------

/**
 * Text mutations (insert/replace/delete/format.*) return a TextMutationReceipt.
 * The CLI response hoists `resolution.target` and `resolution.range` to the
 * top level alongside the full receipt for backwards-compatible envelope shape:
 *   { target, resolvedRange, receipt, ... }
 */
const flattenTextMutationReceipt: PostInvokeHook = (result) => {
  const record = asRecord(result);
  if (!record) return { receipt: result };

  const resolution = asRecord(record.resolution);
  return {
    target: resolution?.target,
    resolvedRange: resolution?.range,
    receipt: result,
  };
};

const FORMAT_POST_INVOKE_HOOKS: Partial<Record<CliExposedOperationId, PostInvokeHook>> = Object.fromEntries(
  FORMAT_RECEIPT_OPERATION_IDS.map((operationId) => [operationId, flattenTextMutationReceipt]),
) as Partial<Record<CliExposedOperationId, PostInvokeHook>>;

/** Pre-invoke: custom input resolution before calling editor.doc.invoke(). */
export const PRE_INVOKE_HOOKS: Partial<Record<CliExposedOperationId, PreInvokeHook>> = {
  // Track-changes get needs stable-ID → raw-ID translation
  'trackChanges.get': resolveTrackChangeId,
  // trackChanges.decide needs stable-ID → raw-ID translation on target ids
  'trackChanges.decide': resolveReviewDecideId,
  // Comment tracked-change targets need stable-ID → raw-ID translation.
  'comments.create': resolveCommentTrackedChangeTargetId,
  'comments.patch': resolveCommentTrackedChangeTargetId,
};

/** Post-invoke: transform the raw invoke() result before envelope wrapping. */
export const POST_INVOKE_HOOKS: Partial<Record<CliExposedOperationId, PostInvokeHook>> = {
  // Track-changes list/get results need raw-ID → stable-ID normalization
  'trackChanges.list': normalizeTrackChangesListIds,
  'trackChanges.get': normalizeTrackChangeGetId,
  'trackChanges.decide': rememberResolvedTrackChangeIds,
  // Comment linked tracked-change ids are reported in the same stable-id
  // vocabulary the CLI exposes through trackChanges.list/get.
  'comments.list': normalizeCommentTrackedChangeResultIds,
  'comments.get': normalizeCommentTrackedChangeResultIds,
  // Text mutations hoist target/resolvedRange from receipt.resolution
  insert: flattenTextMutationReceipt,
  replace: flattenTextMutationReceipt,
  delete: flattenTextMutationReceipt,
  ...FORMAT_POST_INVOKE_HOOKS,
  // getNodeById: merge nodeId from input into result for pretty output
  getNodeById: (result, context) => {
    const record = asRecord(result);
    const inputRecord = asRecord(context.apiInput);
    if (!record || !inputRecord) return result;
    const nodeId = typeof inputRecord.nodeId === 'string' ? inputRecord.nodeId : undefined;
    if (!nodeId) return result;
    return { ...record, nodeId };
  },
};
