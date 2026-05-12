/**
 * Non-collapse rules — the four spec-correctness invariants the resolver chain
 * must enforce. These tests protect against the kind of axis-collapse that
 * past implementations have fallen into (section RTL inferred to mean paragraph
 * RTL; majority-of-runs heuristic disagreeing with UBA; etc.).
 *
 * If any of these tests fail, a downstream consumer will silently render some
 * documents differently from Word.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveSectionDirection,
  resolveTableDirection,
  resolveCellDirection,
  resolveParagraphDirection,
} from './index.js';

describe('Non-collapse rule 1: section w:bidi MUST NOT make paragraphs RTL', () => {
  // ECMA-376 §17.6.1: section bidi affects section chrome only.

  const rtlSectPr = {
    elements: [{ name: 'w:bidi', attributes: {} }],
  };

  it('section RTL with paragraph having no w:bidi → paragraph inlineDirection is undefined', () => {
    const sectionContext = resolveSectionDirection(rtlSectPr);
    expect(sectionContext.pageDirection).toBe('rtl');

    const paragraphContext = resolveParagraphDirection({}, sectionContext);
    expect(paragraphContext.inlineDirection).toBeUndefined();
  });

  it('section RTL does NOT override an explicit paragraph w:bidi=false', () => {
    const sectionContext = resolveSectionDirection(rtlSectPr);
    const paragraphContext = resolveParagraphDirection({ rightToLeft: false }, sectionContext);
    expect(paragraphContext.inlineDirection).toBe('ltr');
  });

  it('section RTL still produces RTL pageDirection for chrome consumers', () => {
    const sectionContext = resolveSectionDirection(rtlSectPr);
    expect(sectionContext.pageDirection).toBe('rtl');
  });
});

describe('Non-collapse rule 2: table w:bidiVisual MUST NOT make cell paragraphs RTL', () => {
  // ECMA-376 §17.4.1: bidiVisual affects cell ordering and table-level properties only.

  it('table visual RTL with cell having no w:textDirection inherits writing mode only', () => {
    const sectionContext = resolveSectionDirection(undefined);
    // The resolved TableProperties type uses `rightToLeft` (matching the
    // style-engine convention from the existing importer).
    const tableContext = resolveTableDirection({ rightToLeft: true }, sectionContext);
    expect(tableContext.visualDirection).toBe('rtl');

    const cellContext = resolveCellDirection(undefined, tableContext);
    expect(cellContext.writingMode).toBe('horizontal-tb');
  });

  it('table visual RTL accepts the OOXML-shaped bidiVisual alias too', () => {
    // Callers that read raw w:tblPr without going through the style-engine
    // may know it as bidiVisual; both should work.
    const sectionContext = resolveSectionDirection(undefined);
    const tableContext = resolveTableDirection({ bidiVisual: true }, sectionContext);
    expect(tableContext.visualDirection).toBe('rtl');
  });

  it('cell paragraph in visually-RTL table with no w:bidi → inlineDirection is undefined', () => {
    const sectionContext = resolveSectionDirection(undefined);
    const tableContext = resolveTableDirection({ rightToLeft: true }, sectionContext);
    const cellContext = resolveCellDirection(undefined, tableContext);
    const paragraphContext = resolveParagraphDirection({}, sectionContext, cellContext);
    expect(paragraphContext.inlineDirection).toBeUndefined();
  });
});

describe('Non-collapse rule 3: run-level w:rtl MUST NOT bubble up to paragraph', () => {
  // The resolver does not look at runs at all when computing paragraph inline
  // direction. The paragraph w:bidi (or its style cascade) is the only signal.

  it('paragraph with no w:bidi: inlineDirection stays undefined regardless of run content', () => {
    const sectionContext = resolveSectionDirection(undefined);
    const paragraphContext = resolveParagraphDirection({}, sectionContext);
    expect(paragraphContext.inlineDirection).toBeUndefined();
  });

  it('paragraph signature only takes pPr-shaped properties, not run content', () => {
    // Compile-time guarantee: resolveParagraphDirection's signature has no
    // parameter for runs or run properties. This test documents that intent.
    expect(resolveParagraphDirection).toHaveLength(3); // (pPr, section, cell?)
  });
});

describe('Non-collapse rule 4: paragraph w:bidi DOES produce paragraph RTL', () => {
  // The positive case — the one cascade step we DO apply.

  it('explicit paragraph w:bidi=true → inlineDirection RTL', () => {
    const sectionContext = resolveSectionDirection(undefined);
    const paragraphContext = resolveParagraphDirection({ rightToLeft: true }, sectionContext);
    expect(paragraphContext.inlineDirection).toBe('rtl');
  });

  it('docDefaults RTL flows through style cascade into paragraphProperties.rightToLeft', () => {
    // The style-engine cascade resolves docDefaults/pPrDefault/pPr/bidi into
    // paragraphProperties.rightToLeft BEFORE this resolver runs. So a paragraph
    // that inherits RTL from docDefaults arrives here with rightToLeft: true.
    const sectionContext = resolveSectionDirection(undefined);
    const paragraphContext = resolveParagraphDirection({ rightToLeft: true }, sectionContext);
    expect(paragraphContext.inlineDirection).toBe('rtl');
  });
});

describe('Writing mode IS the one inheriting axis (§17.3.1.41)', () => {
  it('paragraph without textDirection inherits writing mode from section', () => {
    const sectPr = {
      elements: [{ name: 'w:textDirection', attributes: { 'w:val': 'tbRl' } }],
    };
    const sectionContext = resolveSectionDirection(sectPr);
    expect(sectionContext.writingMode).toBe('vertical-rl');

    const paragraphContext = resolveParagraphDirection({}, sectionContext);
    expect(paragraphContext.writingMode).toBe('vertical-rl');
  });

  it('paragraph textDirection overrides inherited writing mode', () => {
    const sectPr = {
      elements: [{ name: 'w:textDirection', attributes: { 'w:val': 'tbRl' } }],
    };
    const sectionContext = resolveSectionDirection(sectPr);
    const paragraphContext = resolveParagraphDirection({ textDirection: 'lrTb' }, sectionContext);
    expect(paragraphContext.writingMode).toBe('horizontal-tb');
  });

  it('cell writing mode overrides section default but not paragraph override', () => {
    const sectionContext = resolveSectionDirection(undefined);
    const tableContext = resolveTableDirection(undefined, sectionContext);
    const cellContext = resolveCellDirection({ textDirection: 'tbRl' }, tableContext);
    expect(cellContext.writingMode).toBe('vertical-rl');

    // Paragraph in that cell with no override inherits from cell.
    const paragraphInherit = resolveParagraphDirection({}, sectionContext, cellContext);
    expect(paragraphInherit.writingMode).toBe('vertical-rl');

    // Paragraph in that cell with override wins.
    const paragraphOverride = resolveParagraphDirection({ textDirection: 'lrTb' }, sectionContext, cellContext);
    expect(paragraphOverride.writingMode).toBe('horizontal-tb');
  });

  // ECMA §17.18.93 lists 12 textDirection values. The V-suffix variants are glyph
  // rotation, not line direction. CSS writing-mode can't express the rotation, so
  // V variants share the writing-mode of their non-V sibling. The repo's
  // ST_TEXT_DIRECTION contract publishes lrTbV and tbRlV as accepted values, so
  // dropping them silently is a contract violation.
  describe('all ST_TextDirection values are mapped (paragraph, section, cell)', () => {
    const cases: Array<[string, 'horizontal-tb' | 'vertical-rl' | 'vertical-lr']> = [
      ['lrTb', 'horizontal-tb'],
      ['lrTbV', 'horizontal-tb'],
      ['tb', 'horizontal-tb'],
      ['tbV', 'horizontal-tb'],
      ['tbRl', 'vertical-rl'],
      ['tbRlV', 'vertical-rl'],
      ['rl', 'vertical-rl'],
      ['rlV', 'vertical-rl'],
      ['btLr', 'vertical-lr'],
      ['lr', 'vertical-lr'],
      ['lrV', 'vertical-lr'],
      ['tbLrV', 'vertical-lr'],
    ];

    for (const [val, expected] of cases) {
      it(`maps ${val} -> ${expected} on paragraph, section, and cell`, () => {
        const sectionContext = resolveSectionDirection({
          elements: [{ name: 'w:textDirection', attributes: { 'w:val': val } }],
        });
        expect(sectionContext.writingMode).toBe(expected);

        const tableContext = resolveTableDirection(undefined, sectionContext);
        const cellContext = resolveCellDirection({ textDirection: val }, tableContext);
        expect(cellContext.writingMode).toBe(expected);

        const paragraphContext = resolveParagraphDirection({ textDirection: val }, sectionContext);
        expect(paragraphContext.writingMode).toBe(expected);
      });
    }
  });
});
