import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '../../fixtures/superdoc.js';
import type { Page } from '@playwright/test';

test.use({ config: { toolbar: 'full', showSelection: true } });

const DOC_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/sd-3237-nested-sdt-lorem-ipsum.docx',
);

const BLOCK_SDT = '.superdoc-structured-content-block';
const BLOCK_LABEL = '.superdoc-structured-content__label';
const INLINE_SDT = '.superdoc-structured-content-inline';
const HOVER_CLASS = 'sdt-group-hover';
const ACTIVE_CLASS = 'ProseMirror-selectednode';

const blockById = (id: string) => `${BLOCK_SDT}[data-sdt-id="${id}"], ${BLOCK_SDT}[data-sdt-container-id="${id}"]`;
const inlineById = (id: string) => `${INLINE_SDT}[data-sdt-id="${id}"]`;

async function getTextPoint(
  page: Page,
  text: string,
  offset = 0,
  occurrence = 0,
  selector = '.superdoc-layout',
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ selector, text, offset, occurrence }) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error(`Element not found: ${selector}`);

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let seen = 0;
      let node = walker.nextNode() as Text | null;
      while (node) {
        const index = node.data.indexOf(text);
        if (index !== -1) {
          if (seen !== occurrence) {
            seen += 1;
            node = walker.nextNode() as Text | null;
            continue;
          }
          const start = Math.min(index + offset, node.data.length - 1);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, Math.min(start + 1, node.data.length));
          const rect = range.getBoundingClientRect();
          range.detach();
          if (rect.width || rect.height) {
            return { x: rect.left + 1, y: rect.top + rect.height / 2 };
          }
        }
        node = walker.nextNode() as Text | null;
      }

      throw new Error(`Text occurrence not found: ${text} (${occurrence})`);
    },
    { selector, text, offset, occurrence },
  );
}

async function getTextBoundaryPoint(
  page: Page,
  selector: string,
  text: string,
  offset: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ selector, text, offset }) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error(`Element not found: ${selector}`);

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const index = node.data.indexOf(text);
        if (index !== -1) {
          const leftOffset = index + offset - 1;
          const rightOffset = index + offset;
          if (leftOffset < 0 || rightOffset >= node.data.length) {
            throw new Error(`Boundary offset ${offset} is out of range for ${text}`);
          }

          const leftRange = document.createRange();
          leftRange.setStart(node, leftOffset);
          leftRange.setEnd(node, leftOffset + 1);
          const leftRect = leftRange.getBoundingClientRect();
          leftRange.detach();

          const rightRange = document.createRange();
          rightRange.setStart(node, rightOffset);
          rightRange.setEnd(node, rightOffset + 1);
          const rightRect = rightRange.getBoundingClientRect();
          rightRange.detach();

          if (leftRect.width || rightRect.width) {
            return {
              x: (leftRect.right + rightRect.left) / 2,
              y: (leftRect.top + leftRect.height / 2 + rightRect.top + rightRect.height / 2) / 2,
            };
          }
        }
        node = walker.nextNode() as Text | null;
      }

      throw new Error(`Text not found: ${text}`);
    },
    { selector, text, offset },
  );
}

async function getSelectionInfo(page: Page) {
  return page.evaluate(() => {
    const { state } = (window as any).editor;
    const { selection } = state;
    const parentTypes: string[] = [];
    const sdtIds: string[] = [];
    const $pos = selection.$from;

    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      parentTypes.push(node.type.name);
      if (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') {
        const id = node.attrs?.id ?? node.attrs?.sdtId;
        if (id != null) sdtIds.push(String(id));
      }
    }

    return {
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
      nodeType: selection.node?.type?.name ?? null,
      parentTypes,
      sdtIds,
    };
  });
}

async function getTextPositionInSdt(page: Page, sdtId: string, text: string, offset: number): Promise<number> {
  return page.evaluate(
    ({ sdtId, text, offset }) => {
      const { state } = (window as any).editor;
      let result: number | null = null;

      state.doc.descendants((node: any, pos: number) => {
        if (!node.isText || result != null) return result == null;
        const index = node.text.indexOf(text);
        if (index === -1) return true;

        const $pos = state.doc.resolve(pos);
        for (let depth = $pos.depth; depth > 0; depth--) {
          const parent = $pos.node(depth);
          if (parent.type.name !== 'structuredContent') continue;
          const id = parent.attrs?.id ?? parent.attrs?.sdtId;
          if (String(id) === sdtId) {
            result = pos + index + offset;
            return false;
          }
        }

        return true;
      });

      if (result == null) {
        throw new Error(`Text not found in SDT ${sdtId}: ${text}`);
      }
      return result;
    },
    { sdtId, text, offset },
  );
}

async function getSdtRange(
  page: Page,
  sdtId: string,
  nodeType: 'structuredContent' | 'structuredContentBlock',
): Promise<{
  pos: number;
  start: number;
  end: number;
  nodeEnd: number;
  textFrom: number | null;
  textTo: number | null;
}> {
  return page.evaluate(
    ({ sdtId, nodeType }) => {
      const { state } = (window as any).editor;
      let result: {
        pos: number;
        start: number;
        end: number;
        nodeEnd: number;
        textFrom: number | null;
        textTo: number | null;
      } | null = null;

      state.doc.descendants((node: any, pos: number) => {
        if (node.type.name !== nodeType) return true;
        const id = node.attrs?.id ?? node.attrs?.sdtId;
        if (String(id) !== sdtId) return true;

        let textFrom: number | null = null;
        let textTo: number | null = null;
        node.descendants((child: any, childPos: number) => {
          if (!child.isText) return true;
          const basePos = pos + 1 + childPos;
          if (textFrom == null) textFrom = basePos;
          textTo = basePos + child.nodeSize;
          return true;
        });

        result = {
          pos,
          start: pos + 1,
          end: pos + node.nodeSize - 1,
          nodeEnd: pos + node.nodeSize,
          textFrom,
          textTo,
        };
        return false;
      });

      if (!result) {
        throw new Error(`SDT not found: ${nodeType} ${sdtId}`);
      }
      return result;
    },
    { sdtId, nodeType },
  );
}

async function getElementCenter(
  page: Page,
  rootSelector: string,
  targetSelector?: string,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ rootSelector, targetSelector }) => {
      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`Element not found: ${rootSelector}`);
      const target = targetSelector ? root.querySelector(targetSelector) : root;
      if (!(target instanceof HTMLElement)) throw new Error(`Target not found: ${targetSelector ?? rootSelector}`);

      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        throw new Error(`Target has no visible rect: ${targetSelector ?? rootSelector}`);
      }
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    { rootSelector, targetSelector },
  );
}

async function isLabelVisible(page: Page, blockSelector: string): Promise<boolean> {
  return page.evaluate(
    ({ blockSelector, labelSelector }) => {
      const block = document.querySelector(blockSelector);
      const label = block?.querySelector(labelSelector);
      return label ? getComputedStyle(label).display !== 'none' : false;
    },
    { blockSelector, labelSelector: BLOCK_LABEL },
  );
}

async function loadBlockSdtTableBackspaceFixture(
  page: Page,
): Promise<{ beforeEnd: number; afterStart: number; a1Start: number; b2End: number }> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const { schema } = editor;
    const paragraph = (text: string) =>
      schema.nodes.paragraph.create(null, schema.nodes.run.create(null, schema.text(text)));
    const cell = (text: string) => schema.nodes.tableCell.create(null, paragraph(text));

    const blockSdt = schema.nodes.structuredContentBlock.create(
      {
        id: 'sd3237-block-table',
        alias: 'Block With Table',
        tag: 'block-table',
        lockMode: 'unlocked',
        controlType: 'richText',
      },
      [
        schema.nodes.table.create(
          {
            tableLayout: 'fixed',
            tableProperties: { tableLayout: 'fixed', tableWidth: { value: 0, type: 'auto' } },
            grid: [{ col: 4680 }, { col: 4680 }],
          },
          [
            schema.nodes.tableRow.create(null, [cell('A1'), cell('B1')]),
            schema.nodes.tableRow.create(null, [cell('A2'), cell('B2')]),
          ],
        ),
      ],
    );

    const doc = schema.nodes.doc.create(null, [paragraph('Before'), blockSdt, paragraph('After')]);
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content));

    let afterStart: number | null = null;
    let beforeEnd: number | null = null;
    let a1Start: number | null = null;
    let b2End: number | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return true;
      if (node.text === 'Before') beforeEnd = pos + node.text.length;
      if (node.text === 'After') afterStart = pos;
      if (node.text === 'A1') a1Start = pos;
      if (node.text === 'B2') b2End = pos + node.text.length;
      return true;
    });

    if (beforeEnd == null || afterStart == null || a1Start == null || b2End == null) {
      throw new Error('Failed to build block SDT table fixture');
    }

    return { beforeEnd, afterStart, a1Start, b2End };
  });
}

test.describe('SD-3237 structured content interactions', () => {
  test.beforeEach(async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await expect(superdoc.page.locator(blockById('5101')).first()).toBeVisible();
    await expect(superdoc.page.locator(inlineById('5102')).first()).toBeVisible();
    const outside = await getTextPoint(superdoc.page, 'Outside of SDT', 2, 0);
    await superdoc.page.mouse.click(outside.x, outside.y);
    await superdoc.waitForStable();
  });

  test('block SDT content clicks place and move a collapsed caret', async ({ superdoc }) => {
    const first = await getTextPoint(superdoc.page, 'Lorem', 2, 1);
    await superdoc.page.mouse.click(first.x, first.y);
    await superdoc.waitForStable();
    const firstSelection = await getSelectionInfo(superdoc.page);

    const second = await getTextPoint(superdoc.page, 'consectetur', 4, 1);
    await superdoc.page.mouse.click(second.x, second.y);
    await superdoc.waitForStable();
    const secondSelection = await getSelectionInfo(superdoc.page);

    expect(firstSelection.empty).toBe(true);
    expect(secondSelection.empty).toBe(true);
    expect(firstSelection.nodeType).toBeNull();
    expect(secondSelection.nodeType).toBeNull();
    expect(firstSelection.from).not.toBe(secondSelection.from);
  });

  test('outer block hover shows background only and click shows active chrome', async ({ superdoc }) => {
    const outerBlock = blockById('5101');
    const hoverPoint = await getTextPoint(superdoc.page, 'Lorem', 1, 0);

    await superdoc.page.mouse.move(hoverPoint.x, hoverPoint.y);
    await superdoc.waitForStable();

    await expect(superdoc.page.locator(outerBlock).first()).toHaveClass(new RegExp(HOVER_CLASS));
    expect(await isLabelVisible(superdoc.page, outerBlock)).toBe(false);

    await superdoc.page.mouse.click(hoverPoint.x, hoverPoint.y);
    await superdoc.waitForStable();

    await expect(superdoc.page.locator(outerBlock).first()).toHaveClass(new RegExp(ACTIVE_CLASS));
    expect(await isLabelVisible(superdoc.page, outerBlock)).toBe(true);
  });

  test('block SDT label click selects the whole block control', async ({ superdoc }) => {
    const outerBlock = blockById('5101');
    const blockRange = await getSdtRange(superdoc.page, '5101', 'structuredContentBlock');

    const blockBodyPoint = await getTextPoint(superdoc.page, 'Lorem', 2, 0);
    await superdoc.page.mouse.click(blockBodyPoint.x, blockBodyPoint.y);
    await superdoc.waitForStable();

    const blockLabelPoint = await getElementCenter(superdoc.page, outerBlock, BLOCK_LABEL);
    await superdoc.page.mouse.click(blockLabelPoint.x, blockLabelPoint.y);
    await superdoc.waitForStable();
    const blockSelection = await getSelectionInfo(superdoc.page);

    expect(blockSelection).toMatchObject({
      empty: false,
      nodeType: 'structuredContentBlock',
      from: blockRange.pos,
      to: blockRange.nodeEnd,
    });
  });

  test('block SDT label click keeps selecting the outer block when it contains a nested inline SDT', async ({
    superdoc,
  }) => {
    const nestedBlock = blockById('5101');
    const nonNestedBlock = blockById('715705189');
    const nestedBlockRange = await getSdtRange(superdoc.page, '5101', 'structuredContentBlock');
    const nonNestedBlockRange = await getSdtRange(superdoc.page, '715705189', 'structuredContentBlock');
    const nestedInlineRange = await getSdtRange(superdoc.page, '5102', 'structuredContent');

    const nonNestedTextPoint = await getTextPoint(superdoc.page, 'NOT NESTED', 3);
    await superdoc.page.mouse.click(nonNestedTextPoint.x, nonNestedTextPoint.y);
    await superdoc.waitForStable();

    const nonNestedLabelPoint = await getElementCenter(superdoc.page, nonNestedBlock, BLOCK_LABEL);
    await superdoc.page.mouse.click(nonNestedLabelPoint.x, nonNestedLabelPoint.y);
    await superdoc.waitForStable();
    const nonNestedSelection = await getSelectionInfo(superdoc.page);

    expect(nonNestedSelection).toMatchObject({
      empty: false,
      nodeType: 'structuredContentBlock',
      from: nonNestedBlockRange.pos,
      to: nonNestedBlockRange.nodeEnd,
    });

    const nestedTextPoint = await getTextPoint(superdoc.page, 'NESTED', 1, 0, nestedBlock);
    await superdoc.page.mouse.click(nestedTextPoint.x, nestedTextPoint.y);
    await superdoc.waitForStable();

    const nestedLabelPoint = await getElementCenter(superdoc.page, nestedBlock, BLOCK_LABEL);
    await superdoc.page.mouse.click(nestedLabelPoint.x, nestedLabelPoint.y);
    await superdoc.waitForStable();
    const nestedSelection = await getSelectionInfo(superdoc.page);

    expect(nestedSelection).toMatchObject({
      empty: false,
      nodeType: 'structuredContentBlock',
      from: nestedBlockRange.pos,
      to: nestedBlockRange.nodeEnd,
    });
    expect(nestedSelection.from).not.toBe(nestedInlineRange.pos);
  });

  test('nested inline SDT clicks place and move caret while both wrappers stay active', async ({ superdoc }) => {
    const outerBlock = blockById('5101');
    const innerInline = inlineById('5102');

    const first = await getTextPoint(superdoc.page, 'Sed do', 2, 0, innerInline);
    await superdoc.page.mouse.click(first.x, first.y);
    await superdoc.waitForStable();
    const firstSelection = await getSelectionInfo(superdoc.page);

    const second = await getTextPoint(superdoc.page, 'tempor', 2, 0, innerInline);
    await superdoc.page.mouse.click(second.x, second.y);
    await superdoc.waitForStable();
    const secondSelection = await getSelectionInfo(superdoc.page);

    expect(firstSelection.empty).toBe(true);
    expect(secondSelection.empty).toBe(true);
    expect(firstSelection.nodeType).toBeNull();
    expect(secondSelection.nodeType).toBeNull();
    expect(secondSelection.parentTypes).toContain('structuredContent');
    expect(secondSelection.parentTypes).toContain('structuredContentBlock');
    expect(secondSelection.sdtIds).toEqual(expect.arrayContaining(['5101', '5102']));
    expect(firstSelection.from).not.toBe(secondSelection.from);

    await expect(superdoc.page.locator(outerBlock).first()).toHaveClass(new RegExp(ACTIVE_CLASS));
    await expect(superdoc.page.locator(innerInline).first()).toHaveClass(new RegExp(ACTIVE_CLASS));
  });

  test('nested inline SDT repeated boundary clicks place caret at clicked word positions', async ({ superdoc }) => {
    const innerInline = inlineById('5102');
    const firstExpected = await getTextPositionInSdt(superdoc.page, '5102', 'aliqua', 3);
    const secondExpected = await getTextPositionInSdt(superdoc.page, '5102', 'dolore', 3);

    const first = await getTextBoundaryPoint(superdoc.page, '.superdoc-layout', 'aliqua', 3);
    await superdoc.page.mouse.click(first.x, first.y);
    await superdoc.waitForStable();
    const firstSelection = await getSelectionInfo(superdoc.page);

    const second = await getTextBoundaryPoint(superdoc.page, '.superdoc-layout', 'dolore', 3);
    await superdoc.page.mouse.click(second.x, second.y);
    await superdoc.waitForStable();
    const secondSelection = await getSelectionInfo(superdoc.page);

    expect(firstSelection).toMatchObject({
      empty: true,
      nodeType: null,
      from: firstExpected,
      to: firstExpected,
    });
    expect(secondSelection).toMatchObject({
      empty: true,
      nodeType: null,
      from: secondExpected,
      to: secondExpected,
    });
    expect(secondSelection.sdtIds).toEqual(expect.arrayContaining(['5101', '5102']));
  });

  test('inline SDT label click selects the whole inline control', async ({ superdoc }) => {
    const innerInline = inlineById('5102');
    const inlineRange = await getSdtRange(superdoc.page, '5102', 'structuredContent');

    const inlineBodyPoint = await getTextPoint(superdoc.page, 'aliqua', 2, 0);
    await superdoc.page.mouse.click(inlineBodyPoint.x, inlineBodyPoint.y);
    await superdoc.waitForStable();

    const inlineLabelPoint = await getElementCenter(
      superdoc.page,
      innerInline,
      '.superdoc-structured-content-inline__label',
    );
    await superdoc.page.mouse.click(inlineLabelPoint.x, inlineLabelPoint.y);
    await superdoc.waitForStable();
    const inlineSelection = await getSelectionInfo(superdoc.page);

    expect(inlineSelection).toMatchObject({
      empty: false,
      nodeType: 'structuredContent',
      from: inlineRange.pos,
      to: inlineRange.nodeEnd,
    });
  });

  test('Backspace at paragraph after block SDT table moves into SDT without deleting following text', async ({
    superdoc,
  }) => {
    const { afterStart, b2End } = await loadBlockSdtTableBackspaceFixture(superdoc.page);
    await superdoc.waitForStable();

    await superdoc.setTextSelection(afterStart);
    await superdoc.page.evaluate(() => (window as any).editor.view.focus());
    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    const result = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      const { selection } = state;
      const parentTypes: string[] = [];
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        parentTypes.push(selection.$from.node(depth).type.name);
      }
      return {
        text: state.doc.textContent,
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
        parentTypes,
      };
    });

    expect(result).toMatchObject({
      text: 'BeforeA1B1A2B2After',
      from: b2End,
      to: b2End,
      empty: true,
    });
    expect(result.parentTypes).toContain('structuredContentBlock');
  });

  test('Delete at paragraph before block SDT table moves into SDT without deleting preceding text', async ({
    superdoc,
  }) => {
    const { beforeEnd, a1Start } = await loadBlockSdtTableBackspaceFixture(superdoc.page);
    await superdoc.waitForStable();

    await superdoc.setTextSelection(beforeEnd);
    await superdoc.page.evaluate(() => (window as any).editor.view.focus());
    await superdoc.press('Delete');
    await superdoc.waitForStable();

    const result = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      const { selection } = state;
      const parentTypes: string[] = [];
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        parentTypes.push(selection.$from.node(depth).type.name);
      }
      return {
        text: state.doc.textContent,
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
        parentTypes,
      };
    });

    expect(result).toMatchObject({
      text: 'BeforeA1B1A2B2After',
      from: a1Start,
      to: a1Start,
      empty: true,
    });
    expect(result.parentTypes).toContain('structuredContentBlock');
  });
});
