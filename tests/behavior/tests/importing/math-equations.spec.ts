import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_OBJECTS_DOC = path.resolve(__dirname, 'fixtures/math-all-objects.docx');
const FUNC_DOC = path.resolve(__dirname, 'fixtures/math-func-tests.docx');
const SPRE_DOC = path.resolve(__dirname, 'fixtures/math-spre-tests.docx');
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

test.describe('m:sPre (pre-sub-superscript) rendering', () => {
  // Fixture covers 9 m:sPre shapes: basic, isotope, multi-run, only-sub, only-sup,
  // no sPrePr, fraction-in-sub, nested sPre, display-mode m:oMathPara.
  test('imports all m:sPre equations from docx', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    const mathCount = await superdoc.page.evaluate(() => document.querySelectorAll('math').length);
    expect(mathCount).toBe(9);
  });

  test('renders each m:sPre as <mmultiscripts> with <mprescripts/>', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    const structure = await superdoc.page.evaluate(() => {
      const multis = Array.from(document.querySelectorAll('mmultiscripts'));
      return {
        count: multis.length,
        allHaveFourChildren: multis.every((m) => m.children.length === 4),
        allHavePrescripts: multis.every((m) => m.children[1]?.localName === 'mprescripts'),
        allHaveBaseFirst: multis.every((m) => m.children[0]?.localName === 'mrow'),
      };
    });

    // 8 outer sPre + 1 inner nested + 1 inside m:oMathPara = 10
    expect(structure.count).toBe(10);
    expect(structure.allHaveFourChildren).toBe(true);
    expect(structure.allHavePrescripts).toBe(true);
    expect(structure.allHaveBaseFirst).toBe(true);
  });

  test('preserves multi-run operands inside <mrow>', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    // Test 3 in the fixture: sub=n+1, sup=k-1, base=X
    const multiRun = await superdoc.page.evaluate(() => {
      const multis = Array.from(document.querySelectorAll('mmultiscripts'));
      const target = multis.find((m) => m.children[0]?.textContent === 'X');
      if (!target) return null;
      return {
        subText: target.children[2]?.textContent,
        supText: target.children[3]?.textContent,
        subChildCount: target.children[2]?.children.length ?? 0,
      };
    });

    expect(multiRun).not.toBeNull();
    expect(multiRun!.subText).toBe('n+1');
    expect(multiRun!.supText).toBe('k-1');
    // sub mrow should contain 3 tokens (mi/mo/mn), preserving arity of outer mmultiscripts
    expect(multiRun!.subChildCount).toBe(3);
  });

  test('missing m:sub/m:sup renders empty <mrow> to preserve arity', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    // Test 4 (base=P, only sub=5) and Test 5 (base=Q, only sup=3)
    const emptySlots = await superdoc.page.evaluate(() => {
      const multis = Array.from(document.querySelectorAll('mmultiscripts'));
      const onlySub = multis.find((m) => m.children[0]?.textContent === 'P');
      const onlySup = multis.find((m) => m.children[0]?.textContent === 'Q');
      return {
        onlySubEmptySup: onlySub?.children[3]?.textContent === '',
        onlySupEmptySub: onlySup?.children[2]?.textContent === '',
        // Both still have exactly 4 children
        arityPreserved: onlySub?.children.length === 4 && onlySup?.children.length === 4,
      };
    });

    expect(emptySlots.onlySubEmptySup).toBe(true);
    expect(emptySlots.onlySupEmptySub).toBe(true);
    expect(emptySlots.arityPreserved).toBe(true);
  });

  test('nested m:sPre renders nested <mmultiscripts> inside outer base', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    // Test 8: outer sPre(a, b, <inner sPre(c, d, Y)>)
    const nested = await superdoc.page.evaluate(() => {
      const multis = Array.from(document.querySelectorAll('mmultiscripts'));
      // The outer one has a nested mmultiscripts inside its first child (base mrow)
      const outer = multis.find((m) => m.children[0]?.querySelector('mmultiscripts'));
      if (!outer) return null;
      const inner = outer.children[0]!.querySelector('mmultiscripts')!;
      return {
        outerSubText: outer.children[2]?.textContent,
        outerSupText: outer.children[3]?.textContent,
        innerBaseText: inner.children[0]?.textContent,
        innerSubText: inner.children[2]?.textContent,
        innerSupText: inner.children[3]?.textContent,
      };
    });

    expect(nested).not.toBeNull();
    expect(nested!.outerSubText).toBe('a');
    expect(nested!.outerSupText).toBe('b');
    expect(nested!.innerBaseText).toBe('Y');
    expect(nested!.innerSubText).toBe('c');
    expect(nested!.innerSupText).toBe('d');
  });

  test('m:oMathPara wrapping m:sPre renders in display mode', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    // Test 9: <m:oMathPara><m:oMath><m:sPre>...base=Z</m:sPre></m:oMath></m:oMathPara>
    const displayMode = await superdoc.page.evaluate(() => {
      const multis = Array.from(document.querySelectorAll('mmultiscripts'));
      const target = multis.find((m) => m.children[0]?.textContent === 'Z');
      if (!target) return null;
      const math = target.closest('math');
      return {
        display: math?.getAttribute('display'),
        displaystyle: math?.getAttribute('displaystyle'),
      };
    });

    expect(displayMode).not.toBeNull();
    expect(displayMode!.display).toBe('block');
    expect(displayMode!.displaystyle).toBe('true');
  });
});
