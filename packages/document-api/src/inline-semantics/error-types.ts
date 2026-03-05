/**
 * Typed error/diagnostic records for inline formatting.
 *
 * Three frozen schemas:
 * - `INVALID_INLINE_TOKEN` — shared (runtime: thrown; import: collected as diagnostic)
 * - `STYLE_RESOLUTION_FAILED` — runtime-only (thrown)
 * - `INVALID_TARGET` — runtime-only (thrown)
 */

import type { CorePropertyId, CoreTogglePropertyId } from './property-ids.js';

// ---------------------------------------------------------------------------
// INVALID_INLINE_TOKEN — discriminated union by `property`
// ---------------------------------------------------------------------------

interface InvalidInlineTokenBase {
  code: 'INVALID_INLINE_TOKEN';
  /** The invalid value (`null` if attribute absent where value is required). */
  token: string | null;
  /** Attribute-level OOXML xpath (e.g., `.../w:u/@w:themeTint`). */
  xpath: string;
  /** Optional human-readable context. */
  context?: string;
}

/** Toggle property variant (bold/italic/strike) — only `w:val` can fail. */
export interface InvalidInlineTokenToggle extends InvalidInlineTokenBase {
  property: CoreTogglePropertyId;
  attribute: 'val';
}

/** Underline variant — `w:val` plus rich attrs can each fail independently. */
export interface InvalidInlineTokenUnderline extends InvalidInlineTokenBase {
  property: 'underline';
  attribute: 'val' | 'color' | 'themeColor' | 'themeTint' | 'themeShade';
}

/**
 * Discriminated union for invalid inline token errors/diagnostics.
 * Dual use: thrown at runtime, collected as diagnostic during import.
 */
export type InvalidInlineTokenError = InvalidInlineTokenToggle | InvalidInlineTokenUnderline;

/**
 * Type alias for import-site readability.
 * `InlineTokenDiagnostic` IS `InvalidInlineTokenError` — one type, one schema, zero drift.
 */
export type InlineTokenDiagnostic = InvalidInlineTokenError;

// ---------------------------------------------------------------------------
// STYLE_RESOLUTION_FAILED — runtime-only
// ---------------------------------------------------------------------------

/** Required resolution input fields (§4.1 applicability matrix). */
export const REQUIRED_RESOLUTION_FIELDS = ['defaults', 'paragraph', 'run', 'revision'] as const;
export type RequiredResolutionField = (typeof REQUIRED_RESOLUTION_FIELDS)[number];

export interface StyleResolutionFailedError {
  code: 'STYLE_RESOLUTION_FAILED';
  property: CorePropertyId;
  field: RequiredResolutionField;
  /** PM document position of the failing run. */
  runPosition: number;
  /** Block reference identifier for debugging. */
  blockRef: string;
  /** Optional human-readable context. */
  context?: string;
}

// ---------------------------------------------------------------------------
// INVALID_TARGET — discriminated union by `reason`
// ---------------------------------------------------------------------------

interface InvalidTargetBase {
  code: 'INVALID_TARGET';
  /** Optional human-readable context. */
  context?: string;
}

export interface InvalidTargetOutOfRange extends InvalidTargetBase {
  reason: 'out_of_range';
  target: { from: number; to: number };
}

export interface InvalidTargetInvalidSelector extends InvalidTargetBase {
  reason: 'invalid_selector';
  target: { selector: string };
}

/**
 * Discriminated union for invalid mutation target errors.
 * Collapsed ranges (from === to) are NOT an error — they are a silent no-op.
 */
export type InvalidTargetError = InvalidTargetOutOfRange | InvalidTargetInvalidSelector;
