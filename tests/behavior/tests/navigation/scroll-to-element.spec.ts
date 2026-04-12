import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/advanced-text.docx',
);

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');
test.use({ config: { comments: 'on', trackChanges: true } });

test.describe('scrollToElement', () => {
  test('@behavior navigates to a paragraph by nodeId', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const result = await superdoc.page.evaluate(() => {
      const qm = (window as any).editor?.doc?.query?.match;
      const match = qm({ select: { type: 'text', pattern: 'Fortune favors', mode: 'contains' }, require: 'first' });
      const nodeId = match?.items?.[0]?.address?.nodeId;
      if (!nodeId) return { error: 'nodeId not found' };
      return { nodeId };
    });

    expect(result).toHaveProperty('nodeId');
    const nodeId = (result as { nodeId: string }).nodeId;

    const navResult = await superdoc.page.evaluate((id) => (window as any).superdoc.scrollToElement(id), nodeId);
    expect(navResult).toBe(true);
  });

  test('@behavior navigates to a comment by entityId', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const commentId = await superdoc.page.evaluate(() => {
      const comments = (window as any).editor?.doc?.comments?.list?.();
      return comments?.items?.[0]?.address?.entityId ?? comments?.items?.[0]?.id ?? null;
    });

    if (!commentId) {
      test.skip();
      return;
    }

    const navResult = await superdoc.page.evaluate((id) => (window as any).superdoc.scrollToElement(id), commentId);
    expect(navResult).toBe(true);
  });

  test('@behavior navigates to a tracked change by entityId', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const tcId = await superdoc.page.evaluate(() => {
      const tcs = (window as any).editor?.doc?.trackChanges?.list?.();
      return tcs?.items?.[0]?.address?.entityId ?? tcs?.items?.[0]?.id ?? null;
    });

    if (!tcId) {
      test.skip();
      return;
    }

    const navResult = await superdoc.page.evaluate((id) => (window as any).superdoc.scrollToElement(id), tcId);
    expect(navResult).toBe(true);
  });

  test('@behavior returns false for non-existent element ID', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const navResult = await superdoc.page.evaluate(() => (window as any).superdoc.scrollToElement('DOES_NOT_EXIST'));
    expect(navResult).toBe(false);
  });

  test('@behavior navigates to multiple blocks sequentially', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const results = await superdoc.page.evaluate(async () => {
      const qm = (window as any).editor?.doc?.query?.match;
      const targets = ['Fortune favors', 'Dropcaps', 'SuperDoc Advanced'];
      const navResults: Array<{ text: string; success: boolean }> = [];

      for (const text of targets) {
        const match = qm({ select: { type: 'text', pattern: text, mode: 'contains' }, require: 'first' });
        const nodeId = match?.items?.[0]?.address?.nodeId;
        const success = nodeId ? await (window as any).superdoc.scrollToElement(nodeId) : false;
        navResults.push({ text, success });
        await new Promise((r) => setTimeout(r, 300));
      }

      return navResults;
    });

    for (const r of results) {
      expect(r.success, `Navigation to "${r.text}" should succeed`).toBe(true);
    }
  });
});
