import { test as base, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers — inline versions of what @superdoc-testing/helpers provides,
// kept here so the prototype has zero workspace deps beyond Playwright.
// ---------------------------------------------------------------------------

const HARNESS_URL = 'http://localhost:9989';

interface HarnessConfig {
  layout?: boolean;
  toolbar?: 'none' | 'minimal' | 'full';
  comments?: 'off' | 'on' | 'panel' | 'readonly';
  trackChanges?: boolean;
  hideCaret?: boolean;
  hideSelection?: boolean;
  width?: number;
  height?: number;
}

function buildHarnessUrl(config: HarnessConfig = {}): string {
  const params = new URLSearchParams();
  if (config.layout !== undefined) params.set('layout', config.layout ? '1' : '0');
  if (config.toolbar) params.set('toolbar', config.toolbar);
  if (config.comments) params.set('comments', config.comments);
  if (config.trackChanges) params.set('trackChanges', '1');
  if (config.hideCaret !== undefined) params.set('hideCaret', config.hideCaret ? '1' : '0');
  if (config.hideSelection !== undefined) params.set('hideSelection', config.hideSelection ? '1' : '0');
  if (config.width) params.set('width', String(config.width));
  if (config.height) params.set('height', String(config.height));
  const qs = params.toString();
  return qs ? `${HARNESS_URL}?${qs}` : HARNESS_URL;
}

async function waitForReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => (window as any).superdocReady === true, null, { polling: 100, timeout });
}

async function waitForStable(page: Page, ms = 1500): Promise<void> {
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.fonts.ready);
}

// ---------------------------------------------------------------------------
// SuperDoc fixture
// ---------------------------------------------------------------------------

export interface SuperDocFixture {
  /** The raw Playwright Page */
  page: Page;

  /** Type text into the editor */
  type(text: string): Promise<void>;
  /** Press a single key */
  press(key: string): Promise<void>;
  /** Press Enter */
  newLine(): Promise<void>;
  /** Press Cmd/Ctrl+key */
  shortcut(key: string): Promise<void>;
  /** Toggle bold */
  bold(): Promise<void>;
  /** Toggle italic */
  italic(): Promise<void>;
  /** Toggle underline */
  underline(): Promise<void>;
  /** Undo */
  undo(): Promise<void>;
  /** Redo */
  redo(): Promise<void>;
  /** Select all */
  selectAll(): Promise<void>;
  /** Triple-click a line by index to select it */
  tripleClickLine(lineIndex: number): Promise<void>;
  /** Execute an editor command via window.editor.commands */
  executeCommand(name: string, args?: Record<string, any>): Promise<void>;
  /** Set document mode (editing, suggesting, viewing) */
  setDocumentMode(mode: 'editing' | 'suggesting' | 'viewing'): Promise<void>;
  /** Set cursor/selection position via ProseMirror positions */
  setTextSelection(from: number, to?: number): Promise<void>;
  /** Find the first occurrence of a text string in the document and return its ProseMirror position range. */
  findTextRange(text: string): Promise<{ from: number; to: number }>;
  /** Single click on a line by index */
  clickOnLine(lineIndex: number, xOffset?: number): Promise<void>;
  /** Click on a comment highlight containing the given text */
  clickOnCommentedText(textMatch: string): Promise<void>;
  /** Press a key multiple times */
  pressTimes(key: string, count: number): Promise<void>;
  /** Wait for the editor to stabilize */
  waitForStable(ms?: number): Promise<void>;

  /** Wait for editor to stabilize, then take a full-page screenshot */
  screenshot(name: string): Promise<void>;

  /** Load a .docx document into the editor */
  loadDocument(filePath: string): Promise<void>;

  /** Assert the number of rendered pages matches expected count */
  assertPageCount(expected: number): Promise<void>;

  /** Screenshot every rendered page (for paginated/layout docs) */
  screenshotPages(baseName: string, maxPages?: number): Promise<void>;
}

interface SuperDocOptions {
  config?: HarnessConfig;
}

export const test = base.extend<{ superdoc: SuperDocFixture } & SuperDocOptions>({
  config: [{}, { option: true }],

  superdoc: async ({ page, config }, use) => {
    const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

    // Navigate to harness
    const url = buildHarnessUrl({
      layout: true,
      hideCaret: true,
      hideSelection: true,
      ...config,
    });
    await page.goto(url);
    await waitForReady(page);

    // Focus the editor — use .focus() not .click() because in layout mode
    // the ProseMirror contenteditable is positioned off-screen (DomPainter renders visuals).
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    await editor.focus();

    const fixture: SuperDocFixture = {
      page,

      async type(text: string) {
        await editor.focus();
        await page.keyboard.type(text, { delay: 30 });
      },

      async press(key: string) {
        await page.keyboard.press(key);
      },

      async newLine() {
        await page.keyboard.press('Enter');
      },

      async shortcut(key: string) {
        await page.keyboard.press(`${modKey}+${key}`);
      },

      async bold() {
        await page.keyboard.press(`${modKey}+b`);
      },

      async italic() {
        await page.keyboard.press(`${modKey}+i`);
      },

      async underline() {
        await page.keyboard.press(`${modKey}+u`);
      },

      async undo() {
        await page.keyboard.press(`${modKey}+z`);
      },

      async redo() {
        await page.keyboard.press(`${modKey}+Shift+z`);
      },

      async selectAll() {
        await page.keyboard.press(`${modKey}+a`);
      },

      async tripleClickLine(lineIndex: number) {
        const line = page.locator('.superdoc-line').nth(lineIndex);
        await line.click({ clickCount: 3, timeout: 10_000 });
      },

      async setDocumentMode(mode: 'editing' | 'suggesting' | 'viewing') {
        await page.evaluate((m) => {
          const sd = (window as any).superdoc;
          // Some modes (e.g., viewing) access toolbar internals — guard against null
          if (sd.toolbar) {
            sd.setDocumentMode(m);
          } else {
            // Fallback: set mode on activeEditor directly
            sd.activeEditor?.setDocumentMode(m);
          }
        }, mode);
      },

      async setTextSelection(from: number, to?: number) {
        await page.waitForFunction(() => (window as any).editor?.commands, null, { timeout: 10_000 });
        await page.evaluate(
          ({ f, t }) => {
            const editor = (window as any).editor;
            editor.commands.setTextSelection({ from: f, to: t ?? f });
          },
          { f: from, t: to },
        );
      },

      async findTextRange(text: string): Promise<{ from: number; to: number }> {
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
      },

      async clickOnLine(lineIndex: number, xOffset = 10) {
        const line = page.locator('.superdoc-line').nth(lineIndex);
        const box = await line.boundingBox();
        if (!box) throw new Error(`Line ${lineIndex} not visible`);
        await page.mouse.click(box.x + xOffset, box.y + box.height / 2);
      },

      async clickOnCommentedText(textMatch: string) {
        const highlights = page.locator('.superdoc-comment-highlight');
        const count = await highlights.count();
        let bestIndex = -1;
        let bestArea = Infinity;

        for (let i = 0; i < count; i++) {
          const hl = highlights.nth(i);
          const text = await hl.textContent();
          if (text && text.includes(textMatch)) {
            const box = await hl.boundingBox();
            if (box) {
              const area = box.width * box.height;
              if (area < bestArea) {
                bestArea = area;
                bestIndex = i;
              }
            }
          }
        }

        if (bestIndex === -1) throw new Error(`No comment highlight found for "${textMatch}"`);
        await highlights.nth(bestIndex).click();
      },

      async pressTimes(key: string, count: number) {
        for (let i = 0; i < count; i++) {
          await page.keyboard.press(key);
        }
      },

      async executeCommand(name: string, args?: Record<string, any>) {
        await page.waitForFunction(() => (window as any).editor?.commands, null, { timeout: 10_000 });
        await page.evaluate(
          ({ cmd, cmdArgs }) => {
            const editor = (window as any).editor;
            if (!editor?.commands?.[cmd]) throw new Error(`Command "${cmd}" not found`);
            if (cmdArgs && Object.keys(cmdArgs).length > 0) {
              editor.commands[cmd](cmdArgs);
            } else {
              editor.commands[cmd]();
            }
          },
          { cmd: name, cmdArgs: args },
        );
      },

      async waitForStable(ms?: number) {
        await waitForStable(page, ms);
      },

      async screenshot(name: string) {
        await waitForStable(page);

        await expect(page).toHaveScreenshot(`${name}.png`, {
          fullPage: true,
          timeout: 15_000,
        });
      },

      async loadDocument(filePath: string) {
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(filePath);
        // Wait for document to load and render
        await page.waitForFunction(
          () => (window as any).superdoc !== undefined && (window as any).editor !== undefined,
          null,
          { polling: 100, timeout: 30_000 },
        );
        await waitForStable(page, 1000);
      },

      async assertPageCount(expected: number) {
        await waitForStable(page);
        const pages = page.locator('.superdoc-page[data-page-index]');
        await expect(pages).toHaveCount(expected, { timeout: 15_000 });
      },

      async screenshotPages(baseName: string, maxPages?: number) {
        await waitForStable(page);

        const pages = page.locator('.superdoc-page[data-page-index]');
        let count = await pages.count();
        if (maxPages && count > maxPages) count = maxPages;

        if (count === 0) {
          // No paginated pages — screenshot the whole editor
          await fixture.screenshot(baseName);
          return;
        }

        for (let i = 0; i < count; i++) {
          const pageEl = pages.nth(i);

          // Skip pages that can't be scrolled into view (e.g. empty trailing pages)
          try {
            await pageEl.scrollIntoViewIfNeeded({ timeout: 5_000 });
          } catch {
            break;
          }

          await expect(pageEl).toHaveScreenshot(`${baseName}-p${i + 1}.png`, {
            timeout: 15_000,
          });
        }
      },
    };

    await use(fixture);
  },
});

export { expect };
