import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { addCommentByText, replaceText, findFirstSelectionTarget } from '../../helpers/document-api.js';

test('@behavior SD-2525: doc.extract returns blocks with nodeIds and full text', async ({ superdoc }) => {
  await superdoc.type('Hello world');
  await superdoc.press('Enter');
  await superdoc.type('Second paragraph');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.blocks).toBeDefined();
  expect(result.blocks.length).toBeGreaterThanOrEqual(2);
  expect(result.revision).toBeDefined();

  for (const block of result.blocks) {
    expect(block.nodeId).toBeTruthy();
    expect(block.type).toBeTruthy();
    expect(typeof block.text).toBe('string');
  }

  const hello = result.blocks.find((b: any) => b.text.includes('Hello world'));
  const second = result.blocks.find((b: any) => b.text.includes('Second paragraph'));
  expect(hello).toBeDefined();
  expect(second).toBeDefined();
  expect(hello.nodeId).not.toBe(second.nodeId);
});

test('@behavior SD-2525: doc.extract returns empty arrays when no comments or tracked changes', async ({
  superdoc,
}) => {
  await superdoc.type('Plain document');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.comments).toEqual([]);
  expect(result.trackedChanges).toEqual([]);
});

test('@behavior SD-2525: doc.extract returns full text not truncated', async ({ superdoc }) => {
  const longText =
    'This is a long paragraph that exceeds eighty characters to verify text is not truncated like textPreview is.';
  await superdoc.type(longText);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const found = result.blocks.find((b: any) => b.text.includes('eighty characters'));
  expect(found).toBeDefined();
  expect(found.text.length).toBeGreaterThan(80);
});

test('@behavior SD-2525: doc.extract returns headingLevel for heading blocks', async ({ superdoc }) => {
  await superdoc.type('My Heading');

  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setStyleById('Heading1');
  });
  await superdoc.press('Enter');
  await superdoc.type('Body text');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const heading = result.blocks.find((b: any) => b.text === 'My Heading');
  const body = result.blocks.find((b: any) => b.text === 'Body text');

  expect(heading).toBeDefined();
  expect(heading.type).toBe('heading');
  expect(heading.headingLevel).toBe(1);

  expect(body).toBeDefined();
  expect(body.headingLevel).toBeUndefined();
});

test('@behavior SD-2525: doc.extract returns comments with entityId and blockId', async ({ superdoc }) => {
  await superdoc.type('This text has a comment on it');

  const commentId = await addCommentByText(superdoc.page, {
    pattern: 'comment',
    text: 'Review this section',
  });

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.comments.length).toBeGreaterThanOrEqual(1);
  const comment = result.comments.find((c: any) => c.entityId === commentId);
  expect(comment).toBeDefined();
  expect(comment.text).toBe('Review this section');
  expect(comment.anchoredText).toBeTruthy();
  expect(comment.blockId).toBeTruthy();
  expect(comment.status).toBe('open');
});

test('@behavior SD-2525: doc.extract returns tracked changes', async ({ superdoc }) => {
  await superdoc.type('Original text here');

  const target = await findFirstSelectionTarget(superdoc.page, 'Original');
  if (!target) throw new Error('Could not find text range');
  await replaceText(superdoc.page, { target, text: 'Modified' }, { changeMode: 'tracked' });

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.trackedChanges.length).toBeGreaterThanOrEqual(1);
  const tc = result.trackedChanges[0];
  expect(tc.entityId).toBeTruthy();
  expect(['insert', 'delete', 'format']).toContain(tc.type);
});

test('@behavior SD-2525: extract nodeIds work with scrollToElement', async ({ superdoc }) => {
  await superdoc.type('First paragraph');
  await superdoc.press('Enter');
  await superdoc.type('Second paragraph');
  await superdoc.press('Enter');
  await superdoc.type('Third paragraph');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const blocks = result.blocks.filter((b: any) => b.text.length > 0);
  expect(blocks.length).toBeGreaterThanOrEqual(3);

  const lastBlock = blocks[blocks.length - 1];
  const navResult = await superdoc.page.evaluate(
    (id) => (window as any).superdoc.scrollToElement(id),
    lastBlock.nodeId,
  );
  expect(navResult).toBe(true);
});

// ---------------------------------------------------------------------------
// SD-2672: Table-aware extraction
// ---------------------------------------------------------------------------

/**
 * Inserts a table at the current selection, then types a unique label
 * `r{row}c{col}` into each cell so we can assert which block came from
 * which (row, column).
 */
async function insertLabeledTable(superdoc: SuperDocFixture, rows: number, cols: number): Promise<void> {
  await superdoc.executeCommand('insertTable', { rows, cols });
  await superdoc.waitForStable();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      await superdoc.type(`r${r}c${c}`);
      const isLastCell = r === rows - 1 && c === cols - 1;
      if (!isLastCell) await superdoc.press('Tab');
    }
  }
  await superdoc.waitForStable();
}

test('@behavior SD-2672: extract emits a block per cell paragraph with tableContext', async ({ superdoc }) => {
  await insertLabeledTable(superdoc, 2, 3);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  // No flattened "type: table" block should be returned.
  expect(result.blocks.find((b: any) => b.type === 'table')).toBeUndefined();

  // Every cell's paragraph should appear as its own block with tableContext.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const block = result.blocks.find((b: any) => b.text === `r${r}c${c}`);
      expect(block, `block for r${r}c${c}`).toBeDefined();
      expect(block.tableContext).toBeDefined();
      expect(block.tableContext.tableOrdinal).toBe(0);
      expect(block.tableContext.rowIndex).toBe(r);
      expect(block.tableContext.columnIndex).toBe(c);
      expect(block.tableContext.rowspan).toBe(1);
      expect(block.tableContext.colspan).toBe(1);
      expect(block.nodeId).toBeTruthy();
      expect(block.type).toBe('paragraph');
    }
  }
});

test('@behavior SD-2672: nodeIds inside a table cell work with scrollToElement', async ({ superdoc }) => {
  await insertLabeledTable(superdoc, 2, 2);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const cellBlock = result.blocks.find((b: any) => b.text === 'r1c1');
  expect(cellBlock).toBeDefined();

  const navResult = await superdoc.page.evaluate(
    (id) => (window as any).superdoc.scrollToElement(id),
    cellBlock.nodeId,
  );
  expect(navResult).toBe(true);
});

test('@behavior SD-2672: empty cells emit a block with empty text', async ({ superdoc }) => {
  // Insert a table without filling any cells; every cell holds one empty paragraph.
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2 });
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const tableBlocks = result.blocks.filter((b: any) => b.tableContext);

  expect(tableBlocks).toHaveLength(4);
  for (const block of tableBlocks) {
    expect(block.text).toBe('');
    expect(block.nodeId).toBeTruthy();
    expect(block.type).toBe('paragraph');
  }

  const coords = tableBlocks.map((b: any) => `${b.tableContext.rowIndex},${b.tableContext.columnIndex}`).sort();
  expect(coords).toEqual(['0,0', '0,1', '1,0', '1,1']);
});

test('@behavior SD-2672: blocks outside tables have no tableContext', async ({ superdoc }) => {
  await superdoc.type('Before the table');
  await superdoc.press('Enter');
  await insertLabeledTable(superdoc, 1, 2);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const before = result.blocks.find((b: any) => b.text === 'Before the table');
  expect(before).toBeDefined();
  expect(before.tableContext).toBeUndefined();

  const insideCell = result.blocks.find((b: any) => b.text === 'r0c1');
  expect(insideCell).toBeDefined();
  expect(insideCell.tableContext).toBeDefined();
});

test('@behavior SD-2672: nested tables get a fresh ordinal and parent context', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 1 });
  await superdoc.waitForStable();
  // Cursor lands inside the only cell. Insert a nested 1x2 table here.
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 2 });
  await superdoc.waitForStable();
  // Type into the inner cells.
  await superdoc.type('inner-a');
  await superdoc.press('Tab');
  await superdoc.type('inner-b');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const innerA = result.blocks.find((b: any) => b.text === 'inner-a');
  const innerB = result.blocks.find((b: any) => b.text === 'inner-b');
  expect(innerA).toBeDefined();
  expect(innerB).toBeDefined();

  // Both inner cells share the inner table's ordinal and reference the outer
  // table as parent.
  expect(innerA.tableContext.tableOrdinal).toBe(innerB.tableContext.tableOrdinal);
  expect(innerA.tableContext.parentTableOrdinal).toBeDefined();
  expect(innerA.tableContext.parentTableOrdinal).not.toBe(innerA.tableContext.tableOrdinal);
  expect(innerA.tableContext.parentRowIndex).toBe(0);
  expect(innerA.tableContext.parentColumnIndex).toBe(0);
  expect(innerA.tableContext.rowIndex).toBe(0);
  expect(innerA.tableContext.columnIndex).toBe(0);
  expect(innerB.tableContext.columnIndex).toBe(1);
});

test('@behavior SD-2672: merged cells carry rowspan/colspan on the anchor', async ({ superdoc }) => {
  await insertLabeledTable(superdoc, 2, 3);

  // Merge cells (0,0) through (1,1): a 2-row x 2-column block in the top-left.
  await superdoc.page.evaluate(() => {
    const docApi = (window as any).editor.doc;
    const tableResult = docApi.find({ select: { type: 'node', nodeType: 'table' }, limit: 1 });
    const tableAddress = tableResult.items[0].address;
    docApi.tables.mergeCells({
      target: tableAddress,
      start: { rowIndex: 0, columnIndex: 0 },
      end: { rowIndex: 1, columnIndex: 1 },
    });
  });
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const tableBlocks = result.blocks.filter((b: any) => b.tableContext);

  // Anchor cell (0,0) carries the merged content and the spans.
  const anchorBlocks = tableBlocks.filter(
    (b: any) => b.tableContext.rowIndex === 0 && b.tableContext.columnIndex === 0,
  );
  expect(anchorBlocks.length).toBeGreaterThan(0);
  for (const block of anchorBlocks) {
    expect(block.tableContext.rowspan).toBe(2);
    expect(block.tableContext.colspan).toBe(2);
  }

  // Continuation cells (0,1), (1,0), (1,1) emit nothing; the anchor absorbed them.
  const continuationCoords = ['0,1', '1,0', '1,1'];
  for (const coord of continuationCoords) {
    const [r, c] = coord.split(',').map(Number);
    const found = tableBlocks.find((b: any) => b.tableContext.rowIndex === r && b.tableContext.columnIndex === c);
    expect(found, `no anchor expected at (${r},${c}); should be folded into (0,0)`).toBeUndefined();
  }
});
