import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_OBJECTS_DOC = path.resolve(__dirname, 'fixtures/math-all-objects.docx');
const FUNC_DOC = path.resolve(__dirname, 'fixtures/math-func-tests.docx');
const SPRE_DOC = path.resolve(__dirname, 'fixtures/math-spre-tests.docx');
const DELIMITER_DOC = path.resolve(__dirname, 'fixtures/math-delimiter-tests.docx');
const RADICAL_DOC = path.resolve(__dirname, 'fixtures/math-radical-tests.docx');
const LIMIT_DOC = path.resolve(__dirname, 'fixtures/math-limit-tests.docx');
const EQARR_DOC = path.resolve(__dirname, 'fixtures/math-eqarr-tests.docx');
const NARY_DOC = path.resolve(__dirname, 'fixtures/math-nary-tests.docx');
const PHANTOM_DOC = path.resolve(__dirname, 'fixtures/math-phantom-tests.docx');
const GROUPCHR_DOC = path.resolve(__dirname, 'fixtures/math-groupchr-tests.docx');
const MATRIX_DOC = path.resolve(__dirname, 'fixtures/math-matrix-tests.docx');
// Single-object test docs are used for focused verification by community contributors.
// The all-objects doc is used for behavior tests since it exercises the full pipeline.

test.use({ config: { toolbar: 'none', comments: 'off' } });

test.describe('math equation import and rendering', () => {
  test('math-all-objects scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(ALL_OBJECTS_DOC);
    await superdoc.waitForStable();

    await test.step('imports inline and block math nodes from docx', async () => {
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

    await test.step('renders MathML elements in the DOM', async () => {
      // Verify <math> elements are rendered by the DomPainter
      const mathElementCount = await superdoc.page.evaluate(() => {
        return document.querySelectorAll('math').length;
      });

      expect(mathElementCount).toBeGreaterThan(0);
    });

    await test.step('renders fraction as <mfrac> with numerator and denominator', async () => {
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

    await test.step('math wrapper spans have PM position attributes', async () => {
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

    await test.step('renders m:acc as <mover accent="true"> with spacing-form accent char', async () => {
      // The fixture has m:acc with m:chr m:val="U+0302" (combining circumflex).
      // convertAccent should:
      //   1. Produce a <mover accent="true"> wrapper
      //   2. Emit ASCII circumflex U+005E (not the combining U+0302) since that's
      //      what MathML Core's operator dictionary marks as a stretchy accent.
      const accentData = await superdoc.page.evaluate(() => {
        const mover = document.querySelector('mover[accent="true"]');
        if (!mover) return null;
        const mo = mover.querySelector('mo');
        return {
          childCount: mover.children.length,
          baseText: mover.children[0]?.textContent,
          accentChar: mo?.textContent,
          accentCodepoint: mo?.textContent
            ? 'U+' + (mo.textContent.codePointAt(0) ?? 0).toString(16).padStart(4, '0').toUpperCase()
            : null,
        };
      });

      expect(accentData).not.toBeNull();
      expect(accentData!.childCount).toBe(2);
      expect(accentData!.baseText).toBe('x');
      // Combining circumflex (U+0302) in OMML must be rendered as ASCII circumflex (U+005E).
      expect(accentData!.accentChar).toBe('\u005E');
      expect(accentData!.accentCodepoint).toBe('U+005E');
    });

    await test.step('renders sub-superscript as <msubsup> with base, subscript, and superscript', async () => {
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

    await test.step('renders radical as <msqrt> with radicand', async () => {
      // The test doc has √(b²-4ac) and √x — both with degHide, so both should be <msqrt>
      const sqrtData = await superdoc.page.evaluate(() => {
        const msqrts = document.querySelectorAll('msqrt');
        return Array.from(msqrts).map((el) => ({
          childCount: el.children.length,
          textContent: el.textContent,
        }));
      });

      expect(sqrtData.length).toBeGreaterThanOrEqual(2);
      expect(sqrtData[0]!.childCount).toBeGreaterThan(0);
    });

    await test.step('math text content is preserved for unimplemented objects', async () => {
      // Unimplemented math objects should still have their text
      // content accessible in the PM document
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

    await test.step('document text labels render alongside math elements', async () => {
      // The labels (e.g., "1. Inline E=mc2:") should be visible
      await superdoc.assertTextContains('Inline E=mc2');
      await superdoc.assertTextContains('Display fraction');
      await superdoc.assertTextContains('Superscript');
    });
  });
});

test.describe('m:func (function apply) rendering', () => {
  test('m:func scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(FUNC_DOC);
    await superdoc.waitForStable();

    await test.step('renders function names upright with apply operator', async () => {
      // All 12 test equations should produce <math> elements
      const mathCount = await superdoc.page.evaluate(() => {
        return document.querySelectorAll('math').length;
      });
      expect(mathCount).toBe(12);
    });

    await test.step('function names have mathvariant="normal"', async () => {
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

    await test.step('invisible apply operator U+2061 is present', async () => {
      const applyOps = await superdoc.page.evaluate(() => {
        const mos = document.querySelectorAll('mo');
        return Array.from(mos).filter((mo) => mo.textContent === '\u2061').length;
      });

      expect(applyOps).toBeGreaterThanOrEqual(12);
    });

    await test.step('nested functions render correctly (sin of cos x)', async () => {
      const nestedData = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const math8 = maths[7];
        if (!math8) return null;
        const mis = math8.querySelectorAll('mi[mathvariant="normal"]');
        return Array.from(mis).map((mi) => mi.textContent);
      });

      expect(nestedData).toEqual(['sin', 'cos']);
    });

    await test.step('function in fraction renders with <mfrac>', async () => {
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
});

test.describe('m:sPre (pre-sub-superscript) rendering', () => {
  // Fixture covers 9 m:sPre shapes: basic, isotope, multi-run, only-sub, only-sup,
  // no sPrePr, fraction-in-sub, nested sPre, display-mode m:oMathPara.
  test('m:sPre scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(SPRE_DOC);
    await superdoc.waitForStable();

    await test.step('imports all m:sPre equations from docx', async () => {
      const mathCount = await superdoc.page.evaluate(() => document.querySelectorAll('math').length);
      expect(mathCount).toBe(9);
    });

    await test.step('renders each m:sPre as <mmultiscripts> with <mprescripts/>', async () => {
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

    await test.step('preserves multi-run operands inside <mrow>', async () => {
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

    await test.step('missing m:sub/m:sup renders empty <mrow> to preserve arity', async () => {
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

    await test.step('nested m:sPre renders nested <mmultiscripts> inside outer base', async () => {
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

    await test.step('m:oMathPara wrapping m:sPre renders in display mode', async () => {
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
});

test.describe('m:d (delimiter) rendering', () => {
  test('m:d scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(DELIMITER_DOC);
    await superdoc.waitForStable();

    await test.step('renders all 21 delimiter test cases as <math> elements', async () => {
      const mathCount = await superdoc.page.evaluate(() => {
        return document.querySelectorAll('math').length;
      });
      expect(mathCount).toBe(21);
    });

    await test.step('default parentheses wrap expression in <mo> delimiters', async () => {
      // Case 1: default (x+y)
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[0];
        if (!math) return null;
        const mrow = math.querySelector('mrow');
        if (!mrow) return null;
        const mos = mrow.querySelectorAll(':scope > mo');
        return {
          text: math.textContent,
          openDelim: mos[0]?.textContent,
          closeDelim: mos[mos.length - 1]?.textContent,
        };
      });

      expect(data).not.toBeNull();
      expect(data!.text).toBe('(x+y)');
      expect(data!.openDelim).toBe('(');
      expect(data!.closeDelim).toBe(')');
    });

    await test.step('uses U+2502 as default separator between expressions', async () => {
      // Case 2: two expressions with default separator
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[1];
        if (!math) return null;
        return { text: math.textContent };
      });

      expect(data).not.toBeNull();
      expect(data!.text).toBe('(x\u2502y)');
    });

    await test.step('suppresses delimiter when chr element present without m:val', async () => {
      // Case 5: begChr present, no val → suppress opening delimiter
      const case5 = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[4];
        return math?.textContent ?? null;
      });
      expect(case5).toBe('x+y)');

      // Case 8: endChr present, no val → suppress closing delimiter
      const case8 = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[7];
        return math?.textContent ?? null;
      });
      expect(case8).toBe('(x+y');

      // Case 9: both present, no val → suppress both
      const case9 = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[8];
        return math?.textContent ?? null;
      });
      expect(case9).toBe('x+y');
    });

    await test.step('renders custom delimiter characters', async () => {
      // Case 13: absolute value |x|
      const absVal = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[12];
        return math?.textContent ?? null;
      });
      expect(absVal).toBe('|x|');

      // Case 15: floor ⌊x⌋
      const floor = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[14];
        return math?.textContent ?? null;
      });
      expect(floor).toBe('⌊x⌋');

      // Case 16: ceiling ⌈x⌉
      const ceiling = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[15];
        return math?.textContent ?? null;
      });
      expect(ceiling).toBe('⌈x⌉');
    });

    await test.step('renders nested delimiters', async () => {
      // Case 17: ((x+y)+z)
      const nested = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[16];
        if (!math) return null;
        const innerMrows = math.querySelectorAll('mrow mrow mo');
        return {
          text: math.textContent,
          nestedMoCount: innerMrows.length,
        };
      });

      expect(nested).not.toBeNull();
      expect(nested!.text).toBe('((x+y)+z)');
    });
  });
});

test.describe('m:rad (radical) edge cases', () => {
  // Fixture has 3 cases the converter must handle distinctly:
  //   sqrt_degHide          — canonical Word sqrt: degHide=1 + empty <m:deg/>
  //   cube_root             — explicit degree, no degHide
  //   empty_deg_no_degHide  — Word's round-trip canonical for "no explicit degree":
  //                           Word adds an empty <m:deg/> on save, no <m:degHide>
  test('m:rad scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(RADICAL_DOC);
    await superdoc.waitForStable();

    await test.step('canonical sqrt (degHide) renders as <msqrt>', async () => {
      const data = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const first = maths[0];
        if (!first) return null;
        return {
          hasMsqrt: first.querySelector('msqrt') !== null,
          hasMroot: first.querySelector('mroot') !== null,
          text: first.textContent,
        };
      });

      expect(data).not.toBeNull();
      expect(data!.hasMsqrt).toBe(true);
      expect(data!.hasMroot).toBe(false);
      expect(data!.text).toBe('x');
    });

    await test.step('cube root (visible degree) renders as <mroot> with radicand and index', async () => {
      const data = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const second = maths[1];
        if (!second) return null;
        const mroot = second.querySelector('mroot');
        if (!mroot) return null;
        return {
          childCount: mroot.children.length,
          radicand: mroot.children[0]?.textContent,
          degree: mroot.children[1]?.textContent,
        };
      });

      expect(data).not.toBeNull();
      expect(data!.childCount).toBe(2);
      expect(data!.radicand).toBe('x');
      expect(data!.degree).toBe('3');
    });

    await test.step('empty <m:deg/> with no degHide renders as <msqrt>, never <mroot> with empty index', async () => {
      // Without the empty-deg check, this case produces <mroot><mrow>x</mrow><mrow></mrow></mroot>.
      // Assert the broken shape never appears anywhere on the page.
      const data = await superdoc.page.evaluate(() => {
        const maths = Array.from(document.querySelectorAll('math'));
        const third = maths[2];
        const brokenMroots = maths.filter((m) => {
          const root = m.querySelector('mroot');
          if (!root) return false;
          const index = root.children[1];
          return !index || index.textContent === '';
        });
        return {
          thirdHasMsqrt: third?.querySelector('msqrt') !== null,
          thirdHasMroot: third?.querySelector('mroot') !== null,
          thirdText: third?.textContent,
          brokenMrootCount: brokenMroots.length,
        };
      });

      expect(data.thirdHasMsqrt).toBe(true);
      expect(data.thirdHasMroot).toBe(false);
      expect(data.thirdText).toBe('x');
      expect(data.brokenMrootCount).toBe(0);
    });
  });
});

test.describe('m:limLow / m:limUpp (limit object) rendering', () => {
  // Fixture (math-limit-tests.docx) contains 8 Word-native equations:
  //   1. lim_(n→∞)       — m:limLow inside m:func > m:fName
  //   2. =^def           — bare m:limUpp (at root of m:oMath)
  //   3. lim_(x/y)       — m:limLow with m:f (fraction) inside m:lim
  //   4. a_b             — bare m:limLow (non-function base)
  //   5. lim^x           — m:limUpp inside m:func > m:fName
  //   6. max_(x∈S)       — m:limLow with multi-char non-"lim" function base
  //   7. sup_(n≥1)       — m:limLow with another non-"lim" function base
  //   8. lim_(x_i→0)     — m:limLow with m:sSub (subscript) inside m:lim

  test('m:limLow / m:limUpp scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(LIMIT_DOC);
    await superdoc.waitForStable();

    await test.step('renders all 8 limit equations as <math> elements', async () => {
      const mathCount = await superdoc.page.evaluate(() => {
        return document.querySelectorAll('math').length;
      });
      expect(mathCount).toBe(8);
    });

    await test.step('renders m:limLow cases as <munder> with arity 2', async () => {
      // Cases 1, 3, 4, 6, 7, 8 are m:limLow — all produce <munder> with exactly 2 children.
      const data = await superdoc.page.evaluate(() => {
        const munders = Array.from(document.querySelectorAll('munder'));
        return munders.map((el) => ({
          childCount: el.children.length,
          baseText: el.children[0]?.textContent ?? null,
          limitText: el.children[1]?.textContent ?? null,
        }));
      });

      expect(data.length).toBe(6);
      for (const m of data) {
        expect(m.childCount).toBe(2);
      }
      // Case 1 base is "lim" (upright function operator)
      expect(data.some((m) => m.baseText === 'lim' && m.limitText === 'n→∞')).toBe(true);
      // Case 4 bare: "a" over "b"
      expect(data.some((m) => m.baseText === 'a' && m.limitText === 'b')).toBe(true);
      // Case 6: "max" over "x∈S"
      expect(data.some((m) => m.baseText === 'max' && m.limitText === 'x∈S')).toBe(true);
      // Case 7: "sup" over "n≥1"
      expect(data.some((m) => m.baseText === 'sup' && m.limitText === 'n≥1')).toBe(true);
    });

    await test.step('renders m:limUpp cases as <mover> with arity 2', async () => {
      const data = await superdoc.page.evaluate(() => {
        const movers = Array.from(document.querySelectorAll('mover'));
        return movers.map((el) => ({
          childCount: el.children.length,
          baseText: el.children[0]?.textContent ?? null,
          limitText: el.children[1]?.textContent ?? null,
        }));
      });

      expect(data.length).toBe(2);
      for (const m of data) {
        expect(m.childCount).toBe(2);
      }
      // Case 2 bare limUpp: "=" above "def"
      expect(data.some((m) => m.baseText === '=' && m.limitText === 'def')).toBe(true);
      // Case 5 limUpp in func: "lim" above "x"
      expect(data.some((m) => m.baseText === 'lim' && m.limitText === 'x')).toBe(true);
    });

    await test.step('preserves nested <mfrac> inside <munder> (case 3: lim of x/y)', async () => {
      // The limLow whose limit contains x/y must have a <mfrac> inside its second child.
      const hasFracInMunder = await superdoc.page.evaluate(() => {
        const munders = Array.from(document.querySelectorAll('munder'));
        for (const mu of munders) {
          const frac = mu.children[1]?.querySelector('mfrac');
          if (
            frac &&
            frac.children.length === 2 &&
            frac.children[0]?.textContent === 'x' &&
            frac.children[1]?.textContent === 'y'
          ) {
            return true;
          }
        }
        return false;
      });

      expect(hasFracInMunder).toBe(true);
    });

    await test.step('applies mathvariant=normal via m:sty val=p (ECMA-376 §22.1.2)', async () => {
      // Every function-keyword base the fixture produces (lim/max/sup) originates
      // from m:r with m:rPr > m:sty m:val="p", so convertMathRun must set
      // mathvariant="normal" on those <mi> elements.
      const counts = await superdoc.page.evaluate(() => {
        const count = (text: string) =>
          Array.from(document.querySelectorAll('mi[mathvariant="normal"]')).filter((mi) => mi.textContent === text)
            .length;
        return { lim: count('lim'), max: count('max'), sup: count('sup') };
      });
      // "lim" appears in cases 1, 3, 5, 8 (4 total).
      expect(counts.lim).toBe(4);
      // "max" appears in case 6 (1).
      expect(counts.max).toBe(1);
      // "sup" appears in case 7 (1).
      expect(counts.sup).toBe(1);
    });

    await test.step('keeps limit variables italic when m:limLow/m:limUpp is wrapped in m:func (SD-2538)', async () => {
      // ECMA-376 §22.1.2.111: m:r without m:sty defaults to italic. Word's own
      // OMML2MML.xsl emits <mi>n</mi> (no mathvariant) for limit variables.
      //
      // Fixture math-limit-tests.docx has 6 m:func>m:fName wrappers: 5 around
      // m:limLow (→ <munder>) and 1 around m:limUpp (→ <mover>). The function
      // bases are lim×4, max×1, sup×1 — all carry m:sty=p and must render
      // upright. The limit expression runs have no m:sty and must stay italic.
      const FUNCTION_BASES = ['lim', 'max', 'sup'];
      const variantCheck = await superdoc.page.evaluate((bases) => {
        const collect = (tag: string) =>
          Array.from(document.querySelectorAll(tag))
            .map((el) => {
              const baseMi = el.children[0]?.querySelector('mi');
              const limitEl = el.children[1];
              return {
                base: baseMi?.textContent ?? '',
                baseVariant: baseMi?.getAttribute('mathvariant') ?? null,
                limitVariants: Array.from(limitEl?.querySelectorAll('mi') ?? []).map((mi) =>
                  mi.getAttribute('mathvariant'),
                ),
              };
            })
            .filter((entry) => bases.includes(entry.base));
        return { munder: collect('munder'), mover: collect('mover') };
      }, FUNCTION_BASES);

      // Exact counts pin against a regression that drops a case silently.
      expect(variantCheck.munder).toHaveLength(5); // 3×lim + 1×max + 1×sup
      expect(variantCheck.mover).toHaveLength(1); // 1×lim (case: m:limUpp in func)

      for (const entry of [...variantCheck.munder, ...variantCheck.mover]) {
        expect(entry.baseVariant).toBe('normal');
        for (const limVariant of entry.limitVariants) {
          expect(limVariant).toBeNull();
        }
      }
    });

    await test.step('preserves nested <msub> inside <munder> (case 8: lim of x_i → 0)', async () => {
      // The limLow whose limit contains x_i must have an <msub> inside its second child.
      const hasSubInMunder = await superdoc.page.evaluate(() => {
        const munders = Array.from(document.querySelectorAll('munder'));
        return munders.some((mu) => {
          const sub = mu.children[1]?.querySelector('msub');
          return sub !== null && sub !== undefined && sub.children.length === 2;
        });
      });
      expect(hasSubInMunder).toBe(true);
    });

    await test.step('bare m:limLow (case 4) leaves identifiers italic (no m:rPr styling)', async () => {
      // Case 4 "a_b" is bare m:limLow with no m:rPr — identifiers keep the MathML default
      // (single-char <mi> is italic) and therefore must NOT carry mathvariant="normal".
      // The other bare case (case 2 "=^def") has no <mi>a</mi>, so finding an <mi>a</mi>
      // without mathvariant is a sufficient signal for case 4.
      const data = await superdoc.page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('mi')).find((el) => el.textContent === 'a');
        const b = Array.from(document.querySelectorAll('mi')).find((el) => el.textContent === 'b');
        return {
          aHasVariant: a?.hasAttribute('mathvariant') ?? null,
          bHasVariant: b?.hasAttribute('mathvariant') ?? null,
        };
      });

      expect(data.aHasVariant).toBe(false);
      expect(data.bHasVariant).toBe(false);
    });

    await test.step('m:limLowPr and m:limUppPr property elements are filtered out', async () => {
      // Word emits m:limLowPr / m:limUppPr wrapping m:ctrlPr on every limit object.
      // These must be stripped by the converter — they should never appear as DOM
      // elements named "limlowpr" / "limupppr" / "ctrlpr".
      const leaked = await superdoc.page.evaluate(() => {
        const leaks: string[] = [];
        for (const el of document.querySelectorAll('math *')) {
          const name = el.localName.toLowerCase();
          if (name === 'limlowpr' || name === 'limupppr' || name === 'ctrlpr') {
            leaks.push(name);
          }
        }
        return leaks;
      });
      expect(leaked).toEqual([]);
    });

    await test.step('splits multi-char operator runs in m:lim content (SD-2632)', async () => {
      // Case 1: lim_(n→∞). Word emits the "→∞" as a single m:r. Previously we
      // rendered it as one <mi>→∞</mi>; now per Word's OMML2MML.XSL it splits
      // into separate atoms. Assert the full ordered sequence so a regression
      // that drops or misclassifies any atom is caught.
      const limExpressionAtoms = await superdoc.page.evaluate(() => {
        const munders = Array.from(document.querySelectorAll('munder'));
        const limMunder = munders.find((m) => m.children[0]?.querySelector('mi')?.textContent === 'lim');
        const limExpr = limMunder?.children[1];
        return Array.from(limExpr?.children ?? []).map((c) => `${c.localName}:${c.textContent}`);
      });

      expect(limExpressionAtoms).toEqual(['mi:n', 'mo:\u2192', 'mi:\u221E']);
    });
  });
});

test.describe('m:eqArr (equation array) rendering', () => {
  // Fixture (math-eqarr-tests.docx) contains 5 Word-native equation arrays:
  //   1. Basic 2-row               — x=1 / y=2
  //   2. Row with nested fraction  — a/b=c / x=y
  //   3. Row with subscript        — x_1=a / y=b
  //   4. Alignment markers (&)     — x&=1 / yy&=22 (ampersands must be stripped)
  //   5. With m:eqArrPr properties — x=1 / y=2 (Pr element must be filtered)

  test('m:eqArr scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(EQARR_DOC);
    await superdoc.waitForStable();

    await test.step('renders all 5 equation arrays as <mtable columnalign="left">', async () => {
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

    await test.step('preserves nested <mfrac> inside an equation array row (case 2)', async () => {
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

    await test.step('preserves nested <msub> inside an equation array row (case 3)', async () => {
      const hasSubInRow = await superdoc.page.evaluate(() => {
        const mtables = Array.from(document.querySelectorAll('mtable'));
        return mtables.some((t) => t.querySelector(':scope > mtr > mtd msub') !== null);
      });

      expect(hasSubInRow).toBe(true);
    });

    await test.step('strips & alignment markers from row content (case 4)', async () => {
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

    await test.step('m:eqArrPr property element is filtered out (case 5)', async () => {
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
});

test.describe('m:nary (n-ary operator) rendering', () => {
  // Fixture covers 13 m:nary scenarios across every ECMA-376 spec path:
  //   §22.1.2.20 (m:chr), §22.1.2.53 (m:limLoc), §22.1.2.70 (m:nary),
  //   §22.1.2.72 (m:naryPr), §22.9.2.7 (ST_OnOff).

  test('m:nary scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(NARY_DOC);
    await superdoc.waitForStable();

    await test.step('renders all 13 scenarios as <math> elements', async () => {
      const mathCount = await superdoc.page.evaluate(() => {
        return document.querySelectorAll('math').length;
      });
      expect(mathCount).toBe(13);
    });

    await test.step('definite integral renders as <msubsup> with both limits', async () => {
      // Scenario 1: ∫₀¹ f(x)dx
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[0];
        const msubsup = math?.querySelector('msubsup');
        if (!msubsup) return null;
        return {
          childCount: msubsup.children.length,
          opChar: msubsup.children[0]?.textContent,
          sub: msubsup.children[1]?.textContent,
          sup: msubsup.children[2]?.textContent,
        };
      });
      expect(data).not.toBeNull();
      expect(data!.childCount).toBe(3);
      expect(data!.opChar).toBe('\u222B');
      expect(data!.sub).toBe('0');
      expect(data!.sup).toBe('1');
    });

    await test.step('summation without m:limLoc renders as <munderover> (§22.1.2.53 + operator heuristic)', async () => {
      // Scenario 3: ∑_{i=1}^n i with no m:limLoc — spec says default to undOvr in display mode.
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[2];
        const munderover = math?.querySelector('munderover');
        if (!munderover) return null;
        return {
          hasMsubsup: math?.querySelector('msubsup') !== null,
          opChar: munderover.children[0]?.textContent,
          under: munderover.children[1]?.textContent,
          over: munderover.children[2]?.textContent,
        };
      });
      expect(data).not.toBeNull();
      expect(data!.hasMsubsup).toBe(false);
      expect(data!.opChar).toBe('\u2211');
      expect(data!.under).toBe('i=1');
      expect(data!.over).toBe('n');
    });

    await test.step('union with supHide renders as <munder> (one-sided undOvr branch)', async () => {
      // Scenario 6: ⋃ᵢ Aᵢ — m:supHide=1 + no m:limLoc on a non-integral → munder.
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[5];
        const munder = math?.querySelector('munder');
        if (!munder) return null;
        // The n-ary body contains m:sSub (Aᵢ), which legitimately renders as <msub>.
        // Assert only on the n-ary's own wrapper — the element parenting <mo>⋃</mo>.
        const unionOp = Array.from(math.querySelectorAll('mo')).find((m) => m.textContent === '\u22C3');
        const naryWrapperTag = unionOp?.parentElement?.tagName.toLowerCase();
        return {
          naryWrapperTag,
          opChar: munder.children[0]?.textContent,
          under: munder.children[1]?.textContent,
        };
      });
      expect(data).not.toBeNull();
      expect(data!.naryWrapperTag).toBe('munder');
      expect(data!.opChar).toBe('\u22C3');
      expect(data!.under).toBe('i');
    });

    await test.step('indefinite integral (no m:sub/m:sup elements) renders as bare <mo>', async () => {
      // Scenario 7 (label "2b" in fixture): no sub/sup and no hide flags — expect bare <mo>.
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[6];
        const hasScriptWrapper = math?.querySelector('msubsup, msub, msup, munderover, munder, mover') !== null;
        const mo = math?.querySelector('mo');
        return {
          hasScriptWrapper,
          opChar: mo?.textContent ?? null,
          bodyText: math?.textContent ?? null,
        };
      });
      expect(data).not.toBeNull();
      expect(data!.hasScriptWrapper).toBe(false);
      expect(data!.opChar).toBe('\u222B');
      expect(data!.bodyText).toContain('f(x)dx');
    });

    await test.step('subHide with content promotes sub into sup slot (matches Word)', async () => {
      // Scenarios 8 and 9 in the document set m:subHide ("true" / bare) on a nary
      // that has non-empty m:sub ("0") and m:sup ("1"). Word renders these as
      // ∫^{01} — the sub content is promoted into the sup slot so nothing is
      // dropped. Expect <msup> whose sup mrow starts with "0" then "1".
      const data = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const [seven, eight] = [maths[7], maths[8]];
        const fromMath = (m?: Element | null) => {
          const msup = m?.querySelector('msup');
          return {
            hasMsubsup: m?.querySelector('msubsup') !== null,
            hasMsup: msup !== null,
            supText: msup?.children[1]?.textContent ?? null,
          };
        };
        return { seven: fromMath(seven), eight: fromMath(eight) };
      });
      expect(data.seven.hasMsubsup).toBe(false);
      expect(data.seven.hasMsup).toBe(true);
      expect(data.seven.supText).toBe('01');
      expect(data.eight.hasMsubsup).toBe(false);
      expect(data.eight.hasMsup).toBe(true);
      expect(data.eight.supText).toBe('01');
    });

    await test.step('Word indefinite integral (empty sub/sup + hide flags) renders as bare <mo>', async () => {
      // Scenario 2 (index 1): Word authored ∫ f(x)dx — emits empty m:sub/m:sup with
      // subHide=supHide=1. This is the real "hide flag suppresses empty placeholder" case.
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[1];
        return {
          hasScriptWrapper: math?.querySelector('msubsup, msub, msup, munderover, munder, mover') !== null,
          opChar: math?.querySelector('mo')?.textContent ?? null,
        };
      });
      expect(data!.hasScriptWrapper).toBe(false);
      expect(data!.opChar).toBe('\u222B');
    });

    await test.step('<m:chr/> with no val renders an empty operator (§22.1.2.20)', async () => {
      // Scenario 11 (index 10): <m:chr/> + limLoc=undOvr — expect munderover with empty <mo>.
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[10];
        const munderover = math?.querySelector('munderover');
        const mo = munderover?.querySelector('mo');
        return {
          hasMunderover: munderover !== null,
          opChar: mo?.textContent ?? null,
        };
      });
      expect(data!.hasMunderover).toBe(true);
      expect(data!.opChar).toBe('');
    });

    await test.step('m:grow m:val="0" suppresses operator growth (§22.1.2.72)', async () => {
      // Scenario 13 (index 12): m:grow=0 on ∑ — expect largeop="false" stretchy="false".
      const data = await superdoc.page.evaluate(() => {
        const math = document.querySelectorAll('math')[12];
        const mo = math?.querySelector('mo');
        return {
          opChar: mo?.textContent ?? null,
          largeop: mo?.getAttribute('largeop') ?? null,
          stretchy: mo?.getAttribute('stretchy') ?? null,
        };
      });
      expect(data!.opChar).toBe('\u2211');
      expect(data!.largeop).toBe('false');
      expect(data!.stretchy).toBe('false');
    });

    await test.step('OMML property elements do not leak into the MathML DOM', async () => {
      // naryPr/subHide/supHide/limLoc/chr/grow are OMML property elements — they
      // must not appear in the rendered MathML output.
      const leaked = await superdoc.page.evaluate(() => {
        return Array.from(document.querySelectorAll('math *'))
          .map((el) => el.localName.toLowerCase())
          .filter((n) => ['narypr', 'subhide', 'suphide', 'limloc', 'chr', 'grow', 'ctrlpr'].includes(n));
      });
      expect(leaked).toEqual([]);
    });
  });
});

test.describe('m:phant (phantom) rendering', () => {
  // Fixture contains 12 phantom cases of `a + [phant(xyz)] + b`:
  //   0: no phantPr                        → visible mpadded
  //   1: empty phantPr                     → visible mpadded
  //   2: bare <m:show/>                    → visible mpadded
  //   3: m:show val=1                      → visible mpadded
  //   4: m:show val=0                      → mphantom (hidden)
  //   5: m:show val=true                   → visible mpadded
  //   6: m:show val=false                  → mphantom (hidden)
  //   7: m:zeroAsc=1 alone                 → mpadded height=0, visible
  //   8: m:zeroDesc=1 alone                → mpadded depth=0, visible
  //   9: m:show=0 + m:zeroDesc=1           → mpadded depth=0 wrapping mphantom
  //  10: m:show=0 + all three zero flags   → mpadded all=0 wrapping mphantom
  //  11: m:transp=1 (unsupported)          → visible mpadded passthrough

  test('m:phant scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(PHANTOM_DOC);
    await superdoc.waitForStable();

    await test.step('imports all 12 phantom equations from docx', async () => {
      const mathCount = await superdoc.page.evaluate(() => document.querySelectorAll('math').length);
      expect(mathCount).toBe(12);
    });

    await test.step('renders visible phantom as <mpadded> without inner <mphantom> (default per ECMA-376 §22.1.2.96)', async () => {
      // Cases 0, 1, 2, 3, 5: visibility-default variants (no m:show, empty, bare, val=1, val=true).
      const visibleIndices = [0, 1, 2, 3, 5];
      const results = await superdoc.page.evaluate((indices) => {
        const maths = document.querySelectorAll('math');
        return indices.map((i) => {
          const m = maths[i];
          const mpadded = m?.querySelector('mpadded');
          return {
            hasMphantom: m?.querySelector('mphantom') != null,
            mpaddedWidth: mpadded?.getAttribute('width'),
            mpaddedHeight: mpadded?.getAttribute('height'),
            mpaddedDepth: mpadded?.getAttribute('depth'),
            text: m?.textContent,
          };
        });
      }, visibleIndices);

      for (const r of results) {
        expect(r.hasMphantom).toBe(false);
        expect(r.mpaddedWidth).toBeNull();
        expect(r.mpaddedHeight).toBeNull();
        expect(r.mpaddedDepth).toBeNull();
        expect(r.text).toBe('a+xyz+b');
      }
    });

    await test.step('renders m:show val=0 / val=false as <mphantom> (hidden, space reserved)', async () => {
      const results = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        return [4, 6].map((i) => {
          const m = maths[i];
          const mphantom = m?.querySelector('mphantom');
          return {
            hasMphantom: mphantom != null,
            hasMpadded: m?.querySelector('mpadded') != null,
            phantomText: mphantom?.textContent,
          };
        });
      });

      for (const r of results) {
        expect(r.hasMphantom).toBe(true);
        expect(r.hasMpadded).toBe(false);
        expect(r.phantomText).toBe('xyz');
      }
    });

    await test.step('zeros individual dimensions on <mpadded> without hiding content', async () => {
      // Case 7: m:zeroAsc=1 alone; Case 8: m:zeroDesc=1 alone.
      const results = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const extract = (i: number) => {
          const p = maths[i]?.querySelector('mpadded');
          return {
            width: p?.getAttribute('width') ?? null,
            height: p?.getAttribute('height') ?? null,
            depth: p?.getAttribute('depth') ?? null,
            hasMphantom: maths[i]?.querySelector('mphantom') != null,
          };
        };
        return { zeroAsc: extract(7), zeroDesc: extract(8) };
      });

      expect(results.zeroAsc).toEqual({ width: null, height: '0', depth: null, hasMphantom: false });
      expect(results.zeroDesc).toEqual({ width: null, height: null, depth: '0', hasMphantom: false });
    });

    await test.step('combines zeroed dimensions with hidden content as <mpadded> wrapping <mphantom>', async () => {
      // Case 9: show=0 + zeroDesc=1; Case 10: show=0 + all three zero flags.
      const results = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const inspect = (i: number) => {
          const mpadded = maths[i]?.querySelector('mpadded');
          const inner = mpadded?.querySelector('mphantom');
          return {
            mpadded: mpadded
              ? {
                  width: mpadded.getAttribute('width'),
                  height: mpadded.getAttribute('height'),
                  depth: mpadded.getAttribute('depth'),
                }
              : null,
            innerIsMphantom: inner != null,
            innerText: inner?.textContent,
          };
        };
        return { case9: inspect(9), case10: inspect(10) };
      });

      expect(results.case9).toEqual({
        mpadded: { width: null, height: null, depth: '0' },
        innerIsMphantom: true,
        innerText: 'xyz',
      });
      expect(results.case10).toEqual({
        mpadded: { width: '0', height: '0', depth: '0' },
        innerIsMphantom: true,
        innerText: 'xyz',
      });
    });

    await test.step('m:transp passes through as visible phantom (unsupported in MathML)', async () => {
      // Case 11: m:transp=1. No direct MathML equivalent; should fall through
      // to a visible <mpadded> with no dimension attributes.
      const result = await superdoc.page.evaluate(() => {
        const m = document.querySelectorAll('math')[11];
        const mpadded = m?.querySelector('mpadded');
        return {
          hasMphantom: m?.querySelector('mphantom') != null,
          width: mpadded?.getAttribute('width') ?? null,
          height: mpadded?.getAttribute('height') ?? null,
          depth: mpadded?.getAttribute('depth') ?? null,
          text: m?.textContent,
        };
      });

      expect(result).toEqual({
        hasMphantom: false,
        width: null,
        height: null,
        depth: null,
        text: 'a+xyz+b',
      });
    });

    await test.step('OMML phantom property elements do not leak into the MathML DOM', async () => {
      // m:phantPr, m:show, m:zeroWid, m:zeroAsc, m:zeroDesc, m:transp are OOXML property
      // elements — they must not appear in the rendered MathML output.
      const leaked = await superdoc.page.evaluate(() => {
        return Array.from(document.querySelectorAll('math *'))
          .map((el) => el.localName.toLowerCase())
          .filter((n) => ['phantpr', 'show', 'zerowid', 'zeroasc', 'zerodesc', 'transp'].includes(n));
      });
      expect(leaked).toEqual([]);
    });
  });
});

test.describe('m:groupChr (group character) rendering', () => {
  // Fixture has 12 m:groupChr variants covering every ECMA-376 §22.1.2.41 case:
  // 1 default, 2 empty m:chr, 3 explicit underbrace, 4 overbrace, 5 ← arrow, 6 → arrow,
  // 7-10 four pos×vertJc combos, 11 vertJc empty-val, 12 complex base.
  test('m:groupChr scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(GROUPCHR_DOC);
    await superdoc.waitForStable();

    await test.step('renders every groupChr variant as <munder> or <mover>', async () => {
      const counts = await superdoc.page.evaluate(() => ({
        math: document.querySelectorAll('math').length,
        wrappers: document.querySelectorAll('munder, mover').length,
        movers: document.querySelectorAll('mover').length,
        munders: document.querySelectorAll('munder').length,
      }));

      expect(counts.math).toBe(12);
      expect(counts.wrappers).toBe(12);
      // Variants 4, 5, 7, 8, 11 are pos=top → <mover> (5 total).
      expect(counts.movers).toBe(5);
      // Variants 1, 2, 3, 6, 9, 10, 12 are pos=bot or default → <munder> (7 total).
      expect(counts.munders).toBe(7);
    });

    await test.step('default (no groupChrPr) falls back to U+23DF bottom curly bracket', async () => {
      // Use `:scope > mo` to target the group character directly — the base
      // expression may itself contain <mo> atoms (e.g. "a+b" splits to
      // <mi>a</mi><mo>+</mo><mi>b</mi> per Word's OMML2MML.XSL).
      const firstMunder = await superdoc.page.evaluate(() => {
        const munder = document.querySelector('munder');
        const mo = munder?.querySelector(':scope > mo');
        return mo ? { text: mo.textContent, stretchy: mo.getAttribute('stretchy') } : null;
      });

      expect(firstMunder).not.toBeNull();
      expect(firstMunder!.text).toBe('\u23DF');
      expect(firstMunder!.stretchy).toBe('true');
    });

    await test.step('empty <m:chr/> renders a hidden character', async () => {
      // Variant 2 — second munder in DOM order.
      const hiddenChar = await superdoc.page.evaluate(() => {
        const munders = document.querySelectorAll('munder');
        const mo = munders[1]?.querySelector(':scope > mo');
        return mo?.textContent;
      });

      expect(hiddenChar).toBe('');
    });

    await test.step('custom m:chr values are preserved (U+23DE, U+2190, U+2192)', async () => {
      const chars = await superdoc.page.evaluate(() => {
        const wrappers = document.querySelectorAll('munder, mover');
        return Array.from(wrappers).map((w) => w.querySelector(':scope > mo')?.textContent ?? null);
      });

      // Variants 4 (U+23DE), 5 (U+2190), 6 (U+2192).
      expect(chars[3]).toBe('\u23DE');
      expect(chars[4]).toBe('\u2190');
      expect(chars[5]).toBe('\u2192');
    });

    await test.step('natural vertJc combinations render without baseline shift', async () => {
      const natural = await superdoc.page.evaluate(() => {
        const wrappers = document.querySelectorAll('munder, mover');
        // Variant 8 (pos=top, vertJc=bot) and variant 9 (pos=bot, vertJc=top) are natural.
        return {
          v8: {
            vertJc: wrappers[7]?.getAttribute('data-vert-jc'),
            style: wrappers[7]?.getAttribute('style'),
          },
          v9: {
            vertJc: wrappers[8]?.getAttribute('data-vert-jc'),
            style: wrappers[8]?.getAttribute('style'),
          },
        };
      });

      expect(natural.v8.vertJc).toBe('bot');
      expect(natural.v8.style).toBeNull();
      expect(natural.v9.vertJc).toBe('top');
      expect(natural.v9.style).toBeNull();
    });

    await test.step('non-natural vertJc combinations shift the construct vertically', async () => {
      const shifted = await superdoc.page.evaluate(() => {
        const wrappers = document.querySelectorAll('munder, mover');
        return {
          // Variant 7 (pos=top, vertJc=top) shifts down.
          v7: {
            vertJc: wrappers[6]?.getAttribute('data-vert-jc'),
            style: wrappers[6]?.getAttribute('style'),
          },
          // Variant 10 (pos=bot, vertJc=bot) shifts up.
          v10: {
            vertJc: wrappers[9]?.getAttribute('data-vert-jc'),
            style: wrappers[9]?.getAttribute('style'),
          },
        };
      });

      expect(shifted.v7.vertJc).toBe('top');
      expect(shifted.v7.style).toContain('top: 1em');
      expect(shifted.v10.vertJc).toBe('bot');
      expect(shifted.v10.style).toContain('top: -1em');
    });

    await test.step('m:vertJc without m:val defaults to "bot"', async () => {
      // Variant 11 — pos=top with <m:vertJc/> (no val) → defaults to "bot" = natural for pos=top.
      const v11 = await superdoc.page.evaluate(() => {
        const wrappers = document.querySelectorAll('munder, mover');
        return {
          tag: wrappers[10]?.localName,
          vertJc: wrappers[10]?.getAttribute('data-vert-jc'),
          style: wrappers[10]?.getAttribute('style'),
        };
      });

      expect(v11.tag).toBe('mover');
      expect(v11.vertJc).toBe('bot');
      expect(v11.style).toBeNull();
    });
  });
});

test.describe('m:m (matrix) rendering', () => {
  // Fixture contains 10 matrix shapes (§22.1.2.60):
  //   0: plain 2x2, no delimiter
  //   1: 2x2 wrapped in [ ] delimiter
  //   2: 2x2 in ( ) with nested m:f and m:sSup in cells
  //   3: 2x2 in [ ] with multi-run cells (a+b, c-d, …)
  //   4: 2x3 in [ ] with empty <m:e/> gaps
  //   5: 2x3 with per-column m:mcJc=left/center/right (no delimiter)
  //   6: 1x3 row vector in [ ]
  //   7: 3x1 column vector in [ ]
  //   8: 1x2 containing literal '&' in text (non-spec edge case)
  //   9: inline matrix with m:baseJc=top

  test('m:m scenarios', async ({ superdoc }) => {
    await superdoc.loadDocument(MATRIX_DOC);
    await superdoc.waitForStable();

    await test.step('imports all 10 matrix equations from docx', async () => {
      const mathCount = await superdoc.page.evaluate(() => document.querySelectorAll('math').length);
      expect(mathCount).toBe(10);
      const tableCount = await superdoc.page.evaluate(() => document.querySelectorAll('mtable').length);
      expect(tableCount).toBe(10);
    });

    await test.step('wraps every <mtd> in <mrow> for cell content grouping', async () => {
      const allWrapped = await superdoc.page.evaluate(() => {
        const tds = Array.from(document.querySelectorAll('mtd'));
        return tds.every((td) => td.children.length === 1 && td.firstElementChild?.localName === 'mrow');
      });
      expect(allWrapped).toBe(true);
    });

    await test.step('renders matrix wrapped in m:d with delimiter operators around the mtable', async () => {
      // Case 1: [ ] brackets around 2x2.
      const result = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const mtable = maths[1]?.querySelector('mtable');
        const operators = Array.from(maths[1]?.querySelectorAll('mrow > mo') ?? []).map((el) => el.textContent);
        return { hasMtable: mtable != null, operators };
      });
      expect(result.hasMtable).toBe(true);
      expect(result.operators).toEqual(['[', ']']);
    });

    await test.step('preserves nested math (mfrac, msup) inside matrix cells', async () => {
      const result = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const m = maths[2];
        return {
          hasMfrac: m?.querySelector('mtd mfrac') != null,
          hasMsup: m?.querySelector('mtd msup') != null,
        };
      });
      expect(result.hasMfrac).toBe(true);
      expect(result.hasMsup).toBe(true);
    });

    await test.step('renders empty <m:e/> cells with a U+25A1 placeholder by default (§22.1.2.83)', async () => {
      // Case 4: 2x3 with empty cells at (0,1) and (1,0). Expect three columns preserved
      // with placeholder glyphs at the gaps.
      const result = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const mtable = maths[4]?.querySelector('mtable');
        const rows = Array.from(mtable?.querySelectorAll('mtr') ?? []);
        return rows.map((row) => Array.from(row.querySelectorAll('mtd')).map((td) => td.textContent));
      });
      expect(result).toEqual([
        ['a', '\u25A1', 'c'],
        ['\u25A1', 'e', 'f'],
      ]);
    });

    await test.step('renders multi-run cell content as siblings inside the cell <mrow>', async () => {
      // Case 3 bottom row cell 0: x, +, y as three separate runs → mi, mo, mi under mrow.
      const result = await superdoc.page.evaluate(() => {
        const maths = document.querySelectorAll('math');
        const mtable = maths[3]?.querySelector('mtable');
        const cell = mtable?.querySelectorAll('mtr')[1]?.querySelectorAll('mtd')[0];
        const mrow = cell?.firstElementChild;
        return {
          mrowTag: mrow?.localName,
          childTags: Array.from(mrow?.children ?? []).map((c) => c.localName),
          text: mrow?.textContent,
        };
      });
      expect(result.mrowTag).toBe('mrow');
      expect(result.childTags).toEqual(['mi', 'mo', 'mi']);
      expect(result.text).toBe('x+y');
    });
  });
});
