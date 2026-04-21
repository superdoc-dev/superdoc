import { expect, test } from '../../fixtures/superdoc.js';
import { dragRenderedElement } from '../../helpers/drag-drop.js';
import { insertBlockSdt, insertInlineSdt } from '../../helpers/sdt.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const BLOCK_LABEL = '.superdoc-structured-content__label';
const INLINE_LABEL = '.superdoc-structured-content-inline__label';
const LINE = '.superdoc-line';

async function getFirstNodePosByType(page: Page, typeName: string): Promise<number> {
  return page.evaluate((nodeType) => {
    const editor = (window as any).editor;
    let found = -1;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (found !== -1) return false;
      if (node.type?.name === nodeType) {
        found = pos;
        return false;
      }
      return true;
    });

    if (found === -1) {
      throw new Error(`No node found for type "${nodeType}"`);
    }

    return found;
  }, typeName);
}

async function getLineByText(page: Page, text: string) {
  const line = page.locator(LINE).filter({ hasText: text }).first();
  await expect(line).toBeVisible();
  const box = await line.boundingBox();
  if (!box) {
    throw new Error(`Line containing "${text}" is not visible`);
  }
  return { line, box };
}

test.describe('structured content drag and drop', () => {
  test('@behavior SD-2192: dragging a block SDT label repositions the block', async ({ superdoc }) => {
    await superdoc.type('Intro paragraph');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await insertBlockSdt(superdoc.page, 'Block to move', 'Block payload to move');
    await superdoc.waitForStable();

    await superdoc.newLine();
    await superdoc.type('Tail paragraph');
    await superdoc.waitForStable();

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    expect(sourceBefore).toBeLessThan(tailBefore);

    const source = superdoc.page.locator(BLOCK_LABEL).first();
    const { line: target, box: targetBox } = await getLineByText(superdoc.page, 'Tail paragraph');

    await dragRenderedElement(source, target, { targetOffsetX: Math.max(4, targetBox.width - 4) });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Block payload to move');
  });

  test('@behavior SD-2192: dragging an inline SDT label repositions the inline field', async ({ superdoc }) => {
    await superdoc.type('Intro paragraph with ');
    await insertInlineSdt(superdoc.page, 'Inline to move', 'Inline payload to move');
    await superdoc.waitForStable();
    await superdoc.type(' in the first paragraph');
    await superdoc.newLine();
    await superdoc.type('Tail paragraph');
    await superdoc.waitForStable();

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    expect(sourceBefore).toBeLessThan(tailBefore);

    const source = superdoc.page.locator(INLINE_LABEL).first();
    const { line: target, box: targetBox } = await getLineByText(superdoc.page, 'Tail paragraph');

    await dragRenderedElement(source, target, { targetOffsetX: Math.max(4, targetBox.width - 4) });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Inline payload to move');
  });
});
