/**
 * Core mutation pipeline for non-document.xml parts.
 *
 * `mutateParts` is the only core primitive. `mutatePart` is a convenience
 * wrapper. All lifecycle, event emission, and rollback logic lives here.
 *
 * Lifecycle guarantees (in order):
 *   1. Undo isolation
 *   2. Revision guard
 *   3. Clone (snapshot for rollback)
 *   4. Execute (operation-specific)
 *   5. Normalize and validate
 *   6. Change detection (diff)
 *   7. Commit or rollback
 *   8. Post-commit side effects (if changed and not dry-run)
 */

import { closeHistory } from 'prosemirror-history';
import { yUndoPluginKey } from 'y-prosemirror';

import type { Editor } from '../../Editor.js';
import type {
  PartId,
  PartDescriptor,
  PartOperation,
  MutatePartRequest,
  CreatePartRequest,
  DeletePartRequest,
  MutatePartsRequest,
  MutatePartsResult,
  MutatePartResult,
  PartChangedEvent,
} from '../types.js';
import { getPartDescriptor } from '../registry/part-registry.js';
import { getPart, hasPart, setPart, removePart, clonePart } from '../store/part-store.js';
import { diffPartPaths } from './diff-part-paths.js';
import { checkRevision, incrementRevision } from '../../../document-api-adapters/plan-engine/revision-tracker.js';
import { applyPartInvalidation } from '../invalidation/part-invalidation-registry.js';
import { markPartCacheStale } from '../cache-staleness.js';

// ---------------------------------------------------------------------------
// Converter shape (minimal interface to avoid importing SuperConverter)
// ---------------------------------------------------------------------------

interface ConverterForMutation {
  documentModified: boolean;
  documentGuid: string | null;
  promoteToGuid?: () => string;
}

function getConverter(editor: Editor): ConverterForMutation | undefined {
  return (editor as unknown as { converter?: ConverterForMutation }).converter;
}

// ---------------------------------------------------------------------------
// Undo isolation
// ---------------------------------------------------------------------------

function closeUndoGroup(editor: Editor): void {
  if (editor.options?.collaborationProvider && editor.options?.ydoc) {
    try {
      yUndoPluginKey.getState(editor.state)?.undoManager?.stopCapturing();
    } catch {
      // yUndoPlugin may not be loaded
    }
  } else {
    try {
      editor.view?.dispatch?.(closeHistory(editor.state.tr));
    } catch {
      // History plugin may not be loaded
    }
  }
}

// ---------------------------------------------------------------------------
// Per-operation execution
// ---------------------------------------------------------------------------

interface OperationOutcome {
  partId: PartId;
  operation: 'mutate' | 'create' | 'delete';
  changed: boolean;
  changedPaths: string[];
  callbackResult?: unknown;
}

interface RollbackEntry {
  partId: PartId;
  operation: 'mutate' | 'create' | 'delete';
  snapshot: unknown;
}

/**
 * Execute a mutate operation on an existing part.
 *
 * If the part does not exist and a descriptor with `ensurePart` is registered,
 * the part is auto-created before mutation. This is intentional for singleton
 * parts (styles, settings, numbering) so callers don't need an explicit
 * create-then-mutate sequence. If no descriptor or `ensurePart` hook exists,
 * the call throws.
 */
function executeMutate(op: MutatePartRequest, rollbacks: RollbackEntry[]): OperationOutcome {
  const { editor, partId, sectionId } = op;
  const descriptor: PartDescriptor | undefined = getPartDescriptor(partId);

  const partExistedBefore = hasPart(editor, partId);

  if (!partExistedBefore) {
    if (descriptor?.ensurePart) {
      const initial = descriptor.ensurePart(editor, sectionId);
      setPart(editor, partId, initial);
    } else {
      throw new Error(`mutatePart: part "${partId}" does not exist in the store.`);
    }
  }

  const existing = getPart(editor, partId);
  const snapshot = clonePart(existing);
  // If part was created by ensurePart, use 'create' rollback so it gets removed on failure/dry-run
  rollbacks.push({
    partId,
    operation: partExistedBefore ? 'mutate' : 'create',
    snapshot: partExistedBefore ? snapshot : undefined,
  });

  const callbackResult = op.mutate({ part: existing, dryRun: op.dryRun ?? false });

  if (descriptor?.normalizePart) {
    const normalized = descriptor.normalizePart(existing);
    if (normalized !== undefined && normalized !== existing) {
      setPart(editor, partId, normalized);
    }
  }

  if (descriptor?.validatePart) {
    const validate: (part: unknown) => asserts part is unknown = descriptor.validatePart;
    validate(getPart(editor, partId));
  }

  const changedPaths = diffPartPaths(snapshot, getPart(editor, partId));
  const changed = changedPaths.length > 0;

  return { partId, operation: 'mutate', changed, changedPaths, callbackResult };
}

function executeCreate(op: CreatePartRequest, rollbacks: RollbackEntry[]): OperationOutcome {
  const { editor, partId } = op;

  if (hasPart(editor, partId)) {
    throw new Error(`mutatePart: part "${partId}" already exists in the store.`);
  }

  rollbacks.push({ partId, operation: 'create', snapshot: undefined });

  let data = clonePart(op.initial);
  const descriptor: PartDescriptor | undefined = getPartDescriptor(partId);

  if (descriptor?.normalizePart) {
    const normalized = descriptor.normalizePart(data);
    if (normalized !== undefined) data = normalized;
  }

  if (descriptor?.validatePart) {
    const validate: (part: unknown) => asserts part is unknown = descriptor.validatePart;
    validate(data);
  }

  setPart(editor, partId, data);

  return { partId, operation: 'create', changed: true, changedPaths: [] };
}

function executeDelete(op: DeletePartRequest, rollbacks: RollbackEntry[]): OperationOutcome {
  const { editor, partId, sectionId, source } = op;

  if (!hasPart(editor, partId)) {
    throw new Error(`mutatePart: part "${partId}" does not exist in the store.`);
  }

  const existing = getPart(editor, partId);
  const snapshot = clonePart(existing);
  rollbacks.push({ partId, operation: 'delete', snapshot });

  const descriptor = getPartDescriptor(partId);
  if (descriptor?.onDelete) {
    descriptor.onDelete({ editor, partId, sectionId, part: existing, source });
  }

  removePart(editor, partId);

  return { partId, operation: 'delete', changed: true, changedPaths: [] };
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

/**
 * Undo all operations by replaying rollback entries in **reverse** order.
 *
 * Reverse order is critical: when the same partId appears multiple times in
 * one transaction, the earliest entry holds the pre-transaction snapshot.
 * Processing in reverse ensures the earliest snapshot is restored last and
 * wins, leaving the part in its original state.
 */
function rollback(editor: Editor, entries: RollbackEntry[]): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.operation === 'create') {
      // Undo a create: remove the part
      if (hasPart(editor, entry.partId)) {
        removePart(editor, entry.partId);
      }
    } else {
      // Undo a mutate or delete: restore the snapshot
      setPart(editor, entry.partId, entry.snapshot);
    }
  }
}

// ---------------------------------------------------------------------------
// Post-commit side effects
// ---------------------------------------------------------------------------

function runPostCommitSideEffects(
  editor: Editor,
  outcomes: OperationOutcome[],
  operations: PartOperation[],
  source: string,
): boolean {
  const converter = getConverter(editor);
  if (converter) {
    converter.documentModified = true;
    if (!converter.documentGuid && typeof converter.promoteToGuid === 'function') {
      converter.promoteToGuid();
    }
  }

  incrementRevision(editor);

  // Run afterCommit hooks
  let degraded = false;
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (!outcome.changed) continue;

    const descriptor = getPartDescriptor(outcome.partId);
    if (!descriptor?.afterCommit || outcome.operation === 'delete') continue;

    try {
      descriptor.afterCommit({
        editor,
        partId: outcome.partId,
        sectionId: operations[i].sectionId,
        part: getPart(editor, outcome.partId),
        source,
      });
    } catch (err) {
      degraded = true;
      markPartCacheStale(editor, outcome.partId);
      console.error(`[parts] afterCommit hook failed for "${outcome.partId}":`, err);
    }
  }

  return degraded;
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

/**
 * Build and emit the `partChanged` event.
 *
 * Listener exceptions are caught and logged so they cannot block
 * downstream invalidation or corrupt the mutation pipeline.
 */
function emitPartChanged(
  editor: Editor,
  outcomes: OperationOutcome[],
  operations: PartOperation[],
  source: string,
  degraded: boolean,
): PartChangedEvent {
  // Preserve input order: outcomes[i] corresponds to operations[i]
  const changedParts: PartChangedEvent['parts'] = [];
  for (let i = 0; i < outcomes.length; i++) {
    if (!outcomes[i].changed) continue;
    changedParts.push({
      partId: outcomes[i].partId,
      sectionId: operations[i].sectionId,
      operation: outcomes[i].operation,
      changedPaths: outcomes[i].changedPaths,
    });
  }

  const event: PartChangedEvent = {
    parts: changedParts,
    source,
    degraded: degraded || undefined,
  };

  if (typeof editor.safeEmit === 'function') {
    const errors = editor.safeEmit('partChanged', event);
    for (const err of errors) {
      console.error('[parts] partChanged listener threw:', err);
    }
  }
  return event;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomic multi-part mutation. All operations execute as one unit.
 *
 * On failure: all parts roll back to pre-call state.
 * On success: one event, one revision increment, one invalidation pass.
 *
 * If any `afterCommit` hook fails, the mutation is still committed but
 * `result.degraded` is set to `true` and the event includes `degraded`.
 */
export function mutateParts(request: MutatePartsRequest): MutatePartsResult {
  const { editor, source, operations } = request;
  const dryRun = request.dryRun ?? false;
  const expectedRevision = request.expectedRevision;

  if (operations.length === 0) {
    return { changed: false, parts: [], degraded: false };
  }

  // Step 1: Undo isolation
  if (!dryRun) {
    closeUndoGroup(editor);
  }

  // Step 2: Revision guard
  checkRevision(editor, expectedRevision);

  // Step 3–6: Execute all operations with rollback tracking
  const rollbacks: RollbackEntry[] = [];
  const outcomes: OperationOutcome[] = [];

  try {
    for (const op of operations) {
      const opWithDefaults = { ...op, dryRun };
      let outcome: OperationOutcome;

      switch (opWithDefaults.operation) {
        case 'mutate':
          outcome = executeMutate(opWithDefaults as MutatePartRequest, rollbacks);
          break;
        case 'create':
          outcome = executeCreate(opWithDefaults as CreatePartRequest, rollbacks);
          break;
        case 'delete':
          outcome = executeDelete(opWithDefaults as DeletePartRequest, rollbacks);
          break;
      }

      outcomes.push(outcome);
    }
  } catch (err) {
    // Full rollback on any failure
    rollback(editor, rollbacks);
    throw err;
  }

  const anyChanged = outcomes.some((o) => o.changed);

  // Step 7: Commit or rollback
  if (dryRun || !anyChanged) {
    // Dry-run or no changes: rollback all mutations (including ensurePart-created parts)
    rollback(editor, rollbacks);
  }

  let degraded = false;

  if (!dryRun && anyChanged) {
    // Step 8: Post-commit side effects
    try {
      degraded = runPostCommitSideEffects(editor, outcomes, operations, source);
    } catch (err) {
      // afterCommit failure: emit degraded event, run invalidation, then re-throw
      const degradedEvent = emitPartChanged(editor, outcomes, operations, source, true);
      applyPartInvalidation(editor, degradedEvent);
      throw err;
    }

    // Emit event, then run invalidation
    const event = emitPartChanged(editor, outcomes, operations, source, degraded);
    applyPartInvalidation(editor, event);
  }

  return {
    changed: anyChanged,
    degraded,
    parts: outcomes.map((o) => ({
      partId: o.partId,
      operation: o.operation,
      changed: o.changed,
      changedPaths: o.changedPaths,
    })),
  };
}

/**
 * Convenience wrapper for single-part mutations.
 * Delegates to `mutateParts` with a single-entry operations array.
 *
 * For mutate operations, captures the callback return value in `result`.
 */
export function mutatePart<TPart = unknown, TResult = unknown>(
  request: MutatePartRequest<TPart, TResult>,
): MutatePartResult<TResult>;
export function mutatePart(request: CreatePartRequest): MutatePartResult<undefined>;
export function mutatePart(request: DeletePartRequest): MutatePartResult<undefined>;
export function mutatePart(request: MutatePartRequest | CreatePartRequest | DeletePartRequest): MutatePartResult {
  // Capture the callback result via a closure wrapper
  let capturedResult: unknown;
  let wrappedOp: PartOperation;

  if (request.operation === 'mutate') {
    const mutateReq = request as MutatePartRequest;
    wrappedOp = {
      ...mutateReq,
      mutate(ctx: { part: unknown; dryRun: boolean }) {
        capturedResult = mutateReq.mutate(ctx);
        return capturedResult;
      },
    };
  } else {
    wrappedOp = request;
  }

  const multiResult = mutateParts({
    editor: request.editor,
    source: request.source,
    dryRun: request.dryRun,
    expectedRevision: request.expectedRevision,
    operations: [wrappedOp],
  });

  const partResult = multiResult.parts[0];

  return {
    changed: partResult?.changed ?? false,
    changedPaths: partResult?.changedPaths ?? [],
    degraded: multiResult.degraded,
    result: capturedResult,
  };
}
