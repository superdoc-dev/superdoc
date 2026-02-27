import { describe, expect, it } from 'vitest';
import { parseAttrs } from './parseAttrs.js';

/**
 * Creates a minimal mock DOM element with the given attributes and inline styles.
 */
function createMockNode(attributes = {}, styles = {}) {
  return {
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    style: styles,
  };
}

describe('parseAttrs', () => {
  describe('data-attribute parsing (existing behavior)', () => {
    it('parses data-spacing JSON attribute', () => {
      const node = createMockNode({
        'data-spacing': JSON.stringify({ line: 360, lineRule: 'auto', before: 120, after: 80 }),
      });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing).toEqual({
        line: 360,
        lineRule: 'auto',
        before: 120,
        after: 80,
      });
    });

    it('parses data-indent JSON attribute', () => {
      const node = createMockNode({
        'data-indent': JSON.stringify({ left: 720, right: 360 }),
      });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.indent).toEqual({ left: 720, right: 360 });
    });

    it('data-spacing takes priority over CSS inline styles', () => {
      const node = createMockNode(
        { 'data-spacing': JSON.stringify({ line: 360, before: 100 }) },
        { lineHeight: '2.0', marginTop: '12pt', marginBottom: '6pt' },
      );
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing.line).toBe(360);
      expect(result.paragraphProperties.spacing.before).toBe(100);
      // CSS values should NOT override data attributes
      expect(result.paragraphProperties.spacing.after).toBeUndefined();
    });

    it('data-indent takes priority over CSS inline styles', () => {
      const node = createMockNode({ 'data-indent': JSON.stringify({ left: 720 }) }, { marginLeft: '72pt' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.indent.left).toBe(720);
    });
  });

  describe('CSS inline style fallback (Google Docs paste)', () => {
    it('extracts line spacing from lineHeight multiplier', () => {
      const node = createMockNode({}, { lineHeight: '1.5' });
      const result = parseAttrs(node);
      // Expected: round((1.5 * 240) / 1.15) = round(313.04) = 313
      expect(result.paragraphProperties.spacing.line).toBe(Math.round((1.5 * 240) / 1.15));
      expect(result.paragraphProperties.spacing.lineRule).toBe('auto');
    });

    it('extracts single line spacing (1.0)', () => {
      const node = createMockNode({}, { lineHeight: '1.0' });
      const result = parseAttrs(node);
      // Expected: round((1.0 * 240) / 1.15) = round(208.7) = 209
      expect(result.paragraphProperties.spacing.line).toBe(Math.round((1.0 * 240) / 1.15));
    });

    it('extracts double line spacing (2.0)', () => {
      const node = createMockNode({}, { lineHeight: '2.0' });
      const result = parseAttrs(node);
      // Expected: round((2.0 * 240) / 1.15) = round(417.39) = 417
      expect(result.paragraphProperties.spacing.line).toBe(Math.round((2.0 * 240) / 1.15));
    });

    it('extracts marginTop as spacing before (pt)', () => {
      const node = createMockNode({}, { marginTop: '12pt' });
      const result = parseAttrs(node);
      // 12pt * 20 = 240 twips
      expect(result.paragraphProperties.spacing.before).toBe(240);
    });

    it('extracts marginBottom as spacing after (pt)', () => {
      const node = createMockNode({}, { marginBottom: '6pt' });
      const result = parseAttrs(node);
      // 6pt * 20 = 120 twips
      expect(result.paragraphProperties.spacing.after).toBe(120);
    });

    it('extracts marginTop in px and converts to twips', () => {
      const node = createMockNode({}, { marginTop: '16px' });
      const result = parseAttrs(node);
      // 16px / 1.333 = ~12pt, * 20 = ~240 twips
      const expectedPt = 16 * 72 / 96;
      expect(result.paragraphProperties.spacing.before).toBe(Math.round(expectedPt * 20));
    });

    it('extracts marginLeft as indent left (pt)', () => {
      const node = createMockNode({}, { marginLeft: '36pt' });
      const result = parseAttrs(node);
      // 36pt * 20 = 720 twips
      expect(result.paragraphProperties.indent.left).toBe(720);
    });

    it('extracts marginLeft in px and converts to twips', () => {
      const node = createMockNode({}, { marginLeft: '48px' });
      const result = parseAttrs(node);
      const expectedPt = 48 * 72 / 96;
      expect(result.paragraphProperties.indent.left).toBe(Math.round(expectedPt * 20));
    });

    it('combines spacing and indent from CSS', () => {
      const node = createMockNode({}, { lineHeight: '1.5', marginTop: '8pt', marginBottom: '4pt', marginLeft: '36pt' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing.line).toBe(Math.round((1.5 * 240) / 1.15));
      expect(result.paragraphProperties.spacing.before).toBe(160);
      expect(result.paragraphProperties.spacing.after).toBe(80);
      expect(result.paragraphProperties.indent.left).toBe(720);
    });

    it('converts percentage lineHeight to multiplier', () => {
      const node = createMockNode({}, { lineHeight: '115%' });
      const result = parseAttrs(node);
      // 115% → 1.15 multiplier → round((1.15 * 240) / 1.15) = 240
      expect(result.paragraphProperties.spacing.line).toBe(Math.round(((115 / 100) * 240) / 1.15));
      expect(result.paragraphProperties.spacing.lineRule).toBe('auto');
    });

    it('converts px lineHeight to exact twips', () => {
      const node = createMockNode({}, { lineHeight: '24px' });
      const result = parseAttrs(node);
      // 24px / 1.333 ≈ 18pt, * 20 = 360 twips
      expect(result.paragraphProperties.spacing.line).toBe(Math.round((24 * 72 / 96) * 20));
      expect(result.paragraphProperties.spacing.lineRule).toBe('exact');
    });

    it('converts pt lineHeight to exact twips', () => {
      const node = createMockNode({}, { lineHeight: '18pt' });
      const result = parseAttrs(node);
      // 18pt * 20 = 360 twips
      expect(result.paragraphProperties.spacing.line).toBe(360);
      expect(result.paragraphProperties.spacing.lineRule).toBe('exact');
    });

    it('converts inch margins to twips', () => {
      const node = createMockNode({}, { marginLeft: '0.5in' });
      const result = parseAttrs(node);
      // 0.5in = 36pt → 720 twips
      expect(result.paragraphProperties.indent.left).toBe(Math.round(0.5 * 72 * 20));
    });

    it('converts cm margins to twips', () => {
      const node = createMockNode({}, { marginTop: '1cm' });
      const result = parseAttrs(node);
      // 1cm ≈ 28.3465pt → ~567 twips
      expect(result.paragraphProperties.spacing.before).toBe(Math.round(1 * 28.3465 * 20));
    });

    it('converts mm margins to twips', () => {
      const node = createMockNode({}, { marginBottom: '10mm' });
      const result = parseAttrs(node);
      // 10mm ≈ 28.3465pt → ~567 twips
      expect(result.paragraphProperties.spacing.after).toBe(Math.round(10 * 2.83465 * 20));
    });

    it('ignores margins with unrecognized units', () => {
      const node = createMockNode({}, { marginLeft: '5em', marginTop: '10rem' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.indent).toBeUndefined();
      expect(result.paragraphProperties.spacing).toBeUndefined();
    });

    it('converts in/cm/mm lineHeight to exact twips', () => {
      const nodeIn = createMockNode({}, { lineHeight: '0.5in' });
      const resultIn = parseAttrs(nodeIn);
      expect(resultIn.paragraphProperties.spacing.line).toBe(Math.round(0.5 * 72 * 20));
      expect(resultIn.paragraphProperties.spacing.lineRule).toBe('exact');

      const nodeCm = createMockNode({}, { lineHeight: '1cm' });
      const resultCm = parseAttrs(nodeCm);
      expect(resultCm.paragraphProperties.spacing.line).toBe(Math.round(1 * 28.3465 * 20));
      expect(resultCm.paragraphProperties.spacing.lineRule).toBe('exact');
    });

    it('ignores lineHeight with unrecognized units', () => {
      const node = createMockNode({}, { lineHeight: '2em' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing).toBeUndefined();
    });

    it('preserves explicit zero margins to override style-engine defaults', () => {
      const node = createMockNode({}, { marginTop: '0pt', marginBottom: '0pt', marginLeft: '0pt' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing.before).toBe(0);
      expect(result.paragraphProperties.spacing.after).toBe(0);
      expect(result.paragraphProperties.indent.left).toBe(0);
    });

    it('ignores zero lineHeight and negative margins', () => {
      const node = createMockNode({}, { marginLeft: '-10pt', lineHeight: '0' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing).toBeUndefined();
      expect(result.paragraphProperties.indent).toBeUndefined();
    });

    it('extracts positive text-indent as firstLine', () => {
      const node = createMockNode({}, { textIndent: '36pt' });
      const result = parseAttrs(node);
      // 36pt * 20 = 720 twips
      expect(result.paragraphProperties.indent.firstLine).toBe(720);
    });

    it('extracts negative text-indent as hanging', () => {
      const node = createMockNode({}, { textIndent: '-18pt' });
      const result = parseAttrs(node);
      // 18pt * 20 = 360 twips
      expect(result.paragraphProperties.indent.hanging).toBe(360);
    });

    it('combines marginLeft and text-indent into indent', () => {
      const node = createMockNode({}, { marginLeft: '36pt', textIndent: '-18pt' });
      const result = parseAttrs(node);
      expect(result.paragraphProperties.indent.left).toBe(720);
      expect(result.paragraphProperties.indent.hanging).toBe(360);
    });

    it('returns no spacing/indent when node has no styles', () => {
      const node = createMockNode({}, {});
      const result = parseAttrs(node);
      expect(result.paragraphProperties.spacing).toBeUndefined();
      expect(result.paragraphProperties.indent).toBeUndefined();
    });
  });
});
