/**
 * Field resolver — finds, resolves, and extracts info from generic field
 * code instances in the document (fldChar-based fields).
 *
 * Fields have a composite address: blockId + occurrenceIndex + nestingDepth
 * because multiple fields can exist in one paragraph and fields can nest.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { FieldAddress, FieldDomain, FieldInfo, DiscoveryItem } from '@superdoc/document-api';
import { buildDiscoveryItem, buildResolvedHandle } from '@superdoc/document-api';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedField {
  pos: number;
  blockId: string;
  occurrenceIndex: number;
  nestingDepth: number;
  instruction: string;
  fieldType: string;
  resolvedText: string;
}

// ---------------------------------------------------------------------------
// Field scanning
// ---------------------------------------------------------------------------

/**
 * Scans the document for field-based nodes and builds a list of resolved fields.
 * Recognized field node types: any node with an `instruction` attribute that
 * represents a field code (TOC, INDEX, pageReference, crossReference, etc.).
 */
const FIELD_NODE_TYPES = new Set([
  'tableOfContents',
  'documentIndex',
  'pageReference',
  'indexEntry',
  'crossReference',
  'citation',
  'bibliography',
  'sequenceField',
  'tableOfAuthorities',
  'authorityEntry',
]);

export function findAllFields(doc: ProseMirrorNode): ResolvedField[] {
  const results: ResolvedField[] = [];
  const blockOccurrenceCounters = new Map<string, number>();

  doc.descendants((node, pos) => {
    if (!FIELD_NODE_TYPES.has(node.type.name) && !node.attrs?.instruction) {
      return true;
    }

    const instruction = (node.attrs?.instruction as string) ?? '';
    if (!instruction) return true;

    const blockId = resolveParentBlockId(doc, pos);
    const counter = blockOccurrenceCounters.get(blockId) ?? 0;
    blockOccurrenceCounters.set(blockId, counter + 1);

    const fieldType = extractFieldType(instruction);
    const resolvedText = (node.attrs?.resolvedText as string) ?? '';

    results.push({
      pos,
      blockId,
      occurrenceIndex: counter,
      nestingDepth: 0,
      instruction,
      fieldType,
      resolvedText,
    });

    return true;
  });

  return results;
}

export function resolveFieldTarget(doc: ProseMirrorNode, target: FieldAddress): ResolvedField {
  const all = findAllFields(doc);
  const found = all.find(
    (f) =>
      f.blockId === target.blockId &&
      f.occurrenceIndex === target.occurrenceIndex &&
      f.nestingDepth === target.nestingDepth,
  );

  if (!found) {
    throw new DocumentApiAdapterError(
      'TARGET_NOT_FOUND',
      `Field at ${target.blockId}[${target.occurrenceIndex}] not found.`,
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Info extraction
// ---------------------------------------------------------------------------

export function extractFieldInfo(resolved: ResolvedField): FieldInfo {
  return {
    address: {
      kind: 'field',
      blockId: resolved.blockId,
      occurrenceIndex: resolved.occurrenceIndex,
      nestingDepth: resolved.nestingDepth,
    },
    instruction: resolved.instruction,
    fieldType: resolved.fieldType,
    resolvedText: resolved.resolvedText,
    nested: resolved.nestingDepth > 0,
  };
}

// ---------------------------------------------------------------------------
// Discovery item builder
// ---------------------------------------------------------------------------

export function buildFieldDiscoveryItem(
  resolved: ResolvedField,
  evaluatedRevision: string,
): DiscoveryItem<FieldDomain> {
  const address: FieldAddress = {
    kind: 'field',
    blockId: resolved.blockId,
    occurrenceIndex: resolved.occurrenceIndex,
    nestingDepth: resolved.nestingDepth,
  };
  const domain: FieldDomain = {
    address,
    instruction: resolved.instruction,
    fieldType: resolved.fieldType,
    resolvedText: resolved.resolvedText,
    nested: resolved.nestingDepth > 0,
  };

  const ref = `${resolved.blockId}:${resolved.occurrenceIndex}:${resolved.nestingDepth}`;
  const handle = buildResolvedHandle(ref, 'ephemeral', 'field');
  const id = `field:${ref}:${evaluatedRevision}`;
  return buildDiscoveryItem(id, handle, domain);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveParentBlockId(doc: ProseMirrorNode, pos: number): string {
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    const blockId = node.attrs?.sdBlockId as string | undefined;
    if (blockId) return blockId;
  }
  return '';
}

function extractFieldType(instruction: string): string {
  const trimmed = instruction.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace > 0 ? trimmed.slice(0, firstSpace).toUpperCase() : trimmed.toUpperCase();
}
