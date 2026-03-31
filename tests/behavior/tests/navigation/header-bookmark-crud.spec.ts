import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { StoryLocator } from '@superdoc/document-api';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEADER_DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/longer-header-sign-area.docx',
);

test.skip(!fs.existsSync(HEADER_DOC_PATH), 'Test document not available');

/**
 * Resolves a header story locator and a text range within it that can be used
 * as an insertion target for bookmarks.
 */
async function resolveHeaderInsertionTarget(page: Page) {
  return page.evaluate(() => {
    const docApi = (window as any).editor?.doc;
    if (!docApi?.headerFooters?.list || !docApi?.find || !docApi?.bookmarks) {
      throw new Error('Required document APIs are unavailable.');
    }

    const headers = docApi.headerFooters.list({ kind: 'header' });
    const entry = headers?.items?.find((item: any) => item?.variant === 'default') ?? headers?.items?.[0];
    if (!entry?.section?.sectionId) {
      throw new Error('Unable to resolve a header/footer slot for the test document.');
    }

    const story: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: entry.section,
      headerFooterKind: 'header',
      variant: entry.variant ?? 'default',
    } as any;

    const toRanges = (item: any) => {
      const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
      return blocks
        .map((block: any) => {
          const blockId = block?.blockId;
          const start = block?.range?.start;
          const end = block?.range?.end;
          if (typeof blockId !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null;
          return { kind: 'text' as const, blockId, range: { start, end } };
        })
        .filter(Boolean);
    };

    const queryMatch = docApi?.query?.match;
    const queryResult =
      typeof queryMatch === 'function'
        ? queryMatch({
            select: { type: 'text', pattern: 'Generic content header', mode: 'contains' },
            require: 'any',
            in: story,
          })
        : null;

    const queryItem = Array.isArray(queryResult?.items) ? queryResult.items[0] : null;
    const findResult =
      queryItem == null
        ? docApi.find({
            select: { type: 'text', pattern: 'Generic content header', mode: 'contains' },
            in: story,
            limit: 1,
          })
        : null;
    const firstItem = queryItem ?? (Array.isArray(findResult?.items) ? findResult.items[0] : null);
    const textRange = toRanges(firstItem)[0] ?? null;

    if (!textRange) {
      throw new Error('Unable to resolve a header text range for bookmark insertion.');
    }

    return { story, textRange };
  });
}

test.describe('Header bookmark CRUD', () => {
  test('@behavior insert, get, list, rename, and remove a bookmark in a header story', async ({ superdoc }) => {
    await superdoc.loadDocument(HEADER_DOC_PATH);
    await superdoc.waitForStable(2000);
    await assertDocumentApiReady(superdoc.page);

    const { story, textRange } = await resolveHeaderInsertionTarget(superdoc.page);
    const bookmarkName = `hf-crud-${Date.now()}`;

    // --- Insert ---
    const insertResult = await superdoc.page.evaluate(
      ({ name, at, storyLocator }) => {
        return (window as any).editor.doc.bookmarks.insert({
          name,
          at: { kind: 'text', segments: [at], story: storyLocator },
        });
      },
      { name: bookmarkName, at: textRange, storyLocator: story },
    );

    expect(insertResult.success).toBe(true);
    expect(insertResult.bookmark).toEqual(
      expect.objectContaining({
        kind: 'entity',
        entityType: 'bookmark',
        name: bookmarkName,
        story: expect.objectContaining({ storyType: 'headerFooterSlot' }),
      }),
    );

    // --- Get ---
    const getResult = await superdoc.page.evaluate(
      ({ name, storyLocator }) => {
        return (window as any).editor.doc.bookmarks.get({
          target: { kind: 'entity', entityType: 'bookmark', name, story: storyLocator },
        });
      },
      { name: bookmarkName, storyLocator: story },
    );

    expect(getResult).toEqual(
      expect.objectContaining({
        name: bookmarkName,
        address: expect.objectContaining({
          kind: 'entity',
          entityType: 'bookmark',
          name: bookmarkName,
        }),
      }),
    );

    // --- List (filtered to header story) ---
    const listResult = await superdoc.page.evaluate(
      ({ storyLocator }) => {
        return (window as any).editor.doc.bookmarks.list({ in: storyLocator });
      },
      { storyLocator: story },
    );

    const listedNames: string[] = (listResult?.items ?? []).map((item: any) => item?.name ?? item?.address?.name);
    expect(listedNames).toContain(bookmarkName);

    // --- Rename ---
    const renamedName = `${bookmarkName}-renamed`;
    const renameResult = await superdoc.page.evaluate(
      ({ oldName, newName, storyLocator }) => {
        return (window as any).editor.doc.bookmarks.rename({
          target: { kind: 'entity', entityType: 'bookmark', name: oldName, story: storyLocator },
          newName,
        });
      },
      { oldName: bookmarkName, newName: renamedName, storyLocator: story },
    );

    expect(renameResult.success).toBe(true);
    expect(renameResult.bookmark).toEqual(
      expect.objectContaining({
        name: renamedName,
        story: expect.objectContaining({ storyType: 'headerFooterSlot' }),
      }),
    );

    // --- Get after rename ---
    const getAfterRename = await superdoc.page.evaluate(
      ({ name, storyLocator }) => {
        return (window as any).editor.doc.bookmarks.get({
          target: { kind: 'entity', entityType: 'bookmark', name, story: storyLocator },
        });
      },
      { name: renamedName, storyLocator: story },
    );

    expect(getAfterRename).toEqual(expect.objectContaining({ name: renamedName }));

    // --- Remove ---
    const removeResult = await superdoc.page.evaluate(
      ({ name, storyLocator }) => {
        return (window as any).editor.doc.bookmarks.remove({
          target: { kind: 'entity', entityType: 'bookmark', name, story: storyLocator },
        });
      },
      { name: renamedName, storyLocator: story },
    );

    expect(removeResult.success).toBe(true);

    // --- List after remove (bookmark should be gone) ---
    const listAfterRemove = await superdoc.page.evaluate(
      ({ storyLocator }) => {
        return (window as any).editor.doc.bookmarks.list({ in: storyLocator });
      },
      { storyLocator: story },
    );

    const remainingNames: string[] = (listAfterRemove?.items ?? []).map(
      (item: any) => item?.name ?? item?.address?.name,
    );
    expect(remainingNames).not.toContain(renamedName);
  });
});
