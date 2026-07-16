/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
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

describe('comment reply export (DOCXBench comment-reply-001 repro)', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-comment-reply-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('writes an API-created threaded reply into comments.xml', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const comments = createCommentsWrapper(editor!);

    // Does a reply bump the document revision? (The CLI host only persists when
    // revisionBefore !== revisionAfter — see execute-code.ts mutated check.)
    const docApi: any = (editor as any).doc;
    const revBefore = docApi?.info?.({})?.revision;

    const list: any = comments.list();
    const items: any[] = list?.items ?? list?.comments ?? (Array.isArray(list) ? list : []);
    const parentId: string | undefined = items[0]?.commentId ?? items[0]?.id ?? items[0]?.importedId;
    // Sanity: the fixture ships exactly one root comment by K. Reviewer.
    expect(parentId).toBeTruthy();

    comments.reply({
      parentCommentId: parentId!,
      text: 'Confirmed, thirty days is correct.',
    } as any);
    const revAfter = docApi?.info?.({})?.revision;

    // A persisted reply must bump the document revision — the CLI host only
    // writes the doc back when revisionBefore !== revisionAfter.
    expect(revAfter, 'reply bumps the document revision').not.toBe(revBefore);

    const xml = await exportCommentsXml(editor!);

    // Exact count: exactly the original comment + the reply,
    // and no sidebar-only tracked-change row leaks in as an empty comment.
    expect(countComments(xml)).toBe(2);
    expect(countEmptyComments(xml), 'no empty (sidebar-only) comment exported').toBe(0);
    expect(xml).toContain('Confirmed, thirty days is correct.');
  });
});
