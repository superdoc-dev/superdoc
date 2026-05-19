/**
 * Anchored metadata — attach a structured payload to a span of text and
 * read it back across DOCX round-trips.
 *
 * Backed by the two-layer pattern (hidden inline content control as
 * anchor + Custom XML Data Storage Part as payload store), but consumers
 * see one operation set: `metadata.attach`, `metadata.list`, `metadata.get`,
 * `metadata.update`, `metadata.remove`, `metadata.resolve`.
 *
 * v1 is opinionated:
 *   - Anchor is a hidden inline SDT (text-range only; same paragraph).
 *   - Payload is JSON, serialized opaquely inside a SuperDoc-owned XML
 *     envelope. VBA/Office.js readers see one escaped text node; use the
 *     SuperDoc API to traverse.
 *   - One Custom XML Data Storage Part per namespace; payload entries
 *     collected inside `<refs xmlns="namespace">` with `<ref id="..." encoding="json">`.
 *   - Schema validation is out of scope (`<ds:schemaRefs>` not written).
 *     Consumers who need schema validation can fall back to
 *     `customXml.parts.patch`.
 */
import type { AdapterMutationFailure } from '../types/adapter-result.js';
import type { DiscoveryOutput } from '../types/discovery.js';
import type { SelectionTarget } from '../types/address.js';

// ---------------------------------------------------------------------------
// Stable identity
// ---------------------------------------------------------------------------

/**
 * Stable opaque identifier for an anchored-metadata entry. Lives in the
 * anchor SDT's `w:tag` (ECMA-376 Part 1 §17.5.2.34) and links the anchor
 * to the payload entry in the namespaced Custom XML Data Storage Part.
 *
 * Consumers may supply their own id at `attach` time (e.g. their own
 * citation id); otherwise the adapter generates one. Ids are opaque
 * strings — SuperDoc does not assume GUID or URN shape.
 */
export type AnchoredMetadataId = string;

// ---------------------------------------------------------------------------
// Anchor target
// ---------------------------------------------------------------------------

/**
 * Where to place a new anchored-metadata entry in the document. v1
 * supports a single paragraph text range only — the adapter wraps that
 * range in a hidden inline SDT whose `w:tag` carries the id.
 *
 * v1 constraints (enforced at the contract layer):
 *   - both `start` and `end` must be `{ kind: 'text' }` — `nodeEdge`
 *     endpoints are not accepted.
 *   - both endpoints must share the same `blockId` — cross-paragraph
 *     spans are not accepted.
 *
 * Block-level, image, and table-cell anchors are out of scope for v1.
 * Consumers who need them can fall back to the underlying primitives
 * (`contentControls.*` + `customXml.parts.*`).
 *
 * Type alias of `SelectionTarget` — kept distinct for documentation; the
 * resolver path is shared with the rest of the Document API.
 */
export type MetadataTarget = SelectionTarget;

// ---------------------------------------------------------------------------
// Payload (JSON)
// ---------------------------------------------------------------------------

/**
 * Caller-owned JSON payload. Any JSON-serializable value: object, array,
 * string, number, boolean, or null. SuperDoc serializes the payload via
 * `JSON.stringify` and stores it as an escaped text node inside a
 * SuperDoc-owned `<ref id="..." encoding="json">…</ref>` element.
 *
 * The payload is opaque to other XML tools reading the DOCX package:
 * VBA / Office.js readers see one text node of escaped JSON, not a
 * structural XML tree. Consumers who need a Word-readable XML payload
 * should use `customXml.parts.*` directly.
 */
export type AnchoredMetadataPayload = unknown;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface AnchoredMetadataAttachInput {
  /**
   * Text range to anchor the metadata to. v1: same-paragraph text range
   * (see {@link MetadataTarget} constraints).
   */
  target: MetadataTarget;
  /**
   * Logical namespace for the metadata set, e.g. `'urn:harvey:citations:1'`.
   * SuperDoc writes this as the `xmlns` of the `<refs>` element in the
   * backing Custom XML Data Storage Part. All entries sharing a namespace
   * share one part on disk.
   *
   * Not to be confused with `<ds:schemaRef ds:uri>` — v1 does not write
   * schemaRefs.
   */
  namespace: string;
  /**
   * Caller's payload (any JSON-serializable value). Stored opaquely inside
   * a SuperDoc-owned `<ref id="..." encoding="json">…</ref>` envelope.
   */
  payload: AnchoredMetadataPayload;
  /**
   * Optional caller-chosen id. When omitted, the adapter generates one.
   * Must be unique within the document — attach fails with
   * `INVALID_INPUT` if an id collides with an existing entry.
   */
  id?: AnchoredMetadataId;
}

export interface AnchoredMetadataListInput {
  /**
   * Filter by logical namespace — matches the `xmlns` of the backing
   * Storage Part's `<refs>` root.
   */
  namespace?: string;
  /**
   * Filter to entries whose resolved anchor range overlaps `within`. Useful
   * for "what metadata is on this paragraph / selection" queries that would
   * otherwise require listing every entry and resolving it.
   *
   * Mirrors the `hyperlinks.list({ within })` precedent. Same v1 target
   * constraints as {@link MetadataTarget}: text-range only.
   */
  within?: SelectionTarget;
  limit?: number;
  offset?: number;
}

export interface AnchoredMetadataGetInput {
  id: AnchoredMetadataId;
}

export interface AnchoredMetadataUpdateInput {
  id: AnchoredMetadataId;
  /**
   * Replace the entry's payload. Any JSON-serializable value. Replace
   * semantics — no merge / JSON-patch.
   */
  payload: AnchoredMetadataPayload;
}

export interface AnchoredMetadataRemoveInput {
  id: AnchoredMetadataId;
}

export interface AnchoredMetadataResolveInput {
  id: AnchoredMetadataId;
}

// ---------------------------------------------------------------------------
// Info / domain
// ---------------------------------------------------------------------------

/**
 * Light view of an entry returned by `list()`. Carries identity and the
 * package coordinates of its backing storage part, but NOT the payload —
 * fetch via `get()` when needed.
 */
export interface AnchoredMetadataSummary {
  id: AnchoredMetadataId;
  namespace: string;
  /** Package-relative path of the backing Storage Part. */
  partName: string;
}

export type AnchoredMetadataInfo = AnchoredMetadataSummary & {
  /**
   * The caller's payload, deserialized from the stored JSON envelope.
   * SuperDoc reads the text content of `<ref id="..." encoding="json">`
   * and `JSON.parse`s it before returning; consumers see the same shape
   * they passed to `attach`.
   */
  payload: AnchoredMetadataPayload;
};

/**
 * Where an entry's anchor currently lives in the document. Returned by
 * `resolve()`. `target` is the SelectionTarget that spans the anchor's
 * content — consumers can pass it to other read or mutation operations
 * (selection, comment.add, etc.).
 */
export interface AnchoredMetadataResolveInfo {
  id: AnchoredMetadataId;
  target: SelectionTarget;
}

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface AnchoredMetadataAttachSuccess {
  success: true;
  /** The id assigned to the new entry (caller-supplied or generated). */
  id: AnchoredMetadataId;
  namespace: string;
  partName: string;
}

export type AnchoredMetadataAttachResult = AnchoredMetadataAttachSuccess | AdapterMutationFailure;

/**
 * Successful mutation outcome for update / remove.
 *
 * `remove` strips both the anchor content control (wrapper only, content
 * stays in the document) and the payload entry, in that order. When the
 * backing Storage Part has no remaining entries, the part itself is
 * removed.
 *
 * In v1 these writes are sequenced, not transactional. The anchor lives
 * in ProseMirror doc state and the payload lives in the OOXML package:
 * two different state systems with no shared commit primitive. The
 * adapter resolves the target up-front so the common failure mode
 * (`TARGET_NOT_FOUND`) fails before any state change, but a crash
 * strictly between the PM dispatch and the customXml write can leave a
 * dangling payload entry. A future revision may add cross-state
 * compensation.
 */
export interface AnchoredMetadataMutationSuccess {
  success: true;
  id: AnchoredMetadataId;
}

export type AnchoredMetadataMutationResult = AnchoredMetadataMutationSuccess | AdapterMutationFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type AnchoredMetadataListResult = DiscoveryOutput<AnchoredMetadataSummary>;
