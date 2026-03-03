import { test, expect } from '../../fixtures/superdoc.js';

type RenderSnapshot = {
  color: string | null;
  paragraphGap: number | null;
  lineCount: number;
};

test('styles.apply docDefaults mutations rerender color and paragraph spacing', async ({ superdoc }) => {
  await superdoc.page.evaluate(() => {
    (window as any).editor.view.focus();
  });
  await superdoc.type('first paragraph');
  await superdoc.newLine();
  await superdoc.type('second paragraph');
  await superdoc.waitForStable();

  const before = await superdoc.page.evaluate<RenderSnapshot>(() => {
    const lines = Array.from(document.querySelectorAll('.superdoc-line')) as HTMLElement[];
    const firstLine = lines[0] ?? null;
    const secondLine = lines[1] ?? null;
    const firstSpan = firstLine?.querySelector('span');
    const color = firstSpan ? getComputedStyle(firstSpan).color : null;
    const paragraphGap =
      firstLine && secondLine ? secondLine.getBoundingClientRect().top - firstLine.getBoundingClientRect().top : null;

    return {
      color,
      paragraphGap,
      lineCount: lines.length,
    };
  });
  expect(before.lineCount).toBeGreaterThanOrEqual(2);
  expect(before.color).toBe('rgb(0, 0, 0)');
  expect(before.paragraphGap).toBeTruthy();

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor.doc.styles.apply({
      target: { scope: 'docDefaults', channel: 'paragraph' },
      patch: { spacing: { before: 240, after: 120 } },
    });
    editor.doc.styles.apply({
      target: { scope: 'docDefaults', channel: 'run' },
      patch: { color: { val: 'FF0000' } },
    });
  });
  await superdoc.waitForStable();

  const after = await superdoc.page.evaluate<RenderSnapshot>(() => {
    const lines = Array.from(document.querySelectorAll('.superdoc-line')) as HTMLElement[];
    const firstLine = lines[0] ?? null;
    const secondLine = lines[1] ?? null;
    const firstSpan = firstLine?.querySelector('span');
    const color = firstSpan ? getComputedStyle(firstSpan).color : null;
    const paragraphGap =
      firstLine && secondLine ? secondLine.getBoundingClientRect().top - firstLine.getBoundingClientRect().top : null;

    return {
      color,
      paragraphGap,
      lineCount: lines.length,
    };
  });
  expect(after.color).toBe('rgb(255, 0, 0)');
  expect(after.paragraphGap).toBeGreaterThan((before.paragraphGap ?? 0) + 5);
});
