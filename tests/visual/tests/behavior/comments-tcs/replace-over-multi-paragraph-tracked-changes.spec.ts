import { type Page } from '@playwright/test';
import { test } from '../../fixtures/superdoc.js';

test.use({ config: { comments: 'on', trackChanges: true, hideSelection: false } });

async function findTextRange(page: Page, text: string) {
  return page.evaluate((needle) => {
    const editor = (window as any).editor;
    let found: { from: number; to: number } | null = null;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (found) return false;
      if (!node.isText || !node.text) return true;

      const index = node.text.indexOf(needle);
      if (index === -1) return true;

      found = { from: pos + index, to: pos + index + needle.length };
      return false;
    });

    if (!found) {
      throw new Error(`Text not found: ${needle}`);
    }

    return found;
  }, text);
}

test('replace over multi-paragraph tracked changes stays coherent', async ({ superdoc }) => {
  await superdoc.type('Line one stays');
  await superdoc.newLine();
  await superdoc.type('Line two keeps tailword2');
  await superdoc.newLine();
  await superdoc.type('Line three keeps tailword3');
  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-1-initial-lines');

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const tail2 = await findTextRange(superdoc.page, 'tailword2');
  await superdoc.setTextSelection(tail2.from, tail2.to);
  await superdoc.press('Backspace');

  const tail3 = await findTextRange(superdoc.page, 'tailword3');
  await superdoc.setTextSelection(tail3.from, tail3.to);
  await superdoc.press('Backspace');

  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-2-lines-2-3-last-word-deleted');

  const line2Start = await findTextRange(superdoc.page, 'Line two keeps');
  const line3Tail = await findTextRange(superdoc.page, 'tailword3');
  await superdoc.setTextSelection(line2Start.from, line3Tail.to);
  await superdoc.type('Merged suggestion');

  await superdoc.waitForStable();
  await superdoc.screenshot('it-67-step-3-replaced-lines-2-3-with-single-change');
});
