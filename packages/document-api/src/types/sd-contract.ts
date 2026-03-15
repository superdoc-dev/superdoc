/**
 * SDM/1 contract types — mutation receipts, error model, and diagnostics.
 */

import type { SelectionTarget } from './address.js';
import type { SDAddress } from './sd-envelope.js';

// ---------------------------------------------------------------------------
// Error model (normative)
// ---------------------------------------------------------------------------

export type SDErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'ADDRESS_STALE'
  | 'REVISION_MISMATCH'
  | 'INVALID_CONTEXT'
  | 'INVALID_NESTING'
  | 'INVALID_PLACEMENT'
  | 'DUPLICATE_ID'
  | 'CAPABILITY_UNSUPPORTED'
  | 'RAW_MODE_REQUIRED'
  | 'PRESERVE_ONLY_VIOLATION'
  | 'NO_OP'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INTERNAL_ERROR';

export interface SDError {
  code: SDErrorCode;
  message: string;
  path?: Array<string | number>;
  address?: SDAddress;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mutation receipt
// ---------------------------------------------------------------------------

export interface SDMutationReceipt {
  success: boolean;
  failure?: SDError;
  evaluatedRevision?: { before: string; after: string };
  resolution?: {
    requestedTarget?: SDAddress;
    target: SDAddress;
    /** Full selection target for cross-block mutations. */
    selectionTarget?: SelectionTarget;
  };
}

// ---------------------------------------------------------------------------
// Diagnostic (for markdown conversion and similar)
// ---------------------------------------------------------------------------

export interface SDDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: Array<string | number>;
}

// ---------------------------------------------------------------------------
// Markdown conversion result
// ---------------------------------------------------------------------------

export interface SDMarkdownToFragmentResult {
  fragment: import('./fragment.js').SDFragment;
  lossy: boolean;
  diagnostics: SDDiagnostic[];
}
