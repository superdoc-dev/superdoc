import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BORDERBOX_DOC = path.resolve(__dirname, 'fixtures/sd-2750-borderbox.docx');

test.use({ config: { toolbar: 'none', comments: 'off' } });

/**
 * Covers the 30 ECMA-376 §22.1.2.11–14 / §22.9.2.7 scenarios bundled in
 * sd-2750-borderbox.docx: defaults, ST_OnOff value variants, individual hide
 * flags, strike directions, combinations, Annex L.6.1.3, m:box with boxPr,
 * and nested structures.
 */
test.describe('m:borderBox import → <menclose>', () => {
  test('every scenario produces the expected notation attribute', async ({ superdoc }) => {
    await superdoc.loadDocument(BORDERBOX_DOC);
    await superdoc.waitForStable();

    const notations = await superdoc.page.evaluate(() =>
      Array.from(document.querySelectorAll('menclose')).map((el) => el.getAttribute('notation')),
    );

    // Ordered — matches the scenario numbering inside the DOCX.
    expect(notations).toEqual([
      'box', // 1. default
      'box', // 2. empty borderBoxPr
      'bottom left right', // 3. m:val="1"
      'bottom left right', // 4. m:val="true"
      'bottom left right', // 5. m:val="on" (Annex L)
      'bottom left right', // 6. bare <m:hideTop/>
      'box', // 7. m:val="0" → not hidden
      'box', // 8. m:val="false"
      'top left right', // 9. hideBot only
      'top bottom right', // 10. hideLeft only
      'top bottom left', // 11. hideRight only
      'bottom left', // 12. hideTop + hideRight (spec §22.1.2.12)
      // 13 (all hidden, no strikes) → <mrow> fallback, no menclose
      'updiagonalstrike', // 14. strikeBLTR → "/"
      'downdiagonalstrike', // 15. strikeTLBR → "\"
      'horizontalstrike', // 16
      'verticalstrike', // 17
      'updiagonalstrike downdiagonalstrike', // 18. X pattern
      'updiagonalstrike horizontalstrike downdiagonalstrike verticalstrike', // 19
      'box horizontalstrike', // 20
      'bottom left right horizontalstrike', // 21
      'box downdiagonalstrike', // 22. Annex L.6.1.3 (m:val="on")
      // 23–27 are m:box scenarios → <mrow>, no menclose
      'box', // 28. m:box inside m:borderBox → outer menclose
      'box', // 29. m:borderBox inside m:box → inner menclose
      'left right', // 30. nested borderBox — outer
      'horizontalstrike', // 30. nested borderBox — inner
    ]);
  });

  test('multi-child borderBox content renders as a horizontal row (Annex L.6.1.3)', async ({ superdoc }) => {
    await superdoc.loadDocument(BORDERBOX_DOC);
    await superdoc.waitForStable();

    // Without the inner <mrow> wrap, Chrome's MathML Core treats <menclose> as
    // unknown and each child renders with `display: block math` stacked
    // vertically. This test asserts horizontal layout.
    const layout = await superdoc.page.evaluate(() => {
      const annex = Array.from(document.querySelectorAll('menclose')).find(
        (el) => el.getAttribute('notation') === 'box downdiagonalstrike',
      );
      if (!annex) return null;
      const rect = annex.getBoundingClientRect();
      return {
        wider_than_tall: rect.width > rect.height * 1.5,
        hasInnerMrow: annex.children[0]?.localName === 'mrow',
        innerChildCount: annex.children[0]?.children.length ?? 0,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.wider_than_tall).toBe(true);
    expect(layout!.hasInnerMrow).toBe(true);
    expect(layout!.innerChildCount).toBe(5); // a², =, b², +, c²
  });

  test('ST_OnOff variants (1/true/on/bare/0/false) all resolve correctly', async ({ superdoc }) => {
    await superdoc.loadDocument(BORDERBOX_DOC);
    await superdoc.waitForStable();

    // Scenarios 3-8 all share a single hideTop flag; only the m:val form differs.
    // "1", "true", "on", and bare-tag → top hidden. "0" and "false" → top visible.
    const notations = await superdoc.page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('menclose')).map((el) => el.getAttribute('notation'));
      return all.slice(2, 8); // indexes 2..7 = scenarios 3..8
    });

    // First four should all mean "top hidden"
    expect(notations.slice(0, 4)).toEqual([
      'bottom left right', // "1"
      'bottom left right', // "true"
      'bottom left right', // "on"
      'bottom left right', // bare tag
    ]);
    // Last two should mean "nothing hidden" → default box
    expect(notations.slice(4)).toEqual(['box', 'box']);
  });

  test('m:box drops boxPr semantics and falls back to <mrow>', async ({ superdoc }) => {
    await superdoc.loadDocument(BORDERBOX_DOC);
    await superdoc.waitForStable();

    // Scenarios 23-26 all produce <mrow> (opEmu / noBreak / aln / diff currently ignored).
    // Scenario 27 (empty m:box) should drop entirely.
    const mrowOnlyTexts = await superdoc.page.evaluate(() => {
      return Array.from(document.querySelectorAll('math'))
        .filter((m) => !m.querySelector('menclose'))
        .map((m) => m.textContent?.trim());
    });

    // 13 (all-hides fallback), 23, 24, 25, 26 → mrow (5 total). 27 is dropped.
    expect(mrowOnlyTexts).toEqual(['nobdr', '==', 'a==b', 'nbr', 'pAll']);
  });

  test('menclose polyfill stylesheet is injected', async ({ superdoc }) => {
    await superdoc.loadDocument(BORDERBOX_DOC);
    await superdoc.waitForStable();

    // Without this stylesheet, borders and strikes are invisible in Chrome
    // because MathML Core dropped <menclose>. The polyfill lives in
    // styles.ts → ensureMathMencloseStyles().
    const polyfill = await superdoc.page.evaluate(() => {
      const style = document.querySelector('style[data-superdoc-math-menclose-styles]');
      if (!style) return null;
      const css = style.textContent || '';
      return {
        bytes: css.length,
        hasBoxBorder: css.includes('notation~="box"') && css.includes('border:'),
        hasUpDiagonal: css.includes('updiagonalstrike'),
        hasDownDiagonal: css.includes('downdiagonalstrike'),
      };
    });

    expect(polyfill).not.toBeNull();
    expect(polyfill!.bytes).toBeGreaterThan(500);
    expect(polyfill!.hasBoxBorder).toBe(true);
    expect(polyfill!.hasUpDiagonal).toBe(true);
    expect(polyfill!.hasDownDiagonal).toBe(true);
  });
});
