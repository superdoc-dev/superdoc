/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { trackChangesListWrapper } from './plan-engine/track-changes-wrappers.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

async function exportCommentsXml(editor: Editor): Promise<string> {
  const zipper = new DocxZipper();
  const buf = await editor.exportDocx();
  const files = await zipper.getDocxData(buf, true);
  const byName: Record<string, string> = {};
  for (const f of files as Array<{ name: string; content: string }>) byName[f.name] = f.content;
  return byName['word/comments.xml'] || '';
}
const countComments = (xml: string): number => (xml.match(/<w:comment[ >]/g) || []).length;
// A leaked sidebar-only tracked-change row exports as a <w:comment> with no
// real body text. Count those so tests can assert none slip through.
const countEmptyComments = (xml: string): number => {
  const blocks = xml.match(/<w:comment\b[\s\S]*?<\/w:comment>/g) || [];
  return blocks.filter((b) => {
    const texts = [...b.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return !texts.some((t) => t.trim().length > 0);
  }).length;
};

describe('comment on tracked change export (comment-on-insertion-001 repro)', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-comment-on-insertion-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('anchors a comment on a pending tracked insertion and exports it', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    // Discover the logical tracked-change id the document-api exposes (what the
    // model gets from doc.trackChanges.list and passes to comments.create).
    const listed: any = trackChangesListWrapper(editor!, {} as any);
    const items: any[] = listed?.items ?? listed?.changes ?? (Array.isArray(listed) ? listed : []);
    const ins = items.find((c) => (c.author || '').includes('J. Prior')) ?? items[0];
    const trackedChangeId = ins?.id ?? ins?.entityId;
    expect(trackedChangeId, 'tracked change id resolved').toBeTruthy();

    const comments = createCommentsWrapper(editor!);
    comments.add({
      text: 'Confirm this delivery window is acceptable.',
      target: { trackedChangeId, side: 'after' },
    } as any);

    const xml = await exportCommentsXml(editor!);

    // Exact count: exactly the pre-existing comment + the
    // one we added — no sidebar-only tracked-change row leaks in as an empty
    // comment. Asserting `>=` would let such a leak pass unnoticed.
    expect(countComments(xml)).toBe(2);
    expect(countEmptyComments(xml), 'no empty (sidebar-only) comment exported').toBe(0);
    expect(xml).toContain('Confirm this delivery window is acceptable.');
  });

  // Regression: comments.list() returns a synthetic projection row per tracked
  // change (so the sidebar can render revisions beside comments). Feeding those
  // rows straight into exportDocx({ comments }) — a real caller pattern — must
  // NOT turn each tracked change into a spurious <w:comment>. The synthetic row
  // carries the change excerpt as `text`, so the old body-presence filter let it
  // through; the identity check (id === trackedChangeLink.trackedChangeId) drops
  // it while sparing genuine comments anchored on a tracked change.
  it('does not export comments.list() synthetic tracked-change rows via exportDocx({ comments })', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
      user: { name: 'Agent', email: 'agent@example.com' },
    } as any));

    // A SESSION tracked change (no wordRevisionIds) is what surfaces as a
    // synthetic sidebar row in comments.list() — imported revisions are skipped.
    (editor as any).commands.enableTrackChanges();
    (editor as any).commands.command(({ tr, dispatch }: any) => {
      tr.insertText('SESSION-INSERT', 1);
      if (dispatch) dispatch(tr);
      return true;
    });

    const items: any[] = createCommentsWrapper(editor!).list({} as any)?.items ?? [];
    // Confirm the list actually contains a synthetic row (the leak source): a
    // tracked-change row whose id equals the change it links to.
    const synthetic = items.find(
      (c) => c.trackedChange && c.trackedChangeLink?.trackedChangeId === (c.commentId ?? c.id),
    );
    expect(synthetic, 'comments.list surfaces a synthetic tracked-change row').toBeTruthy();

    const zipper = new DocxZipper();
    const buf = await editor!.exportDocx({ comments: items } as any);
    const files = await zipper.getDocxData(buf, true);
    const byName: Record<string, string> = {};
    for (const f of files as Array<{ name: string; content: string }>) byName[f.name] = f.content;
    const xml = byName['word/comments.xml'] || '';

    // Only the pre-existing imported comment survives; the synthetic row (author
    // "Agent", carrying custom:trackedChange) must not become a <w:comment>.
    expect(countComments(xml)).toBe(1);
    expect(xml).not.toContain('w:author="Agent"');
    expect(xml).not.toContain('custom:trackedChange="true"');
  });
});
