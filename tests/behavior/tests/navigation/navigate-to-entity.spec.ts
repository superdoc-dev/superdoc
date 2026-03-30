import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { StoryLocator } from '@superdoc/document-api';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  assertDocumentApiReady,
  listComments,
  listTrackChanges,
  navigateToEntity,
} from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/advanced-text.docx',
);
const HEADER_DOC_PATH = path.resolve(
  __dirname,
  '../../../../packages/super-editor/src/editors/v1/tests/data/longer-header-sign-area.docx',
);

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');
test.use({ config: { comments: 'on', trackChanges: true } });

type SelectionRange = { from: number; to: number };

async function resolveBookmarkPosition(page: Page, bookmarkName: string): Promise<number | null> {
  return page.evaluate((name) => {
    const doc = (window as any).editor?.state?.doc;
    if (!doc) throw new Error('Editor state is unavailable.');

    let resolvedPos: number | null = null;
    doc.descendants((node: any, pos: number) => {
      const nodeName = node?.type?.name;
      const attrs = node?.attrs ?? {};
      const candidateName = attrs.name ?? attrs['w:name'];
      if (nodeName === 'bookmarkStart' && candidateName === name) {
        resolvedPos = pos;
        return false;
      }
      return undefined;
    });

    return resolvedPos;
  }, bookmarkName);
}

async function resolveMarkedRange(page: Page, markName: string, entityId: string): Promise<SelectionRange | null> {
  return page.evaluate(
    ({ name, id }) => {
      const doc = (window as any).editor?.state?.doc;
      if (!doc) throw new Error('Editor state is unavailable.');

      let from: number | null = null;
      let to: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (!node?.isText || typeof node.text !== 'string') return undefined;

        const hasMark = Array.isArray(node.marks)
          ? node.marks.some((mark: any) => {
              if (mark?.type?.name !== name) return false;
              const attrs = mark?.attrs ?? {};
              return attrs.id === id || attrs.commentId === id || attrs.importedId === id;
            })
          : false;

        if (!hasMark) return undefined;

        const start = pos;
        const end = pos + node.nodeSize;
        from = from == null ? start : Math.min(from, start);
        to = to == null ? end : Math.max(to, end);
        return undefined;
      });

      if (from == null || to == null) return null;
      return { from, to };
    },
    { name: markName, id: entityId },
  );
}

async function resolveFirstMarkedRange(page: Page, markName: string): Promise<SelectionRange | null> {
  return page.evaluate((name) => {
    const doc = (window as any).editor?.state?.doc;
    if (!doc) throw new Error('Editor state is unavailable.');

    let from: number | null = null;
    let to: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node?.isText || typeof node.text !== 'string') return undefined;

      const hasMark = Array.isArray(node.marks) ? node.marks.some((mark: any) => mark?.type?.name === name) : false;

      if (!hasMark) return undefined;

      const start = pos;
      const end = pos + node.nodeSize;
      from = from == null ? start : Math.min(from, start);
      to = to == null ? end : Math.max(to, end);
      return undefined;
    });

    if (from == null || to == null) return null;
    return { from, to };
  }, markName);
}

async function expectCursorWithinRange(page: Page, range: SelectionRange): Promise<void> {
  await expect
    .poll(async () => {
      const selection = await page.evaluate(() => {
        const { from, to } = (window as any).editor.state.selection;
        return { from, to };
      });

      return selection.from === selection.to && selection.from >= range.from && selection.from <= range.to;
    })
    .toBe(true);
}

async function expectCursorNearExcerpt(page: Page, excerpt: string): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate((expectedExcerpt) => {
        const editor = (window as any).editor;
        const state = editor?.state;
        if (!state?.doc || !state?.selection) return false;

        const from = state.selection.from;
        const to = state.selection.to;
        if (from !== to || from <= 1) return false;

        const around = state.doc.textBetween(
          Math.max(0, from - 80),
          Math.min(state.doc.content.size, from + 120),
          '\n',
          '\n',
        );

        return typeof around === 'string' && around.includes(expectedExcerpt);
      }, excerpt);
    })
    .toBe(true);
}

async function createHeaderBookmark(page: Page): Promise<{ story: StoryLocator; name: string }> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const docApi = editor?.doc;
    if (!docApi?.headerFooters?.list || !docApi?.find || !docApi?.bookmarks?.insert || !docApi?.bookmarks?.get) {
      throw new Error('Required document APIs are unavailable for header bookmark setup.');
    }

    const headers = docApi.headerFooters.list({ kind: 'header' });
    const entry = headers?.items?.find((item: any) => item?.variant === 'default') ?? headers?.items?.[0];
    if (!entry?.section?.sectionId) {
      throw new Error('Unable to resolve a header/footer slot for the test document.');
    }

    const story = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: entry.section,
      headerFooterKind: 'header',
      variant: entry.variant ?? 'default',
    } as const;

    const toRanges = (item: any): Array<{ kind: 'text'; blockId: string; range: { start: number; end: number } }> => {
      const blocks = Array.isArray(item?.blocks) ? item.blocks : [];
      const fromBlocks = blocks
        .map((block: any) => {
          const blockId = block?.blockId;
          const start = block?.range?.start;
          const end = block?.range?.end;
          if (typeof blockId !== 'string' || typeof start !== 'number' || typeof end !== 'number') return null;
          return { kind: 'text' as const, blockId, range: { start, end } };
        })
        .filter(Boolean);

      if (fromBlocks.length > 0) return fromBlocks;

      const legacyRanges = Array.isArray(item?.context?.textRanges) ? item.context.textRanges : [];
      return legacyRanges.filter(
        (range: any) =>
          range?.kind === 'text' &&
          typeof range?.blockId === 'string' &&
          typeof range?.range?.start === 'number' &&
          typeof range?.range?.end === 'number',
      );
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

    if (
      !textRange ||
      textRange.kind !== 'text' ||
      typeof textRange.blockId !== 'string' ||
      typeof textRange.range?.start !== 'number' ||
      typeof textRange.range?.end !== 'number'
    ) {
      throw new Error('Unable to resolve a header text range for bookmark insertion.');
    }

    const name = `hf-nav-${Date.now()}`;
    const insertResult = docApi.bookmarks.insert({
      name,
      at: {
        kind: 'text',
        segments: [
          {
            blockId: textRange.blockId,
            range: textRange.range,
          },
        ],
        story,
      },
    });

    if (!insertResult?.success) {
      throw new Error(`Bookmark insert failed: ${insertResult?.failure?.code ?? 'UNKNOWN'}`);
    }

    return { story, name };
  });
}

test('@behavior navigateTo moves the caret to a bookmark in advanced-text.docx', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);
  await assertDocumentApiReady(superdoc.page);

  const bookmarkName = '_Paragraph_level_formatting';
  const bookmarkPos = await resolveBookmarkPosition(superdoc.page, bookmarkName);
  expect(bookmarkPos).not.toBeNull();

  await superdoc.setTextSelection(1);
  const didNavigate = await navigateToEntity(superdoc.page, {
    kind: 'entity',
    entityType: 'bookmark',
    name: bookmarkName,
  });

  expect(didNavigate).toBe(true);
  await expect
    .poll(() => superdoc.getSelection())
    .toEqual(expect.objectContaining({ from: bookmarkPos as number, to: bookmarkPos as number }));
});

test('@behavior navigateTo activates the anchored comment in advanced-text.docx', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);
  await assertDocumentApiReady(superdoc.page);

  const comments = (await listComments(superdoc.page, { includeResolved: true })) as any;
  const comment = comments.matches[0];
  expect(comment?.commentId).toBeTruthy();

  const commentRange = await resolveMarkedRange(superdoc.page, 'commentMark', comment.commentId);
  expect(commentRange).not.toBeNull();

  await superdoc.setTextSelection(1);
  const didNavigate = await navigateToEntity(superdoc.page, {
    kind: 'entity',
    entityType: 'comment',
    entityId: comment.commentId,
  });

  expect(didNavigate).toBe(true);
  await expectCursorWithinRange(superdoc.page, commentRange as SelectionRange);
  await expect(
    superdoc.page.locator(`.comment-placeholder[data-comment-id="${comment.commentId}"] .comments-dialog.is-active`),
  ).toBeVisible({ timeout: 10_000 });
});

test('@behavior navigateTo moves the caret to a tracked change in advanced-text.docx', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);
  await assertDocumentApiReady(superdoc.page);

  const trackedChanges = (await listTrackChanges(superdoc.page, { type: 'insert' })) as any;
  const trackedChange = trackedChanges.changes[0];
  expect(trackedChange?.id).toBeTruthy();

  const trackedChangeRange =
    (await resolveMarkedRange(superdoc.page, 'trackInsert', trackedChange.id)) ??
    (await resolveFirstMarkedRange(superdoc.page, 'trackInsert'));
  expect(trackedChangeRange).not.toBeNull();

  await superdoc.setTextSelection(1);
  const didNavigate = await navigateToEntity(superdoc.page, {
    kind: 'entity',
    entityType: 'trackedChange',
    entityId: trackedChange.id,
  });

  expect(didNavigate).toBe(true);
  await expectCursorNearExcerpt(superdoc.page, trackedChange.excerpt);
});

test('@behavior navigateTo activates a header bookmark when given a header story address', async ({ superdoc }) => {
  await superdoc.loadDocument(HEADER_DOC_PATH);
  await superdoc.waitForStable(2000);
  await assertDocumentApiReady(superdoc.page);

  const headerBookmark = await createHeaderBookmark(superdoc.page);

  await superdoc.setTextSelection(1);
  const didNavigate = await navigateToEntity(superdoc.page, {
    kind: 'entity',
    entityType: 'bookmark',
    name: headerBookmark.name,
    story: headerBookmark.story,
  });

  expect(didNavigate).toBe(true);
  await expect(superdoc.page.locator('.superdoc-header-editor-host').first()).toBeVisible({ timeout: 10_000 });

  await expect
    .poll(async () => {
      return superdoc.page.evaluate((bookmarkName) => {
        const activeEditor = (window as any).editor?.presentationEditor?.getActiveEditor?.();
        const selection = activeEditor?.state?.selection;
        if (!selection) return null;

        let bookmarkPos: number | null = null;
        activeEditor.state.doc.descendants((node: any, pos: number) => {
          const candidateName = node?.attrs?.name ?? node?.attrs?.['w:name'];
          if (node?.type?.name === 'bookmarkStart' && candidateName === bookmarkName) {
            bookmarkPos = pos;
            return false;
          }
          return undefined;
        });

        const snippet = activeEditor.state.doc.textBetween(
          Math.max(0, selection.from - 40),
          Math.min(activeEditor.state.doc.content.size, selection.from + 60),
          '\n',
          '\n',
        );

        return {
          from: selection.from,
          to: selection.to,
          snippet,
          documentId: activeEditor.options?.documentId ?? null,
          matchesExpectedPos: bookmarkPos != null && selection.from === bookmarkPos && selection.to === bookmarkPos,
        };
      }, headerBookmark.name);
    })
    .toEqual(
      expect.objectContaining({
        matchesExpectedPos: true,
        snippet: expect.stringContaining('Generic content header'),
      }),
    );
});
