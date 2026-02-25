/**
 * Types for the `query.match` operation — deterministic matching with
 * strict cardinality semantics for mutation targeting and agent planning.
 *
 * Canonical hierarchy: match → blocks → runs.
 * Every run includes explicit styles. Every level has a scoped ref.
 *
 * See plans/query-match-blocks-runs-plan.md for design decisions D1–D20.
 */

import type { BlockNodeType, NodeAddress } from './base.js';
import type { TextSelector, NodeSelector } from './query.js';
import type { DiscoveryItem, DiscoveryOutput } from './discovery.js';

export type CardinalityRequirement = 'any' | 'first' | 'exactlyOne' | 'all';

// ---------------------------------------------------------------------------
// Snippet context
// ---------------------------------------------------------------------------

/** Maximum total length for a match snippet (D11). */
export const SNIPPET_MAX_LENGTH = 500;

/** Maximum characters of surrounding context on each side of the match (D11). */
export const SNIPPET_CONTEXT_CHARS = 100;

/**
 * Character offsets within a snippet identifying the matched text.
 *
 * Invariants (D17):
 * - `start >= 0 && end <= snippet.length`
 * - `start < end` (zero-width matches are dropped before snippet assembly per D20)
 */
export interface HighlightRange {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Match styles (D1, D15)
// ---------------------------------------------------------------------------

/**
 * Inline style state for a single run.
 *
 * Core-4 booleans are always present. Optional presentational fields are
 * emitted only when the source document provides them (omit-not-undefined).
 * See D15 for normalization rules.
 */
export interface MatchStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** 6-digit lowercase hex with `#` prefix (e.g., `#ff0000`). */
  color?: string;
  /** 6-digit lowercase hex with `#` prefix. */
  highlight?: string;
  /** Raw font family string from the document (e.g., `"Calibri"`). */
  fontFamily?: string;
  /** Font size in points, rounded to 1 decimal place. */
  fontSizePt?: number;
}

// ---------------------------------------------------------------------------
// Run (D1, D4, D10a)
// ---------------------------------------------------------------------------

/**
 * A contiguous span of text within a block sharing identical mark-signature.
 *
 * Invariant (D4 — run-tiling): within a block, runs exactly tile the block's
 * matched range with no gaps and no overlaps.
 */
export interface MatchRun {
  /** Block-relative character offsets. */
  range: { start: number; end: number };
  /** The text content of this run. */
  text: string;
  /**
   * OOXML character style definition ID (`w:rStyle` `w:val`) — the key into
   * `styles.xml`. Omitted when no character style is applied (D10a).
   */
  styleId?: string;
  /** Resolved inline style state for this run. */
  styles: MatchStyle;
  /** Run-scoped ephemeral ref (V3, scope: 'run'). */
  ref: string;
}

// ---------------------------------------------------------------------------
// Block (D1, D5, D10)
// ---------------------------------------------------------------------------

/**
 * A single block's participation in a logical match.
 * Contains the block-scoped text and its decomposition into style runs.
 */
export interface MatchBlock {
  /** The PM node's stable block ID. */
  blockId: string;
  /** The PM node type name (e.g., 'paragraph', 'heading', 'listItem'). */
  nodeType: BlockNodeType | string;
  /** Block-relative character offsets of the match within this block. */
  range: { start: number; end: number };
  /** The matched text within this block. */
  text: string;
  /**
   * Paragraph-level style metadata (D10).
   * `styleId` is the OOXML paragraph style definition ID (`w:pStyle` `w:val`).
   * Omitted when no paragraph style metadata is available.
   */
  paragraphStyle?: {
    styleId?: string;
    isListItem?: boolean;
    listLevel?: number;
  };
  /** Block-scoped ephemeral ref (V3, scope: 'block'). */
  ref: string;
  /**
   * Style runs within the matched range, in offset order (D16).
   * Runs exactly tile `range` (D4 invariant).
   */
  runs: MatchRun[];
}

// ---------------------------------------------------------------------------
// Match domain types — discovery-standardized (C1)
// ---------------------------------------------------------------------------

/**
 * Domain fields for a text-selector match.
 *
 * Always has blocks, snippet, highlightRange (D18).
 * `blocks` is a non-empty tuple: a text match always covers at least one block.
 */
export interface TextMatchDomain {
  /** Discriminator — always `'text'` for text-selector matches. */
  matchKind: 'text';
  /** Address of the first matched block in document order (D14). */
  address: NodeAddress;
  /** Matched text plus surrounding context (D11). */
  snippet: string;
  /** Character offsets within `snippet` identifying the matched text (D17). */
  highlightRange: HighlightRange;
  /** Block decomposition of the match, in document order (D16). */
  blocks: [MatchBlock, ...MatchBlock[]];
}

/**
 * Domain fields for a node-selector match.
 *
 * No blocks, no snippet (D13, D18).
 * Block-level nodes use a stable nodeId ref. Inline nodes use an ephemeral
 * V3 ref (anchor offsets are position-dependent).
 */
export interface NodeMatchDomain {
  /** Discriminator — always `'node'` for node-selector matches. */
  matchKind: 'node';
  /** Address of the first matched block in document order (D14). */
  address: NodeAddress;
  /** Always empty for node matches. Discriminator: `blocks.length === 0`. */
  blocks: [];
}

/** Discriminated union of match domain types. Use `matchKind` as the canonical discriminator (`'text'` or `'node'`). */
export type QueryMatchDomain = TextMatchDomain | NodeMatchDomain;

/** A single match item in the discovery envelope. */
export type QueryMatchItem = DiscoveryItem<QueryMatchDomain>;

/** Text match item (blocks.length > 0). */
export type TextMatchItem = DiscoveryItem<TextMatchDomain>;

/** Node match item (blocks.length === 0). */
export type NodeMatchItem = DiscoveryItem<NodeMatchDomain>;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface QueryMatchInput {
  select: TextSelector | NodeSelector;
  within?: NodeAddress;
  require?: CardinalityRequirement;
  /** Match evaluation mode. `'candidates'` (default) returns best-effort matches; `'strict'` enforces exact semantics (future). */
  mode?: 'strict' | 'candidates';
  includeNodes?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Standardized discovery output for `query.match`.
 *
 * Items are `DiscoveryItem<TextMatchDomain | NodeMatchDomain>`:
 * - `id`: deterministic identity, revision-scoped (format: `m:<index>`, D7)
 * - `handle`: mutation-ready `ResolvedHandle` with `ref`, `refStability`, `targetKind`
 * - Plus domain fields (`address`, `blocks`, `snippet`, `highlightRange`)
 */
export type QueryMatchOutput = DiscoveryOutput<QueryMatchDomain>;
