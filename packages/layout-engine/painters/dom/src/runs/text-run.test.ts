import { describe, expect, it } from 'vitest';
import type { TextRun } from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';
import { textRunMergeSignature } from './hash.js';
import { resolveRunText } from './text-run.js';

describe('resolveRunText', () => {
  const context: FragmentRenderContext = {
    pageNumber: 1,
    displayPageNumber: 5,
    pageNumberText: 'v',
    totalPages: 10,
    section: 'body',
  };

  it('uses section-formatted page number text without a local format', () => {
    const run: TextRun = { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 12 };

    expect(resolveRunText(run, context)).toBe('v');
  });

  it('uses run-local page number format when present', () => {
    const run: TextRun = {
      text: '0',
      token: 'pageNumber',
      pageNumberFieldFormat: { format: 'upperRoman' },
      fontFamily: 'Arial',
      fontSize: 12,
    };

    expect(resolveRunText(run, context)).toBe('V');
  });

  it('preserves chapter prefix when applying run-local page number format', () => {
    const run: TextRun = {
      text: '0',
      token: 'pageNumber',
      pageNumberFieldFormat: { format: 'upperRoman' },
      fontFamily: 'Arial',
      fontSize: 12,
    };

    expect(
      resolveRunText(run, {
        ...context,
        pageNumberText: '3:5',
        pageNumberFormat: 'decimal',
        pageNumberChapterText: '3',
        pageNumberChapterSeparator: 'colon',
      }),
    ).toBe('3:V');
  });

  it('uses section page count context for SECTIONPAGES tokens', () => {
    const run: TextRun = { text: '0', token: 'sectionPageCount', fontFamily: 'Arial', fontSize: 12 };

    expect(resolveRunText(run, { ...context, sectionPageCount: 7 })).toBe('7');
  });

  it('preserves cached SECTIONPAGES text when section page count context is missing', () => {
    const run: TextRun = { text: '42', token: 'sectionPageCount', fontFamily: 'Arial', fontSize: 12 };

    expect(resolveRunText(run, context)).toBe('42');
  });

  it('formats SECTIONPAGES tokens with run-local page number format', () => {
    const run: TextRun = {
      text: '0',
      token: 'sectionPageCount',
      pageNumberFieldFormat: { format: 'upperRoman' },
      fontFamily: 'Arial',
      fontSize: 12,
    };

    expect(resolveRunText(run, { ...context, sectionPageCount: 7 })).toBe('VII');
  });
  it('changes merge signature when pageNumberFieldFormat changes', () => {
    const baseRun: TextRun = { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 12 };
    const formattedRun: TextRun = { ...baseRun, pageNumberFieldFormat: { format: 'upperRoman' } };

    expect(textRunMergeSignature(baseRun)).not.toBe(textRunMergeSignature(formattedRun));
  });
});
