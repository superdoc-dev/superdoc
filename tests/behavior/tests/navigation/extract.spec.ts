import { test, expect } from '../../fixtures/superdoc.js';

test('@behavior SD-2525: doc.extract returns blocks with nodeIds and full text', async ({ superdoc }) => {
  // Type some content to have blocks
  await superdoc.click();
  await superdoc.type('Hello world');
  await superdoc.press('Enter');
  await superdoc.type('Second paragraph');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.blocks).toBeDefined();
  expect(result.blocks.length).toBeGreaterThanOrEqual(2);
  expect(result.revision).toBeDefined();

  // Every block has a nodeId, type, and text
  for (const block of result.blocks) {
    expect(block.nodeId).toBeTruthy();
    expect(block.type).toBeTruthy();
    expect(typeof block.text).toBe('string');
  }

  // Find our typed content
  const hello = result.blocks.find((b: any) => b.text.includes('Hello world'));
  const second = result.blocks.find((b: any) => b.text.includes('Second paragraph'));
  expect(hello).toBeDefined();
  expect(second).toBeDefined();

  // nodeIds should be different
  expect(hello.nodeId).not.toBe(second.nodeId);
});

test('@behavior SD-2525: doc.extract returns empty arrays when no comments or tracked changes', async ({
  superdoc,
}) => {
  await superdoc.click();
  await superdoc.type('Plain document');

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  expect(result.comments).toEqual([]);
  expect(result.trackedChanges).toEqual([]);
});

test('@behavior SD-2525: doc.extract returns full text not truncated', async ({ superdoc }) => {
  await superdoc.click();
  // Type a long paragraph
  const longText =
    'This is a long paragraph that exceeds eighty characters to verify text is not truncated like textPreview is.';
  await superdoc.type(longText);

  const result = await superdoc.page.evaluate(() => (window as any).editor.doc.extract({}));

  const found = result.blocks.find((b: any) => b.text.includes('eighty characters'));
  expect(found).toBeDefined();
  expect(found.text.length).toBeGreaterThan(80);
});
