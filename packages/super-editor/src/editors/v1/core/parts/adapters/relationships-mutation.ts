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
import { mutatePart } from '../mutation/mutate-part.js';
import { RELATIONSHIP_TYPES } from '../../super-converter/docx-helpers/docx-constants.js';

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
  elements?: Array<{ name: string; elements?: RelElement[] }>;
}

function getRelationshipsTag(part: RelsXml): { name: string; elements: RelElement[] } | undefined {
  const tag = part?.elements?.find((el) => el.name === 'Relationships');
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FindOrCreateOptions {
  target: string;
  type: string;
  dryRun?: boolean;
  expectedRevision?: string;
}

/**
 * Find an existing relationship or create a new one via `mutatePart`.
 *
 * Returns the rId string, or null on failure.
 */
export function findOrCreateRelationship(editor: Editor, source: string, options: FindOrCreateOptions): string | null {
  const { target, type, dryRun, expectedRevision } = options;

  if (!target || typeof target !== 'string') return null;
  if (!type || typeof type !== 'string') return null;

  const mappedType = RELATIONSHIP_TYPES[type];
  if (!mappedType) {
    console.warn(`findOrCreateRelationship: unsupported type "${type}"`);
    return null;
  }

  const normalized = normalizeTarget(target);
  const isExternal = type === 'hyperlink';

  const result = mutatePart<RelsXml, string | null>({
    editor,
    partId: RELS_PART_ID,
    operation: 'mutate',
    source,
    dryRun,
    expectedRevision,
    mutate({ part }) {
      const tag = getRelationshipsTag(part);
      if (!tag) return null;

      // Reuse-by-target: if relationship already exists, return its rId
      const existing = tag.elements.find(
        (rel) => rel.attributes?.Target === normalized && rel.attributes?.Type === mappedType,
      );
      if (existing) return existing.attributes.Id;

      // Also check for the un-normalized target (backward compat)
      const existingRaw = tag.elements.find(
        (rel) => rel.attributes?.Target === target && rel.attributes?.Type === mappedType,
      );
      if (existingRaw) return existingRaw.attributes.Id;

      // Allocate new rId
      const newIdInt = getMaxIdInt(tag.elements) + 1;
      const newId = `rId${newIdInt}`;

      const newRel: RelElement = {
        type: 'element',
        name: 'Relationship',
        attributes: {
          Id: newId,
          Type: mappedType,
          Target: isExternal ? target : normalized,
        },
      };

      if (isExternal) {
        newRel.attributes.TargetMode = 'External';
      }

      tag.elements.push(newRel);
      return newId;
    },
  });

  return result.result;
}
