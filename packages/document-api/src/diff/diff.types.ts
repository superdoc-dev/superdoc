/**
 * Public types for the snapshot-based document diff contract.
 *
 * These types are engine-agnostic wrappers around opaque engine payloads.
 * The `payload` field in both DiffSnapshot and DiffPayload is engine-owned
 * and must not be inspected by consumers.
 */

// ---------------------------------------------------------------------------
// Engine identification
// ---------------------------------------------------------------------------

/** Identifier for the engine adapter that produced the opaque payload. */
export type DiffEngineId = 'super-editor';

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** Declares which document components are included in a snapshot or diff. */
export interface DiffCoverage {
  body: true;
  comments: boolean;
  styles: boolean;
  numbering: boolean;
  headerFooters: false;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** Versioned, fingerprinted snapshot of a document's diffable state. */
export interface DiffSnapshot {
  version: 'sd-diff-snapshot/v1';
  engine: DiffEngineId;
  fingerprint: string;
  coverage: DiffCoverage;
  /** Opaque engine-owned snapshot data. Do not inspect or modify. */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Diff result types
// ---------------------------------------------------------------------------

/** Coarse change summary for a diff payload. */
export interface DiffSummary {
  hasChanges: boolean;
  changedComponents: Array<'body' | 'comments' | 'styles' | 'numbering'>;
  body: { hasChanges: boolean };
  comments: { hasChanges: boolean };
  styles: { hasChanges: boolean };
  numbering: { hasChanges: boolean };
}

/** Versioned diff payload describing changes from a base to a target document. */
export interface DiffPayload {
  version: 'sd-diff-payload/v1';
  engine: DiffEngineId;
  baseFingerprint: string;
  targetFingerprint: string;
  coverage: DiffCoverage;
  summary: DiffSummary;
  /** Opaque engine-owned diff data. Do not inspect or modify. */
  payload: Record<string, unknown>;
}

/** Result metadata returned after applying a diff. */
export interface DiffApplyResult {
  appliedOperations: number;
  baseFingerprint: string;
  targetFingerprint: string;
  coverage: DiffCoverage;
  summary: DiffSummary;
  diagnostics: string[];
}

// ---------------------------------------------------------------------------
// Operation inputs
// ---------------------------------------------------------------------------

/** Input for `diff.compare`. */
export interface DiffCompareInput {
  targetSnapshot: DiffSnapshot;
}

/** Input for `diff.apply`. */
export interface DiffApplyInput {
  diff: DiffPayload;
}

// ---------------------------------------------------------------------------
// Change mode (re-exported for convenience)
// ---------------------------------------------------------------------------

/** How body content changes are applied. */
export type DiffChangeMode = 'direct' | 'tracked';

/** Options for `diff.apply`. */
export interface DiffApplyOptions {
  changeMode?: DiffChangeMode;
}
