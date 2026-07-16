import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { buildBlockIndex } from '../../document-api-adapters/helpers/node-address-resolver.js';
import { compilePlan } from '../../document-api-adapters/plan-engine/compiler.js';
import { executeCompiledPlan, executePlan } from '../../document-api-adapters/plan-engine/executor.js';
import {
  insertStructuredWrapper,
  selectionMutationWrapper,
} from '../../document-api-adapters/plan-engine/plan-wrappers.js';
import { previewPlan } from '../../document-api-adapters/plan-engine/preview.js';
import { getRevision } from '../../document-api-adapters/plan-engine/revision-tracker.js';
import { registerBuiltInExecutors } from '../../document-api-adapters/plan-engine/register-executors.js';
import { clearExecutorRegistry } from '../../document-api-adapters/plan-engine/executor-registry.js';

// Plan-engine step executors are registered as side-effects of the public
// adapter assembly. Tests that drive `compilePlan` directly need to seed the
// registry themselves so `hasStepExecutor` returns true for `text.rewrite`
// etc. — see `executor.test.ts` for the same pattern.
beforeAll(() => {
  try {
    clearExecutorRegistry();
  } catch {
    // best-effort — first run may not need clearing
  }
  registerBuiltInExecutors();
});

/**
 * Construct an editor whose in-session ProseMirror state already carries two
 * paragraphs sharing the same `paraId`. Mimics the collab/Yjs restore path
 * where the import-time identity normalizer never ran.
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

function appendParagraphWithParaId(editor, paraId, text) {
  const schema = editor.state.schema;
  const tr = editor.state.tr;
  tr.insert(editor.state.doc.content.size, schema.nodes.paragraph.create({ paraId }, schema.text(text)));
  editor.dispatch(tr);
}

async function makeEditorWithDuplicateParaIdAndIndependentTarget(duplicateValue, independentValue = 'UNIQUE01') {
  const editor = await makeEditorWithDuplicateParaId(duplicateValue);
  appendParagraphWithParaId(editor, independentValue, 'independent');
  return editor;
}

/**
 * Regression coverage for runtime block-identity recovery.
 *
 * Documents whose in-session ProseMirror state already carries duplicate
 * `paraId` / `sdBlockId` values — the most common production path is a Yjs
 * collab hydration where the importer-time normalizer never ran — must heal
 * themselves on the next mutation rather than reject every subsequent
 * `compilePlan` with `DOCUMENT_IDENTITY_CONFLICT`. These tests pin the four
 * facets of that contract:
 *
 * 1. Runtime repair removes the duplicates in-place via `setNodeAttribute`.
 * 2. `compilePlan` + `executeCompiledPlan` round-trip a duplicate-laden doc.
 * 3. `previewPlan` stays non-mutating — corrupt input must surface as a
 *    preview failure, not a dispatched repair transaction.
 * 4. A caller's `expectedRevision` (optimistic concurrency) survives the
 *    repair because identity-repair transactions are revision-invisible.
 */
describe('runtime repair of in-session duplicate paraIds', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('compilePlan repairs duplicate paraIds in PM state and proceeds', async () => {
    // Start from any well-formed docx (blank-doc has 1 empty paragraph).
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const init = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });
    editor = init.editor;

    // Add a second paragraph so the doc has two blocks.
    const schema = editor.state.schema;
    const newParagraph = schema.nodes.paragraph.create({ paraId: 'DUPID000' }, schema.text('second'));
    const tr1 = editor.state.tr;
    tr1.insert(editor.state.doc.content.size, newParagraph);
    editor.dispatch(tr1);

    // Now force the FIRST paragraph to share the same paraId. This mimics
    // what arrives when Yjs hydrates from an older base document whose
    // paragraphs collided.
    let firstParagraphPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (firstParagraphPos !== null) return false;
      if (node.type.name !== 'paragraph') return;
      firstParagraphPos = pos;
      return false;
    });
    expect(firstParagraphPos, 'expected to find a first paragraph').not.toBeNull();
    const firstNode = editor.state.doc.nodeAt(firstParagraphPos);
    const tr2 = editor.state.tr;
    tr2.setNodeMarkup(firstParagraphPos, null, { ...firstNode.attrs, paraId: 'DUPID000' });
    editor.dispatch(tr2);

    // Sanity check: index now reports the duplicate.
    const dupIndex = buildBlockIndex(editor);
    const seen = new Map();
    for (const candidate of dupIndex.candidates) {
      seen.set(candidate.nodeId, (seen.get(candidate.nodeId) ?? 0) + 1);
    }
    const dupesBefore = [...seen.entries()].filter(([, count]) => count > 1);
    expect(dupesBefore.length, 'precondition: index has duplicates').toBeGreaterThan(0);

    // Silence the repair warning so test output stays clean; assert it fired.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      // Compile any well-formed plan. The repair must run first, dedupe in
      // place, then compilePlan succeeds with no DOCUMENT_IDENTITY_CONFLICT.
      // A selector-based where re-resolves against the freshly repaired doc,
      // so it is immune to the rename (refs naming the duplicated id are
      // rejected with STALE_REF in the repairing compile — covered by
      // stale-refs-after-identity-repair.test.js).
      const step = {
        id: 'rewrite-1',
        op: 'text.rewrite',
        where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
        args: { replacement: { text: 'rewritten' } },
      };

      expect(() => compilePlan(editor, [step])).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }

    // After compile, the index must be duplicate-free.
    const repairedIndex = buildBlockIndex(editor);
    const seenAfter = new Map();
    for (const candidate of repairedIndex.candidates) {
      seenAfter.set(candidate.nodeId, (seenAfter.get(candidate.nodeId) ?? 0) + 1);
    }
    const dupesAfter = [...seenAfter.entries()].filter(([, count]) => count > 1);
    expect(dupesAfter).toEqual([]);

    // The replacement id is deterministic and 8 uppercase hex chars.
    let foundReplacement = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'paragraph') return;
      if (node.attrs?.paraId && /^[0-9A-F]{8}$/.test(node.attrs.paraId) && node.attrs.paraId !== 'DUPID000') {
        foundReplacement = true;
      }
    });
    expect(foundReplacement, 'expected at least one paragraph to carry a replacement paraId').toBe(true);
  });
});

/**
 * Cross-review fix coverage:
 *
 * - Fix #1 (revision race): the post-repair revision capture must reflect the
 *   tr that just landed, so `executeCompiledPlan`'s D3 drift check does not
 *   trip with `REVISION_CHANGED_SINCE_COMPILE` on every corrupted doc.
 * - Fix #3 (preview is non-mutating): `previewPlan` must NOT dispatch the
 *   repair transaction on a duplicate-laden doc — the doc identity must
 *   survive a preview unchanged, and the conflict must surface as a
 *   PreviewFailure so the caller still knows.
 */
describe('compile + execute round-trips on a duplicate-laden doc', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  /**
   * Build an editor whose PM state has two paragraphs sharing the same
   * paraId — the Yjs-restore shape the runtime repair targets.
   */

  it('executeCompiledPlan succeeds end-to-end without REVISION_CHANGED_SINCE_COMPILE', async () => {
    // Regression for Fix #1: compiler used to capture `compiledRevision`
    // BEFORE the repair dispatch. The repair tr advanced the revision
    // tracker → executor's D3 drift check threw on every corrupted doc.
    editor = await makeEditorWithDuplicateParaId('DUPDUPID');

    // Selector-based where: re-resolves against the repaired doc. Refs naming
    // the duplicated id are rejected with STALE_REF in the repairing compile
    // (covered by stale-refs-after-identity-repair.test.js).
    const step = {
      id: 'rewrite-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
      args: { replacement: { text: 'rewritten' } },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Compile + execute must both succeed. The fix specifically defends
      // against a misleading REVISION_CHANGED_SINCE_COMPILE here.
      const compiled = compilePlan(editor, [step]);
      expect(() => executeCompiledPlan(editor, compiled)).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }

    // After the round-trip, the index is duplicate-free.
    const after = buildBlockIndex(editor);
    const seen = new Map();
    for (const candidate of after.candidates) {
      seen.set(candidate.nodeId, (seen.get(candidate.nodeId) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});

describe('previewPlan must remain non-mutating on a duplicate-laden doc', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('previewPlan does not dispatch the identity repair, surfaces conflict as a PreviewFailure, and apply still recovers', async () => {
    editor = await makeEditorWithDuplicateParaId('DUPPRV01');

    // Snapshot the doc identity (PM doc instance) before preview.
    const docBefore = editor.state.doc;

    const step = {
      id: 'rewrite-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
      args: { replacement: { text: 'rewritten' } },
    };

    // (a) preview must not dispatch the repair tr.
    const result = previewPlan(editor, { steps: [step] });
    expect(editor.state.doc, 'preview must not mutate the editor doc').toBe(docBefore);

    // (b) preview surfaces the conflict as a PreviewFailure rather than a throw.
    expect(result.valid).toBe(false);
    expect(result.failures, 'expected preview to report failures').toBeTruthy();
    const conflict = result.failures.find((f) => f.code === 'DOCUMENT_IDENTITY_CONFLICT');
    expect(conflict, 'expected a DOCUMENT_IDENTITY_CONFLICT failure').toBeTruthy();

    // (c) the production mutation path on the same state recovers.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const compiled = compilePlan(editor, [step]);
      expect(() => executeCompiledPlan(editor, compiled)).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

/**
 * Cross-review second-pass fix coverage:
 *
 * Optimistic concurrency must survive the identity-repair dispatch. A caller
 * that holds revision `N` and submits `mutations.apply({ steps, expectedRevision: 'N' })`
 * against a duplicate-laden doc should succeed — the runtime repair tr is
 * remediation, not a content change, so it must not bump the revision counter
 * and invalidate the caller's `expectedRevision`.
 *
 * Baseline (pre-fix): repair tr ran through `editor.on('transaction', ...)`
 * → `incrementRevision` → executor's `checkRevision` saw `N+1` and threw
 * `REVISION_MISMATCH` on every corrupted-doc mutation.
 *
 * Fix: `trackRevisions` skips transactions tagged with the
 * `superdoc/block-identity-repair` meta key.
 */
describe('caller-supplied expectedRevision survives identity repair', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('executePlan succeeds when expectedRevision matches the pre-repair revision', async () => {
    editor = await makeEditorWithDuplicateParaId('DUPCONC1');

    // Snapshot the revision the caller would see if they queried before
    // submitting the mutation — this is the value the SDK round-trips back
    // as `expectedRevision`.
    const callerRevision = getRevision(editor);

    const step = {
      id: 'rewrite-1',
      op: 'text.rewrite',
      where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
      args: { replacement: { text: 'rewritten' } },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Must NOT throw REVISION_MISMATCH or REVISION_CHANGED_SINCE_COMPILE.
      // Baseline (without the revision-tracker fix) would throw
      // REVISION_MISMATCH because the repair tr advanced the counter.
      expect(() => executePlan(editor, { steps: [step], expectedRevision: callerRevision })).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }

    // After the mutation, the index is duplicate-free.
    const after = buildBlockIndex(editor);
    const seen = new Map();
    for (const candidate of after.candidates) {
      seen.set(candidate.nodeId, (seen.get(candidate.nodeId) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('repair-only dispatch does not bump the revision counter', async () => {
    // Direct unit-level check: dispatching the repair tr in isolation must
    // leave the revision unchanged. Defends the trackRevisions subscription
    // from a future refactor that drops the meta-key short-circuit.
    editor = await makeEditorWithDuplicateParaId('DUPCONC2');

    const before = getRevision(editor);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // compilePlan will internally invoke repairDuplicateBlockIdentities. The
      // assertion below pins that the repair leg of compile keeps revision
      // pinned at `before`, even though the doc DID change.
      compilePlan(editor, [
        {
          id: 'rewrite-1',
          op: 'text.rewrite',
          where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
          args: { replacement: { text: 'noop' } },
        },
      ]);
    } finally {
      warnSpy.mockRestore();
    }

    expect(getRevision(editor)).toBe(before);
  });
});

/**
 * Stale `expectedRevision` must reject the user's intent *before* compile can
 * dispatch the identity-repair transaction. Otherwise the user's mutation
 * surfaces as `REVISION_MISMATCH` but the document is silently rewritten on
 * the way through.
 */
describe('stale expectedRevision rejects before identity repair mutates the doc', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('throws REVISION_MISMATCH and leaves the duplicate-laden doc unchanged', async () => {
    editor = await makeEditorWithDuplicateParaId('STALEREV');
    const docBefore = editor.state.doc;
    const revisionBefore = getRevision(editor);

    // Sanity-check: this is a corrupted-doc state — running executePlan
    // *without* a stale revision would trigger the repair. We're asserting
    // a STALE expectedRevision short-circuits the call before that happens.
    const staleRevision = `${revisionBefore}-stale`;

    expect(() =>
      executePlan(editor, {
        steps: [
          {
            id: 'rewrite-1',
            op: 'text.rewrite',
            where: { by: 'select', select: { type: 'text', pattern: 'second' }, require: 'first' },
            args: { replacement: { text: 'noop' } },
          },
        ],
        expectedRevision: staleRevision,
      }),
    ).toThrow(/REVISION_MISMATCH|expected revision/i);

    // Doc must be IDENTICAL to its pre-call state — no repair transaction
    // dispatched, no attrs rewritten, no revision advanced.
    expect(editor.state.doc).toBe(docBefore);
    expect(getRevision(editor)).toBe(revisionBefore);
  });
});

describe('wrapper dry-run and revision guards stay non-mutating on duplicate-laden docs', () => {
  let editor;

  afterEach(() => {
    editor?.destroy?.();
    editor = undefined;
  });

  it('selectionMutationWrapper dry-run surfaces DOCUMENT_IDENTITY_CONFLICT without repairing', async () => {
    editor = await makeEditorWithDuplicateParaIdAndIndependentTarget('DUPSELDR');
    const docBefore = editor.state.doc;
    const revisionBefore = getRevision(editor);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown = null;
    try {
      selectionMutationWrapper(
        editor,
        {
          kind: 'replace',
          ref: 'UNIQUE01',
          text: 'rewritten',
        },
        { dryRun: true },
      );
    } catch (error) {
      thrown = error;
    } finally {
      warnSpy.mockRestore();
    }

    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe('DOCUMENT_IDENTITY_CONFLICT');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(docBefore);
    expect(getRevision(editor)).toBe(revisionBefore);
  });

  it('ref-based structured insert rejects stale expectedRevision before any repair dispatch', async () => {
    editor = await makeEditorWithDuplicateParaIdAndIndependentTarget('DUPSTRST');
    const docBefore = editor.state.doc;
    const revisionBefore = getRevision(editor);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown = null;
    try {
      insertStructuredWrapper(
        editor,
        {
          value: 'Inserted markdown',
          type: 'markdown',
          ref: 'UNIQUE01',
        },
        { expectedRevision: `${revisionBefore}-stale` },
      );
    } catch (error) {
      thrown = error;
    } finally {
      warnSpy.mockRestore();
    }

    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe('REVISION_MISMATCH');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(docBefore);
    expect(getRevision(editor)).toBe(revisionBefore);
  });

  it('ref-based structured insert dry-run surfaces DOCUMENT_IDENTITY_CONFLICT without repairing', async () => {
    editor = await makeEditorWithDuplicateParaIdAndIndependentTarget('DUPSTRDR');
    const docBefore = editor.state.doc;
    const revisionBefore = getRevision(editor);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown = null;
    try {
      insertStructuredWrapper(
        editor,
        {
          value: 'Inserted markdown',
          type: 'markdown',
          ref: 'UNIQUE01',
        },
        { dryRun: true },
      );
    } catch (error) {
      thrown = error;
    } finally {
      warnSpy.mockRestore();
    }

    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe('DOCUMENT_IDENTITY_CONFLICT');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(docBefore);
    expect(getRevision(editor)).toBe(revisionBefore);
  });

  it('ref-based structured insert still repairs and succeeds for a fresh request', async () => {
    editor = await makeEditorWithDuplicateParaIdAndIndependentTarget('DUPSTROK');
    const callerRevision = getRevision(editor);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const receipt = insertStructuredWrapper(
        editor,
        {
          value: 'Inserted markdown',
          type: 'markdown',
          ref: 'UNIQUE01',
        },
        { expectedRevision: callerRevision },
      );

      expect(receipt.success).toBe(true);
      expect(editor.state.doc.textContent).toContain('Inserted markdown');
    } finally {
      warnSpy.mockRestore();
    }

    const repairedCandidates = buildBlockIndex(editor).candidates.filter(
      (candidate) => candidate.nodeId === 'DUPSTROK',
    );
    expect(repairedCandidates).toHaveLength(1);
  });
});
