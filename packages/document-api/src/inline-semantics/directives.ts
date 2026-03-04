/**
 * Directive state model and transition semantics for inline properties.
 *
 * Defines the canonical DirectState type, InlinePropertyState for full
 * read-side reporting, and the transition matrix helpers.
 */

import type { CorePropertyId } from './property-ids.js';

// ---------------------------------------------------------------------------
// State model
// ---------------------------------------------------------------------------

/** Tri-state directive representing a run's direct inline formatting state. */
export type DirectState = 'on' | 'off' | 'clear';

/** Where the effective value came from. */
export type Provenance = 'direct-on' | 'direct-off' | 'style-cascade' | 'unresolved';

/**
 * Full inline property state for a single property on a single run.
 * Computed internally; `provenance` is not surfaced in the public contract yet.
 */
export interface InlinePropertyState {
  direct: DirectState;
  effective: boolean;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Direct-to-effective derivation (conservative fallback)
// ---------------------------------------------------------------------------

/**
 * Derives effective and provenance from direct state without style-engine cascade.
 *
 * Used when converter context is unavailable (headless mode, unit tests, non-DOCX).
 * - `'on'`   → effective: true, provenance: 'direct-on'
 * - `'off'`  → effective: false, provenance: 'direct-off'
 * - `'clear'` → effective: false, provenance: 'unresolved'
 */
export function derivePropertyStateFromDirect(direct: DirectState): InlinePropertyState {
  switch (direct) {
    case 'on':
      return { direct, effective: true, provenance: 'direct-on' };
    case 'off':
      return { direct, effective: false, provenance: 'direct-off' };
    case 'clear':
      return { direct, effective: false, provenance: 'unresolved' };
  }
}

/**
 * Creates a full property state with style-engine-resolved effective value.
 *
 * Used when converter context is available and the style-engine cascade
 * has resolved the effective visual state.
 */
export function derivePropertyStateWithCascade(direct: DirectState, cascadeEffective: boolean): InlinePropertyState {
  switch (direct) {
    case 'on':
      return { direct, effective: true, provenance: 'direct-on' };
    case 'off':
      return { direct, effective: false, provenance: 'direct-off' };
    case 'clear':
      return { direct, effective: cascadeEffective, provenance: 'style-cascade' };
  }
}

// ---------------------------------------------------------------------------
// Transition matrix
// ---------------------------------------------------------------------------

/**
 * Determines the resulting direct state after applying a directive.
 *
 * The transition matrix is symmetric across all core-4 properties for the
 * tri-state directive model. The actual PM mark operations differ per property
 * (handled by the PM-binding layer), but the state transitions are uniform.
 *
 * | Current | Directive | Result |
 * |---------|-----------|--------|
 * | on      | on        | on (no-op) |
 * | on      | off       | off |
 * | on      | clear     | clear |
 * | off     | on        | on |
 * | off     | off       | off (no-op) |
 * | off     | clear     | clear |
 * | clear   | on        | on |
 * | clear   | off       | off |
 * | clear   | clear     | clear (no-op) |
 */
export function applyDirectiveTransition(current: DirectState, directive: DirectState): DirectState {
  return directive;
}

/**
 * Returns true if applying the directive to the current state would produce
 * an actual document change (not a no-op).
 */
export function wouldDirectiveChange(current: DirectState, directive: DirectState): boolean {
  return current !== directive;
}

// ---------------------------------------------------------------------------
// Effective resolution input contract (§4.1)
// ---------------------------------------------------------------------------

/** Paragraph context for effective resolution. */
export interface ResolutionParagraphContext {
  styleId?: string;
  properties: Record<string, unknown>;
}

/** Run context for effective resolution. */
export interface ResolutionRunContext {
  styleId?: string;
  directProperties: Record<string, unknown>;
}

/** Numbering context (null when run is not in a list). */
export interface ResolutionNumberingContext {
  numId: string;
  ilvl: number;
}

/** Table context (null when run is not in a table). */
export interface ResolutionTableContext {
  tableStyleId?: string;
  rowIndex: number;
  cellIndex: number;
  numRows: number;
  numCells: number;
}

/** Full resolution input for computing effective inline states. */
export interface EffectiveResolutionInput {
  paragraph: ResolutionParagraphContext;
  run: ResolutionRunContext;
  numbering: ResolutionNumberingContext | null;
  table: ResolutionTableContext | null;
  defaults: { docDefaults: Record<string, unknown>; theme?: Record<string, unknown> };
  revision: string;
}

/**
 * Resolver function signature for computing effective inline state.
 * Returns the effective boolean for a single property.
 */
export type EffectiveResolver = (property: CorePropertyId, input: EffectiveResolutionInput) => boolean;
