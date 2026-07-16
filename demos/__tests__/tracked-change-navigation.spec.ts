import { expect, test, type Page } from '@playwright/test';

test.skip((process.env.DEMO || 'custom-ui') !== 'custom-ui', 'custom-ui demo only');

type TrackChangeItem = {
  id: string;
  change?: {
    excerpt?: string;
    text?: string;
  };
};

const collectPageErrors = (page: Page) => {
  const errors: string[] = [];

  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  return errors;
};

const loadTrackedChangeDemo = async (page: Page) => {
  await page.route('**/ingest.superdoc.dev/**', (route) =>
    route.fulfill({ status: 204, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__superdocCustomUIDemoE2E?.ready === true, null, { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const ui = window.__superdocCustomUIDemoE2E?.ui as any;
      return ui?.trackChanges?.getSnapshot?.().items?.length > 1;
    },
    null,
    { timeout: 30_000 },
  );
};

const pickTrackedChangeId = async (page: Page, exclude: string[] = []) => {
  const id = await page.evaluate((excludedIds) => {
    const ui = window.__superdocCustomUIDemoE2E?.ui as any;
    const items = (ui?.trackChanges?.getSnapshot?.().items ?? []) as TrackChangeItem[];
    const availableItems = items.filter((item) => !excludedIds.includes(item.id));
    const textBackedItems = availableItems.filter((item) => {
      const text = item.change?.text ?? item.change?.excerpt ?? '';
      return item.id.startsWith('word:trackInsert:') && text.trim().length > 0;
    });

    return textBackedItems[0]?.id ?? availableItems[0]?.id ?? null;
  }, exclude);

  expect(id).toBeTruthy();
  return id!;
};

const pickTrackedChangePair = async (page: Page) => {
  const pair = await page.evaluate(() => {
    const ui = window.__superdocCustomUIDemoE2E?.ui as any;
    const items = (ui?.trackChanges?.getSnapshot?.().items ?? []) as TrackChangeItem[];
    const textBackedItems = items.filter((item) => {
      const text = item.change?.text ?? item.change?.excerpt ?? '';
      return item.id.startsWith('word:trackInsert:') && text.trim().length > 0;
    });
    const candidates = textBackedItems.length > 1 ? textBackedItems : items;

    return candidates.length > 1 ? { current: candidates[0].id, next: candidates[1].id } : null;
  });

  expect(pair).toBeTruthy();
  return pair!;
};

test('tracked-change navigation leaves the caret inside the active target change', async ({ page }) => {
  const errors = collectPageErrors(page);

  await loadTrackedChangeDemo(page);
  const targetChangeId = await pickTrackedChangeId(page);

  await page.evaluate(async (id) => {
    const harness = window.__superdocCustomUIDemoE2E!;
    const ui = harness.ui as any;

    await ui.trackChanges.scrollTo(id);
  }, targetChangeId);

  await page.waitForFunction(
    (id) => {
      const ui = window.__superdocCustomUIDemoE2E?.ui as any;
      return ui?.trackChanges?.getSnapshot?.().activeId === id;
    },
    targetChangeId,
    { timeout: 5_000 },
  );

  const afterNavigation = await page.evaluate((id) => {
    const harness = window.__superdocCustomUIDemoE2E!;
    const ui = harness.ui as any;
    const host = harness.host as any;

    const editor = host.activeEditor;
    const selectionInfo = editor.doc.selection.current({ includeText: true });
    const selection = editor.state.selection;
    let targetStart: number | null = null;
    let targetEnd: number | null = null;
    let targetText = '';

    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return true;

      const matchingMark = node.marks?.find((mark: any) => {
        const sourceId = mark.attrs?.sourceId;
        const publicId = sourceId ? `word:${mark.type.name}:${sourceId}` : mark.attrs?.id;
        return publicId === id;
      });

      if (!matchingMark) return true;

      targetStart = targetStart == null ? pos : Math.min(targetStart, pos);
      targetEnd = targetEnd == null ? pos + node.nodeSize : Math.max(targetEnd, pos + node.nodeSize);
      targetText += node.text ?? '';
      return true;
    });

    return {
      activeId: ui.trackChanges.getSnapshot().activeId,
      selectionActiveIds: selectionInfo.activeChangeIds ?? [],
      selectionFrom: selection.from,
      selectionTo: selection.to,
      parentOffset: selection.$from?.parentOffset ?? null,
      targetStart,
      targetEnd,
      targetText,
    };
  }, targetChangeId);

  expect(errors).toEqual([]);
  expect(afterNavigation.activeId).toBe(targetChangeId);
  expect(afterNavigation.targetText, JSON.stringify(afterNavigation)).toBeTruthy();
  const expectedCaret =
    afterNavigation.targetText.length > 1 ? afterNavigation.targetStart! + 1 : afterNavigation.targetStart;
  expect(afterNavigation.selectionFrom, JSON.stringify(afterNavigation)).toBe(expectedCaret);
  expect(afterNavigation.selectionTo, JSON.stringify(afterNavigation)).toBe(expectedCaret);
});

test('tracked-change next navigation keeps the caret aligned with the selected PM position', async ({ page }) => {
  const errors = collectPageErrors(page);

  await loadTrackedChangeDemo(page);
  const { current: targetChangeId, next: nextChangeId } = await pickTrackedChangePair(page);

  const afterNextNavigation = await page.evaluate(async (id) => {
    const harness = window.__superdocCustomUIDemoE2E!;
    const ui = harness.ui as any;
    const host = harness.host as any;

    await ui.trackChanges.scrollTo(id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await ui.trackChanges.navigateNext();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const activeId = ui.trackChanges.getSnapshot().activeId;
    const editor = host.activeEditor;
    const selection = editor.state.selection;
    const caret = document.querySelector('.presentation-editor__selection-caret');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const caretRect = caret?.getBoundingClientRect();
    const containingPmElement = Array.from(document.querySelectorAll<HTMLElement>('[data-pm-start][data-pm-end]'))
      .map((element) => ({
        element,
        start: Number(element.dataset.pmStart),
        end: Number(element.dataset.pmEnd),
      }))
      .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end))
      .filter(({ start, end }) => start <= selection.from && selection.from <= end)
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0]?.element;
    const targetRect = containingPmElement?.getBoundingClientRect();

    return {
      activeId,
      selectionFrom: selection.from,
      selectionTo: selection.to,
      caretTop: caretRect?.top ?? null,
      caretBottom: caretRect?.bottom ?? null,
      targetTop: targetRect?.top ?? null,
      targetBottom: targetRect?.bottom ?? null,
    };
  }, targetChangeId);

  expect(errors).toEqual([]);
  expect(afterNextNavigation.activeId, JSON.stringify(afterNextNavigation)).toBe(nextChangeId);
  expect(afterNextNavigation.caretTop, JSON.stringify(afterNextNavigation)).not.toBeNull();
  expect(afterNextNavigation.targetTop, JSON.stringify(afterNextNavigation)).not.toBeNull();
  expect(afterNextNavigation.caretBottom!, JSON.stringify(afterNextNavigation)).toBeGreaterThanOrEqual(
    afterNextNavigation.targetTop! - 2,
  );
  expect(afterNextNavigation.caretTop!, JSON.stringify(afterNextNavigation)).toBeLessThanOrEqual(
    afterNextNavigation.targetBottom! + 2,
  );
});

test('tracked-change sidebar highlight clears after moving the cursor outside tracked changes', async ({ page }) => {
  const errors = collectPageErrors(page);

  await loadTrackedChangeDemo(page);
  const targetChangeId = await pickTrackedChangeId(page);

  const afterClickAway = await page.evaluate(async (id) => {
    const harness = window.__superdocCustomUIDemoE2E!;
    const ui = harness.ui as any;
    const host = harness.host as any;

    await ui.trackChanges.scrollTo(id);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const activeAfterNavigation = ui.trackChanges.getSnapshot().activeId;
    const cardAfterNavigation = activeAfterNavigation
      ? document.querySelector(`.card.active[data-card-id="${CSS.escape(activeAfterNavigation)}"]`)
      : null;

    host.activeEditor.commands.setTextSelection({ from: 1, to: 1 });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const activeCard = document.querySelector('.card.active[data-card-id]');
    const selectionInfo = host.activeEditor.doc.selection.current({ includeText: true });

    return {
      activeAfterNavigation,
      cardAfterNavigationId: cardAfterNavigation?.getAttribute('data-card-id') ?? null,
      activeAfterClickAway: ui.trackChanges.getSnapshot().activeId,
      activeCardId: activeCard?.getAttribute('data-card-id') ?? null,
      selectionActiveChangeIds: selectionInfo.activeChangeIds ?? [],
      selectionActiveCommentIds: selectionInfo.activeCommentIds ?? [],
    };
  }, targetChangeId);

  expect(errors).toEqual([]);
  expect(afterClickAway.cardAfterNavigationId, JSON.stringify(afterClickAway)).toBe(targetChangeId);
  expect(afterClickAway.activeAfterClickAway, JSON.stringify(afterClickAway)).toBeNull();
  expect(afterClickAway.selectionActiveChangeIds, JSON.stringify(afterClickAway)).toEqual([]);
  expect(afterClickAway.selectionActiveCommentIds, JSON.stringify(afterClickAway)).toEqual([]);
  expect(afterClickAway.activeCardId, JSON.stringify(afterClickAway)).toBeNull();
});
