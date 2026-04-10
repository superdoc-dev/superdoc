import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, replaceText, findFirstTextRange } from '../../helpers/document-api.js';

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
  await superdoc.click();
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

  const target = await findFirstTextRange(superdoc.page, 'Original');
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
