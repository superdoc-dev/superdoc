/**
 * Round-trip snapshot harness.
 *
 * Walks a parsed-XML body through the field preprocessor + V2 importer,
 * collects every PM node that carries a `fieldInstance` attr, and applies
 * the canonicalization rules so the resulting array can be compared for
 * equality across re-imports.
 *
 * The harness is the merge gate for the substrate work: a regression in
 * any chunk that breaks the canonical payload — dropped fields, lost
 * dirty/locked flags, mis-attached instances, broken nesting — fails a
 * test here.
 */

import type { FieldInstance } from './field-instance.js';
import { canonicalizeFieldInstance, type CanonicalFieldInstance } from './canonicalize-field-instance.js';
import { defaultNodeListHandler } from '../v2/importer/docxImporter.js';
import { preProcessNodesForFldChar } from './preProcessNodesForFldChar.js';

type PmNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: unknown[];
};

export type FieldSnapshot = {
  /** PM type name carrying the FieldInstance (e.g. `rawField`, `sequenceField`). */
  pmType: string;
  fieldInstance: CanonicalFieldInstance;
};

/**
 * Run a parsed OOXML body through the import pipeline and snapshot every
 * field-bearing PM node that emerges. Snapshots are returned in document
 * order so a reimport yielding the same sequence of fields produces an
 * equal array.
 *
 * A FieldInstance registry is built first (id → instance) and threaded
 * into canonicalization as the `resolveNested` callback so that any
 * `nestedField` token's `childFieldId` resolves to the child's
 * canonical snapshot. The importer does not yet populate nestedField
 * anchors in Phase 0; this threading is forward-looking so the harness
 * catches regressions in nested-anchor wiring as soon as it lands.
 */
export function snapshotFromXml(elements: unknown[]): FieldSnapshot[] {
  const { processedNodes } = preProcessNodesForFldChar(elements as never[], {});
  const nodeListHandler = defaultNodeListHandler();
  const result = nodeListHandler.handler({
    nodes: processedNodes,
    docx: {},
    nodeListHandler,
    converter: {},
    path: [],
  });

  const registry = new Map<string, FieldInstance>();
  collectFieldInstances(result, registry);
  const resolve = (id: string) => registry.get(id) ?? null;

  const snapshots: FieldSnapshot[] = [];
  walk(result, snapshots, resolve);
  return snapshots;
}

function collectFieldInstances(nodes: PmNode[] | undefined, registry: Map<string, FieldInstance>): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const fi = node.attrs?.fieldInstance as FieldInstance | null | undefined;
    if (fi && typeof fi.id === 'string') registry.set(fi.id, fi);
    collectFieldInstances(node.content, registry);
  }
}

function walk(nodes: PmNode[] | undefined, out: FieldSnapshot[], resolve: (id: string) => FieldInstance | null): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const fi = node.attrs?.fieldInstance as FieldInstance | null | undefined;
    if (fi && typeof node.type === 'string') {
      out.push({ pmType: node.type, fieldInstance: canonicalizeFieldInstance(fi, resolve) });
    }
    walk(node.content, out, resolve);
  }
}
