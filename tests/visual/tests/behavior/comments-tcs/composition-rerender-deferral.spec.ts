import { test, expect } from '../../fixtures/superdoc.js';
import { getMarkedText } from '../../../../behavior/helpers/tracked-changes.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'off',
    trackChanges: true,
    hideCaret: true,
    hideSelection: true,
  },
});

test('@behavior SD-2368: composition commits correctly in editing mode', async ({ superdoc }) => {
  await superdoc.waitForStable();

  await superdoc.composeText('你好');
  await superdoc.waitForStable();

  await superdoc.type(' ');
  await superdoc.composeText('世界');
  await superdoc.waitForStable();

  await expect.poll(() => superdoc.page.evaluate(() => (window as any).editor.state.doc.textContent)).toBe('你好 世界');

  await superdoc.screenshot('behavior-sd-2368-composition-editing-mode');
});

test('@behavior SD-2368: composition commits correctly in suggesting mode', async ({ superdoc }) => {
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  await superdoc.composeText('你好');
  await superdoc.waitForStable();
  await superdoc.type(' ');
  await superdoc.composeText('世界');
  await superdoc.waitForStable();

  const fullText = '你好 世界';
  await expect.poll(() => superdoc.page.evaluate(() => (window as any).editor.state.doc.textContent)).toBe(fullText);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe(fullText);

  await superdoc.screenshot('behavior-sd-2368-composition-suggesting-mode');
});

test('@behavior SD-2368: rapid composition cycles in suggesting mode', async ({ superdoc }) => {
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Simulate rapid back-to-back compositions (typing multiple characters quickly)
  await superdoc.composeText('中');
  await superdoc.composeText('国');
  await superdoc.composeText('人');
  await superdoc.waitForStable();

  const fullText = '中国人';
  await expect.poll(() => superdoc.page.evaluate(() => (window as any).editor.state.doc.textContent)).toBe(fullText);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe(fullText);

  await superdoc.screenshot('behavior-sd-2368-rapid-composition-suggesting');
});
