import { describe, expect, it, beforeEach, vi } from 'vitest';
import { hydrateTableStyleAttrs } from './table-styles.js';
import type { PMNode } from '../types.js';
import * as tblTranslator from '@superdoc/super-editor/converter/internal/v3/handlers/w/tbl/tbl-translator.js';

// Mock the external super-converter module that's imported by table-styles.ts
// This module is part of super-editor package and not available in pm-adapter tests
vi.mock('@superdoc/super-editor/converter/internal/v3/handlers/w/tbl/tbl-translator.js');

describe('hydrateTableStyleAttrs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates from tableProperties even without converter context', () => {
    const table = {
      attrs: {
        tableProperties: {
          cellMargins: {
            marginLeft: { value: 108, type: 'dxa' },
            top: { value: 12, type: 'px' },
          },
          tableWidth: { value: 1440, type: 'dxa' },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, undefined);
    expect(result?.cellPadding?.left).toBeCloseTo((108 / 1440) * 96);
    expect(result?.cellPadding?.top).toBe(12);
    expect(result?.tableWidth).toEqual({ width: 96, type: 'px' });
  });

  it('merges referenced styles when context available', () => {
    vi.mocked(tblTranslator._getReferencedTableStyles).mockReturnValue({
      borders: { top: { val: 'single', size: 8 } },
      cellMargins: { left: { value: 72, type: 'dxa' } },
      justification: 'center',
    });

    const table = {
      attrs: {
        tableStyleId: 'TableGrid',
        tableProperties: {
          tableWidth: { value: 500, type: 'px' },
        },
      },
    } as unknown as PMNode;

    const result = hydrateTableStyleAttrs(table, { docx: {} });
    expect(result?.borders).toEqual({ top: { val: 'single', size: 8 } });
    expect(result?.justification).toBe('center');
    expect(result?.cellPadding?.left).toBeCloseTo((72 / 1440) * 96);
    expect(result?.tableWidth).toEqual({ width: 500, type: 'px' });
  });

  describe('extractTableStyleParagraphProps (via hydrateTableStyleAttrs)', () => {
    it('extracts spacing with all attributes (before, after, line, lineRule)', () => {
      const mockDocx = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableNormal' },
                  elements: [
                    {
                      name: 'w:pPr',
                      elements: [
                        {
                          name: 'w:spacing',
                          attributes: {
                            'w:before': '120',
                            'w:after': '240',
                            'w:line': '276',
                            'w:lineRule': 'auto',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const table = {
        attrs: {
          tableStyleId: 'TableNormal',
        },
      } as unknown as PMNode;

      const result = hydrateTableStyleAttrs(table, { docx: mockDocx });
      expect(result?.paragraphProps).toBeDefined();
      expect(result?.paragraphProps?.spacing?.before).toBeCloseTo((120 / 1440) * 96);
      expect(result?.paragraphProps?.spacing?.after).toBeCloseTo((240 / 1440) * 96);
      // For 'auto' lineRule, line is in 240ths: 276/240 = 1.15
      expect(result?.paragraphProps?.spacing?.line).toBeCloseTo(1.3225);
      expect(result?.paragraphProps?.spacing?.lineRule).toBe('auto');
    });

    it('extracts spacing with partial attributes (only before/after)', () => {
      const mockDocx = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableGrid' },
                  elements: [
                    {
                      name: 'w:pPr',
                      elements: [
                        {
                          name: 'w:spacing',
                          attributes: {
                            'w:before': '100',
                            'w:after': '100',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const table = {
        attrs: {
          tableStyleId: 'TableGrid',
        },
      } as unknown as PMNode;

      const result = hydrateTableStyleAttrs(table, { docx: mockDocx });
      expect(result?.paragraphProps).toBeDefined();
      expect(result?.paragraphProps?.spacing?.before).toBeCloseTo((100 / 1440) * 96);
      expect(result?.paragraphProps?.spacing?.after).toBeCloseTo((100 / 1440) * 96);
      expect(result?.paragraphProps?.spacing?.line).toBeUndefined();
      expect(result?.paragraphProps?.spacing?.lineRule).toBeUndefined();
    });

    it('handles different lineRule values (exact and atLeast use twipsToPx)', () => {
      const mockDocxExact = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableExact' },
                  elements: [
                    {
                      name: 'w:pPr',
                      elements: [
                        {
                          name: 'w:spacing',
                          attributes: {
                            'w:line': '240',
                            'w:lineRule': 'exact',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const tableExact = {
        attrs: {
          tableStyleId: 'TableExact',
        },
      } as unknown as PMNode;

      const resultExact = hydrateTableStyleAttrs(tableExact, { docx: mockDocxExact });
      // For 'exact' lineRule, use twipsToPx: (240/1440)*96 = 16
      expect(resultExact?.paragraphProps?.spacing?.line).toBeCloseTo(16);
      expect(resultExact?.paragraphProps?.spacing?.lineUnit).toBe('px');
      expect(resultExact?.paragraphProps?.spacing?.lineRule).toBe('exact');

      const mockDocxAtLeast = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableAtLeast' },
                  elements: [
                    {
                      name: 'w:pPr',
                      elements: [
                        {
                          name: 'w:spacing',
                          attributes: {
                            'w:line': '360',
                            'w:lineRule': 'atLeast',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const tableAtLeast = {
        attrs: {
          tableStyleId: 'TableAtLeast',
        },
      } as unknown as PMNode;

      const resultAtLeast = hydrateTableStyleAttrs(tableAtLeast, { docx: mockDocxAtLeast });
      // For 'atLeast' lineRule, use twipsToPx: (360/1440)*96 = 24
      expect(resultAtLeast?.paragraphProps?.spacing?.line).toBeCloseTo(24);
      expect(resultAtLeast?.paragraphProps?.spacing?.lineRule).toBe('atLeast');
    });

    it('returns undefined when style not found', () => {
      const mockDocx = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'OtherStyle' },
                  elements: [],
                },
              ],
            },
          ],
        },
      };

      const table = {
        attrs: {
          tableStyleId: 'NonExistentStyle',
        },
      } as unknown as PMNode;

      const result = hydrateTableStyleAttrs(table, { docx: mockDocx });
      expect(result?.paragraphProps).toBeUndefined();
    });

    it('returns undefined when style has no w:pPr', () => {
      const mockDocx = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableNoPPr' },
                  elements: [
                    {
                      name: 'w:tblPr',
                      elements: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const table = {
        attrs: {
          tableStyleId: 'TableNoPPr',
        },
      } as unknown as PMNode;

      const result = hydrateTableStyleAttrs(table, { docx: mockDocx });
      expect(result?.paragraphProps).toBeUndefined();
    });

    it('returns undefined when w:pPr has no w:spacing', () => {
      const mockDocx = {
        'word/styles.xml': {
          elements: [
            {
              elements: [
                {
                  name: 'w:style',
                  attributes: { 'w:styleId': 'TableNoSpacing' },
                  elements: [
                    {
                      name: 'w:pPr',
                      elements: [
                        {
                          name: 'w:ind',
                          attributes: { 'w:left': '120' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const table = {
        attrs: {
          tableStyleId: 'TableNoSpacing',
        },
      } as unknown as PMNode;

      const result = hydrateTableStyleAttrs(table, { docx: mockDocx });
      expect(result?.paragraphProps).toBeUndefined();
    });

    it('gracefully handles malformed/missing XML structure', () => {
      const mockDocxMalformed1 = {
        'word/styles.xml': {
          elements: [],
        },
      };

      const table1 = {
        attrs: {
          tableStyleId: 'TableGrid',
        },
      } as unknown as PMNode;

      const result1 = hydrateTableStyleAttrs(table1, { docx: mockDocxMalformed1 });
      expect(result1?.paragraphProps).toBeUndefined();

      const mockDocxMalformed2 = {
        'word/styles.xml': undefined,
      };

      const table2 = {
        attrs: {
          tableStyleId: 'TableGrid',
        },
      } as unknown as PMNode;

      const result2 = hydrateTableStyleAttrs(table2, { docx: mockDocxMalformed2 });
      expect(result2?.paragraphProps).toBeUndefined();

      const mockDocxMalformed3 = {};

      const table3 = {
        attrs: {
          tableStyleId: 'TableGrid',
        },
      } as unknown as PMNode;

      const result3 = hydrateTableStyleAttrs(table3, { docx: mockDocxMalformed3 });
      expect(result3?.paragraphProps).toBeUndefined();
    });
  });
});
