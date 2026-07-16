import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { compilePlan } from '../../document-api-adapters/plan-engine/compiler.js';
import { registerBuiltInExecutors } from '../../document-api-adapters/plan-engine/register-executors.js';
import { clearExecutorRegistry } from '../../document-api-adapters/plan-engine/executor-registry.js';

beforeAll(() => {
  try {
    clearExecutorRegistry();
  } catch {
    // best-effort — first run may not need clearing
  }
  registerBuiltInExecutors();
});

/**
 * Construct an editor whose in-session PM state carries two paragraphs sharing
 * the same `paraId` (the Yjs-restore shape the runtime repair exists for).
 */
async function makeEditorWithDuplicateParaId(duplicateValue) {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
  const init = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });
  const ed = init.editor;

  const schema = ed.state.schema;
  const tr1 = ed.state.tr;
  tr1.insert(
    ed.state.doc.content.size,
    schema.nodes.paragraph.create({ paraId: duplicateValue }, schema.text('second')),
  );
  ed.dispatch(tr1);

  let firstPos = null;
  ed.state.doc.descendants((node, pos) => {
    if (firstPos !== null) return false;
    if (node.type.name !== 'paragraph') return;
    firstPos = pos;
    return false;
  });
  const firstNode = ed.state.doc.nodeAt(firstPos);
  const tr2 = ed.state.tr;
  tr2.setNodeMarkup(firstPos, null, { ...firstNode.attrs, paraId: duplicateValue });
  ed.dispatch(tr2);

  return ed;
}

/**
 * Refs minted against a duplicate-laden doc carry only a blockId — no
 * occurrence index. When the compile-time identity repair renames the later
 * duplicate(s), a pre-repair ref naming the duplicated id is ambiguous: it may
 * have meant the renamed occurrence, and resolving it against the surviving
 * block would silently mutate the wrong content. The compiler must reject
 * such refs loudly in the same compile that performed the repair.
 *
 * Refs minted in EARLIER calls are already covered by the existing
 * revision check (any real mutation bumps the revision), so the one-call
 * guard here closes the entire wrong-block window.
 */
describe('refs naming a just-repaired block id are rejected, not mis-resolved', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('throws STALE_REF when a plan ref targets the duplicated id in the repairing compile', async () => {
    editor = await makeEditorWithDuplicateParaId('DUPSTALE');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let thrown = null;
      try {
        compilePlan(editor, [
          {
            id: 'rewrite-1',
            op: 'text.rewrite',
            where: { by: 'ref', ref: 'DUPSTALE' },
            args: { replacement: { text: 'rewritten' } },
          },
        ]);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).not.toBeNull();
      expect(thrown.code).toBe('STALE_REF');
      // The message is the SDK-facing contract: it must name the repaired id
      // and tell the agent how to recover.
      expect(thrown.message).toContain('DUPSTALE');
      expect(thrown.message).toMatch(/query\.match|find/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('the same ref resolves cleanly on the next compile (doc already repaired)', async () => {
    editor = await makeEditorWithDuplicateParaId('DUPSTALE');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // First compile performs the repair and rejects the ambiguous ref.
      try {
        compilePlan(editor, [
          {
            id: 'rewrite-1',
            op: 'text.rewrite',
            where: { by: 'ref', ref: 'DUPSTALE' },
            args: { replacement: { text: 'rewritten' } },
          },
        ]);
      } catch {
        // expected — STALE_REF
      }

      // Second compile: the doc is clean, 'DUPSTALE' is now unique (the first
      // occurrence kept it), so the same ref resolves without ambiguity.
      expect(() =>
        compilePlan(editor, [
          {
            id: 'rewrite-2',
            op: 'text.rewrite',
            where: { by: 'ref', ref: 'DUPSTALE' },
            args: { replacement: { text: 'rewritten' } },
          },
        ]),
      ).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('throws STALE_REF for a nodeEdge SelectionTarget anchored on the duplicated id', async () => {
    // nodeEdge points nest the block id at `point.node.nodeId` — the guard
    // must see through that shape too, or a pre-repair edge anchor silently
    // retargets to the surviving duplicate.
    editor = await makeEditorWithDuplicateParaId('DUPEDGE1');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let thrown = null;
      try {
        compilePlan(editor, [
          {
            id: 'insert-1',
            op: 'text.insert',
            where: {
              by: 'target',
              target: {
                kind: 'selection',
                start: {
                  kind: 'nodeEdge',
                  node: { kind: 'block', nodeType: 'paragraph', nodeId: 'DUPEDGE1' },
                  edge: 'before',
                },
                end: {
                  kind: 'nodeEdge',
                  node: { kind: 'block', nodeType: 'paragraph', nodeId: 'DUPEDGE1' },
                  edge: 'before',
                },
              },
            },
            args: { position: 'before', content: { text: 'inserted' } },
          },
        ]);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).not.toBeNull();
      expect(thrown.code).toBe('STALE_REF');
      expect(thrown.message).toContain('DUPEDGE1');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('refs naming an UNAFFECTED block still resolve in the repairing compile', async () => {
    editor = await makeEditorWithDuplicateParaId('DUPSTALE');

    // Add a third paragraph with its own unique id — refs to it are safe even
    // though the same compile performs a repair elsewhere in the doc.
    const schema = editor.state.schema;
    const tr = editor.state.tr;
    tr.insert(
      editor.state.doc.content.size,
      schema.nodes.paragraph.create({ paraId: 'UNTOUCHD' }, schema.text('independent')),
    );
    editor.dispatch(tr);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() =>
        compilePlan(editor, [
          {
            id: 'rewrite-1',
            op: 'text.rewrite',
            where: { by: 'ref', ref: 'UNTOUCHD' },
            args: { replacement: { text: 'rewritten' } },
          },
        ]),
      ).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
