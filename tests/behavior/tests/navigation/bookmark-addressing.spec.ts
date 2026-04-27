import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoryLocator } from '@superdoc/document-api';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady } from '../../helpers/document-api.js';
import { LONGER_HEADER_SIGN_AREA_DOC_PATH } from '../../helpers/story-fixtures.js';
import {
  activateHeader,
  exitActiveStory,
  getActiveStorySession,
  getActiveStoryText,
  waitForActiveStory,
} from '../../helpers/story-surfaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BODY_BOOKMARK_DOC_PATH = path.resolve(__dirname, 'fixtures/pageref-standalone-h.docx');

test.skip(!fs.existsSync(BODY_BOOKMARK_DOC_PATH), 'Body bookmark fixture is not available');
test.skip(!fs.existsSync(LONGER_HEADER_SIGN_AREA_DOC_PATH), 'Header fixture is not available');

async function loadDocumentAndWait(superdoc: SuperDocFixture, filePath: string): Promise<void> {
  await superdoc.loadDocument(filePath);
  await superdoc.waitForStable(2000);
  await assertDocumentApiReady(superdoc.page);
}

function requireHeaderStory(story: StoryLocator | null): Extract<StoryLocator, { storyType: 'headerFooterPart' }> {
  if (!story || story.kind !== 'story' || story.storyType !== 'headerFooterPart') {
    throw new Error(`Expected an active header/footer story, received: ${JSON.stringify(story)}`);
  }
  return story;
}

function requireAnchorWord(text: string | null): string {
  const match = (text ?? '').match(/[A-Za-z][A-Za-z0-9_-]*/);
  if (!match) {
    throw new Error(`Could not derive an anchor word from story text: ${JSON.stringify(text)}`);
  }
  return match[0];
}

async function insertBookmarkAtStoryText(
  superdoc: SuperDocFixture,
  input: { name: string; pattern: string; story: StoryLocator },
): Promise<{
  success: true;
  bookmark: { kind: 'entity'; entityType: 'bookmark'; name: string; story?: StoryLocator };
}> {
  return superdoc.page.evaluate(({ name, pattern, story }) => {
    const docApi = (window as any).editor?.doc;
    if (!docApi?.query?.match || !docApi?.bookmarks?.insert) {
      throw new Error('Document API bookmarks/query surface is unavailable.');
    }

    const match = docApi.query.match({
      select: { type: 'text', pattern, mode: 'contains' },
      in: story,
      require: 'first',
    });
    const block = match?.items?.[0]?.blocks?.[0];
    if (!block?.blockId || typeof block?.range?.start !== 'number' || typeof block?.range?.end !== 'number') {
      throw new Error(`Could not resolve a text block for pattern "${pattern}" in ${JSON.stringify(story)}`);
    }

    const receipt = docApi.bookmarks.insert({
      name,
      at: {
        kind: 'text',
        segments: [{ blockId: block.blockId, range: block.range }],
        story,
      },
    });

    if (!receipt?.success) {
      throw new Error(`Bookmark insert failed: ${JSON.stringify(receipt)}`);
    }

    return receipt;
  }, input);
}

async function listBookmarks(
  superdoc: SuperDocFixture,
  query?: { in?: StoryLocator },
): Promise<Array<{ name: string; address: { name: string; story?: StoryLocator } }>> {
  return superdoc.page.evaluate((input) => {
    const result = (window as any).editor?.doc?.bookmarks?.list?.(input);
    return Array.isArray(result?.items)
      ? result.items.map((item: any) => ({
          name: item?.name,
          address: item?.address,
        }))
      : [];
  }, query);
}

async function renameBookmark(
  superdoc: SuperDocFixture,
  target: { kind: 'entity'; entityType: 'bookmark'; name: string; story?: StoryLocator },
  newName: string,
): Promise<void> {
  await superdoc.page.evaluate(
    ({ bookmark, nextName }) => {
      const receipt = (window as any).editor?.doc?.bookmarks?.rename?.({ target: bookmark, newName: nextName });
      if (!receipt?.success) {
        throw new Error(`Bookmark rename failed: ${JSON.stringify(receipt)}`);
      }
    },
    { bookmark: target, nextName: newName },
  );
}

async function removeBookmark(
  superdoc: SuperDocFixture,
  target: { kind: 'entity'; entityType: 'bookmark'; name: string; story?: StoryLocator },
): Promise<void> {
  await superdoc.page.evaluate((bookmark) => {
    const receipt = (window as any).editor?.doc?.bookmarks?.remove?.({ target: bookmark });
    if (!receipt?.success) {
      throw new Error(`Bookmark remove failed: ${JSON.stringify(receipt)}`);
    }
  }, target);
}

async function exportCurrentDocument(superdoc: SuperDocFixture, outputPath: string): Promise<void> {
  const exportedBytes = await superdoc.page.evaluate(async () => {
    const exported = await (window as any).editor.exportDocx({ isFinalDoc: false });

    if (exported instanceof Blob) {
      return Array.from(new Uint8Array(await exported.arrayBuffer()));
    }

    if (exported instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(exported));
    }

    if (ArrayBuffer.isView(exported)) {
      return Array.from(new Uint8Array(exported.buffer, exported.byteOffset, exported.byteLength));
    }

    throw new Error(`Unexpected exportDocx() result: ${Object.prototype.toString.call(exported)}`);
  });

  await writeFile(outputPath, Buffer.from(exportedBytes));
}

test('@behavior SD-2358: SuperDoc.navigateTo accepts body bookmark targets', async ({ superdoc }) => {
  await loadDocumentAndWait(superdoc, BODY_BOOKMARK_DOC_PATH);

  const selBefore = await superdoc.getSelection();
  const result = await superdoc.page.evaluate(() =>
    (window as any).superdoc.navigateTo({
      kind: 'entity',
      entityType: 'bookmark',
      name: '_Toc227765979',
    }),
  );

  expect(result).toBe(true);
  await superdoc.waitForStable(2000);

  const selAfter = await superdoc.getSelection();
  expect(selAfter.from).not.toBe(selBefore.from);
});

test('@behavior SD-2358: SuperDoc.navigateTo returns false for missing bookmark targets', async ({ superdoc }) => {
  await loadDocumentAndWait(superdoc, BODY_BOOKMARK_DOC_PATH);

  const result = await superdoc.page.evaluate(() =>
    (window as any).superdoc.navigateTo({
      kind: 'entity',
      entityType: 'bookmark',
      name: 'sd2358_missing_bookmark',
    }),
  );

  expect(result).toBe(false);
});

test('@behavior SD-2358: header bookmarks support story-aware CRUD and top-level navigation', async ({ superdoc }) => {
  await loadDocumentAndWait(superdoc, LONGER_HEADER_SIGN_AREA_DOC_PATH);

  await activateHeader(superdoc);
  const story = requireHeaderStory(await getActiveStorySession(superdoc.page));
  const anchorWord = requireAnchorWord(await getActiveStoryText(superdoc.page));

  const inserted = await insertBookmarkAtStoryText(superdoc, {
    name: 'sd2358_header_bookmark',
    pattern: anchorWord,
    story,
  });
  expect(inserted.bookmark).toEqual({
    kind: 'entity',
    entityType: 'bookmark',
    name: 'sd2358_header_bookmark',
    story,
  });

  const storyBookmarks = await listBookmarks(superdoc, { in: story });
  expect(storyBookmarks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'sd2358_header_bookmark',
        address: expect.objectContaining({ story }),
      }),
    ]),
  );

  const allBookmarks = await listBookmarks(superdoc);
  expect(allBookmarks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'sd2358_header_bookmark',
        address: expect.objectContaining({ story }),
      }),
    ]),
  );

  await renameBookmark(superdoc, inserted.bookmark, 'sd2358_header_bookmark_renamed');

  const renamedBookmarks = await listBookmarks(superdoc, { in: story });
  const renamed = renamedBookmarks.find((bookmark) => bookmark.name === 'sd2358_header_bookmark_renamed');
  expect(renamed).toBeTruthy();
  expect(renamed?.address.story).toEqual(story);

  await exitActiveStory(superdoc.page);
  const navigated = await superdoc.page.evaluate((bookmark) => (window as any).superdoc.navigateTo(bookmark), {
    kind: 'entity',
    entityType: 'bookmark',
    name: 'sd2358_header_bookmark_renamed',
    story,
  });
  expect(navigated).toBe(true);
  await superdoc.waitForStable(2000);
  await waitForActiveStory(superdoc.page, { kind: 'story', storyType: 'headerFooterPart', refId: story.refId });

  await removeBookmark(superdoc, {
    kind: 'entity',
    entityType: 'bookmark',
    name: 'sd2358_header_bookmark_renamed',
    story,
  });

  const finalBookmarks = await listBookmarks(superdoc, { in: story });
  expect(finalBookmarks.find((bookmark) => bookmark.name === 'sd2358_header_bookmark_renamed')).toBeUndefined();
});

test('SD-2358 header bookmarks survive DOCX export and re-import', async ({ superdoc }, testInfo) => {
  await loadDocumentAndWait(superdoc, LONGER_HEADER_SIGN_AREA_DOC_PATH);

  await activateHeader(superdoc);
  const story = requireHeaderStory(await getActiveStorySession(superdoc.page));
  const anchorWord = requireAnchorWord(await getActiveStoryText(superdoc.page));

  await insertBookmarkAtStoryText(superdoc, {
    name: 'sd2358_roundtrip_header_bookmark',
    pattern: anchorWord,
    story,
  });

  const exportedPath = testInfo.outputPath('sd-2358-header-bookmark-roundtrip.docx');
  await exportCurrentDocument(superdoc, exportedPath);

  await loadDocumentAndWait(superdoc, exportedPath);

  const reloadedBookmarks = await listBookmarks(superdoc);
  expect(reloadedBookmarks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'sd2358_roundtrip_header_bookmark',
        address: expect.objectContaining({
          story: expect.objectContaining({ storyType: 'headerFooterPart' }),
        }),
      }),
    ]),
  );

  const reloadedBookmark = reloadedBookmarks.find((bookmark) => bookmark.name === 'sd2358_roundtrip_header_bookmark');
  expect(reloadedBookmark).toBeTruthy();

  const navigated = await superdoc.page.evaluate((bookmark) => (window as any).superdoc.navigateTo(bookmark), {
    kind: 'entity',
    entityType: 'bookmark',
    name: reloadedBookmark!.address.name,
    story: reloadedBookmark!.address.story,
  });
  expect(navigated).toBe(true);
  await superdoc.waitForStable(2000);
  await waitForActiveStory(superdoc.page, { kind: 'story', storyType: 'headerFooterPart' });
});
