/**
 * Structural input types for insert and replace operations.
 *
 * These define the "structural shape" side of the discriminated union.
 * Legacy string-based shapes are defined in their respective operation files.
 *
 * Discrimination rule: presence of `content` (SDFragment) vs `value`/`text` (string).
 */

import type { BlockNodeAddress } from './base.js';
import type { SelectionTarget } from './address.js';
import type { SDFragment } from './fragment.js';
import type { Placement, NestingPolicy } from './placement.js';

// ---------------------------------------------------------------------------
// Structural insert input
// ---------------------------------------------------------------------------

/** Structural shape for the insert operation. */
export interface SDInsertInput {
  /** Optional insertion target. When omitted, inserts at the end of the document. */
  target?: BlockNodeAddress;
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

/** Structural shape for the replace operation. */
export interface SDReplaceInput {
  /** Target to replace. BlockNodeAddress replaces the entire block; SelectionTarget replaces a contiguous selection. */
  target?: BlockNodeAddress | SelectionTarget;
  /** Opaque ref string (alternative to `target`). */
  ref?: string;
  /** Structural content to replace with. */
  content: SDFragment;
  /** Nesting policy. Defaults to { tables: 'forbid' }. */
  nestingPolicy?: NestingPolicy;
}
