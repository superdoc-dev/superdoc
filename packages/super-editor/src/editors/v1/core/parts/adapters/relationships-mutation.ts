/**
 * Relationship mutation adapter — centralized entry point for runtime
 * `word/_rels/document.xml.rels` mutations.
 *
 * All relationship writes must flow through `findOrCreateRelationship`.
 * Preserves legacy semantics from `document-rels.js`:
 *   - Target normalization (strip `word/` prefix)
 *   - Reuse-by-target (same target+type returns existing rId)
 *   - TargetMode=External for hyperlinks
 *   - Collision-free rId allocation
 */

import type { Editor } from '../../Editor.js';
import type { PartId } from '../types.js';
import { mutatePart } from '../mutation/mutate-part.js';
import { hasPart } from '../store/part-store.js';
import { RELATIONSHIP_TYPES } from '../../super-converter/docx-helpers/docx-constants.js';
import { createRelationshipsPart, getRelationshipsRoot } from '../../helpers/rels-part-helpers.js';

const RELS_PART_ID = 'word/_rels/document.xml.rels' as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RelElement {
  type: string;
  name: string;
  attributes: { Id: string; Type: string; Target: string; TargetMode?: string };
}

interface RelsXml {
  type?: string;
  name?: string;
  elements?: Array<{ type?: string; name: string; attributes?: Record<string, string>; elements?: RelElement[] }>;
}

function getRelationshipsTag(part: RelsXml): { name: string; elements: RelElement[] } | undefined {
  const tag = getRelationshipsRoot(part);
  if (tag && !tag.elements) tag.elements = [];
  return tag as { name: string; elements: RelElement[] } | undefined;
}

function normalizeTarget(target: string): string {
  return target.startsWith('word/') ? target.replace('word/', '') : target;
}

function getMaxIdInt(elements: RelElement[]): number {
  let max = 0;
  for (const rel of elements) {
    const match = rel.attributes?.Id?.match(/^rId(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

function createRelationshipElement(id: string, mappedType: string, target: string, isExternal: boolean): RelElement {
  const rel: RelElement = {
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: id,
      Type: mappedType,
      Target: target,
    },
  };

  if (isExternal) {
    rel.attributes.TargetMode = 'External';
  }

  return rel;
}

function findExistingRelationship(elements: RelElement[], target: string, normalized: string, mappedType: string) {
  return elements.find(
    (rel) =>
      (rel.attributes?.Target === normalized || rel.attributes?.Target === target) &&
      rel.attributes?.Type === mappedType,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FindOrCreateOptions {
  target: string;
  type: string;
  partId?: PartId;
  dryRun?: boolean;
  expectedRevision?: string;
}

/**
 * Find an existing relationship or create a new one via `mutatePart`.
 *
 * Returns the rId string, or null on failure.
 */
export function findOrCreateRelationship(editor: Editor, source: string, options: FindOrCreateOptions): string | null {
  const { target, type, partId = RELS_PART_ID, dryRun, expectedRevision } = options;

  if (!target || typeof target !== 'string') return null;
  if (!type || typeof type !== 'string') return null;

  const mappedType = RELATIONSHIP_TYPES[type];
  if (!mappedType) {
    console.warn(`findOrCreateRelationship: unsupported type "${type}"`);
    return null;
  }

  const normalized = normalizeTarget(target);
  const isExternal = type === 'hyperlink';

  if (!hasPart(editor, partId)) {
    const newId = 'rId1';
    const targetValue = isExternal ? target : normalized;
    mutatePart({
      editor,
      partId,
      operation: 'create',
      source,
      dryRun,
      expectedRevision,
      initial: createRelationshipsPart([createRelationshipElement(newId, mappedType, targetValue, isExternal)]),
    });
    return newId;
  }

  const result = mutatePart<RelsXml, string | null>({
    editor,
    partId,
    operation: 'mutate',
    source,
    dryRun,
    expectedRevision,
    mutate({ part }) {
      const tag = getRelationshipsTag(part);
      if (!tag) return null;

      // Reuse-by-target: if relationship already exists, return its rId
      const existing = findExistingRelationship(tag.elements, target, normalized, mappedType);
      if (existing) return existing.attributes.Id;

      // Allocate new rId
      const newIdInt = getMaxIdInt(tag.elements) + 1;
      const newId = `rId${newIdInt}`;

      const newRel = createRelationshipElement(newId, mappedType, isExternal ? target : normalized, isExternal);
      tag.elements.push(newRel);
      return newId;
    },
  });

  return result.result;
}
