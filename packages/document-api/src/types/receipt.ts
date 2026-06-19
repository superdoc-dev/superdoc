import type {
  BlockNavigationAddress,
  EntityAddress,
  SelectionTarget,
  TextAddress,
  TrackedChangeAddress,
} from './address.js';
import type { BookmarkAddress } from '../bookmarks/bookmarks.types.js';
import type { StoryLocator } from './story.types.js';
export type ReceiptInsert = TrackedChangeAddress;
export type ReceiptEntity = EntityAddress;
export type AffectedRef = TextAddress | BookmarkAddress | EntityAddress | BlockNavigationAddress;
export type AffectedRefRemapping = {
  from: AffectedRef;
  to: AffectedRef;
};
export type ReceiptFailureCode =
  | 'NO_OP'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'CAPABILITY_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'STALE_REVISION'
  | 'REVISION_MISMATCH'
  | 'MATCH_NOT_FOUND'
  | 'AMBIGUOUS_MATCH'
  | 'STYLE_CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'COMMENT_CASCADE_PARTIAL'
  | 'INVALID_INPUT'
  | 'CROSS_BLOCK_MATCH'
  | 'SPAN_FRAGMENTED'
  | 'TARGET_MOVED'
  | 'PLAN_CONFLICT_OVERLAP'
  | 'INVALID_STEP_COMBINATION'
  | 'REVISION_CHANGED_SINCE_COMPILE'
  | 'INVALID_INSERTION_CONTEXT'
  | 'DOCUMENT_IDENTITY_CONFLICT'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INTERNAL_ERROR'
  | 'PAGE_NUMBERS_NOT_MATERIALIZED'
  // Lists-specific failure codes (SD-1272)
  | 'INCOMPATIBLE_DEFINITIONS'
  | 'NO_COMPATIBLE_PREVIOUS'
  | 'ALREADY_CONTINUOUS'
  | 'NO_PREVIOUS_LIST'
  | 'NO_ADJACENT_SEQUENCE'
  | 'ALREADY_SAME_SEQUENCE'
  | 'LEVEL_OUT_OF_RANGE'
  // SD-1973 formatting failure codes
  | 'LEVEL_NOT_FOUND'
  // Structural content failure codes
  | 'INVALID_NESTING'
  | 'INVALID_PLACEMENT'
  | 'EMPTY_FRAGMENT'
  | 'INVALID_FRAGMENT'
  // SDM/1 structural failure codes
  | 'INVALID_PAYLOAD'
  | 'CAPABILITY_UNSUPPORTED'
  | 'ADDRESS_STALE'
  | 'DUPLICATE_ID'
  | 'INVALID_CONTEXT'
  | 'RAW_MODE_REQUIRED'
  | 'PRESERVE_ONLY_VIOLATION'
  // SD-2070 content controls failure codes
  | 'LOCK_VIOLATION'
  | 'TYPE_MISMATCH'
  // SD-3247 templates.apply receipt failure codes
  | 'UNSUPPORTED_SOURCE'
  | 'INVALID_PACKAGE'
  | 'UNSUPPORTED_TEMPLATE_CONTENT';
export type ReceiptFailure = {
  code: ReceiptFailureCode;
  message: string;
  details?: unknown;
};
// ---------------------------------------------------------------------------
// Review warnings
//
// AIDEV-NOTE: `ReviewWarning` is the single shared warning carrier
// for the v2 review features (comments and tracked changes). The shared
// foundation requires one carrier so comments export and
// tracked-change export / degradation policy do not invent
// parallel surfaces. Spec language `warning` maps to `severity: 'warning'`
// here.
//
// Use this lane only for allowed non-exact mappings and non-load-bearing
// degradations the spec permits, for example:
//   - non-exact but allowed export mapping
//   - source had malformed optional sidecar data that was ignored while
//     preserving core data
//   - generated fixture uses direct OOXML rather than Word-authored provenance
//   - Word cannot visually represent a richer v2 headless structural intent
//     exactly
//
// Forbidden semantic loss (e.g. dropping a persisted comment, losing thread
// topology, deleting an anchor that the cross-feature rules say must survive)
// MUST fail closed via `Receipt.failure`. Do NOT emit a warning for those
// cases.
//
// The review foundation decides the carrier shape; the first call site that emits
// real warnings is comment export non-exact mappings.
// Adapters / kernel paths that want to surface a kernel-side
// `SDDiagnosticRecord` to this lane MUST do so by projecting through this
// public type so the lane carrier remains stable across features.
// ---------------------------------------------------------------------------
export type ReviewWarningFeature = 'comments' | 'trackedChanges';
export type ReviewWarning = {
  /** Stable warning code (e.g. `comments-export-non-exact`). */
  code: string;
  /** Human-readable message for diagnostics and consumer logs. */
  message: string;
  /** Which review feature produced this warning. */
  feature: ReviewWarningFeature;
  /** Severity locked to `warning` so this lane never carries failures or info noise. */
  severity: 'warning';
  /** Public id of the affected review object, when known. */
  affectedObjectId?: string;
  /** Package part URI the warning concerns, when known. */
  affectedPartUri?: string;
  /**
   * Whether export / save can proceed despite the warning. `true` means
   * the receipt still represents a successful operation; `false` means the
   * caller should treat this as a soft block (the kernel surfaced the
   * warning before raising `Receipt.failure`).
   */
  canProceed: boolean;
};
/**
 * A per-story descriptor of how visible text was shifted by an
 * operation. Callers maintain their own held-ref state by applying these
 * deltas:
 *
 * - Any caller-held text address whose `range.start` is `>= atChar` in the
 *   same `story` gets `range.start += delta` (and similarly `range.end`).
 * - Any caller-held text address whose range straddles `atChar` is
 *   *invalidated* — the kernel already lists those in `invalidatedRefs`.
 *
 * Negative `delta` describes a deletion. Positive `delta` describes an
 * insertion (e.g. when a `<w:del>` is rejected and its content is restored
 * to the visible flow).
 *
 * One entry per story. Cross-story shifts are reported as separate entries.
 */
export interface TextRangeShift {
  /** The story whose text was shifted. */
  story: StoryLocator;
  /** Character offset in the story's flattened text where the shift begins. */
  atChar: number;
  /** Net change in characters. Negative for deletions, positive for insertions. */
  delta: number;
}
export type ReceiptSuccess = {
  success: true;
  /**
   * Convenience id for operations that create exactly one primary durable entity.
   * Generic consumers should prefer `inserted`; this field exists for simple
   * create-and-follow-up flows such as `comments.create` → `comments.patch`.
   */
  id?: string;
  /** Entities created by the operation and safe for callers to hold. */
  inserted?: ReceiptEntity[];
  /** Entities whose content or metadata changed but whose identity survived. */
  updated?: ReceiptEntity[];
  /** Entities removed by the operation. */
  removed?: ReceiptEntity[];
  /** Caller-held refs that no longer resolve after the operation. */
  invalidatedRefs?: AffectedRef[];
  /** Caller-held refs whose identity survived at a different address. */
  remappedRefs?: AffectedRefRemapping[];
  /** Stories whose content revision changed because of the operation. */
  affectedStories?: StoryLocator[];
  /**
   * Text-range shifts produced by the operation. Optional.
   * Undefined for ops that don't change visible text (most comment ops).
   * Populated by tracked-change accept/reject operations that delete or
   * restore visible content. See {@link TextRangeShift}.
   */
  textRangeShifts?: TextRangeShift[];
  /**
   * Transaction id of the successful commit. Optional and
   * additive — engines that lack a per-tx identity omit it. v2 populates
   * this for every successful mutation so callers can wire the receipt to
   * their own history bookkeeping (undo / redo correlation, audit logs).
   */
  txId?: string;
  /**
   * Review foundation: allowed non-exact mappings or
   * non-load-bearing degradations the spec permits. See {@link ReviewWarning}.
   * Forbidden semantic loss MUST surface as `Receipt.failure`, not here.
   * The first real emitter is comment export.
   */
  warnings?: ReviewWarning[];
};
export type ReceiptFailureResult = {
  success: false;
  failure: ReceiptFailure;
};
export type Receipt = ReceiptSuccess | ReceiptFailureResult;
export type TextMutationRange = {
  from: number;
  to: number;
};
export type TextMutationResolution = {
  /**
   * Requested input target from the caller, when provided.
   * For insert-without-target calls this is omitted.
   */
  requestedTarget?: TextAddress;
  /**
   * Effective target used by the adapter after canonical resolution.
   * For cross-block selections this reflects the first block only -
   * use {@link selectionTarget} for the full resolved range.
   */
  target: TextAddress;
  /**
   * Engine-resolved absolute document range for the effective target.
   */
  range: TextMutationRange;
  /**
   * Snapshot of text currently covered by the resolved range.
   * Empty for collapsed insert targets.
   */
  text: string;
  /**
   * Full selection target for cross-block mutations.
   * Present when the resolved range spans more than one block.
   * Single-block mutations omit this field.
   */
  selectionTarget?: SelectionTarget;
};
export type TextMutationReceipt =
  | (ReceiptSuccess & { resolution: TextMutationResolution })
  | (ReceiptFailureResult & { resolution: TextMutationResolution });
