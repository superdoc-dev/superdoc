import { test as base, expect, type Page, type Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HARNESS_URL = 'http://localhost:9990';

interface HarnessConfig {
  layout?: boolean;
  toolbar?: 'none' | 'full';
  comments?: 'off' | 'on' | 'panel' | 'readonly' | 'disabled';
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
  // Vite may trigger a dep-optimization reload on WebKit after the initial load event,
  // which destroys the execution context and resets `superdocReady`. Retry across
  // navigations until the flag is set or the overall deadline is reached.
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const remaining = Math.max(deadline - Date.now(), 1000);
      await page.waitForFunction(() => (window as any).superdocReady === true, null, {
        polling: 100,
        timeout: remaining,
      });
      return;
    } catch {
      // If the page navigated (context destroyed) and we still have budget, retry
      // after the new page finishes loading.
      if (Date.now() >= deadline) break;
      await page.waitForLoadState('load').catch(() => {});
    }
  }
  throw new Error(`waitForReady: superdocReady was not set within ${timeout}ms`);
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
    let raw: string | null = null;
    if (typeof value === 'string') raw = value;
    if (
      value &&
      typeof value === 'object' &&
      (value as { model?: unknown }).model === 'rgb' &&
      typeof (value as { value?: unknown }).value === 'string'
    ) {
      raw = (value as { value: string }).value;
    }
    if (!raw) return null;
    const normalized = raw.replace(/^#/, '').trim().toUpperCase();
    return normalized || null;
  };

  const matchesTextStyleAttr = (props: Record<string, unknown>, key: string, expectedValue: unknown): boolean => {
    if (key === 'fontFamily') {
      const normalizeFont = (value: unknown): string | null => {
        if (typeof value !== 'string') return null;
        const head = value.split(',')[0]?.trim();
        if (!head) return null;
        return head.replace(/^['"]|['"]$/g, '').toLowerCase();
      };
      const expected = normalizeFont(expectedValue);
      if (!expected) return false;

      const legacyFont = props.font;
      const fontFamily = props.fontFamily;
      const fonts = props.fonts as Record<string, unknown> | undefined;
      return [legacyFont, fontFamily, fonts?.ascii, fonts?.hAnsi, fonts?.eastAsia, fonts?.cs]
        .map(normalizeFont)
        .some((candidate) => candidate === expected);
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
      const sizeValue = typeof props.size === 'number' ? props.size : props.fontSize;
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
        if (!docApi?.find || !docApi?.query?.match) {
          throw new Error('Document API is unavailable: expected editor.doc.find() and editor.doc.query.match().');
        }

        const toRanges = (item: any): TextRange[] => {
          const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
          const fromBlocks = blocks
            .map((block: any) => {
              const blockId = block?.blockId;
              const start = block?.range?.start;
              const end = block?.range?.end;
              if (typeof blockId !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null;
              return { blockId, start, end };
            })
            .filter(Boolean);
          if (fromBlocks.length > 0) return fromBlocks;

          const legacyRanges = Array.isArray(item?.context?.textRanges) ? item.context.textRanges : [];
          return legacyRanges
            .map((range: any) => {
              const blockId = range?.blockId;
              const start = range?.range?.start;
              const end = range?.range?.end;
              if (typeof blockId !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null;
              return { blockId, start, end };
            })
            .filter(Boolean);
        };

        const toWithinAddress = (address: any): any => {
          if (!address || typeof address !== 'object') return null;
          if (address.kind === 'content' || address.kind === 'inline') return address;
          if (address.kind === 'block' && typeof address.nodeId === 'string' && address.nodeId.length > 0) {
            return { kind: 'content', stability: 'stable', nodeId: address.nodeId };
          }
          return null;
        };

        const getItems = (result: any): Array<any> => {
          const discoveryItems = Array.isArray(result?.items) ? result.items : [];
          if (discoveryItems.length > 0) return discoveryItems;
          return [];
        };

        const buildRunsFromMatch = (item: any): InlineSpan[] => {
          const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
          return blocks
            .flatMap((block: any) => {
              const blockId = block?.blockId;
              const blockRuns = Array.isArray(block?.runs) ? block.runs : [];
              if (typeof blockId !== 'string' || blockRuns.length === 0) return [];

              return blockRuns
                .map((run: any) => {
                  const start = run?.range?.start;
                  const end = run?.range?.end;
                  if (typeof start !== 'number' || typeof end !== 'number') return null;
                  const styles = run?.styles ?? {};
                  const effective = styles?.effective ?? {};
                  const direct = styles?.direct ?? {};
                  const strike = effective?.strike === true || direct?.strike === 'on';
                  const underline = effective?.underline === true || direct?.underline === 'on';
                  return {
                    blockId,
                    start,
                    end,
                    properties: {
                      bold: effective?.bold === true || direct?.bold === 'on',
                      italic: effective?.italic === true || direct?.italic === 'on',
                      underline,
                      strike,
                      strikethrough: strike,
                      highlight: styles?.highlight,
                      color: styles?.color,
                      fontFamily: styles?.fontFamily,
                      font: styles?.fontFamily,
                      fontSize: styles?.fontSizePt,
                      size: styles?.fontSizePt,
                    },
                  } satisfies InlineSpan;
                })
                .filter(Boolean);
            })
            .filter(Boolean);
        };

        const textResult = docApi.query.match({
          select: { type: 'text', pattern: searchText, mode: 'contains', caseSensitive: true },
          require: 'any',
        });
        const matchItems = getItems(textResult);
        const matchItem = matchItems[matchIndex];
        if (!matchItem) return null;
        const ranges = toRanges(matchItem);
        const blockAddress = matchItem?.address ?? null;
        if (!blockAddress || ranges.length === 0) return null;

        const withinAddress = toWithinAddress(blockAddress);
        if (!withinAddress) return null;

        const toInlineSpans = (result: any): InlineSpan[] =>
          getItems(result)
            .map((item: any) => {
              const address = item?.address;
              if (address?.kind !== 'inline') return null;
              const { start, end } = address.anchor ?? {};
              if (!start || !end) return null;
              const node = item?.node;
              return {
                blockId: start.blockId,
                start: start.offset,
                end: end.offset,
                properties: { href: node?.kind === 'hyperlink' ? node?.hyperlink?.href : undefined },
              };
            })
            .filter(Boolean);

        const hyperlinkResult = docApi.find({
          select: { type: 'node', nodeKind: 'hyperlink', kind: 'inline' },
          within: withinAddress,
        });

        return {
          ranges,
          blockAddress,
          runs: buildRunsFromMatch(matchItem),
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
      const underline = run.properties.underline as unknown;
      if (underline === true || (underline != null && typeof underline === 'object')) marks.add('underline');
      if (
        run.properties.strike === true ||
        run.properties.strikethrough === true ||
        run.properties.doubleStrikethrough === true
      ) {
        marks.add('strike');
      }
      if (
        run.properties.highlight ||
        run.properties.backgroundColor ||
        run.properties.background ||
        run.properties.shading ||
        run.properties.fill
      ) {
        marks.add('highlight');
      }
    }
    if (!marks.has('highlight')) {
      const hasDomHighlight = await page.evaluate(
        ({ searchText, targetOccurrence }) => {
          const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
          const expected = normalize(searchText);
          if (!expected) return false;

          let seen = 0;
          for (const el of Array.from(document.querySelectorAll('mark'))) {
            const marked = normalize(el.textContent ?? '');
            if (!marked) continue;
            if (marked.includes(expected) || expected.includes(marked)) {
              if (seen === targetOccurrence) return true;
              seen += 1;
            }
          }
          return false;
        },
        { searchText: text, targetOccurrence: occurrence },
      );
      if (hasDomHighlight) marks.add('highlight');
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
      const deadline = Date.now() + 10_000;
      let sawMatchText = false;

      while (Date.now() < deadline) {
        const highlights = page.locator('.superdoc-comment-highlight');
        const count = await highlights.count();
        let bestIndex = -1;
        let fallbackIndex = -1;
        let bestArea = Infinity;

        for (let i = 0; i < count; i++) {
          const hl = highlights.nth(i);
          const text = await hl.textContent();
          if (!text || !text.includes(textMatch)) continue;

          sawMatchText = true;
          if (fallbackIndex === -1) fallbackIndex = i;

          const box = await hl.boundingBox();
          if (!box || box.width <= 0 || box.height <= 0) continue;

          const area = box.width * box.height;
          if (area < bestArea) {
            bestArea = area;
            bestIndex = i;
          }
        }

        const targetIndex = bestIndex !== -1 ? bestIndex : fallbackIndex;
        if (targetIndex !== -1) {
          const target = highlights.nth(targetIndex);
          const targetCommentIds = ((await target.getAttribute('data-comment-ids')) ?? '')
            .split(/[\s,]+/)
            .filter(Boolean);

          const ensureActiveDialog = async () => {
            // Most browsers activate on highlight click. Firefox can occasionally
            // miss this state transition, so we fall back to activating the
            // corresponding floating dialog directly.
            const activeDialogs = page.locator('.comment-placeholder .comments-dialog.is-active');
            if ((await activeDialogs.count()) > 0) return;

            for (const id of targetCommentIds) {
              const dialogForId = page
                .locator(`.comment-placeholder[data-comment-id="${id}"] .comments-dialog`)
                .first();
              if ((await dialogForId.count()) === 0) continue;
              await dialogForId.click({ timeout: 500 });
              if ((await activeDialogs.count()) > 0) return;
            }

            const fallbackDialog = page.locator('.comment-placeholder .comments-dialog').last();
            if ((await fallbackDialog.count()) > 0) {
              await fallbackDialog.click({ timeout: 500 });
            }
          };

          try {
            await target.click({ timeout: 500 });
            await ensureActiveDialog();
            return;
          } catch {
            try {
              await target.click({ timeout: 500, force: true });
              await ensureActiveDialog();
              return;
            } catch {
              // The highlight likely re-rendered between lookup and click.
            }
          }
        }

        await page.waitForTimeout(100);
      }

      if (sawMatchText) {
        throw new Error(`Found comment highlight text for "${textMatch}" but could not click it`);
      }

      throw new Error(`No comment highlight found for "${textMatch}"`);
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

              const getAddresses = (result: any): any[] => {
                const discoveryItems = Array.isArray(result?.items) ? result.items : [];
                if (discoveryItems.length > 0) {
                  return discoveryItems.map((item: any) => item?.address).filter(Boolean);
                }
                return Array.isArray(result?.matches) ? result.matches : [];
              };

              const tableResult = docApi.find({ select: { type: 'node', nodeKind: 'table' }, limit: 1 });
              const tableAddress = getAddresses(tableResult)[0];
              if (!tableAddress) return 'no table found in document';

              if (expectedRows !== undefined && expectedCols !== undefined) {
                const expectedCellCount = expectedRows * expectedCols;

                const rowResult = docApi.find({ select: { type: 'node', nodeKind: 'tableRow' }, within: tableAddress });
                const rowCount = getAddresses(rowResult).length;

                // Only validate row count when the adapter exposes row-level querying.
                if (rowCount > 0 && rowCount !== expectedRows) {
                  return `expected ${expectedRows} rows, got ${rowCount}`;
                }

                const cellResult = docApi.find({
                  select: { type: 'node', nodeKind: 'tableCell' },
                  within: tableAddress,
                });
                let cellCount = getAddresses(cellResult).length;
                try {
                  const headerResult = docApi.find({
                    select: { type: 'node', nodeKind: 'tableHeader' },
                    within: tableAddress,
                  });
                  cellCount += getAddresses(headerResult).length;
                } catch {
                  /* tableHeader may not be queryable */
                }

                // Fallback: count paragraphs when cell-level querying isn't available.
                if (cellCount === 0) {
                  const paragraphResult = docApi.find({
                    select: { type: 'node', nodeKind: 'paragraph' },
                    within: tableAddress,
                  });
                  cellCount = getAddresses(paragraphResult).length;
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

    async assertCommentHighlightExists(opts?: { text?: string; commentId?: string; timeoutMs?: number }) {
      const expectedText = opts?.text;
      const expectedCommentId = opts?.commentId;
      const timeoutMs = opts?.timeoutMs ?? 20_000;
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ text, commentId }) => {
                type HighlightEntry = { text: string; commentIds: string[] };
                const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
                const includesExpectedText = (entries: HighlightEntry[], expected: string) => {
                  if (!expected) return true;
                  if (entries.some((entry) => entry.text.includes(expected))) return true;
                  const aggregatedText = normalize(
                    entries
                      .map((entry) => entry.text)
                      .filter(Boolean)
                      .join(' '),
                  );
                  return aggregatedText.includes(expected);
                };

                const highlights: HighlightEntry[] = Array.from(
                  document.querySelectorAll('.superdoc-comment-highlight'),
                ).map((el) => ({
                  text: normalize(el.textContent ?? ''),
                  commentIds: (el.getAttribute('data-comment-ids') ?? '').split(/[\s,;]+/).filter(Boolean),
                }));
                if (highlights.length === 0) return false;

                const expected = normalize(text ?? '');
                if (!commentId) {
                  return includesExpectedText(highlights, expected);
                }

                const relevant = highlights.filter((entry) => entry.commentIds.includes(commentId));

                if (relevant.length > 0) {
                  return includesExpectedText(relevant, expected);
                }

                // Fallback: on some engines, highlight DOM may transiently expose a
                // canonical/imported ID mismatch. Resolve anchored text from comments.list()
                // and assert the corresponding text remains highlighted.
                const docApi = (window as any).editor?.doc;
                const commentsList = docApi?.comments?.list?.({ includeResolved: true });
                const matches = Array.isArray(commentsList?.matches)
                  ? commentsList.matches
                  : Array.isArray(commentsList?.items)
                    ? commentsList.items
                    : [];

                const matchingComment = matches.find((entry: any) => {
                  const entryId =
                    (typeof entry?.commentId === 'string' && entry.commentId) ||
                    (typeof entry?.id === 'string' && entry.id) ||
                    (typeof entry?.address?.entityId === 'string' && entry.address.entityId) ||
                    '';
                  const importedId = typeof entry?.importedId === 'string' ? entry.importedId : '';
                  return entryId === commentId || importedId === commentId;
                });

                const anchoredText = normalize(
                  expected ||
                    (typeof matchingComment?.anchoredText === 'string' && matchingComment.anchoredText) ||
                    (typeof matchingComment?.text === 'string' && matchingComment.text) ||
                    (typeof matchingComment?.snippet === 'string' && matchingComment.snippet) ||
                    (typeof matchingComment?.context?.snippet === 'string' && matchingComment.context.snippet) ||
                    '',
                );
                if (!anchoredText) return false;

                return includesExpectedText(highlights, anchoredText);
              },
              { text: expectedText, commentId: expectedCommentId },
            ),
          { timeout: timeoutMs },
        )
        .toBe(true);
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

    async assertTextAlignment(text: string, expectedAlignment: string | null, occurrence = 0) {
      await expect
        .poll(() =>
          page.evaluate(
            ({ searchText, matchIndex }) => {
              const docApi = (window as any).editor?.doc;
              if (!docApi?.query?.match || !docApi?.getNode) {
                throw new Error('Document API is unavailable: expected editor.doc.query.match/getNode.');
              }

              const getAddress = (item: any): any => {
                if (!item || typeof item !== 'object') return null;
                if (item.address) return item.address;
                return item.context?.address ?? null;
              };

              const textResult = docApi.query.match({
                select: { type: 'text', pattern: searchText, mode: 'contains', caseSensitive: true },
                require: 'any',
              });
              const items = Array.isArray(textResult?.items) ? textResult.items : [];
              const address = getAddress(items[matchIndex]);
              if (!address) return null;

              const nodeResult = docApi.getNode(address);
              const node = nodeResult?.node ?? nodeResult;
              if (!node || typeof node !== 'object') return null;

              if (node.kind === 'paragraph') {
                return node.paragraph?.props?.alignment ?? node.paragraph?.resolved?.alignment ?? null;
              }
              if (node.kind === 'heading') {
                return node.heading?.props?.alignment ?? node.heading?.resolved?.alignment ?? null;
              }

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

    // Navigate to harness — use 'networkidle' so Vite finishes serving all
    // assets (and any dep-optimization reloads) before we check app state.
    // WebKit is particularly sensitive to mid-load reloads in parallel workers.
    const url = buildHarnessUrl({ layout: true, ...config });
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitForReady(page);

    // Focus the editor — use .focus() not .click() because in layout mode
    // the ProseMirror contenteditable is positioned off-screen (DomPainter renders visuals).
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 15_000 });
    await editor.focus();

    await use(createFixture(page, editor, modKey));
  },
});

export { expect };
