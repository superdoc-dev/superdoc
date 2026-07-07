import { describe, expect, test } from 'bun:test';
import { executeCodeWithRollback } from '../../lib/execute-code-rollback';
import { runPresetDispatch } from '../../lib/preset-ops';
import type { EditorWithDoc } from '../../lib/document';

/**
 * Fake v1 editor: a doc with a real revision counter plus the ProseMirror-ish
 * state/dispatch surface the rollback envelope uses (state.doc snapshot,
 * state.tr.replaceWith, dispatch). Restoring bumps the revision like a real
 * editor transaction would — the envelope must normalize that away.
 */
function makeFakeEditor() {
  let revision = 0;
  let content = 'ORIGINAL';
  const doc = {
    info: () => ({ revision: String(revision) }),
    mutate: (next: string) => {
      content = next;
      revision += 1;
      return { ok: true };
    },
  };
  const snapshot = { content: { size: 10, restoreTo: 'ORIGINAL' } };
  const editor = {
    doc,
    state: {
      doc: snapshot,
      get tr() {
        return {
          replaceWith: (_from: number, _to: number, restored: { restoreTo: string }) => ({ restored }),
        };
      },
    },
    dispatch: (tr: { restored: { restoreTo: string } }) => {
      content = tr.restored.restoreTo;
      revision += 1; // a restore transaction still advances the editor revision
    },
  };
  return {
    editor: editor as unknown as EditorWithDoc,
    getContent: () => content,
  };
}

describe('executeCodeWithRollback', () => {
  test('crash after mutation restores the document and does not count as mutated', async () => {
    const { editor, getContent } = makeFakeEditor();
    const outcome = await executeCodeWithRollback(editor, "doc.mutate('BROKEN'); throw new Error('boom');");
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.rolledBack).toBe(true);
    expect(outcome.mutated).toBe(false);
    expect(outcome.revisionAfter).toBe(outcome.revisionBefore);
    expect(getContent()).toBe('ORIGINAL');
  });

  test('successful script keeps its mutations and reports mutated', async () => {
    const { editor, getContent } = makeFakeEditor();
    const outcome = await executeCodeWithRollback(editor, "doc.mutate('CHANGED'); return 'done';");
    expect(outcome.result.ok).toBe(true);
    expect(outcome.result.rolledBack).toBeUndefined();
    expect(outcome.mutated).toBe(true);
    expect(getContent()).toBe('CHANGED');
  });

  test('read-only script mutates nothing', async () => {
    const { editor, getContent } = makeFakeEditor();
    const outcome = await executeCodeWithRollback(editor, 'return doc.info().revision;');
    expect(outcome.result.ok).toBe(true);
    expect(outcome.mutated).toBe(false);
    expect(getContent()).toBe('ORIGINAL');
  });

  test('timeout blocks late document calls from mutating the session', async () => {
    const { editor, getContent } = makeFakeEditor();
    const outcome = await executeCodeWithRollback(
      editor,
      "await new Promise((resolve) => setTimeout(resolve, 25)); doc.mutate('LATE'); return 'late';",
      { timeoutMs: 5 },
    );

    expect(outcome.result.ok).toBe(false);
    expect(outcome.mutated).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getContent()).toBe('ORIGINAL');
  });

  test('delayed work after a successful return cannot mutate the session', async () => {
    const { editor, getContent } = makeFakeEditor();
    const outcome = await executeCodeWithRollback(
      editor,
      "setTimeout(() => doc.mutate('LATE'), 25); return 'scheduled';",
      { timeoutMs: 100 },
    );

    expect(outcome.result.ok).toBe(true);
    expect(outcome.mutated).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getContent()).toBe('ORIGINAL');
  });
});

describe('preset dispatch superdoc_execute_code (shim parity)', () => {
  test('a crashing script dispatched through the core preset is rolled back', async () => {
    const { editor, getContent } = makeFakeEditor();
    const result = (await runPresetDispatch(
      'core',
      'superdoc_execute_code',
      { code: "doc.mutate('BROKEN'); throw new Error('boom');" },
      editor,
    )) as { ok?: boolean; rolledBack?: boolean };
    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);
    // Reviewer repro (PR #264): the paragraph used to survive the crash.
    expect(getContent()).toBe('ORIGINAL');
  });

  test('a successful script dispatched through the core preset keeps its edits', async () => {
    const { editor, getContent } = makeFakeEditor();
    const result = (await runPresetDispatch(
      'core',
      'superdoc_execute_code',
      { code: "doc.mutate('CHANGED'); return 'ok';" },
      editor,
    )) as { ok?: boolean };
    expect(result.ok).toBe(true);
    expect(getContent()).toBe('CHANGED');
  });
});
