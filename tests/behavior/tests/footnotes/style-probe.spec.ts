/** Temporary probe — paste and undo paths inside a note session. */
import { test, expect } from '../../fixtures/superdoc.js';
import { BASIC_FOOTNOTES_DOC_PATH } from '../../helpers/story-fixtures.js';

test.use({ config: { showCaret: true, showSelection: true } });

async function openNote(superdoc: any) {
  await superdoc.loadDocument(BASIC_FOOTNOTES_DOC_PATH);
  await superdoc.waitForStable();
  const note = superdoc.page.locator('[data-block-id^="footnote-1-"]').first();
  await note.scrollIntoViewIfNeeded();
  const box = await note.boundingBox();
  await superdoc.page.mouse.dblclick(box!.x + 60, box!.y + box!.height / 2);
  await superdoc.waitForStable();
}

const dump = (superdoc: any) =>
  superdoc.page.evaluate(() => {
    const sed = (window as any).editor?.presentationEditor?.getActiveEditor?.();
    const out: string[] = [];
    sed?.state?.doc?.forEach((n: any) => {
      out.push(`${n.attrs?.paragraphProperties?.styleId ?? 'NONE'}:${(n.textContent || '~').slice(0, 8)}`);
    });
    return out.join(' | ');
  });

test('probe: paste multi-paragraph content inside a note', async ({ superdoc }) => {
  await openNote(superdoc);
  // Build two paragraphs, select all, copy, then paste at the end twice.
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.type('copy me');
  await superdoc.waitForStable(400);
  await superdoc.page.keyboard.press('ControlOrMeta+a');
  await superdoc.page.keyboard.press('ControlOrMeta+c');
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.press('ControlOrMeta+v');
  await superdoc.waitForStable(800);
  console.log('AFTER-PASTE:', await dump(superdoc));

  const sizes = await superdoc.page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-block-id^="footnote-1-"] .superdoc-line'))
      .map(
        (l) =>
          `${(l.textContent ?? '~').slice(0, 8)}=${
            Array.from(l.querySelectorAll('span'))
              .map((s) => (s as HTMLElement).style.fontSize)
              .filter(Boolean)[0] ?? '?'
          }`,
      )
      .join(' | '),
  );
  console.log('PAINTED:', sizes);
  expect(true).toBe(true);
});

test('probe: undo and redo around splits inside a note', async ({ superdoc }) => {
  await openNote(superdoc);
  await superdoc.page.keyboard.press('End');
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.type('one');
  await superdoc.page.keyboard.press('Enter');
  await superdoc.page.keyboard.type('two');
  await superdoc.waitForStable(400);
  await superdoc.page.keyboard.press('ControlOrMeta+z');
  await superdoc.page.keyboard.press('ControlOrMeta+z');
  await superdoc.waitForStable(400);
  await superdoc.page.keyboard.press('ControlOrMeta+Shift+z');
  await superdoc.page.keyboard.press('ControlOrMeta+Shift+z');
  await superdoc.waitForStable(600);
  console.log('AFTER-UNDO-REDO:', await dump(superdoc));
  expect(true).toBe(true);
});
