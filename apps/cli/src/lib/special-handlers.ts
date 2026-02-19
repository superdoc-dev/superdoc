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
import type { CliExposedOperationId } from '../cli/operation-set.js';
import type { EditorWithDoc } from './document.js';

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

type HookContext = {
  editor: EditorWithDoc;
  apiInput?: unknown;
};

type PreInvokeHook = (input: unknown, context: HookContext) => unknown;

type PostInvokeHook = (result: unknown, context: HookContext) => unknown;

// ---------------------------------------------------------------------------
// Track-changes stable-ID helpers
// ---------------------------------------------------------------------------

type TrackChangeLike = Record<string, unknown>;

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

function stableTrackChangeSignature(change: TrackChangeLike): string {
  const type = typeof change.type === 'string' ? change.type : '';
  const author = typeof change.author === 'string' ? change.author : '';
  const authorEmail = typeof change.authorEmail === 'string' ? change.authorEmail : '';
  const date = typeof change.date === 'string' ? change.date : '';
  const excerpt = typeof change.excerpt === 'string' ? change.excerpt : '';
  return `${type}|${author}|${authorEmail}|${date}|${excerpt}`;
}

/**
 * Builds stable-ID ↔ raw-ID mappings from a track-changes list result.
 * The CLI uses SHA-1-based stable IDs instead of adapter raw IDs.
 */
function buildStableIdMappings(rawListResult: unknown): {
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

  const normalizedChanges = asArray(record.changes)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const rawId =
        (typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : undefined) ??
        asTrackChangeAddress(entry.address)?.entityId;
      if (!rawId) return entry;

      const signature = stableTrackChangeSignature(entry);
      const hash = createHash('sha1').update(signature).digest('hex').slice(0, 24);
      const nextCount = (signatureCounts.get(hash) ?? 0) + 1;
      signatureCounts.set(hash, nextCount);
      const stableId = nextCount === 1 ? hash : `${hash}-${nextCount}`;

      stableToRawId.set(stableId, rawId);
      rawToStableId.set(rawId, stableId);

      const normalizedAddress = asTrackChangeAddress(entry.address);
      return {
        ...entry,
        id: stableId,
        address: normalizedAddress ? { ...normalizedAddress, entityId: stableId } : entry.address,
      };
    });

  const normalizedMatches = asArray(record.matches).map((entry) => {
    const address = asTrackChangeAddress(entry);
    if (!address) return entry;
    const stableId = rawToStableId.get(address.entityId) ?? address.entityId;
    return { ...address, entityId: stableId };
  });

  return {
    normalizedResult: {
      ...record,
      matches: normalizedMatches,
      changes: normalizedChanges.length > 0 ? normalizedChanges : record.changes,
    },
    stableToRawId,
    rawToStableId,
  };
}

// ---------------------------------------------------------------------------
// Pre-invoke hooks
// ---------------------------------------------------------------------------

/**
 * Track-changes mutations (accept/reject/get) need stable-ID → raw-ID
 * translation because the CLI uses SHA-1-based stable IDs.
 */
const resolveTrackChangeId: PreInvokeHook = (input, context) => {
  const record = asRecord(input);
  if (!record) return input;

  const stableId = typeof record.id === 'string' ? record.id : undefined;
  if (!stableId) return input;

  // List all track changes to build the stable → raw mapping
  const listResult = context.editor.doc.invoke({
    operationId: 'trackChanges.list' as const,
    input: {},
  });
  const { stableToRawId } = buildStableIdMappings(listResult);
  const rawId = stableToRawId.get(stableId) ?? stableId;

  return { ...record, id: rawId };
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
  const listResult = context.editor.doc.invoke({
    operationId: 'trackChanges.list' as const,
    input: {},
  });
  const { rawToStableId } = buildStableIdMappings(listResult);

  const rawId = typeof record.id === 'string' ? record.id : undefined;
  if (!rawId) return result;

  const stableId = rawToStableId.get(rawId) ?? rawId;
  const normalizedAddress = asTrackChangeAddress(record.address);

  return {
    ...record,
    id: stableId,
    address: normalizedAddress ? { ...normalizedAddress, entityId: stableId } : record.address,
  };
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

// ---------------------------------------------------------------------------
// comments.setActive input normalization
// ---------------------------------------------------------------------------

/**
 * comments.setActive accepts either `--id <commentId>` or `--clear`.
 * The API expects `{ commentId: string | null }`.
 * - `--clear` → `{ commentId: null }`
 * - `--id X`  → rename handled by PARAM_RENAMES (id → commentId)
 */
const normalizeSetActiveInput: PreInvokeHook = (input) => {
  const record = asRecord(input);
  if (!record) return input;

  if (record.clear === true) {
    return { commentId: null };
  }
  return input;
};

/** Pre-invoke: custom input resolution before calling editor.doc.invoke(). */
export const PRE_INVOKE_HOOKS: Partial<Record<CliExposedOperationId, PreInvokeHook>> = {
  // Track-changes mutations need stable-ID → raw-ID translation
  'trackChanges.accept': resolveTrackChangeId,
  'trackChanges.reject': resolveTrackChangeId,
  'trackChanges.get': resolveTrackChangeId,
  // comments.setActive --clear → { commentId: null }
  'comments.setActive': normalizeSetActiveInput,
};

/** Post-invoke: transform the raw invoke() result before envelope wrapping. */
export const POST_INVOKE_HOOKS: Partial<Record<CliExposedOperationId, PostInvokeHook>> = {
  // Track-changes list/get results need raw-ID → stable-ID normalization
  'trackChanges.list': normalizeTrackChangesListIds,
  'trackChanges.get': normalizeTrackChangeGetId,
  // Text mutations hoist target/resolvedRange from receipt.resolution
  insert: flattenTextMutationReceipt,
  replace: flattenTextMutationReceipt,
  delete: flattenTextMutationReceipt,
  'format.bold': flattenTextMutationReceipt,
  'format.italic': flattenTextMutationReceipt,
  'format.underline': flattenTextMutationReceipt,
  'format.strikethrough': flattenTextMutationReceipt,
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
