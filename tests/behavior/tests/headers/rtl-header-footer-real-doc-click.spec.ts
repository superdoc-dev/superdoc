import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../../fixtures/superdoc.js';
import { activateHeader } from '../../helpers/story-surfaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-header-footer.docx');

test.skip(!fs.existsSync(DOC_PATH), 'RTL header/footer real-doc fixture not available');

test.use({
  config: {
    documentMode: 'editing',
    showCaret: true,
    showSelection: true,
  },
});

test('real doc: click in RTL header maps to active caret position', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await activateHeader(superdoc);

  const target = superdoc.page.locator('.superdoc-page-header .superdoc-line span[data-pm-start]').first();
  const box = await target.boundingBox();
  expect(box).toBeTruthy();

  const point = {
    x: box!.x + box!.width * 0.75,
    y: box!.y + box!.height / 2,
  };

  await superdoc.page.mouse.click(point.x, point.y);
  await superdoc.waitForStable();

  const clickState = await superdoc.page.evaluate(({ x, y }) => {
    const presentation = (window as any).editor?.presentationEditor;
    const activeEditor = presentation?.getActiveEditor?.();
    const selection = activeEditor?.state?.selection;
    const hit = presentation?.hitTest?.(x, y) ?? null;
    return {
      hitPos: hit?.pos ?? null,
      selection: selection ? { from: selection.from, to: selection.to } : null,
    };
  }, point);

  expect(clickState.hitPos).toBeTruthy();
  expect(clickState.selection).toEqual({
    from: clickState.hitPos,
    to: clickState.hitPos,
  });
});
