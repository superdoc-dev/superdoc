/**
 * Attach a {@link FieldInstance} to the typed `sd:*` element(s) emitted by
 * a family preprocessor.
 *
 * Family preprocessors return different shapes depending on the family
 * (single inline node, paragraph wrapper with the field as a child,
 * multiple sibling nodes, etc.). To keep attachment predictable the
 * function only mutates elements whose `name` is in the explicit
 * supported-name list, and does so by writing to `attributes.fieldInstance`.
 * Unsupported elements are left untouched and pass through unchanged.
 *
 * Each attachment receives its own clone of the FieldInstance so a later
 * mutation on one node cannot alias another.
 */

import type { FieldInstance } from './field-instance.js';

type OoxmlNode = {
  name?: string;
  attributes?: Record<string, unknown>;
  elements?: OoxmlNode[];
};

/**
 * XML element names emitted by family preprocessors that map to a typed
 * field PM node. Add a name here only after verifying the corresponding
 * PM extension declares the `fieldInstance` attribute and its v3
 * translator forwards `attributes.fieldInstance` to PM `attrs.fieldInstance`.
 */
export const FIELD_BEARING_XML_NAMES: ReadonlySet<string> = new Set([
  'sd:sequenceField',
  'sd:documentStatField',
  'sd:crossReference',
  'sd:pageReference',
  'sd:tableOfContents',
  'sd:index',
  'sd:autoPageNumber',
  'sd:totalPageNumber',
]);

/**
 * Walk `nodes` (and their `elements` children) and attach a clone of
 * `fieldInstance` to every element whose `name` is in
 * {@link FIELD_BEARING_XML_NAMES}.
 *
 * Returns the same `nodes` array; mutation is in place. Mutation is scoped
 * to the matched elements' `attributes.fieldInstance`; nothing else is
 * touched.
 */
export function attachFieldInstanceToFieldNodes<T extends OoxmlNode>(
  nodes: readonly T[] | T[],
  fieldInstance: FieldInstance,
): T[] {
  for (const node of nodes) {
    visit(node, fieldInstance);
  }
  return nodes as T[];
}

/**
 * Recursively deep-clone a parsed-XML subtree, removing any
 * `fieldInstance` entry from element attributes.
 *
 * The substrate stores FieldInstance on PM-bound `sd:*` elements as a
 * convenience for the v3 encoder, but `fieldInstance` is a JavaScript
 * object — not a string — so it must never reach an XML serializer. When
 * a parent field's import captures children for `source.originalXml`,
 * those children may already carry `fieldInstance` from a nested
 * preprocessor; this clone strips it so passthrough export emits a valid
 * subtree (instead of `fieldInstance="[object Object]"`).
 */
export function cloneOoxmlWithoutFieldInstance<T extends OoxmlNode>(node: T): T {
  const out: OoxmlNode = { ...node };
  if (out.attributes && typeof out.attributes === 'object') {
    const { fieldInstance: _stripped, ...rest } = out.attributes as Record<string, unknown>;
    out.attributes = rest;
  }
  if (Array.isArray(out.elements)) {
    out.elements = out.elements.map((child) => cloneOoxmlWithoutFieldInstance(child));
  }
  return out as T;
}

function visit(node: OoxmlNode | null | undefined, fieldInstance: FieldInstance): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.name === 'string' && FIELD_BEARING_XML_NAMES.has(node.name)) {
    // A nested field that already has its own FieldInstance attached takes
    // precedence: we do not overwrite a child's payload with the parent's.
    // This matters when an outer HYPERLINK / IF wraps an inner PAGEREF or
    // MERGEFIELD, where each finalize attaches its own.
    if (node.attributes?.fieldInstance) return;
    if (!node.attributes) node.attributes = {};
    node.attributes.fieldInstance = cloneFieldInstance(fieldInstance);
    // Don't recurse into children of an attached field; nested fields are
    // their own substrate entries and were attached by their own preprocessor.
    return;
  }
  if (Array.isArray(node.elements)) {
    for (const child of node.elements) visit(child, fieldInstance);
  }
}

/**
 * Shallow-clone the FieldInstance so each attachment gets its own object
 * identity. `instructionTokens`, `parsedArgs`, `mutation`, and `source`
 * are themselves cloned so a later in-place mutation on one node cannot
 * alias another. `resultFragments` and `originalXml` stay shared by
 * reference; they are large parsed-XML subtrees and the substrate treats
 * them as read-only at this stage.
 */
function cloneFieldInstance(fi: FieldInstance): FieldInstance {
  return {
    ...fi,
    instructionTokens: [...fi.instructionTokens],
    parsedArgs: {
      family: fi.parsedArgs.family,
      positional: fi.parsedArgs.positional.map((arg) => ({ ...arg })),
      switches: fi.parsedArgs.switches.map((sw) => ({ ...sw, arg: sw.arg ? { ...sw.arg } : undefined })),
    },
    mutation: { ...fi.mutation },
    source: { ...fi.source },
  };
}
