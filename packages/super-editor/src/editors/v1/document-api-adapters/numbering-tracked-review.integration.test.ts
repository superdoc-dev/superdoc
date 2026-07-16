/* @vitest-environment jsdom */

/**
 * A tracked numbering attach (w:pPrChange) must be reviewable through the
 * Document API — visible in trackChanges.list and accept/reject-able via the
 * decide surface — not only exportable to Word. The change lives on
 * `paragraphProperties.change` (a node attr, not a mark), so the review graph
 * surfaces it via the dedicated pPrChange enumerator.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import { updateNumberingProperties } from '@core/commands/changeListLevel.js';
import {
  trackChangesListWrapper,
  trackChangesAcceptWrapper,
  trackChangesRejectWrapper,
} from './plan-engine/track-changes-wrappers.js';
import { listsAttachWrapper } from './plan-engine/lists-wrappers.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

function makeEditor(docData: LoadedDocData): Editor {
  const { editor } = initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    useImmediateSetTimeout: false,
    user: { name: 'Agent', email: 'agent@example.com' },
  } as any);
  return editor;
}

function listChanges(editor: Editor): any[] {
  const listed: any = trackChangesListWrapper(editor, { in: 'all', limit: 250, offset: 0 } as any);
  return listed?.items ?? listed?.changes ?? (Array.isArray(listed) ? listed : []);
}

function idOf(change: any): string {
  return change.id ?? change.entityId ?? change.address?.entityId;
}

/** Apply tracked numbering to the block containing `needle`; returns applied. */
function applyTrackedNumbering(editor: Editor, needle: string): boolean {
  const tr = (editor as any).state.tr;
  let applied = false;
  (editor as any).state.doc.descendants((node: any, pos: number) => {
    if (applied || !node.isTextblock) return true;
    if (typeof node.textContent === 'string' && node.textContent.includes(needle)) {
      updateNumberingProperties({ numId: 1, ilvl: 0 }, node, pos, editor as any, tr, { trackChange: true });
      applied = true;
    }
    return true;
  });
  if (applied) (editor as any).view.dispatch(tr);
  return applied;
}

function hasNumbering(editor: Editor, needle: string): boolean {
  let found = false;
  (editor as any).state.doc.descendants((node: any) => {
    if (found || !node.isTextblock) return true;
    if (typeof node.textContent === 'string' && node.textContent.includes(needle)) {
      const np = node.attrs.numberingProperties ?? node.attrs.paragraphProperties?.numberingProperties;
      found = Boolean(np && np.numId);
    }
    return true;
  });
  return found;
}

const TARGET = 'Third obligation';

describe('tracked numbering is reviewable via the Document API', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('docxbench-numbering-001.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('surfaces a tracked pPrChange in trackChanges.list', () => {
    editor = makeEditor(docData);
    const beforeIds = new Set(listChanges(editor).map(idOf));

    expect(applyTrackedNumbering(editor, TARGET), 'numbering applied').toBe(true);
    expect(hasNumbering(editor, TARGET), 'numbering present after attach').toBe(true);

    const after = listChanges(editor);
    const fresh = after.filter((c) => !beforeIds.has(idOf(c)));
    // eslint-disable-next-line no-console
    console.log(
      '[ppr-review] listed:',
      JSON.stringify(after.map((c) => ({ id: idOf(c), type: c.type, hasFormat: c.hasFormat }))),
    );
    expect(fresh.length, 'the tracked numbering change is now listed').toBe(1);
    expect(fresh[0].type, 'listed as a formatting change').toBe('format');
  });

  it('reject restores the unnumbered state and clears the change', () => {
    editor = makeEditor(docData);
    const beforeIds = new Set(listChanges(editor).map(idOf));
    applyTrackedNumbering(editor, TARGET);
    const pprId = idOf(listChanges(editor).find((c) => !beforeIds.has(idOf(c))));

    const receipt: any = trackChangesRejectWrapper(editor, { id: pprId } as any);
    expect(receipt?.success, 'reject succeeds').toBe(true);
    expect(hasNumbering(editor, TARGET), 'numbering removed on reject').toBe(false);
    expect(
      listChanges(editor).some((c) => idOf(c) === pprId),
      'change gone from list',
    ).toBe(false);
  });

  it('accept keeps the numbering and clears the change', () => {
    editor = makeEditor(docData);
    const beforeIds = new Set(listChanges(editor).map(idOf));
    applyTrackedNumbering(editor, TARGET);
    const pprId = idOf(listChanges(editor).find((c) => !beforeIds.has(idOf(c))));

    const receipt: any = trackChangesAcceptWrapper(editor, { id: pprId } as any);
    expect(receipt?.success, 'accept succeeds').toBe(true);
    expect(hasNumbering(editor, TARGET), 'numbering kept on accept').toBe(true);
    expect(
      listChanges(editor).some((c) => idOf(c) === pprId),
      'change gone from list',
    ).toBe(false);
  });

  // A tracked pPrChange carries author/date revision
  // metadata. The tracked lists.attach path must fail early when no user is
  // configured — same as the ins/del and lists.insert tracked paths — instead
  // of silently stamping a blank author. (Guard runs before target resolution.)
  it('tracked lists.attach with no configured user fails early (no blank-author pPrChange)', () => {
    editor = makeEditor(docData);
    (editor as any).options.user = null; // simulate an editor with no configured user
    expect(() =>
      listsAttachWrapper(
        editor as any,
        {
          target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
          attachTo: { kind: 'block', nodeType: 'listItem', nodeId: 'l1' },
          level: 0,
        } as any,
        { changeMode: 'tracked' } as any,
      ),
    ).toThrow(/requires a user/i);
  });
});
