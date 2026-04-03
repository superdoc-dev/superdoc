import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_OBJECTS_DOC = path.resolve(__dirname, 'fixtures/math-all-objects.docx');
const FUNC_DOC = path.resolve(__dirname, 'fixtures/math-func-tests.docx');
// Single-object test docs are used for focused verification by community contributors.
// The all-objects doc is used for behavior tests since it exercises the full pipeline.

test.use({ config: { toolbar: 'none', comments: 'off' } });

test.describe('math equation import and rendering', () => {
  test('imports inline and block math nodes from docx', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // Verify math nodes exist in the PM document
    const mathNodeCount = await superdoc.page.evaluate(() => {
      const view = (window as any).editor?.view;
      if (!view) return 0;
      let count = 0;
      view.state.doc.descendants((node: any) => {
        if (node.type.name === 'mathInline' || node.type.name === 'mathBlock') count++;
      });
      return count;
    });

    expect(mathNodeCount).toBeGreaterThan(0);
  });

  test('renders MathML elements in the DOM', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // Verify <math> elements are rendered by the DomPainter
    const mathElementCount = await superdoc.page.evaluate(() => {
      return document.querySelectorAll('math').length;
    });

    expect(mathElementCount).toBeGreaterThan(0);
  });

  test('renders fraction as <mfrac> with numerator and denominator', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // The test doc has a display fraction (a/b) — should render as <mfrac>
    const fractionData = await superdoc.page.evaluate(() => {
      const mfrac = document.querySelector('mfrac');
      if (!mfrac) return null;
      return {
        childCount: mfrac.children.length,
        numerator: mfrac.children[0]?.textContent,
        denominator: mfrac.children[1]?.textContent,
      };
    });

    expect(fractionData).not.toBeNull();
    expect(fractionData!.childCount).toBe(2);
    expect(fractionData!.numerator).toBe('a');
    expect(fractionData!.denominator).toBe('b');
  });

  test('math wrapper spans have PM position attributes', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // Verify sd-math elements have data-pm-start and data-pm-end
    const mathSpanData = await superdoc.page.evaluate(() => {
      const spans = document.querySelectorAll('.sd-math');
      return Array.from(spans).map((el) => ({
        hasPmStart: el.hasAttribute('data-pm-start'),
        hasPmEnd: el.hasAttribute('data-pm-end'),
        hasLayoutEpoch: el.hasAttribute('data-layout-epoch'),
      }));
    });

    expect(mathSpanData.length).toBeGreaterThan(0);
    for (const span of mathSpanData) {
      expect(span.hasPmStart).toBe(true);
      expect(span.hasPmEnd).toBe(true);
      expect(span.hasLayoutEpoch).toBe(true);
    }
  });

  test('math text content is preserved for unimplemented objects', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // Unimplemented math objects (e.g., superscript, radical) should still
    // have their text content accessible in the PM document
    const mathTexts = await superdoc.page.evaluate(() => {
      const view = (window as any).editor?.view;
      if (!view) return [];
      const texts: string[] = [];
      view.state.doc.descendants((node: any) => {
        if (node.type.name === 'mathInline' && node.attrs?.textContent) {
          texts.push(node.attrs.textContent);
        }
      });
      return texts;
    });

    // Should have multiple inline math nodes with text content
    expect(mathTexts.length).toBeGreaterThan(0);
    // The first inline math should be E=mc2
    expect(mathTexts).toContain('E=mc2');
  });

  test('document text labels render alongside math elements', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // The labels (e.g., "1. Inline E=mc2:") should be visible
    await superdoc.assertTextContains('Inline E=mc2');
    await superdoc.assertTextContains('Display fraction');
    await superdoc.assertTextContains('Superscript');
  });
});

test.describe('m:func (function apply) rendering', () => {
  test('renders function names upright with apply operator', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    // All 12 test equations should produce <math> elements
    const mathCount = await superdoc.page.evaluate(() => {
      return document.querySelectorAll('math').length;
    });
    expect(mathCount).toBe(12);
  });

  test('function names have mathvariant="normal"', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    // Every function name <mi> inside an <mrow> should be upright
    const funcNames = await superdoc.page.evaluate(() => {
      const mis = document.querySelectorAll('mi[mathvariant="normal"]');
      return Array.from(mis).map((mi) => mi.textContent);
    });

    // sin, cos, tan, log, ln, f, sin, sin, sin, sin, cos, sin, sin
    expect(funcNames).toContain('sin');
    expect(funcNames).toContain('cos');
    expect(funcNames).toContain('tan');
    expect(funcNames).toContain('log');
    expect(funcNames).toContain('ln');
    expect(funcNames).toContain('f');
  });

  test('invisible apply operator U+2061 is present', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    const applyOps = await superdoc.page.evaluate(() => {
      const mos = document.querySelectorAll('mo');
      return Array.from(mos).filter((mo) => mo.textContent === '\u2061').length;
    });

    // Each m:func should have one apply operator (12 funcs + nested cos = 14)
    expect(applyOps).toBeGreaterThanOrEqual(12);
  });

  test('nested functions render correctly (sin of cos x)', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    // Test 8 has nested sin(cos x) — both names should be upright
    const nestedData = await superdoc.page.evaluate(() => {
      const maths = document.querySelectorAll('math');
      // Test 8 is the 8th math element (0-indexed: 7)
      const math8 = maths[7];
      if (!math8) return null;
      const mis = math8.querySelectorAll('mi[mathvariant="normal"]');
      return Array.from(mis).map((mi) => mi.textContent);
    });

    expect(nestedData).toEqual(['sin', 'cos']);
  });

  test('function in fraction renders with <mfrac>', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    // Test 9 has sin(x)/x — should have <mfrac> wrapping the func
    const fractionData = await superdoc.page.evaluate(() => {
      const maths = document.querySelectorAll('math');
      // Test 9 is the 9th math element (0-indexed: 8)
      const math9 = maths[8];
      if (!math9) return null;
      const mfrac = math9.querySelector('mfrac');
      if (!mfrac) return null;
      return {
        hasFunc: mfrac.querySelector('mi[mathvariant="normal"]') !== null,
        numeratorText: mfrac.children[0]?.textContent,
        denominatorText: mfrac.children[1]?.textContent,
      };
    });

    expect(fractionData).not.toBeNull();
    expect(fractionData!.hasFunc).toBe(true);
    expect(fractionData!.denominatorText).toBe('x');
  });
});
