/**
 * Local type declarations for the metadata.* citation flow.
 *
 * `editor.doc.metadata.*` exists at runtime (SD-3104) but the
 * published SuperDocEditorLike `doc?` stub hasn't caught up yet, so
 * the demo declares the slice it uses here.
 */

export type SelectionPoint =
  | { kind: 'text'; blockId: string; offset: number }
  | { kind: 'nodeEdge'; node: { kind: 'block'; nodeType: string; nodeId: string }; edge: 'before' | 'after' };

export type SelectionTarget = {
  kind: 'selection';
  start: SelectionPoint;
  end: SelectionPoint;
};

export type TextSegment = { blockId: string; range: { start: number; end: number } };
export type TextTarget = { kind: 'text'; segments: TextSegment[] };

/**
 * Per-citation payload. JSON-serializable so it survives DOCX round-trips.
 *
 * The SDT `w:tag` is the document anchor key SuperDoc owns. Citation
 * identity is the customer's foreign key inside the payload:
 *
 * - `citationId`: stable id from the customer's citation database.
 * - `sourceId`: stable id of the cited source (the customer's record
 *   key, not a URL — URLs can change).
 * - `sourceType`: shape the cited record takes in the customer's domain.
 *   Drives rendering choices (KeyCite signal for cases, etc.) without
 *   forcing the customer to teach SuperDoc about every doc type.
 * - `provider`: which system stores the source (e.g. `'lexisnexis'`,
 *   `'westlaw'`, `'customer-dms'`). Opaque to SuperDoc; consumer apps
 *   route `deepLink` resolution and verification by it.
 * - `displayText`: fallback label shown when the customer hasn't
 *   resolved `sourceId` to a live record. Display only, not identity.
 * - `locator`: optional pinpoint (page, section, paragraph).
 * - `excerpt`: quoted supporting passage from the source. Shown in the
 *   hover popover so the lawyer can verify without leaving the doc.
 * - `deepLink`: optional URL the customer's app resolves to the
 *   source's primary view.
 * - `confidence`: optional AI-generated confidence score 0..1. Render
 *   only when present — not every provider emits it.
 * - `createdAt`: optional ISO-8601 timestamp of when the citation was
 *   attached.
 *
 * Deliberately omitted from v1: `verificationStatus` and
 * `sourceVersionId`. Both are render-time concerns — KeyCite / Shepard
 * signals change over time, so persisting them in the DOCX payload
 * would go stale. The consumer's app should compute verification
 * status at render time from `sourceId` + `provider`.
 */
export type CitationPayload = {
  citationId: string;
  sourceId: string;
  sourceType: 'case' | 'statute' | 'contract' | 'memo' | 'precedent';
  provider: string;
  displayText: string;
  locator?: string;
  excerpt: string;
  deepLink?: string;
  confidence?: number;
  createdAt?: string;
};

export type CitationInfo = {
  id: string;
  namespace: string;
  partName: string;
  payload: CitationPayload;
};

export type MetadataAttachResult =
  | { success: true; id: string; namespace: string; partName: string }
  | { success: false; failure: { code: string; message: string } };

export type MetadataMutationResult =
  | { success: true; id: string }
  | { success: false; failure: { code: string; message: string } };

/** The metadata.* slice this demo reaches into via `editor.doc.metadata`. */
export type MetadataDocApi = {
  attach(input: {
    target: SelectionTarget;
    namespace: string;
    payload: unknown;
    id?: string;
  }): MetadataAttachResult;
  list(input?: { namespace?: string; within?: SelectionTarget }): {
    items: Array<{ id: string; namespace: string; partName: string }>;
    total: number;
  };
  get(input: { id: string }): { id: string; namespace: string; partName: string; payload: unknown } | null;
  update(input: { id: string; payload: unknown }): MetadataMutationResult;
  remove(input: { id: string }): MetadataMutationResult;
  resolve(input: { id: string }): { id: string; target: SelectionTarget } | null;
};

export const CITATIONS_NAMESPACE = 'urn:superdoc:demo:citations:1';

export function isCitationPayload(payload: unknown): payload is CitationPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.citationId === 'string' &&
    typeof p.sourceId === 'string' &&
    typeof p.sourceType === 'string' &&
    typeof p.provider === 'string' &&
    typeof p.displayText === 'string' &&
    typeof p.excerpt === 'string'
  );
}

/**
 * Convert the SelectionInfo TextTarget (from `ui.state.selection.target`)
 * to a SelectionTarget for `metadata.attach`. v1 requires both endpoints
 * in the same block; returns null when the selection is empty,
 * multi-block, or otherwise unsupported.
 */
export function textTargetToSelectionTarget(target: TextTarget | null | undefined): SelectionTarget | null {
  if (!target || target.segments.length === 0) return null;
  const first = target.segments[0]!;
  const last = target.segments[target.segments.length - 1]!;
  if (first.blockId !== last.blockId) return null;
  if (last.range.end <= first.range.start) return null;
  return {
    kind: 'selection',
    start: { kind: 'text', blockId: first.blockId, offset: first.range.start },
    end: { kind: 'text', blockId: last.blockId, offset: last.range.end },
  };
}

/** Reverse: SelectionTarget (from metadata.resolve) → TextTarget (for viewport.scrollIntoView). */
export function selectionTargetToTextTarget(target: SelectionTarget | null): TextTarget | null {
  if (!target) return null;
  if (target.start.kind !== 'text' || target.end.kind !== 'text') return null;
  return {
    kind: 'text',
    segments: [{ blockId: target.start.blockId, range: { start: target.start.offset, end: target.end.offset } }],
  };
}
