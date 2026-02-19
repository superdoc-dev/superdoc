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

type TextRange = {
  blockId: string;
  start: number;
  end: number;
};

type InlineSpan = {
  blockId: string;
  start: number;
  end: number;
  properties: Record<string, unknown>;
};

type DocTextSnapshot = {
  ranges: TextRange[];
  blockAddress: unknown;
  runs: InlineSpan[];
  hyperlinks: InlineSpan[];
};

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
  const normalizeHexColor = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/^#/, '').trim().toUpperCase();
    return normalized || null;
  };

  const matchesTextStyleAttr = (props: Record<string, unknown>, key: string, expectedValue: unknown): boolean => {
    if (key === 'fontFamily') {
      return props.font === expectedValue;
    }

    if (key === 'color') {
      const expectedColor = normalizeHexColor(expectedValue);
      return expectedColor ? normalizeHexColor(props.color) === expectedColor : false;
    }

    if (key === 'fontSize') {
      const parsed =
        typeof expectedValue === 'number'
          ? expectedValue
          : Number.parseFloat(String(expectedValue).replace(/pt$/i, ''));
      if (!Number.isFinite(parsed)) return false;
      const sizeValue = props.size;
      if (typeof sizeValue !== 'number') return false;
      return [parsed, parsed * 2, parsed / 2].some((candidate) => Math.abs(sizeValue - candidate) < 0.01);
    }

    return false;
  };

  const getTextContentFromDocApi = async (): Promise<string> =>
    page.evaluate(() => {
      const docApi = (window as any).editor?.doc;
      if (!docApi?.getText) {
        throw new Error('Document API is unavailable: expected editor.doc.getText().');
      }
      return docApi.getText({});
    });

  const getDocTextSnapshot = async (text: string, occurrence = 0): Promise<DocTextSnapshot | null> =>
    page.evaluate(
      ({ searchText, matchIndex }) => {
        const docApi = (window as any).editor?.doc;
        if (!docApi?.find) {
          throw new Error('Document API is unavailable: expected editor.doc.find().');
        }

        const textResult = docApi.find({
          select: { type: 'text', pattern: searchText, mode: 'contains', caseSensitive: true },
        });
        const context = textResult?.context?.[matchIndex];
        if (!context?.address) return null;

        const ranges = (context.textRanges ?? []).map((range: any) => ({
          blockId: range.blockId,
          start: range.range.start,
          end: range.range.end,
        }));
        if (!ranges.length) return null;

        const toInlineSpans = (result: any): InlineSpan[] =>
          (result?.matches ?? [])
            .map((address: any, i: number) => {
              if (address?.kind !== 'inline') return null;
              const { start, end } = address.anchor ?? {};
              if (!start || !end) return null;
              return {
                blockId: start.blockId,
                start: start.offset,
                end: end.offset,
                properties: result.nodes?.[i]?.properties ?? {},
              };
            })
            .filter(Boolean);

        const runResult = docApi.find({
          select: { type: 'node', nodeType: 'run', kind: 'inline' },
          within: context.address,
          includeNodes: true,
        });

        const hyperlinkResult = docApi.find({
          select: { type: 'node', nodeType: 'hyperlink', kind: 'inline' },
          within: context.address,
          includeNodes: true,
        });

        return {
          ranges,
          blockAddress: context.address,
          runs: toInlineSpans(runResult),
          hyperlinks: toInlineSpans(hyperlinkResult),
        } satisfies DocTextSnapshot;
      },
      { searchText: text, matchIndex: occurrence },
    );

  const overlapsRange = (span: InlineSpan, ranges: TextRange[]): boolean =>
    ranges.some((range) => {
      if (range.blockId !== span.blockId) return false;
      return Math.max(span.start, range.start) < Math.min(span.end, range.end);
    });

  const getDocMarksByText = async (text: string, occurrence = 0): Promise<string[] | null> => {
    const snapshot = await getDocTextSnapshot(text, occurrence);
    if (!snapshot) return null;

    const marks = new Set<string>();
    for (const run of snapshot.runs) {
      if (!overlapsRange(run, snapshot.ranges)) continue;
      if (run.properties.bold === true) marks.add('bold');
      if (run.properties.italic === true) marks.add('italic');
      if (run.properties.underline === true) marks.add('underline');
      if (run.properties.strike === true || run.properties.strikethrough === true) marks.add('strike');
      if (run.properties.highlight) marks.add('highlight');
    }
    for (const link of snapshot.hyperlinks) {
      if (overlapsRange(link, snapshot.ranges)) marks.add('link');
    }

    return [...marks];
  };

  const getDocRunPropertiesByText = async (
    text: string,
    occurrence = 0,
  ): Promise<Array<Record<string, unknown>> | null> => {
    const snapshot = await getDocTextSnapshot(text, occurrence);
    if (!snapshot) return null;
    const runs = snapshot.runs.filter((run) => overlapsRange(run, snapshot.ranges));
    return runs.map((run) => run.properties);
  };

  const getDocLinkHrefsByText = async (text: string, occurrence = 0): Promise<string[] | null> => {
    const snapshot = await getDocTextSnapshot(text, occurrence);
    if (!snapshot) return null;

    const hrefs = snapshot.hyperlinks
      .filter((link) => overlapsRange(link, snapshot.ranges))
      .map((link) => link.properties.href)
      .filter((href): href is string => typeof href === 'string');

    return hrefs;
  };
  const fixture = {
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
      await expect.poll(() => fixture.getTextContent()).toBe(expected);
    },

    async assertTextContains(sub: string) {
      await expect.poll(() => fixture.getTextContent()).toContain(sub);
    },

    async assertTextNotContains(sub: string) {
      await expect.poll(() => fixture.getTextContent()).not.toContain(sub);
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

    async assertTextHasMarks(text: string, expectedNames: string[], occurrence = 0) {
      const marks = await getDocMarksByText(text, occurrence);
      expect(marks).not.toBeNull();
      expect(marks ?? []).toEqual(expect.arrayContaining(expectedNames));
    },

    async assertTextLacksMarks(text: string, disallowedNames: string[], occurrence = 0) {
      const marks = await getDocMarksByText(text, occurrence);
      expect(marks).not.toBeNull();
      for (const markName of disallowedNames) {
        expect(marks ?? []).not.toContain(markName);
      }
    },

    async assertTableExists(rows?: number, cols?: number) {
      if ((rows === undefined) !== (cols === undefined)) {
        throw new Error('assertTableExists expects both rows and cols, or neither.');
      }

      await expect
        .poll(() =>
          page.evaluate(
            ({ expectedRows, expectedCols }) => {
              const docApi = (window as any).editor?.doc;
              if (!docApi?.find) {
                throw new Error('Document API is unavailable: expected editor.doc.find().');
              }

              const tableResult = docApi.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
              const tableAddress = tableResult?.matches?.[0];
              if (!tableAddress) return 'no table found in document';

              if (expectedRows !== undefined && expectedCols !== undefined) {
                const expectedCellCount = expectedRows * expectedCols;

                const rowResult = docApi.find({ select: { type: 'node', nodeType: 'tableRow' }, within: tableAddress });
                const rowCount = rowResult?.matches?.length ?? 0;

                // Only validate row count when the adapter exposes row-level querying.
                if (rowCount > 0 && rowCount !== expectedRows) {
                  return `expected ${expectedRows} rows, got ${rowCount}`;
                }

                const cellResult = docApi.find({
                  select: { type: 'node', nodeType: 'tableCell' },
                  within: tableAddress,
                });
                let cellCount = cellResult?.matches?.length ?? 0;
                try {
                  const headerResult = docApi.find({
                    select: { type: 'node', nodeType: 'tableHeader' },
                    within: tableAddress,
                  });
                  cellCount += headerResult?.matches?.length ?? 0;
                } catch {
                  /* tableHeader may not be queryable */
                }

                // Fallback: count paragraphs when cell-level querying isn't available.
                if (cellCount === 0) {
                  const paragraphResult = docApi.find({
                    select: { type: 'node', nodeType: 'paragraph' },
                    within: tableAddress,
                  });
                  cellCount = paragraphResult?.matches?.length ?? 0;
                }

                if (cellCount !== expectedCellCount) {
                  return `expected ${expectedCellCount} cells, got ${cellCount}`;
                }
              }

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

    async assertTextMarkAttrs(text: string, markName: string, attrs: Record<string, unknown>, occurrence = 0) {
      if (markName === 'link') {
        const hrefs = await getDocLinkHrefsByText(text, occurrence);
        expect(hrefs).not.toBeNull();
        expect(typeof attrs.href).toBe('string');
        expect(hrefs ?? []).toContain(attrs.href as string);
        return;
      }

      if (markName === 'textStyle') {
        const runProperties = await getDocRunPropertiesByText(text, occurrence);
        expect(runProperties).not.toBeNull();
        expect((runProperties ?? []).length).toBeGreaterThan(0);
        const entries = Object.entries(attrs);
        const allMatched = (runProperties ?? []).some((props) =>
          entries.every(([key, expectedValue]) => matchesTextStyleAttr(props, key, expectedValue)),
        );
        expect(allMatched).toBe(true);
        return;
      }

      throw new Error(`assertTextMarkAttrs only supports "link" and "textStyle" via document-api; got "${markName}".`);
    },

    async assertTextAlignment(text: string, expectedAlignment: string, occurrence = 0) {
      await expect
        .poll(() =>
          page.evaluate(
            ({ searchText, matchIndex }) => {
              const docApi = (window as any).editor?.doc;
              if (!docApi?.find || !docApi?.getNode) {
                throw new Error('Document API is unavailable: expected editor.doc.find/getNode.');
              }

              const textResult = docApi.find({
                select: { type: 'text', pattern: searchText, mode: 'contains', caseSensitive: true },
              });
              const contexts = Array.isArray(textResult?.context) ? textResult.context : [];
              const context = contexts[matchIndex];
              if (!context?.address) return null;

              const node = docApi.getNode(context.address);
              return node?.properties?.alignment ?? null;
            },
            { searchText: text, matchIndex: occurrence },
          ),
        )
        .toBe(expectedAlignment);
    },

    // ----- Getter methods -----

    async getTextContent(): Promise<string> {
      return getTextContentFromDocApi();
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

    async findTextPos(text: string, occurrence = 0): Promise<number> {
      return page.evaluate(
        ({ search, targetOccurrence }) => {
          const doc = (window as any).editor.state.doc;
          let found = -1;
          let seen = 0;

          doc.descendants((node: any, pos: number) => {
            if (found !== -1) return false;
            if (!node.isText || !node.text) return;

            let fromIndex = 0;
            while (fromIndex <= node.text.length) {
              const hit = node.text.indexOf(search, fromIndex);
              if (hit === -1) break;
              if (seen === targetOccurrence) {
                found = pos + hit;
                return false;
              }
              seen++;
              fromIndex = hit + 1;
            }
          });

          if (found === -1) throw new Error(`Text "${search}" (occurrence ${targetOccurrence}) not found in document`);
          return found;
        },
        { search: text, targetOccurrence: occurrence },
      );
    },
  };

  return fixture;
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
