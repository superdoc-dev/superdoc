// Export shape for a whole-block tracked deletion's paragraph MARK.
//
// Two things have to hold, and both were reported as defects on review:
//   1. `w:id` is ST_DecimalNumber, and the internal revision id is a UUID, so
//      the mark must go through the same allocator the run-level `w:del` uses.
//      Sharing the logical id also keeps both halves of one deletion under a
//      single `w:id`, which is what makes Word treat them as one revision.
//   2. A final-doc export is the ACCEPTED state, so a block whose mark was
//      deleted must not survive it — otherwise the export reproduces the empty
//      numbered item the feature exists to remove.

import { describe, it, expect } from 'vitest';
import { generateParagraphProperties } from './generate-paragraph-properties.js';
import { translateParagraphNode } from './translate-paragraph-node.js';

const MARK = {
  type: 'paragraphMarkDelete',
  id: 'b3f1c2de-0000-4000-8000-000000000001',
  author: 'Alice Reviewer',
  authorEmail: 'alice@example.com',
  date: '2026-07-31T10:00:00Z',
};

const paragraphNode = (attrs = {}) => ({
  type: 'paragraph',
  attrs: { markTrackChange: MARK, ...attrs },
  content: [],
});

const findMarkDeletion = (pPr) =>
  pPr?.elements?.find((el) => el.name === 'w:rPr')?.elements?.find((el) => el.name === 'w:del');

describe('paragraph-mark deletion export', () => {
  it('allocates a decimal w:id instead of writing the internal UUID', () => {
    const allocated = [];
    const allocator = {
      allocate: ({ logicalId }) => {
        allocated.push(logicalId);
        return '7';
      },
    };
    const pPr = generateParagraphProperties({
      node: paragraphNode(),
      converter: { wordIdAllocator: allocator },
      currentPartPath: 'word/document.xml',
    });
    const del = findMarkDeletion(pPr);
    expect(del, 'the paragraph mark must be exported').toBeTruthy();
    expect(del.attributes['w:id']).toBe('7');
    // Allocated on the LOGICAL id, so the run-level half of the same deletion
    // resolves to the same w:id.
    expect(allocated).toEqual([MARK.id]);
  });

  it('falls back to the internal id when no allocator is bound', () => {
    const pPr = generateParagraphProperties({ node: paragraphNode() });
    expect(findMarkDeletion(pPr).attributes['w:id']).toBe(MARK.id);
  });

  it('drops a fully deleted block from a final-doc export', () => {
    // No surviving content: the struck runs are already gone by this point.
    const result = translateParagraphNode({
      node: paragraphNode(),
      isFinalDoc: true,
      relationships: [],
      children: [],
    });
    expect(result, 'an accepted whole-block deletion must not export').toBeUndefined();
  });

  it('keeps the paragraph in a final-doc export when content survives', () => {
    // Partially deleted: the accepted result is a merge into the successor,
    // which this per-node translator cannot express — dropping the paragraph
    // would silently lose text that was never deleted.
    const result = translateParagraphNode({
      node: {
        type: 'paragraph',
        attrs: { markTrackChange: MARK },
        content: [{ type: 'text', text: 'survives' }],
      },
      isFinalDoc: true,
      relationships: [],
      children: [],
    });
    expect(result?.name).toBe('w:p');
  });
});

describe('table cell content invariant on final export', () => {
  it('keeps a paragraph in a cell whose only paragraph was deleted', async () => {
    const { translateTableCell } = await import('../../tc/helpers/translate-table-cell.js');
    // Every child dropped — what a final export does to a cell holding one
    // fully tracked-deleted paragraph. `<w:tcPr>` alone is not valid CT_Tc
    // content, so Word would offer to repair the file.
    const cell = translateTableCell({
      node: { type: 'tableCell', attrs: {}, content: [] },
      relationships: [],
      isFinalDoc: true,
    });
    expect(cell.name).toBe('w:tc');
    const blocks = cell.elements.filter((el) => el && el.name !== 'w:tcPr');
    expect(blocks.length, 'a cell must keep at least one block-level child').toBeGreaterThan(0);
    expect(blocks[0].name).toBe('w:p');
  });
});
