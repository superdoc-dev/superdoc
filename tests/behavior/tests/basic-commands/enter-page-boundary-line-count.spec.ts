import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKDOWN_PATH = path.resolve(__dirname, 'fixtures/enter-page-boundary.md');

type HeadingPageCheck = {
  ok: boolean;
  headingLineIndex?: number;
  previousLineText?: string | null;
  firstLineText?: string | null;
  reason?: string;
};

const evaluateHeadingPagePosition = async (superdoc: any, needle: string): Promise<HeadingPageCheck> => {
  return superdoc.page.evaluate((headingNeedle) => {
    const normalize = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const lines = Array.from(document.querySelectorAll('.superdoc-line')) as HTMLElement[];
    const headingLine = lines.find((line) => normalize(line.textContent).toLowerCase() === headingNeedle.toLowerCase());
    if (!headingLine) {
      return { ok: false, reason: 'heading line not found in rendered DOM' };
    }

    const page = headingLine.closest('.superdoc-page');
    if (!page) {
      return { ok: false, reason: 'heading line is not inside a .superdoc-page element' };
    }

    const bodyLines = Array.from(page.querySelectorAll('.superdoc-line')).filter((line) => {
      const element = line as HTMLElement;
      return !element.closest('.superdoc-page-header') && !element.closest('.superdoc-page-footer');
    }) as HTMLElement[];

    const headingLineIndex = bodyLines.findIndex((line) => line === headingLine);
    if (headingLineIndex < 0) {
      return { ok: false, reason: 'heading line not found among page body lines' };
    }

    const previousLineText = headingLineIndex > 0 ? normalize(bodyLines[headingLineIndex - 1].textContent) : null;
    const firstLineText = bodyLines[0] ? normalize(bodyLines[0].textContent) : null;

    return {
      ok: headingLineIndex === 0,
      headingLineIndex,
      previousLineText,
      firstLineText,
    };
  }, needle);
};

test('enter at heading boundary does not insert extra blank line above heading on next page', async ({ superdoc }) => {
  const markdown = fs.readFileSync(MARKDOWN_PATH, 'utf8');

  await superdoc.page.evaluate((contentOverride) => {
    const init = (window as any).behaviorHarnessInit;
    if (typeof init !== 'function') {
      throw new Error('behaviorHarnessInit is unavailable in behavior harness.');
    }

    init({
      contentOverride,
      overrideType: 'markdown',
    });
  }, markdown);

  await superdoc.page.waitForFunction(() => (window as any).superdocReady === true, null, { timeout: 30_000 });
  await superdoc.waitForStable();

  const headingText = 'heading 2 before break';
  const headingStartPos = await superdoc.page.evaluate((needle) => {
    const editor = (window as any).editor;
    const state = editor?.state;
    if (!state?.doc) return null;

    let foundPos: number | null = null;
    state.doc.descendants((node: any, pos: number) => {
      if (foundPos !== null) return false;
      if (node?.isText && typeof node.text === 'string') {
        const idx = node.text.indexOf(needle);
        if (idx >= 0) {
          foundPos = pos + idx;
          return false;
        }
      }
      return true;
    });

    return foundPos;
  }, headingText);

  if (headingStartPos == null) {
    throw new Error(`Unable to find heading text "${headingText}" in document.`);
  }

  const preCheck = await evaluateHeadingPagePosition(superdoc, headingText);
  test.skip(
    !preCheck.ok,
    `Precondition unmet: heading is not at page boundary in this environment (index=${String(preCheck.headingLineIndex)}, first="${String(
      preCheck.firstLineText,
    )}").`,
  );

  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    editor?.commands?.focus?.();
  });
  await superdoc.setTextSelection(headingStartPos);
  await superdoc.press('Enter');
  await superdoc.waitForStable();

  const pageCheck = await evaluateHeadingPagePosition(superdoc, headingText);

  if (!pageCheck.ok) {
    throw new Error(
      `Expected heading to be first body line on its page. Got index=${String(pageCheck.headingLineIndex)}, prev="${String(
        pageCheck.previousLineText,
      )}", first="${String(pageCheck.firstLineText)}"${pageCheck.reason ? `, reason=${pageCheck.reason}` : ''}`,
    );
  }
});
