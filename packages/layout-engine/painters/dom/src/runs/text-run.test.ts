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

  it('changes merge signature when pageNumberFieldFormat changes', () => {
    const baseRun: TextRun = { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 12 };
    const formattedRun: TextRun = { ...baseRun, pageNumberFieldFormat: { format: 'upperRoman' } };

    expect(textRunMergeSignature(baseRun)).not.toBe(textRunMergeSignature(formattedRun));
  });
});
