import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseMarks,
  handleStyleChangeMarks,
  handleStyleChangeMarksV2,
  createImportMarks,
  getMarkValue,
  getFontFamilyValue,
  getIndentValue,
  getLineHeightValue,
  getHighLightValue,
  getStrikeValue,
} from './markImporter.js';
import { SuperConverter } from '../../SuperConverter.js';
import { TrackFormatMarkName } from '@extensions/track-changes/constants.js';

const themeDoc = {
  elements: [
    {
      elements: [
        {
          name: 'a:themeElements',
          elements: [
            {
              name: 'a:fontScheme',
              elements: [
                {
                  name: 'a:majorFont',
                  elements: [{ name: 'a:latin', attributes: { typeface: 'ThemeTypeface' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const makeDocx = () => ({ 'word/theme/theme1.xml': themeDoc });

describe('parseMarks', () => {
  let unknownMarks;

  beforeEach(() => {
    unknownMarks = [];
  });

  it('parses known marks, combines textStyle attrs, and tracks unknown marks', () => {
    const property = {
      elements: [
        { name: 'w:b', attributes: { 'w:val': '1' } },
        { name: 'w:color', attributes: { 'w:val': 'FF0000' } },
        { name: 'w:sz', attributes: { 'w:val': 22 } },
        {
          name: 'w:rFonts',
          attributes: { 'w:ascii': 'uiDisplayFallbackFont', 'w:asciiTheme': 'majorAscii' },
        },
        { name: 'w:spacing', attributes: { 'w:line': '360', 'w:lineRule': 'auto' } },
        { name: 'w:spacing', attributes: { 'w:val': '120' } },
        { name: 'w:jc', attributes: { 'w:val': 'center' } },
        { name: 'w:caps', attributes: { 'w:val': '1' } },
        { name: 'w:u', attributes: { 'w:val': 'single' } },
        { name: 'w:highlight', attributes: { 'w:val': 'yellow' } },
        { name: 'w:strike', attributes: { 'w:val': 'true' } },
        { name: 'w:pStyle', attributes: {} },
      ],
    };

    const result = parseMarks(property, unknownMarks, makeDocx());

    const boldMark = result.find((mark) => mark.type === 'bold');
    const underlineMark = result.find((mark) => mark.type === 'underline');
    const highlightMark = result.find((mark) => mark.type === 'highlight');
    const strikeMark = result.find((mark) => mark.type === 'strike');
    const textStyleMark = result.find((mark) => mark.type === 'textStyle');

    expect(boldMark?.attrs).toEqual({ value: '1' });
    expect(underlineMark?.attrs).toEqual({ underlineType: 'single' });
    expect(highlightMark?.attrs).toEqual({ color: '#FFFF00' });
    expect(strikeMark).toBeTruthy();
    expect(textStyleMark?.attrs).toMatchObject({
      color: '#FF0000',
      fontSize: '11pt',
      fontFamily: 'ThemeTypeface, sans-serif',
      lineHeight: '1.5',
      letterSpacing: '6pt',
      textAlign: 'center',
      textTransform: 'uppercase',
    });
    expect(unknownMarks).toContain('w:pStyle');
  });

  it('skips underline marks without a value', () => {
    const property = {
      elements: [{ name: 'w:u', attributes: {} }],
    };

    const result = parseMarks(property, unknownMarks, makeDocx());

    expect(result.some((mark) => mark.type === 'underline')).toBe(false);
  });

  it('skips marks with w:val="0" outside of exceptions', () => {
    const property = {
      elements: [{ name: 'w:color', attributes: { 'w:val': '0' } }],
    };

    const result = parseMarks(property, unknownMarks, makeDocx());

    const textStyleMark = result.find((mark) => mark.type === 'textStyle');
    expect(textStyleMark?.attrs?.color).toBeUndefined();
  });
});

describe('handleStyleChangeMarks', () => {
  it('returns tracking mark with before/after state', () => {
    const currentMarks = [{ type: 'bold', attrs: { value: '1' } }];
    const rPr = {
      elements: [
        {
          name: 'w:rPrChange',
          attributes: {
            'w:id': '1',
            'w:date': '2023-01-01T00:00:00Z',
            'w:author': 'Author',
            'w:authorEmail': 'author@example.com',
          },
          elements: [{ name: 'w:b', attributes: { 'w:val': '0' } }],
        },
      ],
    };

    const result = handleStyleChangeMarks(rPr, currentMarks);

    expect(result).toHaveLength(1);
    const [{ type, attrs }] = result;
    expect(type).toBe(TrackFormatMarkName);
    expect(attrs).toMatchObject({
      id: '1',
      date: '2023-01-01T00:00:00Z',
      author: 'Author',
      authorEmail: 'author@example.com',
    });
    expect(attrs.before.length).toBeGreaterThan(0);
    expect(attrs.after).toEqual(currentMarks);
  });

  it('returns empty array when no style change element is present', () => {
    const result = handleStyleChangeMarks({ elements: [] }, [{ type: 'bold' }]);
    expect(result).toEqual([]);
  });
});

describe('handleStyleChangeMarksV2', () => {
  it('handles empty rPr in rPrChange without throwing', () => {
    const currentMarks = [{ type: 'bold', attrs: { value: true } }];
    const rPrChange = {
      name: 'w:rPrChange',
      attributes: {
        'w:id': '2',
        'w:date': '2024-09-04T09:29:00Z',
        'w:author': 'author@example.com',
      },
      elements: [{ name: 'w:rPr', elements: [] }],
    };

    const result = handleStyleChangeMarksV2(rPrChange, currentMarks, { docx: {} });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(TrackFormatMarkName);
    expect(result[0].attrs.before).toEqual([]);
    expect(result[0].attrs.after).toEqual(currentMarks);
  });

  it('handles missing rPrChange attributes defensively', () => {
    const result = handleStyleChangeMarksV2(
      {
        name: 'w:rPrChange',
        elements: [{ name: 'w:rPr', elements: [] }],
      },
      [],
      { docx: {} },
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(TrackFormatMarkName);
    expect(result[0].attrs.before).toEqual([]);
    expect(result[0].attrs.after).toEqual([]);
  });
});

describe('createImportMarks', () => {
  it('combines multiple textStyle marks into a single mark', () => {
    const marks = [
      { type: 'textStyle', attrs: { color: '#111111' } },
      { type: 'textStyle', attrs: { fontSize: '12pt' } },
      { type: 'bold', attrs: { value: '1' } },
    ];

    const result = createImportMarks(marks);

    expect(result).toEqual([
      { type: 'bold', attrs: { value: '1' } },
      { type: 'textStyle', attrs: { color: '#111111', fontSize: '12pt' } },
    ]);
  });

  it('always returns a textStyle mark even when none are provided', () => {
    const result = createImportMarks([{ type: 'bold', attrs: { value: '1' } }]);
    expect(result.find((mark) => mark.type === 'textStyle')).toBeTruthy();
  });
});

describe('getMarkValue', () => {
  const docx = makeDocx();

  it('maps supported mark types to values', () => {
    expect(getMarkValue('color', { 'w:val': 'ABCDEF' })).toBe('#ABCDEF');
    expect(getMarkValue('fontSize', { 'w:val': 28 })).toBe('14pt');
    expect(getMarkValue('tabs', { 'w:left': 1440 })).toBe('1in');
    expect(getMarkValue('fontFamily', { 'w:ascii': 'Arial', 'w:asciiTheme': 'majorAscii' }, docx)).toBe(
      'ThemeTypeface, sans-serif',
    );
    expect(getMarkValue('lineHeight', { 'w:line': 480, 'w:lineRule': 'auto' })).toBe('2');
    expect(getMarkValue('letterSpacing', { 'w:val': 120 })).toBe('6pt');
    expect(getMarkValue('textAlign', { 'w:val': 'right' })).toBe('right');
    expect(getMarkValue('link', { href: 'https://example.com' })).toBe('https://example.com');
    expect(getMarkValue('underline', { 'w:val': 'double' })).toBe('double');
    expect(getMarkValue('highlight', { 'w:val': 'yellow' })).toBe('#FFFF00');
    expect(getMarkValue('strike', { 'w:val': 'true' })).toBe('1');
    expect(getMarkValue('bold', { 'w:val': '1' })).toBe('1');
    expect(getMarkValue('italic', { 'w:val': '1' })).toBe('1');
  });

  it('returns undefined for unsupported mark types', () => {
    expect(getMarkValue('unknown', { 'w:val': '1' })).toBeUndefined();
  });
});

describe('getFontFamilyValue', () => {
  it('returns theme font when available', () => {
    expect(getFontFamilyValue({ 'w:ascii': 'Arial', 'w:asciiTheme': 'majorAscii' }, makeDocx())).toBe(
      'ThemeTypeface, sans-serif',
    );
  });

  it('falls back to ascii font when theme lookup fails', () => {
    expect(getFontFamilyValue({ 'w:ascii': 'Arial' }, makeDocx())).toBe('Arial, sans-serif');
    expect(getFontFamilyValue({ 'w:ascii': 'Arial', 'w:asciiTheme': 'majorAscii' }, {})).toBe('Arial, sans-serif');
  });
});

describe('getIndentValue', () => {
  it('converts twips to inches when value exists', () => {
    expect(getIndentValue({ 'w:left': 720 })).toBe('0.5in');
  });

  it('returns null when value is missing', () => {
    expect(getIndentValue({})).toBeNull();
  });
});

describe('getLineHeightValue', () => {
  it('returns null for zero or missing line height', () => {
    expect(getLineHeightValue({})).toBeNull();
    expect(getLineHeightValue({ 'w:line': '0' })).toBeNull();
  });

  it('converts exact values to pt', () => {
    expect(getLineHeightValue({ 'w:line': 480, 'w:lineRule': 'exact' })).toBe('24pt');
  });

  it('converts auto values to line multiples', () => {
    expect(getLineHeightValue({ 'w:line': 480, 'w:lineRule': 'auto' })).toBe('2');
  });
});

describe('getHighLightValue', () => {
  it('prefers w:fill when provided and not auto', () => {
    expect(getHighLightValue({ 'w:fill': 'FFEE00' })).toBe('#FFEE00');
  });

  it('uses hex value from w:val when valid', () => {
    expect(getHighLightValue({ 'w:val': '00FF00' })).toBe('#00FF00');
  });

  it('maps docx system colors to hex', () => {
    expect(getHighLightValue({ 'w:val': 'yellow' })).toBe('#FFFF00');
  });
});

describe('getStrikeValue', () => {
  it('returns default enabled state when value missing', () => {
    expect(getStrikeValue({})).toBe('1');
  });

  it('interprets truthy values as enabled', () => {
    expect(getStrikeValue({ 'w:val': 'on' })).toBe('1');
    expect(getStrikeValue({ 'w:val': 'true' })).toBe('1');
  });

  it('returns "0" for falsy values to preserve strike negation', () => {
    expect(getStrikeValue({ 'w:val': 'false' })).toBe('0');
    expect(getStrikeValue({ 'w:val': '0' })).toBe('0');
    expect(getStrikeValue({ 'w:val': 'off' })).toBe('0');
  });
});
