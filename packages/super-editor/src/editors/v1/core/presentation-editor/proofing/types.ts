/**
 * Core proofing platform types.
 *
 * These types define the provider contract, config surface, and internal data
 * structures for SuperDoc's provider-agnostic proofing platform.
 */

// =============================================================================
// Issue Kinds
// =============================================================================

/** The kind of proofing issue. v1 UI renders only 'spelling'; others are stored silently. */
export type ProofingIssueKind = 'spelling' | 'grammar' | 'style';

// =============================================================================
// Provider Contract
// =============================================================================

/**
 * A proofing provider is a pure data engine that checks text segments
 * and returns structured issues. It must not touch the DOM or assume
 * any particular editor surface.
 */
export type ProofingProvider = {
  /** Unique identifier for this provider instance. */
  id: string;
  /** Optional capability declaration. */
  getCapabilities?: () => Promise<ProofingCapabilities> | ProofingCapabilities;
  /** Check one or more text segments for proofing issues. */
  check: (request: ProofingCheckRequest) => Promise<ProofingCheckResult>;
  /** Optional cleanup when the provider is replaced or proofing is disabled. */
  dispose?: () => Promise<void> | void;
};

export type ProofingCapabilities = {
  issueKinds: ProofingIssueKind[];
  supportsSuggestions?: boolean;
  supportsMultipleLanguages?: boolean;
  supportsBatching?: boolean;
  requiresNetwork?: boolean;
};

// =============================================================================
// Request / Response
// =============================================================================

export type ProofingCheckRequest = {
  documentId?: string | null;
  defaultLanguage?: string | null;
  maxSuggestions?: number;
  segments: ProofingSegment[];
  signal?: AbortSignal;
};

export type ProofingSegment = {
  id: string;
  text: string;
  language?: string | null;
  metadata: ProofingSegmentMetadata;
};

export type ProofingSegmentMetadata = {
  blockId?: string;
  pageIndex?: number;
  surface: 'body' | 'header' | 'footer' | 'table-cell' | 'other';
};

export type ProofingCheckResult = {
  issues: ProofingIssue[];
};

export type ProofingIssue = {
  segmentId: string;
  /** Zero-based start offset into the segment text (UTF-16 code units). */
  start: number;
  /** Zero-based end offset into the segment text (UTF-16 code units, exclusive). */
  end: number;
  kind: ProofingIssueKind;
  message?: string;
  replacements?: string[];
  ruleId?: string;
  providerMeta?: Record<string, unknown>;
};

// =============================================================================
// Public Config
// =============================================================================

export type ProofingStatus = 'idle' | 'checking' | 'disabled' | 'degraded';

export type ProofingError = {
  kind: 'provider-error' | 'validation-error' | 'timeout';
  message: string;
  segmentIds?: string[];
  cause?: unknown;
};

export type ProofingConfig = {
  enabled?: boolean;
  provider?: ProofingProvider | null;
  defaultLanguage?: string | null;
  debounceMs?: number;
  maxSuggestions?: number;
  visibleFirst?: boolean;
  allowIgnoreWord?: boolean;
  ignoredWords?: string[];
  timeoutMs?: number;
  maxConcurrentRequests?: number;
  maxSegmentsPerBatch?: number;
  onProofingError?: (error: ProofingError) => void;
  onStatusChange?: (status: ProofingStatus) => void;
};

// =============================================================================
// Internal: Offset Mapping
// =============================================================================

/** A slice of text within a segment, mapped back to PM positions. */
export type OffsetSlice = {
  /** Start offset within the segment text string. */
  textStart: number;
  /** End offset within the segment text string. */
  textEnd: number;
  /** ProseMirror start position. */
  pmFrom: number;
  /** ProseMirror end position. */
  pmTo: number;
};

/** Maps segment text offsets to PM positions for a single segment. */
export type SegmentOffsetMap = {
  segmentId: string;
  slices: OffsetSlice[];
};

// =============================================================================
// Internal: Proofing Store
// =============================================================================

/** A stored issue with its resolved PM range, lifecycle state, and derived word. */
export type StoredIssue = ProofingIssue & {
  /** Resolved PM start position. */
  pmFrom: number;
  /** Resolved PM end position. */
  pmTo: number;
  /**
   * The actual misspelled word, derived from the segment text using
   * issue start/end offsets. Used for ignore/add-to-dictionary.
   * Not the same as `message`, which is provider-defined and may be
   * a human-readable explanation rather than the raw token.
   */
  word?: string;
  /** 'confirmed' = trusted provider result. 'mapped' = transformed through transaction, awaiting recheck. */
  state: 'confirmed' | 'mapped';
  /** Identifies which pending recheck cohort owns this mapped issue. null for confirmed issues. */
  recheckId: number | null;
};

// =============================================================================
// Internal: Paint Slices (non-overlapping render input)
// =============================================================================

/** A non-overlapping range to paint, with a reference to its primary issue. */
export type ProofingPaintSlice = {
  pmFrom: number;
  pmTo: number;
  kind: ProofingIssueKind;
  /** The primary issue for context-menu resolution. */
  issue: StoredIssue;
};

// =============================================================================
// Internal: DOM Decoration Pass
// =============================================================================

/**
 * Minimal proofing range input for the editor-owned DOM decoration pass.
 *
 * This is intentionally separate from `ProofingPaintSlice`: the DOM mutator
 * only needs positions plus the issue kind, not the backing issue payload.
 */
export type ProofingAnnotation = {
  pmFrom: number;
  pmTo: number;
  kind: ProofingIssueKind;
};

/**
 * CSS class names and data attributes used by proofing DOM decorations.
 */
export const PROOFING_CSS = {
  SPELLING: 'sd-proofing-spelling',
  GRAMMAR: 'sd-proofing-grammar',
  STYLE: 'sd-proofing-style',
  DATA_ATTR: 'data-sd-proofing',
  SPLIT_ATTR: 'data-sd-proofing-split',
} as const;

/** Map a proofing issue kind to its DOM decoration CSS class. */
export function cssClassForKind(kind: ProofingIssueKind): string {
  switch (kind) {
    case 'spelling':
      return PROOFING_CSS.SPELLING;
    case 'grammar':
      return PROOFING_CSS.GRAMMAR;
    case 'style':
      return PROOFING_CSS.STYLE;
  }
}
