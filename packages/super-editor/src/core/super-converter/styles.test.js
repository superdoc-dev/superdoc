import { describe, it, expect, vi, beforeAll } from 'vitest';
import { encodeMarksFromRPr, decodeRPrFromMarks, encodeCSSFromRPr, encodeCSSFromPPr } from './styles.js';

beforeAll(() => {
  vi.stubGlobal('SuperConverter', {
    toCssFontFamily: (font) => font,
  });
});

describe('encodeMarksFromRPr', () => {
  it('should encode bold, italic, and strike properties', () => {
    const rPr = { bold: true, italic: true, strike: true };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toEqual(
      expect.arrayContaining([
        { type: 'bold', attrs: { value: true } },
        { type: 'italic', attrs: { value: true } },
        { type: 'strike', attrs: { value: true } },
      ]),
    );
  });

  it('should encode color and fontSize', () => {
    const rPr = { color: { val: 'FF0000' }, fontSize: 24 };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { color: '#FF0000', fontSize: '12pt' },
    });
  });

  it('should encode underline', () => {
    const rPr = { underline: { 'w:val': 'single', 'w:color': 'auto' } };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'underline',
      attrs: { underlineType: 'single', underlineColor: 'auto' },
    });
  });

  it('should encode highlight from w:highlight', () => {
    const rPr = { highlight: { 'w:val': 'yellow' } };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'highlight',
      attrs: { color: '#FFFF00' },
    });
  });

  it('should encode highlight from w:shd', () => {
    const rPr = { shading: { fill: 'FFA500' } };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'highlight',
      attrs: { color: '#FFA500' },
    });
  });

  it('should encode fontFamily', () => {
    const rPr = { fontFamily: { 'w:ascii': 'Arial' } };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { fontFamily: 'Arial, sans-serif' },
    });
  });

  it('should encode textTransform', () => {
    const rPr = { textTransform: 'uppercase' };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { textTransform: 'uppercase' },
    });
  });

  it('encodes vertical alignment and position into textStyle', () => {
    const rPr = { vertAlign: 'subscript', position: 4 };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { vertAlign: 'subscript', position: '2pt' },
    });
  });
});

describe('encodeCSSFromRPr', () => {
  it('should encode basic font toggles', () => {
    const css = encodeCSSFromRPr({ bold: true, italic: false, strike: true }, {});
    expect(css).toMatchObject({
      'font-weight': 'bold',
      'font-style': 'normal',
      'text-decoration-line': 'line-through',
    });
    expect(css).not.toHaveProperty('text-decoration');
  });

  it('should encode underline styles and merge strike decorations', () => {
    const css = encodeCSSFromRPr({ underline: { 'w:val': 'double', 'w:color': 'FF0000' }, strike: true }, {});
    expect(css).toMatchObject({
      'text-decoration-style': 'double',
      'text-decoration-color': '#FF0000',
    });
    expect(css['text-decoration-line'].split(' ').sort()).toEqual(['line-through', 'underline'].sort());
  });

  it('should encode highlight without overriding explicit text color', () => {
    const css = encodeCSSFromRPr({ color: { val: 'FF0000' }, highlight: { 'w:val': 'yellow' } }, {});
    expect(css).toMatchObject({
      color: '#FF0000',
      'background-color': '#FFFF00',
    });
  });

  it('should encode font size and letter spacing', () => {
    const css = encodeCSSFromRPr({ fontSize: 24, letterSpacing: 240 }, {});
    expect(css).toMatchObject({
      'font-size': '12pt',
      'letter-spacing': '12pt',
    });
  });

  it('should encode font family using converter fallbacks', () => {
    const css = encodeCSSFromRPr({ fontFamily: { 'w:ascii': 'Arial' } }, {});
    expect(css['font-family']).toBe('Arial, sans-serif');
  });

  it('applies vertical-align and scaling for superscript/subscript', () => {
    const css = encodeCSSFromRPr({ vertAlign: 'superscript', fontSize: 20 }, {});
    expect(css['vertical-align']).toBe('super');
    expect(css['font-size']).toBe('6.5pt'); // 20 half-points = 10pt; scaled 65%
  });

  it('uses numeric position when provided', () => {
    const css = encodeCSSFromRPr({ position: 4 }, {});
    expect(css['vertical-align']).toBe('2pt');
  });
});

describe('decodeRPrFromMarks', () => {
  it('decodes vertAlign and position from textStyle mark', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { vertAlign: 'subscript', position: '1.5pt' } }];
    expect(decodeRPrFromMarks(marks)).toMatchObject({ vertAlign: 'subscript', position: 3 });
  });

  it('does not write debug output while decoding marks', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      decodeRPrFromMarks([{ type: { name: 'bold' }, attrs: { value: true } }]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('encodeMarksFromRPr - vertAlign/position edge cases', () => {
  it('handles null vertAlign gracefully', () => {
    const rPr = { vertAlign: null };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.vertAlign).toBeUndefined();
  });

  it('handles undefined vertAlign gracefully', () => {
    const rPr = { vertAlign: undefined };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.vertAlign).toBeUndefined();
  });

  it('handles null position gracefully', () => {
    const rPr = { position: null };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.position).toBeUndefined();
  });

  it('handles undefined position gracefully', () => {
    const rPr = { position: undefined };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.position).toBeUndefined();
  });

  it('handles NaN position gracefully', () => {
    const rPr = { position: NaN };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.position).toBeUndefined();
  });

  it('handles Infinity position gracefully', () => {
    const rPr = { position: Infinity };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.position).toBeUndefined();
  });

  it('handles negative Infinity position gracefully', () => {
    const rPr = { position: -Infinity };
    const marks = encodeMarksFromRPr(rPr, {});
    const textStyleMark = marks.find((m) => m.type === 'textStyle');
    expect(textStyleMark?.attrs?.position).toBeUndefined();
  });

  it('handles negative position values correctly', () => {
    const rPr = { position: -4 };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { position: '-2pt' },
    });
  });

  it('handles zero position value', () => {
    const rPr = { position: 0 };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { position: '0pt' },
    });
  });

  it('handles both vertAlign and position set together', () => {
    const rPr = { vertAlign: 'superscript', position: 4 };
    const marks = encodeMarksFromRPr(rPr, {});
    expect(marks).toContainEqual({
      type: 'textStyle',
      attrs: { vertAlign: 'superscript', position: '2pt' },
    });
  });
});

describe('encodeCSSFromRPr - vertAlign/position edge cases', () => {
  it('handles null vertAlign gracefully', () => {
    const css = encodeCSSFromRPr({ vertAlign: null }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles undefined vertAlign gracefully', () => {
    const css = encodeCSSFromRPr({ vertAlign: undefined }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles null position gracefully', () => {
    const css = encodeCSSFromRPr({ position: null }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles undefined position gracefully', () => {
    const css = encodeCSSFromRPr({ position: undefined }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles NaN position gracefully', () => {
    const css = encodeCSSFromRPr({ position: NaN }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles Infinity position gracefully', () => {
    const css = encodeCSSFromRPr({ position: Infinity }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles negative Infinity position gracefully', () => {
    const css = encodeCSSFromRPr({ position: -Infinity }, {});
    expect(css['vertical-align']).toBeUndefined();
  });

  it('handles negative position values correctly', () => {
    const css = encodeCSSFromRPr({ position: -4 }, {});
    expect(css['vertical-align']).toBe('-2pt');
  });

  it('handles zero position value', () => {
    const css = encodeCSSFromRPr({ position: 0 }, {});
    expect(css['vertical-align']).toBe('0pt');
  });

  it('position takes precedence over vertAlign when both are set', () => {
    const css = encodeCSSFromRPr({ vertAlign: 'superscript', position: 4 }, {});
    expect(css['vertical-align']).toBe('2pt');
    expect(css['font-size']).toBeUndefined();
  });
});

describe('decodeRPrFromMarks - vertAlign/position edge cases', () => {
  it('handles null vertAlign gracefully', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { vertAlign: null } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.vertAlign).toBeUndefined();
  });

  it('handles null position gracefully', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { position: null } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.position).toBeUndefined();
  });

  it('handles invalid position string gracefully', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { position: 'invalid' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.position).toBeUndefined();
  });

  it('handles negative position values correctly', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { position: '-2pt' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.position).toBe(-4);
  });

  it('handles zero position value', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { position: '0pt' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.position).toBe(0);
  });

  it('handles both vertAlign and position set together', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { vertAlign: 'subscript', position: '2pt' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr.vertAlign).toBe('subscript');
    expect(rPr.position).toBe(4);
  });
});

describe('encodeCSSFromPPr', () => {
  it('converts spacing, indentation, and justification to CSS declarations', () => {
    const css = encodeCSSFromPPr({
      spacing: { before: 180, after: 120, line: 480, lineRule: 'auto' },
      indent: { left: 720, right: 1440, firstLine: 360 },
      justification: 'both',
    });

    expect(css).toMatchObject({
      'margin-top': '12px',
      'margin-bottom': '8px',
      'line-height': '2',
      'margin-left': '48px',
      'margin-right': '96px',
      'text-indent': '24px',
      'text-align': 'justify',
    });
  });

  it('forces drop caps to use single-line spacing regardless of provided spacing', () => {
    const cssWithoutFrame = encodeCSSFromPPr({
      spacing: { before: 0, after: 0, line: 720, lineRule: 'exact' },
    });
    const cssWithFrame = encodeCSSFromPPr({
      spacing: { before: 0, after: 0, line: 720, lineRule: 'exact' },
      framePr: { dropCap: 'drop' },
    });

    expect(cssWithoutFrame['line-height']).toBe('3');
    expect(cssWithFrame['line-height']).toBe('1');
  });

  it('keeps autospacing margins unless suppressed for list items', () => {
    const spacing = {
      before: 120,
      after: 120,
      line: 240,
      lineRule: 'auto',
      beforeAutospacing: true,
      afterAutospacing: true,
    };

    const css = encodeCSSFromPPr({ spacing });
    expect(css['margin-top']).toBe('8px');
    expect(css['margin-bottom']).toBe('8px');

    const listCss = encodeCSSFromPPr({
      spacing,
      numberingProperties: { numId: 1, ilvl: 0 },
    });
    expect(listCss['margin-top']).toBeUndefined();
    expect(listCss['margin-bottom']).toBeUndefined();
  });

  it('translates borders to CSS including padding for bottom space', () => {
    const css = encodeCSSFromPPr({
      borders: {
        top: { val: 'none' },
        bottom: { val: 'single', size: 8, color: 'FF0000', space: 16 },
      },
    });

    expect(css['border-top']).toBe('none');
    expect(css['border-bottom']).toContain('#FF0000');
    expect(css['border-bottom']).toContain('solid');
    expect(parseFloat(css['border-bottom'])).toBeCloseTo(1.333, 3);
    expect(parseFloat(css['padding-bottom'])).toBeCloseTo(2.6666, 3);
  });
});

describe('decodeRPrFromMarks', () => {
  it('should decode bold, italic, and strike marks', () => {
    const marks = [
      { type: 'bold', attrs: { value: true } },
      { type: 'italic', attrs: { value: true } },
      { type: 'strike', attrs: { value: true } },
    ];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ bold: true, italic: true, strike: true });
  });

  it('should decode textStyle marks for color and fontSize', () => {
    const marks = [{ type: 'textStyle', attrs: { color: '#FF0000', fontSize: '12pt' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ color: { val: 'FF0000' }, fontSize: 24 });
  });

  it('should decode underline marks', () => {
    const marks = [{ type: 'underline', attrs: { underlineType: 'single', underlineColor: '#FF0000' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ underline: { 'w:val': 'single', 'w:color': 'FF0000' } });
  });

  it('should decode highlight marks', () => {
    const marks = [{ type: 'highlight', attrs: { color: '#FFFF00' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ highlight: { 'w:val': '#FFFF00' } });
  });

  it('should decode textStyle with fontFamily', () => {
    const marks = [{ type: 'textStyle', attrs: { fontFamily: 'Arial, sans-serif' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({
      fontFamily: {
        ascii: 'Arial',
        cs: 'Arial',
        eastAsia: 'Arial',
        hAnsi: 'Arial',
      },
    });
  });

  it('should decode textStyle with textTransform', () => {
    const marks = [{ type: 'textStyle', attrs: { textTransform: 'uppercase' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ textTransform: 'uppercase' });
  });

  it('should decode link mark into Hyperlink styleId', () => {
    const marks = [{ type: 'link', attrs: { href: 'https://example.com' } }];
    const rPr = decodeRPrFromMarks(marks);
    expect(rPr).toEqual({ styleId: 'Hyperlink' });
  });
});

describe('marks encoding/decoding round-trip', () => {
  it('should correctly round-trip basic properties', () => {
    const initialRPr = {
      bold: true,
      italic: true,
      strike: true,
      underline: { 'w:val': 'single', 'w:color': 'auto' },
      color: { val: 'FF0000' },
      fontSize: 28,
      letterSpacing: 20,
    };

    const marks = encodeMarksFromRPr(initialRPr, {});
    const finalRPr = decodeRPrFromMarks(marks);

    expect(finalRPr).toEqual(initialRPr);
  });

  it('should round-trip fontFamily for simple symmetric cases', () => {
    const initialRPr = { fontFamily: { 'w:ascii': 'Arial', 'w:hAnsi': 'Arial' } };
    const marks = encodeMarksFromRPr(initialRPr, {});
    const finalRPr = decodeRPrFromMarks(marks);
    expect(finalRPr).toEqual({
      fontFamily: {
        ascii: 'Arial',
        cs: 'Arial',
        eastAsia: 'Arial',
        hAnsi: 'Arial',
      },
    });
  });

  it('should round-trip highlight to a consistent format', () => {
    const rPrHighlight = { highlight: { 'w:val': 'yellow' } };
    const marks1 = encodeMarksFromRPr(rPrHighlight, {});
    const finalRPr1 = decodeRPrFromMarks(marks1);
    expect(finalRPr1).toEqual({ highlight: { 'w:val': '#FFFF00' } });

    const rPrShading = { shading: { fill: 'FFA500' } };
    const marks2 = encodeMarksFromRPr(rPrShading, {});
    const finalRPr2 = decodeRPrFromMarks(marks2);
    expect(finalRPr2).toEqual({ highlight: { 'w:val': '#FFA500' } });
  });

  it('should show asymmetry in textTransform/caps round-trip', () => {
    const rPrTextTransform = { textTransform: 'uppercase' };
    const marks = encodeMarksFromRPr(rPrTextTransform, {});
    const finalRPr = decodeRPrFromMarks(marks);
    expect(finalRPr).toEqual({ textTransform: 'uppercase' });

    // and the other way
    const rPrCaps = { caps: true };
    const marksFromCaps = encodeMarksFromRPr(rPrCaps, {});
    // encodeMarksFromRPr doesn't handle 'caps', so it produces no textTransform mark.
    expect(marksFromCaps.some((m) => m.type === 'textStyle' && m.attrs.textTransform)).toBe(false);
  });
});
