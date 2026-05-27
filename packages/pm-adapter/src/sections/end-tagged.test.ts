/**
 * @file End-tagged section-membership tests (ECMA-376 §17.6.17, §17.18.77).
 *
 * OOXML rule: a `<w:sectPr>` inside a paragraph defines the section that
 * ENDS with that paragraph. All body children preceding it (back to the
 * previous section-terminating paragraph) belong to that section —
 * including tables, drawings, and other non-paragraph nodes.
 *
 * These tests use real implementations with no module mocks so they assert
 * observable behavior of the section analysis, not call patterns.
 */
import { describe, it, expect } from 'vitest';
import { analyzeSectionRanges } from './analysis.js';
import type { PMNode } from '../types.js';
import type { SectPrElement } from './types.js';

const sectPr = (options: {
  type?: 'continuous' | 'nextPage';
  cols?: number;
  colSpace?: number;
  pgSz?: { w: number; h: number };
}): SectPrElement => {
  const elements: SectPrElement['elements'] = [];
  if (options.type) {
    elements!.push({
      type: 'element',
      name: 'w:type',
      attributes: { 'w:val': options.type },
    });
  }
  if (options.pgSz) {
    elements!.push({
      type: 'element',
      name: 'w:pgSz',
      attributes: { 'w:w': String(options.pgSz.w), 'w:h': String(options.pgSz.h) },
    });
  }
  elements!.push({
    type: 'element',
    name: 'w:cols',
    attributes: {
      'w:num': String(options.cols ?? 1),
      'w:space': String(options.colSpace ?? 720),
    },
  });
  return {
    type: 'element',
    name: 'w:sectPr',
    elements,
  };
};

const paragraph = (marker?: SectPrElement): PMNode => ({
  type: 'paragraph',
  attrs: marker ? { paragraphProperties: { sectPr: marker } } : {},
  content: [],
});

const table = (): PMNode => ({
  type: 'table',
  attrs: {},
  content: [
    {
      type: 'tableRow',
      content: [
        {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
        },
        {
          type: 'tableCell',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
        },
      ],
    },
  ],
});

describe('analyzeSectionRanges — end-tagged membership for non-paragraph nodes (SD-2646)', () => {
  it('places a table between two sectPr markers into the section of the LATER marker', () => {
    // Arrange — IT-945 shape:
    //   p0            "first section" text
    //   p1(sectPr-A)  empty marker, 1-col nextPage  → ends Section A
    //   TABLE         belongs to Section B per ECMA-376 §17.6.17
    //   p2(sectPr-B)  empty marker, 2-col continuous → ends Section B
    //   p3            "third section" text
    //   body sectPr   final, 1-col continuous       → Section C
    const markerA = sectPr({ type: 'nextPage', cols: 1 });
    const markerB = sectPr({ type: 'continuous', cols: 2, colSpace: 720 });
    const bodyMarker = sectPr({ type: 'continuous', cols: 1 });
    const doc: PMNode = {
      type: 'doc',
      attrs: { bodySectPr: bodyMarker },
      content: [paragraph(), paragraph(markerA), table(), paragraph(markerB), paragraph()],
    };

    // Act
    const sut = analyzeSectionRanges(doc, bodyMarker);

    // Assert — three sections, with Section B's range spanning the table
    expect(sut).toHaveLength(3);
    const [sectionA, sectionB, sectionC] = sut;

    // Section A ends at p1 (node index 1). Table at node index 2 is NOT in A.
    expect(sectionA.endNodeIndex).toBe(1);
    expect(sectionA.columns?.count ?? 1).toBe(1);

    // Section B: starts AFTER Section A (node index 2 — the table), ends at p2 (node index 3).
    // The table must belong to Section B, not Section A.
    expect(sectionB.startNodeIndex).toBe(2);
    expect(sectionB.endNodeIndex).toBe(3);
    expect(sectionB.columns?.count).toBe(2);

    // Section C (body): starts at node index 4 (p3).
    expect(sectionC.startNodeIndex).toBe(4);
    expect(sectionC.columns?.count ?? 1).toBe(1);
  });
});
