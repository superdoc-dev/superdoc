import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, replaceText, findFirstSelectionTarget } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIVIAL_REPORT_FIXTURE = path.join(__dirname, 'fixtures/sd-2653-trivial-report.docx');

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

async function insertFilled2x2(superdoc: any): Promise<void> {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.type('A1');
  await superdoc.press('Tab');
  await superdoc.type('B1');
  await superdoc.press('Tab');
  await superdoc.type('A2');
  await superdoc.press('Tab');
  await superdoc.type('B2');
  await superdoc.waitForStable();
}

test('@behavior SD-2653: doc.extract emits a block per paragraph inside each cell', async ({ superdoc }) => {
  await insertFilled2x2(superdoc);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  // No opaque `type: "table"` block.
  expect(result.blocks.find((b: any) => b.type === 'table')).toBeUndefined();

  // Every cell contributes exactly one paragraph block — 4 in a 2x2.
  const cellBlocks = result.blocks.filter((b: any) => b.tableContext);
  expect(cellBlocks.length).toBe(4);

  const byCoord = new Map(cellBlocks.map((b: any) => [`r${b.tableContext.rowIndex}c${b.tableContext.colIndex}`, b]));
  expect((byCoord.get('r0c0') as any).text).toBe('A1');
  expect((byCoord.get('r0c1') as any).text).toBe('B1');
  expect((byCoord.get('r1c0') as any).text).toBe('A2');
  expect((byCoord.get('r1c1') as any).text).toBe('B2');

  for (const block of cellBlocks) {
    expect(block.type).toBe('paragraph');
    expect(typeof block.nodeId).toBe('string');
    expect(block.nodeId.length).toBeGreaterThan(0);
  }

  // The cell-level nodeIds are all distinct.
  const ids = cellBlocks.map((b: any) => b.nodeId);
  expect(new Set(ids).size).toBe(ids.length);

  // All cells belong to the same table — `tableNodeId` lets callers group them
  // even though there is no longer a `type: "table"` marker block.
  const tableIds = new Set(cellBlocks.map((b: any) => b.tableContext.tableNodeId));
  expect(tableIds.size).toBe(1);
  for (const id of tableIds) {
    expect(typeof id).toBe('string');
    expect((id as string).length).toBeGreaterThan(0);
  }
});

test('@behavior SD-2653: extract cell nodeIds resolve through scrollToElement', async ({ superdoc }) => {
  await insertFilled2x2(superdoc);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
  const b2 = result.blocks.find(
    (b: any) => b.tableContext && b.tableContext.rowIndex === 1 && b.tableContext.colIndex === 1,
  );
  expect(b2).toBeDefined();

  const navResult = await superdoc.page.evaluate((id) => (window as any).superdoc.scrollToElement(id), b2.nodeId);
  expect(navResult).toBe(true);
});

test('@behavior SD-2653: cells with multiple paragraphs emit one block per paragraph', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // First cell holds two paragraphs; second holds one.
  await superdoc.type('line one');
  await superdoc.press('Enter');
  await superdoc.type('line two');
  await superdoc.press('Tab');
  await superdoc.type('right cell');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const leftCell = result.blocks.filter(
    (b: any) => b.tableContext && b.tableContext.rowIndex === 0 && b.tableContext.colIndex === 0,
  );
  const rightCell = result.blocks.filter(
    (b: any) => b.tableContext && b.tableContext.rowIndex === 0 && b.tableContext.colIndex === 1,
  );

  expect(leftCell.map((b: any) => b.text)).toEqual(['line one', 'line two']);
  expect(rightCell.map((b: any) => b.text)).toEqual(['right cell']);

  // The two blocks in the left cell have the same coordinates but distinct nodeIds.
  expect(leftCell[0].nodeId).not.toBe(leftCell[1].nodeId);
});

test('@behavior SD-2653: empty cells still emit an empty-text paragraph block', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Leave first cell empty; only type in second.
  await superdoc.press('Tab');
  await superdoc.type('right');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const cellBlocks = result.blocks.filter((b: any) => b.tableContext);
  expect(cellBlocks.length).toBe(2);

  const emptyCell = cellBlocks.find((b: any) => b.tableContext.colIndex === 0);
  expect(emptyCell).toBeDefined();
  expect(emptyCell.text).toBe('');
  expect(emptyCell.type).toBe('paragraph');
  expect(typeof emptyCell.nodeId).toBe('string');
  expect(emptyCell.nodeId.length).toBeGreaterThan(0);

  const filledCell = cellBlocks.find((b: any) => b.tableContext.colIndex === 1);
  expect(filledCell.text).toBe('right');
});

test('@behavior SD-2653: heading-styled paragraphs inside cells keep their heading type and level', async ({
  superdoc,
}) => {
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 1, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type('cell heading');
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setStyleById('Heading2');
  });
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const cellBlock = result.blocks.find((b: any) => b.tableContext && b.text === 'cell heading');
  expect(cellBlock).toBeDefined();
  expect(cellBlock.type).toBe('heading');
  expect(cellBlock.headingLevel).toBe(2);
});

test('@behavior SD-2653: nested tables emit paragraphs scoped to the inner table', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 1, cols: 1, withHeaderRow: false });
  await superdoc.waitForStable();

  // Inside the outer cell, insert a 2x1 nested table and fill both cells.
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 1, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.type('nested top');
  await superdoc.press('Tab');
  await superdoc.type('nested bottom');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const tableIds = new Set(
    result.blocks.filter((b: any) => b.tableContext).map((b: any) => b.tableContext.tableNodeId),
  );
  expect(tableIds.size).toBeGreaterThanOrEqual(2);

  const nestedBlocks = result.blocks.filter(
    (b: any) => b.tableContext && (b.text === 'nested top' || b.text === 'nested bottom'),
  );
  // Both nested paragraphs share the same `tableNodeId` — the inner table, not the outer one.
  expect(nestedBlocks.length).toBe(2);
  const nestedTableIds = new Set(nestedBlocks.map((b: any) => b.tableContext.tableNodeId));
  expect(nestedTableIds.size).toBe(1);

  // Coordinates are scoped to the nested table (two rows, one column each).
  const coords = nestedBlocks.map((b: any) => `r${b.tableContext.rowIndex}c${b.tableContext.colIndex}`).sort();
  expect(coords).toEqual(['r0c0', 'r1c0']);
});

test('@behavior SD-2653: top-level content-control wrappers are transparent', async ({ superdoc }) => {
  // Insert a structured-content-block at the document root wrapping two paragraphs.
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.insertStructuredContentBlock({
      attrs: { alias: 'wrapped-section' },
      json: {
        type: 'structuredContentBlock',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'wrapped first paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'wrapped second paragraph' }] },
        ],
      },
    });
  });
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  // Pre-fix: the whole SDT came back as one opaque block whose text concatenated
  // both paragraphs with no separator. Post-fix: the wrapper is transparent and
  // its inner paragraphs are emitted as their own blocks with stable IDs.
  const wrapped = result.blocks.filter(
    (b: any) => b.text === 'wrapped first paragraph' || b.text === 'wrapped second paragraph',
  );
  expect(wrapped.length).toBe(2);

  for (const block of wrapped) {
    expect(block.type).toBe('paragraph');
    expect(typeof block.nodeId).toBe('string');
    expect(block.nodeId.length).toBeGreaterThan(0);
    expect(block.tableContext).toBeUndefined();
  }

  // And no opaque `sdt` / `structuredContentBlock` block with concatenated text.
  const opaque = result.blocks.find(
    (b: any) => b.type === 'sdt' && /wrapped first paragraphwrapped second paragraph/.test(b.text),
  );
  expect(opaque).toBeUndefined();
});

test.describe('@behavior SD-2653: DOCX-imported table', () => {
  test.skip(!fs.existsSync(TRIVIAL_REPORT_FIXTURE), 'fixture missing');

  test('preserves imported paraIds and emits one block per cell paragraph', async ({ superdoc }) => {
    await superdoc.loadDocument(TRIVIAL_REPORT_FIXTURE);

    const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

    const cellBlocks = result.blocks.filter((b: any) => b.tableContext);

    // Fixture is a 5x4 table (4 header cells + 4 data rows x 4 cells each).
    expect(cellBlocks.length).toBe(20);

    // Imported paraIds are 8-char uppercase hex (Word's w14:paraId format).
    // Importer preserves these so they round-trip through export.
    for (const block of cellBlocks) {
      expect(block.nodeId).toMatch(/^[0-9A-F]{8}$/);
    }

    // The header cells "Flats", "Curves", "Angles" appear in row 0.
    const headerTexts = cellBlocks.filter((b: any) => b.tableContext.rowIndex === 0).map((b: any) => b.text);
    expect(headerTexts).toContain('Flats');
    expect(headerTexts).toContain('Curves');
    expect(headerTexts).toContain('Angles');

    // Spot-check a data row: "Cone" row should contain "Cone", "3", "1", "1".
    const coneRowIndex = cellBlocks.find((b: any) => b.text === 'Cone')?.tableContext.rowIndex;
    expect(coneRowIndex).toBeDefined();
    const coneRow = cellBlocks
      .filter((b: any) => b.tableContext.rowIndex === coneRowIndex)
      .sort((a: any, b: any) => a.tableContext.colIndex - b.tableContext.colIndex)
      .map((b: any) => b.text);
    expect(coneRow).toEqual(['Cone', '3', '1', '1']);

    // All cells point at the same tableNodeId.
    const tableIds = new Set(cellBlocks.map((b: any) => b.tableContext.tableNodeId));
    expect(tableIds.size).toBe(1);
  });

  test('imported cell paraIds resolve through scrollToElement', async ({ superdoc }) => {
    await superdoc.loadDocument(TRIVIAL_REPORT_FIXTURE);

    const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));
    const coneCell = result.blocks.find((b: any) => b.text === 'Cone');
    expect(coneCell).toBeDefined();

    const navResult = await superdoc.page.evaluate(
      (id) => (window as any).superdoc.scrollToElement(id),
      coneCell.nodeId,
    );
    expect(navResult).toBe(true);
  });
});
