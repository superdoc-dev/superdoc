/**
 * Structural input types for insert and replace operations.
 *
 * These define the "structural shape" side of the discriminated union.
 * Legacy string-based shapes are defined in their respective operation files.
 *
 * Discrimination rule: presence of `content` (SDFragment) vs `value`/`text` (string).
 */

import type { SDAddress } from './sd-envelope.js';
import type { TextAddress } from './address.js';
import type { SDFragment } from './fragment.js';
import type { Placement, NestingPolicy } from './placement.js';

// ---------------------------------------------------------------------------
// Structural insert input
// ---------------------------------------------------------------------------

/** SDM/1 structural shape for the insert operation. */
export interface SDInsertInput {
  /** Optional insertion target. When omitted, inserts at the end of the document. */
  target?: SDAddress | TextAddress;
  /** Structural content to insert. */
  content: SDFragment;
  /** Where to place content relative to the target. Defaults to 'after'. */
  placement?: Placement;
  /** Nesting policy. Defaults to { tables: 'forbid' }. */
  nestingPolicy?: NestingPolicy;
}

// ---------------------------------------------------------------------------
// Structural replace input
// ---------------------------------------------------------------------------

/** SDM/1 structural shape for the replace operation. */
export interface SDReplaceInput {
  /** Required target range to replace. */
  target: SDAddress | TextAddress;
  /** Structural content to replace with. */
  content: SDFragment;
  /** Nesting policy. Defaults to { tables: 'forbid' }. */
  nestingPolicy?: NestingPolicy;
}

// ---------------------------------------------------------------------------
// Legacy aliases (temporary — removed in Phase 12)
// ---------------------------------------------------------------------------

/** @deprecated Use SDInsertInput. Temporary alias for migration. */
export type StructuralInsertInput = SDInsertInput;

/** @deprecated Use SDReplaceInput. Temporary alias for migration. */
export type StructuralReplaceInput = SDReplaceInput;
