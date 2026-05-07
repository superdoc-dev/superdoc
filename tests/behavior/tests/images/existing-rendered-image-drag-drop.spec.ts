import { expect, test } from '../../fixtures/superdoc.js';
import { dragRenderedElement } from '../../helpers/drag-drop.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const IMAGE_ROOT_SELECTOR =
  '.superdoc-image-fragment[data-drag-source-kind="existingImage"], .superdoc-inline-image-clip-wrapper[data-drag-source-kind="existingImage"], .superdoc-inline-image[data-drag-source-kind="existingImage"]';
const LINE = '.superdoc-line';

async function getFirstNodePosByType(page: Page, typeName: string): Promise<number> {
  return page.evaluate((nodeType: string) => {
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

test.describe('existing rendered image drag and drop', () => {
  test('@behavior SD-2192: dragging an existing image repositions the image node', async ({ superdoc }) => {
    await superdoc.type('Intro paragraph with ');
    await superdoc.page.evaluate(() => {
      (window as any).editor.commands.setImage({
        src: 'assets/image-landscape.png',
        alt: 'Drag me',
        size: { width: 120, height: 80 },
      });
    });
    await expect.poll(async () => getFirstNodePosByType(superdoc.page, 'image')).toBeGreaterThan(0);
    await superdoc.type(' in the first paragraph');
    await superdoc.newLine();
    await superdoc.type('Tail paragraph');
    await superdoc.newLine();
    await superdoc.type('Drop anchor');
    await superdoc.waitForStable();

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'image');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    const anchorBefore = await superdoc.findTextPos('Drop anchor');
    expect(sourceBefore).toBeLessThan(tailBefore);
    expect(tailBefore).toBeLessThan(anchorBefore);

    const source = superdoc.page.locator(IMAGE_ROOT_SELECTOR).first();
    const { line: target } = await getLineByText(superdoc.page, 'Drop anchor');

    await dragRenderedElement(source, target, { targetOffsetX: 4 });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'image');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');
    const anchorAfter = await superdoc.findTextPos('Drop anchor');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).toBeLessThan(anchorAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Intro paragraph with');
  });
});
