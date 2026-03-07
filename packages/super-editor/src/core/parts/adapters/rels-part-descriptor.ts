/**
 * Part descriptor for `word/_rels/document.xml.rels`.
 *
 * Phase 2 migration: routes relationship mutations through the centralized parts system.
 *
 * The `afterCommit` hook synchronizes header/footer derived caches whenever
 * new header/footer relationships appear in the rels. This removes the need
 * for callers to manually update `converter.headers`/`footers`,
 * `converter.headerIds`/`footerIds`, and `converter.headerFooterModified`.
 */

import type { Editor } from '../../Editor.js';
import type { PartDescriptor } from '../types.js';

const RELS_PART_ID = 'word/_rels/document.xml.rels' as const;
const RELS_XMLNS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const HEADER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

// ---------------------------------------------------------------------------
// Converter shape (minimal interface for header/footer cache sync)
// ---------------------------------------------------------------------------

interface VariantIds {
  ids?: string[];
  [key: string]: unknown;
}

interface ConverterForRels {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerIds?: VariantIds;
  footerIds?: VariantIds;
  headerFooterModified?: boolean;
}

function getConverter(editor: Editor): ConverterForRels | undefined {
  return (editor as unknown as { converter?: ConverterForRels }).converter;
}

// ---------------------------------------------------------------------------
// Header/footer derived cache sync
// ---------------------------------------------------------------------------

interface XmlElement {
  name?: string;
  attributes?: Record<string, string>;
  elements?: XmlElement[];
}

function createEmptyHeaderFooterJson(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
}

/**
 * Synchronize header/footer derived caches from the committed rels part.
 *
 * Scans the rels for header/footer relationships and ensures that
 * `converter.headerIds`/`footerIds` and `converter.headers`/`footers`
 * include entries for every relationship. Newly discovered entries are
 * initialized with an empty JSON part; the caller may override with
 * cloned source content after `mutateParts` returns.
 */
function syncHeaderFooterCaches(editor: Editor, part: unknown): void {
  const converter = getConverter(editor);
  if (!converter) return;

  const root = part as XmlElement;
  const relsRoot = root?.elements?.find((el) => el.name === 'Relationships');
  if (!relsRoot?.elements) return;

  let changed = false;

  for (const el of relsRoot.elements) {
    if (el.name !== 'Relationship') continue;
    const type = el.attributes?.Type;
    const id = el.attributes?.Id;
    if (!id) continue;

    const isHeader = type === HEADER_RELATIONSHIP_TYPE;
    const isFooter = type === FOOTER_RELATIONSHIP_TYPE;
    if (!isHeader && !isFooter) continue;

    const variantIds = isHeader ? (converter.headerIds ??= {}) : (converter.footerIds ??= {});
    if (!Array.isArray(variantIds.ids)) variantIds.ids = [];

    if (variantIds.ids.includes(id)) continue;

    // New relationship discovered — sync derived caches
    variantIds.ids.push(id);

    const collection = isHeader ? (converter.headers ??= {}) : (converter.footers ??= {});
    if (!(id in collection)) {
      collection[id] = createEmptyHeaderFooterJson();
    }

    changed = true;
  }

  if (changed) {
    converter.headerFooterModified = true;
  }
}

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export const relsPartDescriptor: PartDescriptor = {
  id: RELS_PART_ID,

  ensurePart() {
    return {
      type: 'element',
      name: 'document',
      elements: [
        {
          type: 'element',
          name: 'Relationships',
          attributes: { xmlns: RELS_XMLNS },
          elements: [],
        },
      ],
    };
  },

  afterCommit({ editor, part }) {
    syncHeaderFooterCaches(editor, part);
  },
};
