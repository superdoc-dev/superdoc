import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/sd-1960-word-replacement-no-comments.docx');

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true } });

type TrackChangeSegment = {
  from: number;
  id: string;
  sourceId: string;
  text: string;
  to: number;
  type: 'delete' | 'insert';
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function listTrackedSegments(page: Page): Promise<TrackChangeSegment[]> {
  return page.evaluate(() => {
    const rawSegments: TrackChangeSegment[] = [];
    const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node?.isText || !node.text) {
        return;
      }

      const trackedMark = (node.marks ?? []).find((mark: any) => {
        const name = mark.type?.name;
        return name === 'trackInsert' || name === 'trackDelete';
      });

      if (!trackedMark) {
        return;
      }

      rawSegments.push({
        from: Number(pos),
        id: String(trackedMark.attrs?.id ?? ''),
        sourceId: String(trackedMark.attrs?.sourceId ?? ''),
        text: String(node.text),
        to: Number(pos + node.nodeSize),
        type: trackedMark.type.name === 'trackDelete' ? 'delete' : 'insert',
      });
    });

    return rawSegments.reduce<TrackChangeSegment[]>((segments, segment) => {
      const previous = segments.at(-1);
      if (previous && previous.id === segment.id && previous.type === segment.type && previous.to === segment.from) {
        previous.text += segment.text;
        previous.to = segment.to;
        return segments;
      }

      segments.push(segment);
      return segments;
    }, []);
  });
}

async function resolveTrackedChangeById(page: Page, input: { action: 'accept' | 'reject'; id: string }): Promise<void> {
  await page.evaluate((payload) => {
    const editor = (window as any).superdoc?.activeEditor ?? (window as any).editor;
    const command =
      payload.action === 'accept' ? editor.commands.acceptTrackedChangeById : editor.commands.rejectTrackedChangeById;

    command(payload.id);
  }, input);
}

function combineSegments(segments: TrackChangeSegment[]): TrackChangeSegment {
  const [first, ...rest] = [...segments].sort((left, right) => left.from - right.from);
  if (!first) {
    throw new Error('Expected at least one tracked segment to combine.');
  }

  return rest.reduce(
    (combined, segment) => ({
      ...combined,
      text: `${combined.text}${segment.text}`,
      to: Math.max(combined.to, segment.to),
    }),
    { ...first },
  );
}

async function loadImportedReplacement(page: Page, loadDocument: (filePath: string) => Promise<void>) {
  await loadDocument(DOC_PATH);
  await assertDocumentApiReady(page);

  const trackedSegments = await listTrackedSegments(page);
  const deleteSegments = trackedSegments.filter((segment) => segment.type === 'delete');
  const insertSegments = trackedSegments.filter((segment) => segment.type === 'insert');
  const deleteSegment = deleteSegments.length > 0 ? combineSegments(deleteSegments) : null;
  const insertSegment = insertSegments.length > 0 ? combineSegments(insertSegments) : null;

  const replacementDialog = page.locator('.comment-placeholder .comments-dialog', {
    has: page.locator('.change-type', { hasText: 'Replaced' }),
  });

  expect(deleteSegment).toBeTruthy();
  expect(insertSegment).toBeTruthy();
  expect(deleteSegment?.id).toBe(insertSegment?.id);
  expect(deleteSegment?.sourceId).not.toBe(insertSegment?.sourceId);
  expect(normalizeText(deleteSegment?.text ?? '')).toBe('test');
  expect(normalizeText(insertSegment?.text ?? '')).toBe('abc');
  expect(deleteSegment?.to).toBeLessThanOrEqual(insertSegment?.from ?? Number.POSITIVE_INFINITY);

  await expect(replacementDialog).toHaveCount(1);
  await expect(replacementDialog.locator('.tracked-change-text.is-deleted')).toContainText('test');
  await expect(replacementDialog.locator('.tracked-change-text.is-inserted')).toContainText('abc');

  return {
    deleteSegment: deleteSegment!,
    insertSegment: insertSegment!,
  };
}

test('SD-1960 accepting imported Word replacement with no comments resolves both tracked halves', async ({
  superdoc,
}) => {
  const { insertSegment } = await loadImportedReplacement(superdoc.page, superdoc.loadDocument);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);

  await resolveTrackedChangeById(superdoc.page, { action: 'accept', id: insertSegment.id });

  await expect.poll(() => listTrackedSegments(superdoc.page)).toEqual([]);
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(0);
  await expect.poll(async () => normalizeText(await getDocumentText(superdoc.page))).toBe('Test abc test');
});

test('SD-1960 rejecting imported Word replacement with no comments resolves both tracked halves', async ({
  superdoc,
}) => {
  const { deleteSegment } = await loadImportedReplacement(superdoc.page, superdoc.loadDocument);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);

  await resolveTrackedChangeById(superdoc.page, { action: 'reject', id: deleteSegment.id });

  await expect.poll(() => listTrackedSegments(superdoc.page)).toEqual([]);
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(0);
  await expect.poll(async () => normalizeText(await getDocumentText(superdoc.page))).toBe('Test test test');
});
