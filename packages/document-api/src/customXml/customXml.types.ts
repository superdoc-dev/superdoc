import type { AdapterMutationFailure } from '../types/adapter-result.js';
import type { DiscoveryOutput } from '../types/discovery.js';

// ---------------------------------------------------------------------------
// Custom XML Part targeting
// ---------------------------------------------------------------------------

/**
 * Stable identifier for a Custom XML Data Storage Part.
 *
 * Maps to the `<ds:datastoreItem ds:itemID>` GUID in the part's Properties
 * Part (ECMA-376 Part 1 §22.5.2.1). Format is a literal `ST_Guid` with
 * braces: `"{A67AC88A-A164-4ADE-8889-8826CE44DE6E}"`.
 *
 * Absent when a Storage Part has no Properties Part (foreign producers
 * sometimes ship one without the other; the spec allows it). In that
 * case, use `{ partName }` to target the part instead.
 */
export type CustomXmlPartId = string;

/**
 * Target shape for read/patch/remove operations.
 *
 * Most callers will use `{ id }` (the itemID GUID). The `{ partName }`
 * variant exists for Storage Parts that have no Properties Part — those
 * have no itemID and can only be addressed by their file path inside
 * the OOXML package.
 *
 * Scope: `partName` accepts Word-style Storage Part paths only —
 * `customXml/itemN.xml` for integer `N`. Foreign-named Storage Parts
 * (which ECMA-376 §15.2.5 permits) are not in v1; see the implementation
 * note on the converter's `listCustomXmlStoragePartNames`. Foreign-named
 * *Properties Parts* paired via rels are fully supported on the read side.
 */
export type CustomXmlPartTarget = { id: CustomXmlPartId } | { partName: string };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CustomXmlPartsListInput {
  /**
   * Filter by the XML namespace of the Storage Part's root element
   * (e.g. `<harveyRefs xmlns="urn:harvey:refs:1"/>` → `'urn:harvey:refs:1'`).
   *
   * Distinct from `schemaRef`: this is what the *data* declares; schemaRef
   * is what the Properties Part declares as the associated XML schema's
   * target namespace. Often they match, but the spec does not require it.
   */
  rootNamespace?: string;
  /**
   * Filter by one of the part's `<ds:schemaRef ds:uri>` values
   * (ECMA-376 Part 1 §22.5.2.2). Matches if any declared schemaRef equals
   * this URI.
   */
  schemaRef?: string;
  limit?: number;
  offset?: number;
}

export interface CustomXmlPartsGetInput {
  target: CustomXmlPartTarget;
}

export interface CustomXmlPartsCreateInput {
  /**
   * Well-formed XML for the Storage Part's body. Anything that is legal
   * `application/xml` is acceptable; consumers control the schema entirely.
   */
  content: string;
  /**
   * Optional list of XML schema target namespaces to declare in the
   * Properties Part (`<ds:schemaRef ds:uri>`). When omitted or empty, the
   * Properties Part is still emitted with a fresh itemID and an empty
   * `<ds:schemaRefs/>` so `id` is always discoverable on readback.
   */
  schemaRefs?: string[];
}

export interface CustomXmlPartsPatchInput {
  target: CustomXmlPartTarget;
  /** Replace the Storage Part's content. Must be well-formed XML. */
  content?: string;
  /**
   * Replace the Properties Part's `<ds:schemaRefs>` set with this list.
   * Pass `[]` to clear all schemaRefs.
   */
  schemaRefs?: string[];
}

export interface CustomXmlPartsRemoveInput {
  target: CustomXmlPartTarget;
}

// ---------------------------------------------------------------------------
// Info / domain
// ---------------------------------------------------------------------------

/**
 * Lightweight view of a Custom XML Part returned by `list()`. Does NOT
 * carry `content` — parts can be large; fetch the full record via `get()`
 * when needed.
 */
export interface CustomXmlPartSummary {
  /** itemID GUID; absent when no Properties Part exists. */
  id?: CustomXmlPartId;
  /**
   * Package-relative path of the Storage Part, e.g. `"customXml/item1.xml"`.
   * v1 scope: Word-style `customXml/itemN.xml` only.
   */
  partName: string;
  /** Package-relative path of the Properties Part, when present. */
  propsPartName?: string;
  /**
   * XML namespace URI of the Storage Part's root element, parsed from
   * `content`. Absent when the root element has no namespace.
   */
  rootNamespace?: string;
  /** Values from `<ds:schemaRef ds:uri>` in the Properties Part. */
  schemaRefs: string[];
}

export type CustomXmlPartInfo = CustomXmlPartSummary & {
  /** Full serialized XML body of the Storage Part. */
  content: string;
};

// ---------------------------------------------------------------------------
// Mutation results
// ---------------------------------------------------------------------------

export interface CustomXmlPartsCreateSuccess {
  success: true;
  /** Generated itemID GUID for the newly created part. */
  id: CustomXmlPartId;
  partName: string;
  propsPartName: string;
}

export type CustomXmlPartsCreateResult = CustomXmlPartsCreateSuccess | AdapterMutationFailure;

export interface CustomXmlPartsMutationSuccess {
  success: true;
  /** Identifier the operation acted on (mirrors the resolved input target). */
  target: CustomXmlPartTarget;
}

export type CustomXmlPartsMutationResult = CustomXmlPartsMutationSuccess | AdapterMutationFailure;

// ---------------------------------------------------------------------------
// List result
// ---------------------------------------------------------------------------

export type CustomXmlPartsListResult = DiscoveryOutput<CustomXmlPartSummary>;
