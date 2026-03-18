import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@converter/v2/importer/index.js', () => ({
  parseMarks: vi.fn(() => [
    { type: 'textStyle', attrs: { fontSize: '12pt', backgroundColor: '#fff' } },
    { type: 'highlight', attrs: { color: 'yellow' } },
  ]),
}));

vi.mock('@converter/helpers.js', () => ({
  twipsToLines: (n) => Number(n) / 240,
  twipsToPixels: (n) => Number(n) / 10,
}));

vi.mock('@superdoc/common', () => ({
  kebabCase: (s) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase(),
}));

import { getDefaultStyleDefinition } from './get-default-style-definition.js';
import { parseMarks } from '@converter/v2/importer/index.js';

describe('getDefaultStyleDefinition', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns minimal object when no defaultStyleId provided', () => {
    const res = getDefaultStyleDefinition('', {});
    expect(res).toEqual({ lineSpaceBefore: null, lineSpaceAfter: null });
  });

  it('returns minimal object when styles.xml missing', () => {
    const res = getDefaultStyleDefinition('Heading1', {});
    expect(res).toEqual({ lineSpaceBefore: null, lineSpaceAfter: null });
  });

  it('returns minimal object when matching style has no elements', () => {
    const docx = {
      'word/styles.xml': {
        elements: [
          {
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'Heading1' },
              },
            ],
          },
        ],
      },
    };

    const res = getDefaultStyleDefinition('Heading1', docx);

    expect(res).toEqual({ lineSpaceBefore: null, lineSpaceAfter: null });
    expect(parseMarks).not.toHaveBeenCalled();
  });

  it('parses style definition with spacing, indent, flags, and marks', () => {
    const docx = {
      'word/styles.xml': {
        elements: [
          {
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'Heading1' },
                elements: [
                  { name: 'w:name', attributes: { 'w:val': 'Heading 1' } },
                  { name: 'w:qFormat' },
                  { name: 'w:basedOn', attributes: { 'w:val': 'Base' } },
                  {
                    name: 'w:pPr',
                    elements: [
                      { name: 'w:spacing', attributes: { 'w:before': '120', 'w:after': '360', 'w:line': '480' } },
                      { name: 'w:jc', attributes: { 'w:val': 'center' } },
                      { name: 'w:ind', attributes: { 'w:left': '100', 'w:right': '50', 'w:firstLine': '20' } },
                      { name: 'w:keepNext', attributes: {} },
                      { name: 'w:keepLines', attributes: {} },
                      { name: 'w:outlineLvl', attributes: { 'w:val': '2' } },
                      { name: 'w:pageBreakBefore', attributes: {} },
                      { name: 'w:pageBreakAfter', attributes: { 'w:val': '0' } },
                    ],
                  },
                  { name: 'w:rPr', elements: [] },
                ],
              },
            ],
          },
        ],
      },
    };

    const res = getDefaultStyleDefinition('Heading1', docx);
    // attrs
    expect(res.attrs).toEqual({
      name: 'Heading 1',
      qFormat: true,
      keepNext: true,
      keepLines: true,
      outlineLevel: 2,
      pageBreakBefore: true,
      pageBreakAfter: false,
      basedOn: 'Base',
    });

    // styles -> spacing and indent converted, textAlign propagated from justify when indent present
    expect(res.styles.spacing).toEqual({ lineSpaceAfter: 36, lineSpaceBefore: 12, line: 2 });
    expect(res.styles.textAlign).toBe('center');
    expect(res.styles.indent).toEqual({ leftIndent: 10, rightIndent: 5, firstLine: 2 });

    // styles from marks (kebab-cased keys for textStyle)
    expect(parseMarks).toHaveBeenCalled();
    expect(res.styles['font-size']).toBe('12pt');
    expect(res.styles['background-color']).toBe('#fff');
    expect(res.styles.highlight).toEqual({ color: 'yellow' });
  });

  it('parses tab stops from style definition', () => {
    const docx = {
      'word/styles.xml': {
        elements: [
          {
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'TabbedStyle' },
                elements: [
                  {
                    name: 'w:pPr',
                    elements: [
                      {
                        name: 'w:tabs',
                        elements: [
                          { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '720', 'w:leader': 'dot' } },
                          { name: 'w:tab', attributes: { 'w:val': 'right', 'w:pos': '1440' } },
                          { name: 'w:tab', attributes: { 'w:val': 'center', 'w:pos': '2160' } },
                        ],
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

    const res = getDefaultStyleDefinition('TabbedStyle', docx);

    expect(res.styles.tabStops).toEqual([
      { val: 'start', pos: 72, leader: 'dot' },
      { val: 'end', pos: 144, leader: undefined },
      { val: 'center', pos: 216, leader: undefined },
    ]);
  });

  it('handles w:tabs element with no children gracefully', () => {
    const docx = {
      'word/styles.xml': {
        elements: [
          {
            elements: [
              {
                name: 'w:style',
                attributes: { 'w:styleId': 'NoTabsStyle' },
                elements: [
                  {
                    name: 'w:pPr',
                    elements: [
                      {
                        name: 'w:tabs',
                        elements: [],
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

    const res = getDefaultStyleDefinition('NoTabsStyle', docx);

    expect(res.styles.tabStops).toBeNull();
  });
});
