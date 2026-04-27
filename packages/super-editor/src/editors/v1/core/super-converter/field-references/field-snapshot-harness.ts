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

  const snapshots: FieldSnapshot[] = [];
  walk(result, snapshots);
  return snapshots;
}

function walk(nodes: PmNode[] | undefined, out: FieldSnapshot[]): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const fi = node.attrs?.fieldInstance as FieldInstance | null | undefined;
    if (fi && typeof node.type === 'string') {
      out.push({ pmType: node.type, fieldInstance: canonicalizeFieldInstance(fi) });
    }
    walk(node.content, out);
  }
}
