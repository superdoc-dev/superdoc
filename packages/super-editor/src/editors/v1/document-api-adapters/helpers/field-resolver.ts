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
  'documentStatField',
]);

/**
 * Node types that represent fields but derive their instruction synthetically
 * rather than from an `instruction` attribute.
 */
const SYNTHETIC_FIELD_NODE_TYPES: Record<string, { fieldType: string; instruction: string }> = {
  'total-page-number': { fieldType: 'NUMPAGES', instruction: 'NUMPAGES' },
};

export function findAllFields(doc: ProseMirrorNode): ResolvedField[] {
  const results: ResolvedField[] = [];
  const blockOccurrenceCounters = new Map<string, number>();

  doc.descendants((node, pos) => {
    const typeName = node.type.name;

    // Check for synthetic field node types (e.g. total-page-number → NUMPAGES)
    const synthetic = SYNTHETIC_FIELD_NODE_TYPES[typeName];
    if (synthetic) {
      const blockId = resolveParentBlockId(doc, pos);
      const counter = blockOccurrenceCounters.get(blockId) ?? 0;
      blockOccurrenceCounters.set(blockId, counter + 1);

      // Priority: text content (live NodeView value) → resolvedText (F9 update)
      // → importedCachedText (original import fallback).
      const textContent = node.textContent ?? '';
      const resolvedAttr = (node.attrs?.resolvedText as string) ?? '';
      const importedCached = (node.attrs?.importedCachedText as string) ?? '';
      const resolvedText = textContent || resolvedAttr || importedCached;

      results.push({
        pos,
        blockId,
        occurrenceIndex: counter,
        nestingDepth: 0,
        instruction: synthetic.instruction,
        fieldType: synthetic.fieldType,
        resolvedText,
      });
      return true;
    }

    if (!FIELD_NODE_TYPES.has(typeName) && !node.attrs?.instruction) {
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

/**
 * Returns the subset of document fields whose positions intersect a range.
 *
 * For a collapsed selection (from === to) the field immediately at or
 * adjacent to the cursor is matched — mirroring Word's "caret on a field"
 * semantics. For a range selection, all fields overlapping [from, to) are
 * returned.
 */
export function findFieldsInRange(doc: ProseMirrorNode, from: number, to: number): ResolvedField[] {
  const allFields = findAllFields(doc);
  const isCollapsed = from === to;

  return allFields.filter((field) => {
    const node = doc.nodeAt(field.pos);
    if (!node) return false;
    const fieldEnd = field.pos + node.nodeSize;

    if (isCollapsed) {
      // Match when cursor sits at either edge of the field node
      return field.pos <= from && fieldEnd >= from;
    }

    // Standard range overlap: field starts before range ends AND ends after range starts
    return field.pos < to && fieldEnd > from;
  });
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
