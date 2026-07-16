/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import {
  trackChangesListWrapper,
  trackChangesRejectWrapper,
  trackChangesAcceptWrapper,
} from './plan-engine/track-changes-wrappers.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

function listChanges(editor: Editor): any[] {
  const listed: any = trackChangesListWrapper(editor, { in: 'all', limit: 250, offset: 0 } as any);
  return listed?.items ?? listed?.changes ?? (Array.isArray(listed) ? listed : []);
}

describe('targeted reject of one deletion (resolve-reject-del-001 repro)', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-resolve-reject-del-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('rejects only the deleted side of a paired replacement, leaving the insertion', async () => {
    // Default (paired) mode: the adjacent w:del + w:ins import as one replacement.
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const before = listChanges(editor!);
    // eslint-disable-next-line no-console
    console.log(
      '[repro] before:',
      JSON.stringify(
        before.map((c) => ({
          id: c.id ?? c.entityId,
          type: c.type,
          author: c.author,
          ins: c.insertedText,
          del: c.deletedText,
        })),
      ),
    );

    const replacement = before.find((c) => c.type === 'replacement') ?? before[0];
    expect(replacement, 'a replacement exists').toBeTruthy();
    const replacementId = replacement?.id ?? replacement?.entityId;

    // Reject ONLY the deleted side: restore " to the dock", keep the insertion tracked.
    const receipt: any = trackChangesRejectWrapper(editor!, { id: replacementId, side: 'deleted' } as any);
    // eslint-disable-next-line no-console
    console.log('[repro] reject receipt:', JSON.stringify(receipt));

    const after = listChanges(editor!);
    // eslint-disable-next-line no-console
    console.log(
      '[repro] after:',
      JSON.stringify(
        after.map((c) => ({ id: c.id ?? c.entityId, type: c.type, author: c.author, excerpt: c.excerpt })),
      ),
    );

    const text = (editor as any).state.doc.textContent as string;
    // eslint-disable-next-line no-console
    console.log('[repro] text:', JSON.stringify(text));

    // The deletion is gone; an insertion remains tracked.
    expect(
      after.some((c) => c.type === 'delete'),
      'deletion removed',
    ).toBe(false);
    expect(
      after.some((c) => c.type === 'insert' || c.type === 'replacement'),
      'insertion preserved',
    ).toBe(true);
    // The deleted text is restored as live content.
    expect(text).toContain(' to the dock');
    const priorAfter = after.filter((c) => (c.author || '').includes('J. Prior'));
    expect(priorAfter.length, 'exactly one J. Prior change remains').toBe(1);
  });

  // After one side of a replacement is resolved, the
  // surviving side must resolve normally — even if it still carries the
  // "replacement" label. A one-sided replacement must NOT fail with
  // "missing inserted or deleted side".
  it('the surviving side of a replacement resolves normally after one side is rejected', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const rep = listChanges(editor!).find((c) => c.type === 'replacement');
    expect(rep, 'a replacement exists').toBeTruthy();
    trackChangesRejectWrapper(editor!, { id: rep!.id ?? rep!.entityId, side: 'deleted' } as any);

    const survivor = listChanges(editor!)[0];
    expect(survivor, 'a survivor remains').toBeTruthy();
    const survivorId = survivor.id ?? survivor.entityId;
    // eslint-disable-next-line no-console
    console.log('[survivor] type=', survivor.type, 'id=', survivorId);

    const receipt: any = trackChangesAcceptWrapper(editor!, { id: survivorId } as any);
    // eslint-disable-next-line no-console
    console.log('[survivor] accept receipt:', JSON.stringify(receipt));
    expect(receipt?.success, 'the surviving half accepts without a missing-side error').toBe(true);
    expect(listChanges(editor!).length, 'no tracked changes remain').toBe(0);
  });
});
