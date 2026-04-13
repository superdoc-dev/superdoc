import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_OBJECTS_DOC = path.resolve(__dirname, 'fixtures/math-all-objects.docx');
const FUNC_DOC = path.resolve(__dirname, 'fixtures/math-func-tests.docx');
const EQARR_DOC = path.resolve(__dirname, 'fixtures/math-eqarr-tests.docx');
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

  test('renders sub-superscript as <msubsup> with base, subscript, and superscript', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // The test doc has x_i^2 — should render as <msubsup> with 3 children
    const subSupData = await superdoc.page.evaluate(() => {
      const msubsup = document.querySelector('msubsup');
      if (!msubsup) return null;
      return {
        childCount: msubsup.children.length,
        base: msubsup.children[0]?.textContent,
        subscript: msubsup.children[1]?.textContent,
        superscript: msubsup.children[2]?.textContent,
      };
    });

    expect(subSupData).not.toBeNull();
    expect(subSupData!.childCount).toBe(3);
    expect(subSupData!.base).toBe('x');
    expect(subSupData!.subscript).toBe('i');
    expect(subSupData!.superscript).toBe('2');
  });

  test('math text content is preserved for unimplemented objects', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    // Unimplemented math objects (e.g., radical, delimiter) should still
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

    const funcNames = await superdoc.page.evaluate(() => {
      const mis = document.querySelectorAll('mi[mathvariant="normal"]');
      return Array.from(mis).map((mi) => mi.textContent);
    });

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

    expect(applyOps).toBeGreaterThanOrEqual(12);
  });

  test('nested functions render correctly (sin of cos x)', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    const nestedData = await superdoc.page.evaluate(() => {
      const maths = document.querySelectorAll('math');
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

    const fractionData = await superdoc.page.evaluate(() => {
      const maths = document.querySelectorAll('math');
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

test.describe('m:eqArr (equation array) rendering', () => {
  // Fixture (math-eqarr-tests.docx) contains 5 Word-native equation arrays:
  //   1. Basic 2-row               — x=1 / y=2
  //   2. Row with nested fraction  — a/b=c / x=y
  //   3. Row with subscript        — x_1=a / y=b
  //   4. Alignment markers (&)     — x&=1 / yy&=22 (ampersands must be stripped)
  //   5. With m:eqArrPr properties — x=1 / y=2 (Pr element must be filtered)

  test('renders all 5 equation arrays as <mtable columnalign="left">', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    const data = await superdoc.page.evaluate(() => {
      const mtables = Array.from(document.querySelectorAll('mtable'));
      return mtables.map((t) => ({
        columnalign: t.getAttribute('columnalign'),
        mtrCount: t.querySelectorAll(':scope > mtr').length,
      }));
    });

    expect(data.length).toBe(5);
    for (const t of data) {
      expect(t.columnalign).toBe('left');
      expect(t.mtrCount).toBe(2);
    }
  });

  test('preserves nested <mfrac> inside an equation array row (case 2)', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    const hasFracInRow = await superdoc.page.evaluate(() => {
      const mtables = Array.from(document.querySelectorAll('mtable'));
      for (const t of mtables) {
        const frac = t.querySelector(':scope > mtr > mtd mfrac');
        if (
          frac &&
          frac.children.length === 2 &&
          frac.children[0]?.textContent === 'a' &&
          frac.children[1]?.textContent === 'b'
        ) {
          return true;
        }
      }
      return false;
    });

    expect(hasFracInRow).toBe(true);
  });

  test('preserves nested <msub> inside an equation array row (case 3)', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    const hasSubInRow = await superdoc.page.evaluate(() => {
      const mtables = Array.from(document.querySelectorAll('mtable'));
      return mtables.some((t) => t.querySelector(':scope > mtr > mtd msub') !== null);
    });

    expect(hasSubInRow).toBe(true);
  });

  test('strips & alignment markers from row content (case 4)', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    // ECMA-376 §22.1.2.34: `&` inside m:t is an alignment marker, not literal text.
    // The converter does not yet map these to MathML alignment groups, so they
    // should be stripped rather than rendered as literal ampersands.
    const alignmentData = await superdoc.page.evaluate(() => {
      const mtables = Array.from(document.querySelectorAll('mtable'));
      const texts = mtables.flatMap((t) =>
        Array.from(t.querySelectorAll(':scope > mtr > mtd')).map((td) => td.textContent ?? ''),
      );
      return {
        anyContainsAmpersand: texts.some((s) => s.includes('&')),
        hasStrippedRow: texts.some((s) => s === 'yy=22'),
      };
    });

    expect(alignmentData.anyContainsAmpersand).toBe(false);
    expect(alignmentData.hasStrippedRow).toBe(true);
  });

  test('m:eqArrPr property element is filtered out (case 5)', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    // Word emits m:eqArrPr wrapping m:baseJc / m:maxDist / m:rSp / m:ctrlPr etc.
    // These must be stripped by the converter — they should never appear as DOM
    // elements named "eqarrpr" / "basejc" / "maxdist" / "ctrlpr".
    const leaked = await superdoc.page.evaluate(() => {
      const leaks: string[] = [];
      for (const el of document.querySelectorAll('math *')) {
        const name = el.localName.toLowerCase();
        if (['eqarrpr', 'basejc', 'maxdist', 'objdist', 'rsp', 'rsprule', 'ctrlpr'].includes(name)) {
          leaks.push(name);
        }
      }
      return leaks;
    });

    expect(leaked).toEqual([]);
  });
});
