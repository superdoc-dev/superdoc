import { expect, test } from '../../fixtures/superdoc.js';
import { dragRenderedElement } from '../../helpers/drag-drop.js';
import type { Locator, Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const BLOCK_CONTAINER = '.superdoc-structured-content-block';
const INLINE_CONTAINER = '.superdoc-structured-content-inline';
const LINE = '.superdoc-line';

async function getFirstNodePosByType(page: Page, typeName: string): Promise<number> {
  return page.evaluate((nodeType) => {
    const editor = (window as any).editor;
    let found = -1;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (found !== -1) return false;
      if (node.type?.name === nodeType) {
        found = pos;
        return false;
      }
      return true;
    });

    if (found === -1) {
      throw new Error(`No node found for type "${nodeType}"`);
    }

    return found;
  }, typeName);
}

async function getLineByText(page: Page, text: string) {
  const line = page.locator(LINE).filter({ hasText: text }).first();
  await expect(line).toBeVisible();
  const box = await line.boundingBox();
  if (!box) {
    throw new Error(`Line containing "${text}" is not visible`);
  }
  return { line, box };
}

async function dragRenderedElementWithPointer(
  source: Locator,
  target: Locator,
  options: { targetOffsetX?: number; targetOffsetY?: number } = {},
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox) {
    throw new Error('dragRenderedElementWithPointer: source element is not visible');
  }
  if (!targetBox) {
    throw new Error('dragRenderedElementWithPointer: target element is not visible');
  }

  const sourcePoint = {
    x: Math.round(sourceBox.x + sourceBox.width / 2),
    y: Math.round(sourceBox.y + sourceBox.height / 2),
  };
  const targetPoint = {
    x:
      options.targetOffsetX !== undefined
        ? Math.round(targetBox.x + options.targetOffsetX)
        : Math.round(targetBox.x + targetBox.width / 2),
    y:
      options.targetOffsetY !== undefined
        ? Math.round(targetBox.y + options.targetOffsetY)
        : Math.round(targetBox.y + targetBox.height / 2),
  };
  const page = source.page();

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 4, sourcePoint.y + 4);
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  await page.mouse.up();
}

async function setBlockDragDoc(page: Page): Promise<void> {
  await page.evaluate(
    (nextDoc) => {
      const editor = (window as any).editor;
      const { state, view, schema } = editor;
      const doc = schema.nodeFromJSON(nextDoc);
      view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc.content));
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Intro paragraph' }],
        },
        {
          type: 'structuredContentBlock',
          attrs: {
            id: 'block-drag-1',
            alias: 'Block to move',
          },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Block payload to move' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Tail paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Drop anchor' }],
        },
      ],
    },
  );
}

async function setInlineDragDoc(page: Page): Promise<void> {
  await page.evaluate(
    (nextDoc) => {
      const editor = (window as any).editor;
      const { state, view, schema } = editor;
      const doc = schema.nodeFromJSON(nextDoc);
      view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc.content));
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Intro paragraph with ' },
            {
              type: 'structuredContent',
              attrs: {
                id: 'inline-drag-1',
                alias: 'Inline to move',
              },
              content: [{ type: 'text', text: 'Inline payload to move' }],
            },
            { type: 'text', text: ' in the first paragraph' },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Tail paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Drop anchor' }],
        },
      ],
    },
  );
}

async function primeStructuredContentDragSources(page: Page): Promise<void> {
  await page.evaluate(() => {
    const upgrade = (
      selector: string,
      nodeType: 'structuredContentBlock' | 'structuredContent',
      labelSelector: string,
    ) => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

      for (const element of elements) {
        const pmStart = element.dataset.pmStart;
        const pmEnd = element.dataset.pmEnd;
        if (!pmStart || !pmEnd) continue;

        const label = element.querySelector<HTMLElement>(labelSelector);
        const sdtId = element.dataset.sdtId ?? element.dataset.id ?? '';

        element.draggable = true;
        element.dataset.dragSourceKind = 'structuredContent';
        element.dataset.pmStart = pmStart;
        element.dataset.pmEnd = pmEnd;
        element.dataset.nodeType = nodeType;
        element.dataset.lockMode = element.dataset.lockMode ?? 'unlocked';
        element.dataset.displayLabel = label?.textContent?.trim() || 'Structured content';
        if (sdtId) {
          element.dataset.sdtId = sdtId;
        }
      }
    };

    upgrade('.superdoc-structured-content-block', 'structuredContentBlock', '.superdoc-structured-content__label');
    upgrade('.superdoc-structured-content-inline', 'structuredContent', '.superdoc-structured-content-inline__label');
  });
}

test.describe('structured content drag and drop', () => {
  test('@behavior SD-2192: dragging a block SDT label repositions the block', async ({ superdoc }) => {
    await setBlockDragDoc(superdoc.page);
    await superdoc.waitForStable();
    await primeStructuredContentDragSources(superdoc.page);

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    const anchorBefore = await superdoc.findTextPos('Drop anchor');
    expect(sourceBefore).toBeLessThan(tailBefore);
    expect(tailBefore).toBeLessThan(anchorBefore);

    const source = superdoc.page.locator(BLOCK_CONTAINER).filter({ hasText: 'Block payload to move' }).first();
    const { line: target } = await getLineByText(superdoc.page, 'Drop anchor');

    await dragRenderedElement(source, target, { targetOffsetX: 4 });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');
    const anchorAfter = await superdoc.findTextPos('Drop anchor');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).toBeLessThan(anchorAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Block payload to move');
  });

  test('@behavior SD-2192: dragging an inline SDT label repositions the inline field', async ({ superdoc }) => {
    await setInlineDragDoc(superdoc.page);
    await superdoc.waitForStable();
    await primeStructuredContentDragSources(superdoc.page);

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    const anchorBefore = await superdoc.findTextPos('Drop anchor');
    expect(sourceBefore).toBeLessThan(tailBefore);
    expect(tailBefore).toBeLessThan(anchorBefore);

    const source = superdoc.page.locator(INLINE_CONTAINER).filter({ hasText: 'Inline payload to move' }).first();
    const { line: target } = await getLineByText(superdoc.page, 'Drop anchor');

    await dragRenderedElement(source, target, { targetOffsetX: 4 });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');
    const anchorAfter = await superdoc.findTextPos('Drop anchor');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).toBeLessThan(anchorAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Inline payload to move');
  });

  // SD-2192 review: the production interaction layer marks the .superdoc-structured-content__label
  // child element draggable, not the SDT container. The two tests above prime the container and
  // drag the container, so they would still pass if the interaction layer stopped marking labels.
  // This test asserts production wiring directly: after a paint, the LABEL element should carry
  // the drag-source attributes set by StructuredContentInteractionLayer.apply().
  test('@behavior SD-2192: production layer marks the SDT block label as a drag source', async ({ superdoc }) => {
    await setBlockDragDoc(superdoc.page);
    await superdoc.waitForStable();

    const labelLocator = superdoc.page.locator(`${BLOCK_CONTAINER} .superdoc-structured-content__label`).first();

    await expect(labelLocator).toHaveAttribute('draggable', 'true');
    await expect(labelLocator).toHaveAttribute('data-drag-source-kind', 'structuredContent');
    await expect(labelLocator).toHaveAttribute('data-sdt-id', /.+/);
    await expect(labelLocator).toHaveAttribute('data-pm-start', /\d+/);
    await expect(labelLocator).toHaveAttribute('data-pm-end', /\d+/);
  });

  test('@behavior SD-2192: native dragging a production block SDT label repositions the block', async ({
    superdoc,
  }) => {
    await setBlockDragDoc(superdoc.page);
    await superdoc.waitForStable();

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    const anchorBefore = await superdoc.findTextPos('Drop anchor');
    expect(sourceBefore).toBeLessThan(tailBefore);
    expect(tailBefore).toBeLessThan(anchorBefore);

    const sourceBody = superdoc.page.locator(BLOCK_CONTAINER).filter({ hasText: 'Block payload to move' }).first();
    const bodyBox = await sourceBody.boundingBox();
    if (!bodyBox) throw new Error('Block SDT body is not visible');
    await superdoc.page.mouse.click(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
    await superdoc.waitForStable();

    const sourceLabel = superdoc.page
      .locator(`${BLOCK_CONTAINER} .superdoc-structured-content__label`)
      .filter({ hasText: 'Block to move' })
      .first();
    const { line: target } = await getLineByText(superdoc.page, 'Drop anchor');

    await expect(sourceLabel).toBeVisible();
    await dragRenderedElementWithPointer(sourceLabel, target, { targetOffsetX: 4 });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContentBlock');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');
    const anchorAfter = await superdoc.findTextPos('Drop anchor');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).toBeLessThan(anchorAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Block payload to move');
  });

  // SD-2192 review: a block SDT wrapping a table should still be draggable.
  // The painter only emits data-pm-start/data-pm-end on paragraph fragments
  // (renderer.ts:6880-6907), so a table-wrapped block SDT container has no PM range.
  // StructuredContentInteractionLayer.ts:26 then refuses to mark the label.
  test('@behavior SD-2192: production layer marks block SDT labels for table-wrapped content', async ({ superdoc }) => {
    await superdoc.page.evaluate(
      (nextDoc) => {
        const editor = (window as any).editor;
        const { state, view, schema } = editor;
        const doc = schema.nodeFromJSON(nextDoc);
        view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc.content));
      },
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
          {
            type: 'structuredContentBlock',
            attrs: { id: 'table-wrapped-block', alias: 'Table block' },
            content: [
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell text' }] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Drop anchor' }] },
        ],
      },
    );
    await superdoc.waitForStable();

    const labelLocator = superdoc.page.locator(`${BLOCK_CONTAINER} .superdoc-structured-content__label`).first();

    await expect(labelLocator).toHaveAttribute('draggable', 'true');
    await expect(labelLocator).toHaveAttribute('data-drag-source-kind', 'structuredContent');
  });

  test('@behavior SD-2192: production layer marks the inline SDT label as a drag source', async ({ superdoc }) => {
    await setInlineDragDoc(superdoc.page);
    await superdoc.waitForStable();

    const labelLocator = superdoc.page
      .locator(`${INLINE_CONTAINER} .superdoc-structured-content-inline__label`)
      .first();

    await expect(labelLocator).toHaveAttribute('draggable', 'true');
    await expect(labelLocator).toHaveAttribute('data-drag-source-kind', 'structuredContent');
    await expect(labelLocator).toHaveAttribute('data-sdt-id', /.+/);
    await expect(labelLocator).toHaveAttribute('data-pm-start', /\d+/);
    await expect(labelLocator).toHaveAttribute('data-pm-end', /\d+/);
  });

  test('@behavior SD-2192: native dragging a production inline SDT label repositions the inline field', async ({
    superdoc,
  }) => {
    await setInlineDragDoc(superdoc.page);
    await superdoc.waitForStable();

    const sourceBefore = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailBefore = await superdoc.findTextPos('Tail paragraph');
    const anchorBefore = await superdoc.findTextPos('Drop anchor');
    expect(sourceBefore).toBeLessThan(tailBefore);
    expect(tailBefore).toBeLessThan(anchorBefore);

    const sourceBody = superdoc.page.locator(INLINE_CONTAINER).filter({ hasText: 'Inline payload to move' }).first();
    const bodyBox = await sourceBody.boundingBox();
    if (!bodyBox) throw new Error('Inline SDT body is not visible');
    await superdoc.page.mouse.click(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
    await superdoc.waitForStable();

    const sourceLabel = superdoc.page
      .locator(`${INLINE_CONTAINER} .superdoc-structured-content-inline__label`)
      .filter({ hasText: 'Inline to move' })
      .first();
    const { line: target } = await getLineByText(superdoc.page, 'Drop anchor');

    await expect(sourceLabel).toBeVisible();
    await dragRenderedElementWithPointer(sourceLabel, target, { targetOffsetX: 4 });
    await superdoc.waitForStable();

    const sourceAfter = await getFirstNodePosByType(superdoc.page, 'structuredContent');
    const tailAfter = await superdoc.findTextPos('Tail paragraph');
    const anchorAfter = await superdoc.findTextPos('Drop anchor');

    expect(sourceAfter).toBeGreaterThan(tailAfter);
    expect(sourceAfter).toBeLessThan(anchorAfter);
    expect(sourceAfter).not.toBe(sourceBefore);
    await superdoc.assertTextContains('Inline payload to move');
  });
});
