import { test as base, expect, type Page, type Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HARNESS_URL = 'http://localhost:9990';

interface HarnessConfig {
  layout?: boolean;
  toolbar?: 'none' | 'full';
  comments?: 'off' | 'on' | 'panel' | 'readonly';
  trackChanges?: boolean;
  showCaret?: boolean;
  showSelection?: boolean;
}

type DocumentMode = 'editing' | 'suggesting' | 'viewing';

function buildHarnessUrl(config: HarnessConfig = {}): string {
  const params = new URLSearchParams();
  if (config.layout !== undefined) params.set('layout', config.layout ? '1' : '0');
  if (config.toolbar) params.set('toolbar', config.toolbar);
  if (config.comments) params.set('comments', config.comments);
  if (config.trackChanges) params.set('trackChanges', '1');
  if (config.showCaret !== undefined) params.set('showCaret', config.showCaret ? '1' : '0');
  if (config.showSelection !== undefined) params.set('showSelection', config.showSelection ? '1' : '0');
  const qs = params.toString();
  return qs ? `${HARNESS_URL}?${qs}` : HARNESS_URL;
}

async function waitForReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(() => (window as any).superdocReady === true, null, { polling: 100, timeout });
}

async function waitForStable(page: Page, ms?: number): Promise<void> {
  if (ms !== undefined) {
    await page.waitForTimeout(ms);
    return;
  }

  // Smart wait: let the current interaction trigger its effects (rAF),
  // then wait until the DOM stops mutating for SETTLE_MS.
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const SETTLE_MS = 50;
        const MAX_WAIT = 5_000;
        let timer: ReturnType<typeof setTimeout>;

        const done = () => {
          clearTimeout(timer);
          observer.disconnect();
          resolve();
        };

        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, SETTLE_MS);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        // If nothing mutates within SETTLE_MS, we're already stable
        timer = setTimeout(done, SETTLE_MS);
        // Safety net — never block longer than MAX_WAIT
        setTimeout(done, MAX_WAIT);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// SuperDoc fixture
// ---------------------------------------------------------------------------

function createFixture(page: Page, editor: Locator, modKey: string) {
  return {
    page,

    // ----- Interaction methods -----

    async type(text: string) {
      await editor.focus();
      await page.keyboard.type(text);
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

    async setDocumentMode(mode: DocumentMode) {
      await page.evaluate((m) => {
        const sd = (window as any).superdoc;
        if (sd?.toolbar && typeof sd?.setDocumentMode === 'function') {
          sd.setDocumentMode(m);
        } else {
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

    async executeCommand(name: string, args?: Record<string, unknown>) {
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

    async snapshot(label: string) {
      if (process.env.SCREENSHOTS !== '1') return;
      const screenshot = await page.screenshot();
      await base.info().attach(label, { body: screenshot, contentType: 'image/png' });
    },

    async loadDocument(filePath: string) {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(filePath);
      await page.waitForFunction(
        () => (window as any).superdoc !== undefined && (window as any).editor !== undefined,
        null,
        { polling: 100, timeout: 30_000 },
      );
      await waitForStable(page, 1000);
    },

    // ----- Assertion methods -----

    async assertTextContent(expected: string) {
      await expect.poll(() => page.evaluate(() => (window as any).editor.state.doc.textContent)).toBe(expected);
    },

    async assertTextContains(sub: string) {
      await expect.poll(() => page.evaluate(() => (window as any).editor.state.doc.textContent)).toContain(sub);
    },

    async assertTextNotContains(sub: string) {
      await expect.poll(() => page.evaluate(() => (window as any).editor.state.doc.textContent)).not.toContain(sub);
    },

    async assertLineText(lineIndex: number, expected: string) {
      await expect(page.locator('.superdoc-line').nth(lineIndex)).toHaveText(expected);
    },

    async assertLineCount(expected: number) {
      await expect(page.locator('.superdoc-line')).toHaveCount(expected);
    },

    async assertPageCount(expected: number) {
      await expect(page.locator('.superdoc-page[data-page-index]')).toHaveCount(expected, { timeout: 15_000 });
    },

    async assertElementExists(selector: string) {
      await expect(page.locator(selector).first()).toBeAttached();
    },

    async assertElementVisible(selector: string) {
      await expect(page.locator(selector).first()).toBeVisible();
    },

    async assertElementHidden(selector: string) {
      await expect(page.locator(selector).first()).toBeHidden();
    },

    async assertElementCount(selector: string, expected: number) {
      await expect(page.locator(selector)).toHaveCount(expected);
    },

    async assertSelection(from: number, to?: number) {
      const expectedSelection = to !== undefined ? { from, to } : { from, to: from };
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { state } = (window as any).editor;
            return { from: state.selection.from, to: state.selection.to };
          }),
        )
        .toEqual(expect.objectContaining(expectedSelection));
    },

    async assertMarkActive(markName: string) {
      await expect
        .poll(() =>
          page.evaluate((name) => {
            const { state } = (window as any).editor;
            const { from, $from, to, empty } = state.selection;
            if (empty) return $from.marks().some((m: any) => m.type.name === name);
            let found = false;
            state.doc.nodesBetween(from, to, (node: any) => {
              if (node.marks?.some((m: any) => m.type.name === name)) found = true;
            });
            return found;
          }, markName),
        )
        .toBe(true);
    },

    async assertMarksAtPos(pos: number, expectedNames: string[]) {
      await expect
        .poll(() =>
          page.evaluate((p) => {
            const { state } = (window as any).editor;
            const node = state.doc.nodeAt(p);
            return node?.marks?.map((m: any) => m.type.name) ?? [];
          }, pos),
        )
        .toEqual(expect.arrayContaining(expectedNames));
    },

    async assertTableExists(rows?: number, cols?: number) {
      // DomPainter renders tables as flat divs, not <tr>/<td>. Use PM state.
      await expect
        .poll(() =>
          page.evaluate(
            ({ expectedRows, expectedCols }) => {
              const doc = (window as any).editor.state.doc;
              let tableFound = false;
              let rowCount = 0;
              let firstRowCols = 0;
              doc.descendants((node: any) => {
                if (node.type.name === 'table') {
                  tableFound = true;
                  node.forEach((row: any) => {
                    rowCount++;
                    if (rowCount === 1) {
                      row.forEach(() => {
                        firstRowCols++;
                      });
                    }
                  });
                  return false;
                }
              });
              if (!tableFound) return 'no table found in document';
              if (expectedRows !== undefined && rowCount !== expectedRows)
                return `expected ${expectedRows} rows, got ${rowCount}`;
              if (expectedCols !== undefined && firstRowCols !== expectedCols)
                return `expected ${expectedCols} columns, got ${firstRowCols}`;
              return 'ok';
            },
            { expectedRows: rows, expectedCols: cols },
          ),
        )
        .toBe('ok');
    },

    async assertCommentHighlightExists(opts?: { text?: string; commentId?: string }) {
      const highlights = page.locator('.superdoc-comment-highlight');
      await expect(highlights.first()).toBeAttached();

      if (opts?.text) {
        await expect(highlights.filter({ hasText: opts.text }).first()).toBeAttached();
      }
      if (opts?.commentId) {
        const commentId = opts.commentId;
        await expect
          .poll(() =>
            page.evaluate(
              (id) =>
                Array.from(document.querySelectorAll('.superdoc-comment-highlight')).some((el) =>
                  (el.getAttribute('data-comment-ids') ?? '')
                    .split(/[\s,]+/)
                    .filter(Boolean)
                    .includes(id),
                ),
              commentId,
            ),
          )
          .toBe(true);
      }
    },

    async assertTrackedChangeExists(type: 'insert' | 'delete' | 'format') {
      await expect(page.locator(`.track-${type}-dec`).first()).toBeAttached();
    },

    async assertLinkExists(href: string) {
      await expect
        .poll(() =>
          page.evaluate(
            (h) => Array.from(document.querySelectorAll('.superdoc-link')).some((el) => el.getAttribute('href') === h),
            href,
          ),
        )
        .toBe(true);
    },

    async assertListMarkerText(lineIndex: number, expected: string) {
      const line = page.locator('.superdoc-line').nth(lineIndex);
      await expect(line.locator('.superdoc-paragraph-marker')).toHaveText(expected);
    },

    async assertMarkNotActive(markName: string) {
      await expect
        .poll(() =>
          page.evaluate((name) => {
            const { state } = (window as any).editor;
            const { from, $from, to, empty } = state.selection;
            if (empty) return $from.marks().some((m: any) => m.type.name === name);
            let found = false;
            state.doc.nodesBetween(from, to, (node: any) => {
              if (node.marks?.some((m: any) => m.type.name === name)) found = true;
            });
            return found;
          }, markName),
        )
        .toBe(false);
    },

    async assertDocumentMode(mode: DocumentMode) {
      await expect
        .poll(() =>
          page.evaluate(
            ({ expectedMode }: { expectedMode: DocumentMode }) => {
              const sd = (window as any).superdoc;
              const editorMode = (window as any).editor?.options?.documentMode;
              const hasToolbar = Boolean(sd?.toolbar);
              if (hasToolbar) {
                const configMode = sd?.config?.documentMode;
                return configMode === expectedMode;
              }
              return editorMode === expectedMode;
            },
            { expectedMode: mode },
          ),
        )
        .toBe(true);
    },

    async assertMarkAttrsAtPos(pos: number, markName: string, attrs: Record<string, unknown>) {
      await expect
        .poll(() =>
          page.evaluate(
            ({ p, name }) => {
              const { state } = (window as any).editor;
              const node = state.doc.nodeAt(p);
              const mark = node?.marks?.find((m: any) => m.type.name === name);
              return mark ? mark.attrs : null;
            },
            { p: pos, name: markName },
          ),
        )
        .toEqual(expect.objectContaining(attrs));
    },

    // ----- Getter methods -----

    async getTextContent(): Promise<string> {
      return page.evaluate(() => (window as any).editor.state.doc.textContent);
    },

    async getSelection(): Promise<{ from: number; to: number }> {
      return page.evaluate(() => {
        const { state } = (window as any).editor;
        return { from: state.selection.from, to: state.selection.to };
      });
    },

    async getMarksAtPos(pos: number): Promise<string[]> {
      return page.evaluate((p) => {
        const { state } = (window as any).editor;
        const node = state.doc.nodeAt(p);
        return node?.marks?.map((m: any) => m.type.name) ?? [];
      }, pos);
    },

    async getMarkAttrsAtPos(pos: number): Promise<Array<{ name: string; attrs: Record<string, unknown> }>> {
      return page.evaluate((p) => {
        const { state } = (window as any).editor;
        const node = state.doc.nodeAt(p);
        return node?.marks?.map((m: any) => ({ name: m.type.name, attrs: m.attrs })) ?? [];
      }, pos);
    },

    async findTextPos(text: string): Promise<number> {
      return page.evaluate((search) => {
        const doc = (window as any).editor.state.doc;
        let found = -1;
        doc.descendants((node: any, pos: number) => {
          if (found !== -1) return false;
          if (node.isText && node.text && node.text.includes(search)) {
            found = pos + node.text.indexOf(search);
          }
        });
        if (found === -1) throw new Error(`Text "${search}" not found in document`);
        return found;
      }, text);
    },
  };
}

export type SuperDocFixture = ReturnType<typeof createFixture>;

interface SuperDocOptions {
  config?: HarnessConfig;
}

export const test = base.extend<{ superdoc: SuperDocFixture } & SuperDocOptions>({
  config: [{}, { option: true }],

  superdoc: async ({ page, config }, use) => {
    const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

    // Navigate to harness
    const url = buildHarnessUrl({ layout: true, ...config });
    await page.goto(url);
    await waitForReady(page);

    // Focus the editor — use .focus() not .click() because in layout mode
    // the ProseMirror contenteditable is positioned off-screen (DomPainter renders visuals).
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    await editor.focus();

    await use(createFixture(page, editor, modKey));
  },
});

export { expect };
