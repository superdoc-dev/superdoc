/**
 * Types for the `ranges.resolve` operation — deterministic range construction
 * from explicit document anchors.
 *
 * This is a read-only composition layer that resolves two anchor endpoints
 * into a contiguous `SelectionTarget` + mutation-ready `ref`.
 */

import type { SelectionTarget, SelectionPoint } from '../types/address.js';
import type { BlockNodeType } from '../types/base.js';

// ---------------------------------------------------------------------------
// Anchor types
// ---------------------------------------------------------------------------

/** Anchor at the absolute start or end of the document body. */
export type DocumentEdgeAnchor = {
  kind: 'document';
  edge: 'start' | 'end';
};

/** Anchor at an explicit selection point (text offset or node boundary). */
export type PointAnchor = {
  kind: 'point';
  point: SelectionPoint;
};

/** Anchor derived from an existing ref's start or end boundary. */
export type RefBoundaryAnchor = {
  kind: 'ref';
  ref: string;
  boundary: 'start' | 'end';
};

/**
 * A range endpoint — one of three deterministic anchor forms.
 *
 * - `document`: absolute document boundary (start/end of body)
 * - `point`: explicit `SelectionPoint` (text offset or node edge)
 * - `ref`: boundary of an existing ref from `query.match` or `ranges.resolve`
 */
export type RangeAnchor = DocumentEdgeAnchor | PointAnchor | RefBoundaryAnchor;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface ResolveRangeInput {
  /** Start endpoint of the range. */
  start: RangeAnchor;
  /** End endpoint of the range. */
  end: RangeAnchor;
  /** Optional expected revision for consistency checking. */
  expectedRevision?: string;
}

/** Per-block preview metadata within the resolved range. */
export interface RangeBlockPreview {
  nodeId: string;
  nodeType: BlockNodeType;
  textPreview: string;
}

/** Preview metadata for the resolved range. */
export interface RangePreview {
  /** Concatenated text content across the range (truncated if large). */
  text: string;
  /** Whether the text was truncated. */
  truncated: boolean;
  /** Per-block preview entries in document order. */
  blocks: RangeBlockPreview[];
}

export interface ResolveRangeOutput {
  /** The document revision at which the range was evaluated. */
  evaluatedRevision: string;
  /** Mutation-ready handle for the resolved range. */
  handle: {
    /**
     * Text ref encoding the resolved range, usable as a target for mutations
     * (delete, replace, format).
     *
     * `null` when the range covers only structural blocks with no text content
     * (e.g. an image-only document). Check `coversFullTarget` and this field
     * before passing to mutation operations.
     */
    ref: string | null;
    refStability: 'ephemeral';
    /**
     * Whether the ref faithfully covers the exact same range as the target.
     *
     * `true` — the ref encodes the full range; using it for delete/replace/format
     * produces the same result as operating directly on the target.
     *
     * `false` — the range spans structural block boundaries (e.g. table, image)
     * that the text-based ref format cannot capture. The ref covers only the text
     * content within the range, or is `null` if no text content exists.
     */
    coversFullTarget: boolean;
  };
  /** Transparent selection target for inspection, logging, and debugging. */
  target: SelectionTarget;
  /** Preview metadata describing the content within the range. */
  preview: RangePreview;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter that the super-editor implements for `ranges.resolve`.
 *
 * The document-api layer handles validation; the adapter performs the
 * actual ProseMirror-level resolution and ref encoding.
 */
export interface RangeResolverAdapter {
  resolve(input: ResolveRangeInput): ResolveRangeOutput;
}
