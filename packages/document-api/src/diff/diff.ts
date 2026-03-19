/**
 * Diff namespace — engine-agnostic public API and adapter contract.
 *
 * Validates wrapper-level shape, then delegates to the engine adapter.
 * Deep payload validation lives in the engine adapter / shared diff service.
 */

import { DocumentApiValidationError } from '../errors.js';
import type {
  DiffSnapshot,
  DiffPayload,
  DiffApplyResult,
  DiffCompareInput,
  DiffApplyInput,
  DiffApplyOptions,
} from './diff.types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_VERSIONS = new Set(['sd-diff-snapshot/v1', 'sd-diff-snapshot/v2']);
const PAYLOAD_VERSIONS = new Set(['sd-diff-payload/v1', 'sd-diff-payload/v2']);

// ---------------------------------------------------------------------------
// Adapter interface — implemented by each engine
// ---------------------------------------------------------------------------

export interface DiffAdapter {
  capture(): DiffSnapshot;
  compare(input: DiffCompareInput): DiffPayload;
  apply(input: DiffApplyInput, options?: DiffApplyOptions): DiffApplyResult;
}

// ---------------------------------------------------------------------------
// Public API shape on DocumentApi
// ---------------------------------------------------------------------------

export interface DiffApi {
  capture(): DiffSnapshot;
  compare(input: DiffCompareInput): DiffPayload;
  apply(input: DiffApplyInput, options?: DiffApplyOptions): DiffApplyResult;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSnapshotWrapper(snapshot: unknown): asserts snapshot is DiffSnapshot {
  if (!isRecord(snapshot)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'targetSnapshot must be a DiffSnapshot object.');
  }
  if (!SNAPSHOT_VERSIONS.has(String(snapshot.version))) {
    throw new DocumentApiValidationError(
      'CAPABILITY_UNSUPPORTED',
      `Unsupported snapshot version "${String(snapshot.version)}". Expected one of "${[...SNAPSHOT_VERSIONS].join('", "')}".`,
    );
  }
  if (typeof snapshot.engine !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'targetSnapshot.engine must be a string.');
  }
  if (typeof snapshot.fingerprint !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'targetSnapshot.fingerprint must be a string.');
  }
  if (!isRecord(snapshot.coverage)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'targetSnapshot.coverage must be an object.');
  }
  if (!isRecord(snapshot.payload)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'targetSnapshot.payload must be an object.');
  }
}

function validateDiffPayloadWrapper(diff: unknown): asserts diff is DiffPayload {
  if (!isRecord(diff)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff must be a DiffPayload object.');
  }
  if (!PAYLOAD_VERSIONS.has(String(diff.version))) {
    throw new DocumentApiValidationError(
      'CAPABILITY_UNSUPPORTED',
      `Unsupported diff version "${String(diff.version)}". Expected one of "${[...PAYLOAD_VERSIONS].join('", "')}".`,
    );
  }
  if (typeof diff.engine !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.engine must be a string.');
  }
  if (typeof diff.baseFingerprint !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.baseFingerprint must be a string.');
  }
  if (typeof diff.targetFingerprint !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.targetFingerprint must be a string.');
  }
  if (!isRecord(diff.coverage)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.coverage must be an object.');
  }
  if (!isRecord(diff.summary)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.summary must be an object.');
  }
  if (!isRecord(diff.payload)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'diff.payload must be an object.');
  }
}

// ---------------------------------------------------------------------------
// Execute functions — bridge public API to adapter
// ---------------------------------------------------------------------------

export function executeDiffCapture(adapter: DiffAdapter): DiffSnapshot {
  return adapter.capture();
}

export function executeDiffCompare(adapter: DiffAdapter, input: DiffCompareInput): DiffPayload {
  validateSnapshotWrapper(input?.targetSnapshot);
  return adapter.compare(input);
}

export function executeDiffApply(
  adapter: DiffAdapter,
  input: DiffApplyInput,
  options?: DiffApplyOptions,
): DiffApplyResult {
  validateDiffPayloadWrapper(input?.diff);
  return adapter.apply(input, options);
}
