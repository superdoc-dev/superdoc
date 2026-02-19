import { test, expect } from '../../fixtures/superdoc.js';
import {
  insertBlockSdt,
  insertInlineSdt,
  getCenter,
  hasClass,
  isSelectionOnBlockSdt,
  deselectSdt,
} from '../../helpers/sdt.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const BLOCK_SDT = '.superdoc-structured-content-block';
const BLOCK_LABEL = '.superdoc-structured-content__label';
const INLINE_SDT = '.superdoc-structured-content-inline';
const INLINE_LABEL = '.superdoc-structured-content-inline__label';
const HOVER_CLASS = 'sdt-hover';

// ==========================================================================
// Block SDT Tests
// ==========================================================================

test.describe('block structured content', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.type('Before SDT');
    await superdoc.newLine();
    await superdoc.waitForStable();
    await insertBlockSdt(superdoc.page, 'Test Block', 'Block content here');
    await superdoc.waitForStable();
  });

  test('block SDT container renders with correct class and label', async ({ superdoc }) => {
    await superdoc.assertElementExists(BLOCK_SDT);
    await superdoc.assertElementExists(BLOCK_LABEL);

    const labelText = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      return label?.textContent?.trim() ?? '';
    }, BLOCK_LABEL);
    expect(labelText).toBe('Test Block');

    await superdoc.snapshot('block SDT rendered');
  });

  test('block SDT shows hover state on mouse enter', async ({ superdoc }) => {
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(true);

    const labelVisible = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return false;
      return getComputedStyle(label).display !== 'none';
    }, BLOCK_LABEL);
    expect(labelVisible).toBe(true);

    await superdoc.snapshot('block SDT hovered');
  });

  test('block SDT removes hover state on mouse leave', async ({ superdoc }) => {
    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(true);

    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();
    expect(await hasClass(superdoc.page, BLOCK_SDT, HOVER_CLASS)).toBe(false);

    await superdoc.snapshot('block SDT hover removed');
  });

  test('clicking inside block SDT places cursor within the block', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor placed');
  });

  test('moving cursor outside block SDT leaves the block', async ({ superdoc }) => {
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await deselectSdt(superdoc.page);
    await superdoc.waitForStable();

    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(false);

    await superdoc.snapshot('cursor outside block SDT');
  });

  test('block SDT cursor persists through hover cycle', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, BLOCK_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.page.mouse.move(0, 0);
    await superdoc.waitForStable();
    expect(await isSelectionOnBlockSdt(superdoc.page)).toBe(true);

    await superdoc.snapshot('block SDT cursor after hover cycle');
  });

  test('block SDT has correct boundary data attributes', async ({ superdoc }) => {
    const attrs = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('No block SDT found');
      return {
        start: (el as HTMLElement).dataset.sdtContainerStart,
        end: (el as HTMLElement).dataset.sdtContainerEnd,
      };
    }, BLOCK_SDT);

    expect(attrs.start).toBe('true');
    expect(attrs.end).toBe('true');

    await superdoc.snapshot('block SDT boundary attributes');
  });
});

// ==========================================================================
// Inline SDT Tests
// ==========================================================================

test.describe('inline structured content', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.type('Hello ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Test Inline', 'inline value');
    await superdoc.waitForStable();
  });

  test('inline SDT container renders with correct class and label', async ({ superdoc }) => {
    await superdoc.assertElementExists(INLINE_SDT);
    await superdoc.assertElementExists(INLINE_LABEL);

    const labelText = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      return label?.textContent?.trim() ?? '';
    }, INLINE_LABEL);
    expect(labelText).toBe('Test Inline');

    await superdoc.snapshot('inline SDT rendered');
  });

  test('inline SDT shows hover highlight', async ({ superdoc }) => {
    await deselectSdt(superdoc.page, 'Hello');
    await superdoc.waitForStable();

    const center = await getCenter(superdoc.page, INLINE_SDT);
    await superdoc.page.mouse.move(center.x, center.y);
    await superdoc.waitForStable();

    const hasBg = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const bg = getComputedStyle(el).backgroundColor;
      return bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    }, INLINE_SDT);
    expect(hasBg).toBe(true);

    const labelHidden = await superdoc.page.evaluate((sel) => {
      const label = document.querySelector(sel);
      if (!label) return true;
      return getComputedStyle(label).display === 'none';
    }, INLINE_LABEL);
    expect(labelHidden).toBe(true);

    await superdoc.snapshot('inline SDT hovered');
  });

  test('first click inside inline SDT selects all content', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, INLINE_SDT);
    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      const { from, to } = state.selection;
      return state.doc.textBetween(from, to);
    });

    expect(selection).toBe('inline value');

    await superdoc.snapshot('inline SDT content selected');
  });

  test('second click inside inline SDT allows cursor placement', async ({ superdoc }) => {
    const center = await getCenter(superdoc.page, INLINE_SDT);

    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    await superdoc.page.mouse.click(center.x, center.y);
    await superdoc.waitForStable();

    const selection = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      return { from: state.selection.from, to: state.selection.to };
    });

    expect(selection.to - selection.from).toBeLessThan('inline value'.length);

    await superdoc.snapshot('inline SDT cursor placed');
  });
});

// ==========================================================================
// Viewing Mode Tests
// ==========================================================================

test.describe('viewing mode hides SDT affordances', () => {
  test('block SDT border and label are hidden in viewing mode', async ({ superdoc }) => {
    await superdoc.type('Some text');
    await superdoc.newLine();
    await superdoc.waitForStable();
    await insertBlockSdt(superdoc.page, 'Hidden Block', 'Content');
    await superdoc.waitForStable();

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    const styles = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderStyle, padding: cs.padding };
    }, BLOCK_SDT);

    expect(styles).not.toBeNull();
    expect(styles!.border).toBe('none');
    await superdoc.assertElementHidden(BLOCK_LABEL);

    await superdoc.snapshot('block SDT viewing mode');
  });

  test('inline SDT border and label are hidden in viewing mode', async ({ superdoc }) => {
    await superdoc.type('Hello ');
    await superdoc.waitForStable();
    await insertInlineSdt(superdoc.page, 'Hidden Inline', 'value');
    await superdoc.waitForStable();

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    const styles = await superdoc.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { border: cs.borderStyle };
    }, INLINE_SDT);

    expect(styles).not.toBeNull();
    expect(styles!.border).toBe('none');
    await superdoc.assertElementHidden(INLINE_LABEL);

    await superdoc.snapshot('inline SDT viewing mode');
  });
});
