import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, addCommentByText, replyToComment } from '../../helpers/document-api.js';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SD-3355 repro shape: range-threaded thread (root "Here is a comment" +
// reply "with a thread"), the reply carrying its OWN reconstructed anchor
// mark — the shape where a root-only resolve leaves the reply highlighted
// and a non-atomic cascade splits the undo into two steps.
const RANGE_THREADED_DOC = path.resolve(__dirname, 'fixtures/sd-3355-range-threaded-thread.docx');

test.use({ config: { toolbar: 'full', comments: 'on' } });

/**
 * SD-3355 — resolving a thread then exporting must keep the WHOLE thread in a
 * shape Word retains:
 *
 *   1. every comment of the thread survives in word/comments.xml,
 *   2. every comments.xml id carries a <w:commentReference> in
 *      word/document.xml (CMTS-EXPORT-010 — Word silently drops an
 *      unreferenced entry; w15:paraIdParent threading alone does not bind it),
 *   3. the whole thread is marked w15:done="1" (mixed done state makes Word
 *      drop the resolved root — the original "dangling comment"),
 *   4. the resolve is one atomic transaction: a single undo restores both the
 *      in-document highlight and the open thread in the store.
 *
 * The resolve MUST go through the store lane (`comment.resolveComment()` — the
 * sidebar button's path), which cascades the whole thread through
 * `resolveCommentThread` and normalizes reply marks away. The doc-api lane
 * (`comments.patch`) is root-only and never exercises the cascade, so it
 * cannot catch this class of regression (see sd-2306 spec for that lane).
 */

const ROOT_BODY = 'sd-3355 root comment body';
const REPLY_BODY = 'sd-3355 reply body';

const collectIds = (xml: string, re: RegExp): string[] => {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) ids.push(m[1]);
  return ids;
};

/**
 * Resolve the thread root through the store lane — the same path as the
 * sidebar resolve button. This stamps resolvedTime on the root and cascades
 * the whole thread in ONE editor transaction (resolveCommentThread).
 */
async function resolveRootThreadViaStore(superdoc: SuperDocFixture): Promise<void> {
  const resolved = await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    const store = sd?.commentsStore;
    const raw = store?.commentsList;
    const list = Array.isArray(raw) ? raw : (raw?.value ?? []);
    const valuesOf = (c: any) => (typeof c?.getValues === 'function' ? c.getValues() : c) ?? {};
    const root = list.find(
      (c: any) => typeof c?.resolveComment === 'function' && !valuesOf(c).parentCommentId && !valuesOf(c).trackedChange,
    );
    if (!root) return { ok: false, storeSize: list.length };
    root.resolveComment({ id: 'sd-3355-test', email: 'test@behavior', name: 'SD-3355 Test', superdoc: sd });
    return { ok: true, storeSize: list.length };
  });
  expect(resolved.ok, `store root comment not found (store has ${resolved.storeSize} comments)`).toBe(true);
  await superdoc.waitForStable();
}

/** Type text, add a root comment + one reply, then resolve via the store lane. */
async function setupResolvedThread(superdoc: SuperDocFixture): Promise<void> {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('This thread gets resolved before export');
  await superdoc.waitForStable();

  const rootId = await addCommentByText(superdoc.page, {
    pattern: 'thread gets resolved',
    text: ROOT_BODY,
  });
  await superdoc.waitForStable();

  await replyToComment(superdoc.page, { parentCommentId: rootId, text: REPLY_BODY });
  await superdoc.waitForStable();

  await resolveRootThreadViaStore(superdoc);

  // Resolved thread must drop the in-document highlight (EUI-CMTS-035).
  await expect(superdoc.page.locator('.superdoc-comment-highlight')).toHaveCount(0);
}

test('SD-3355 resolved thread exports whole thread: all referenced, all done', async ({ superdoc }) => {
  await setupResolvedThread(superdoc);

  // Export through the app lane (store comments included — same as the UI).
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).superdoc.export({
      exportType: ['docx'],
      commentsType: 'external',
      isFinalDoc: false,
      triggerDownload: false,
    });
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });
  const zip = await JSZip.loadAsync(Buffer.from(bytes));

  // 1. Both comments survive in comments.xml.
  const commentsXml = await zip.file('word/comments.xml')!.async('string');
  expect(commentsXml).toContain(ROOT_BODY);
  expect(commentsXml).toContain(REPLY_BODY);

  // 2. Every comments.xml id is referenced from document.xml — Word drops
  //    unreferenced comments (CMTS-EXPORT-010).
  const documentXml = await zip.file('word/document.xml')!.async('string');
  const commentIds = collectIds(commentsXml, /<w:comment\b[^>]*\bw:id="([^"]*)"/g);
  const referencedIds = new Set(collectIds(documentXml, /<w:commentReference\b[^>]*\bw:id="([^"]*)"/g));
  expect(commentIds.length).toBeGreaterThanOrEqual(2);
  const unreferenced = commentIds.filter((id) => !referencedIds.has(id));
  expect(unreferenced, `comments.xml ids without a w:commentReference in document.xml: [${unreferenced}]`).toEqual([]);

  // 3. The WHOLE thread is marked done — no mixed state (root done="1" with a
  //    reply done="0" makes Word drop the resolved root).
  const extXml = await zip.file('word/commentsExtended.xml')!.async('string');
  const entries = extXml.match(/<w15:commentEx\b[^>]*\/?>/g) ?? [];
  expect(entries.length).toBeGreaterThanOrEqual(2);
  const notDone = entries.filter((e) => !/w15:done="1"/.test(e));
  expect(notDone, `commentsExtended entries not done="1": ${notDone.join(' ')}`).toEqual([]);
  // Threading survives: the reply still points at the root.
  expect(extXml).toContain('w15:paraIdParent');
});

test('SD-3355 resolving a range-threaded thread clears every highlight; one undo restores it all', async ({
  superdoc,
}) => {
  // The repro doc's shape: the reply carries its OWN anchor mark. A root-only
  // resolve leaves the reply's highlight behind, and a non-atomic cascade
  // needs two undos — both regressions this test pins.
  await superdoc.loadDocument(RANGE_THREADED_DOC);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);
  await expect(superdoc.page.locator('.superdoc-comment-highlight').first()).toBeVisible();

  await resolveRootThreadViaStore(superdoc);

  // EUI-CMTS-035: the WHOLE thread drops the highlight — including the reply.
  await expect(superdoc.page.locator('.superdoc-comment-highlight')).toHaveCount(0);

  await superdoc.executeCommand('undo');
  await superdoc.waitForStable();

  // One undo brings back the document overlay…
  await expect(superdoc.page.locator('.superdoc-comment-highlight').first()).toBeVisible();

  // …and the open thread in the store, in the SAME step.
  const readRootStoreState = () =>
    superdoc.page.evaluate(() => {
      const sd = (window as any).superdoc;
      const raw = sd?.commentsStore?.commentsList;
      const list = Array.isArray(raw) ? raw : (raw?.value ?? []);
      const valuesOf = (c: any) => (typeof c?.getValues === 'function' ? c.getValues() : c) ?? {};
      const values = list.map(valuesOf);
      const root = values.find((v: any) => !v.parentCommentId && !v.trackedChange);
      return { rootResolvedTime: root?.resolvedTime ?? null, total: values.length };
    });

  const afterUndo = await readRootStoreState();
  expect(afterUndo.total).toBeGreaterThanOrEqual(2);
  expect(afterUndo.rootResolvedTime).toBeNull();

  // Redo symmetry: redoing the resolve restores BOTH sides in one step — the
  // highlight drops again and the store regains the original resolved state
  // (document anchors and store resolvedTime must never disagree, or the
  // sidebar shows an open thread the document renders as resolved and the
  // export writes inconsistent w15:done).
  await superdoc.executeCommand('redo');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('.superdoc-comment-highlight')).toHaveCount(0);
  const afterRedo = await readRootStoreState();
  expect(afterRedo.rootResolvedTime).not.toBeNull();
});
