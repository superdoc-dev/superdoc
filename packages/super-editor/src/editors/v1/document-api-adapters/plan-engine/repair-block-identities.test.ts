import { describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';
import { buildBlockIndex } from '../helpers/node-address-resolver.js';
import { repairDuplicateBlockIdentities } from './repair-block-identities.js';

/**
 * Unit coverage for the runtime repair pass.
 *
 * The companion `duplicate-block-identities.test.js` covers the
 * end-to-end flow through `compilePlan`; this file pins the
 * `repairDuplicateBlockIdentities(editor)` contract directly so future
 * refactors don't drift from the importer's renaming semantics.
 */
describe('repairDuplicateBlockIdentities', () => {
  /**
   * Build an editor with one duplicate paraId across two paragraphs.
   */
  async function makeEditorWithDuplicateParaId(duplicateValue: string) {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });

    // Append a paragraph with the chosen paraId, then patch the existing
    // first paragraph to share it. Both writes go through ordinary PM
    // transactions — mirrors what a Yjs hydrate produces.
    const schema = editor.state.schema;
    const second = schema.nodes.paragraph.create({ paraId: duplicateValue }, schema.text('second'));
    const tr1 = editor.state.tr;
    tr1.insert(editor.state.doc.content.size, second);
    editor.dispatch(tr1);

    let firstPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (firstPos !== null) return false;
      if (node.type.name !== 'paragraph') return;
      firstPos = pos;
      return false;
    });
    if (firstPos == null) throw new Error('expected to find a paragraph');
    const firstNode = editor.state.doc.nodeAt(firstPos)!;
    const tr2 = editor.state.tr;
    tr2.setNodeMarkup(firstPos, null, { ...firstNode.attrs, paraId: duplicateValue });
    editor.dispatch(tr2);

    return editor;
  }

  it('returns null and leaves state untouched when there are no duplicates', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });

    try {
      const before = editor.state.doc.toJSON();
      const report = repairDuplicateBlockIdentities(editor);
      expect(report).toBeNull();
      expect(editor.state.doc.toJSON()).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it('renames the duplicate occurrence with an 8-uppercase-hex replacement', async () => {
    const editor = await makeEditorWithDuplicateParaId('DUPDUPID');

    try {
      const report = repairDuplicateBlockIdentities(editor);
      expect(report).not.toBeNull();
      expect(report!.repairedBlockCount).toBe(1);
      expect(report!.duplicateBlockIds).toEqual(['DUPDUPID']);
      expect(report!.renames).toHaveLength(1);

      const rename = report!.renames[0];
      expect(rename.originalValue).toBe('DUPDUPID');
      expect(rename.replacementValue).toMatch(/^[0-9A-F]{8}$/);
      expect(rename.replacementValue).not.toBe('DUPDUPID');
      expect(rename.attrs).toContain('paraId');

      // Exactly one paragraph still carries the original id; the other
      // carries the replacement.
      const paraIds: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name !== 'paragraph') return;
        if (node.attrs?.paraId) paraIds.push(node.attrs.paraId);
      });
      expect(paraIds.filter((id) => id === 'DUPDUPID')).toHaveLength(1);
      expect(paraIds.filter((id) => id === rename.replacementValue)).toHaveLength(1);

      // The post-repair block index has no duplicate nodeIds.
      const index = buildBlockIndex(editor);
      const counts = new Map<string, number>();
      for (const candidate of index.candidates) {
        counts.set(candidate.nodeId, (counts.get(candidate.nodeId) ?? 0) + 1);
      }
      expect([...counts.entries()].filter(([, n]) => n > 1)).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it('avoids reissuing an id that is already reserved elsewhere in the doc', async () => {
    // Reserve "00000001" so the deterministic allocator must skip past it.
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });

    try {
      const schema = editor.state.schema;
      const tr0 = editor.state.tr;
      tr0.insert(
        editor.state.doc.content.size,
        schema.nodes.paragraph.create({ paraId: '00000001' }, schema.text('reserved')),
      );
      editor.dispatch(tr0);

      // Now create two paragraphs with the same paraId different from the
      // reserved one.
      const tr1 = editor.state.tr;
      tr1.insert(
        editor.state.doc.content.size,
        schema.nodes.paragraph.create({ paraId: 'DUPLICATE' }, schema.text('dup-a')),
      );
      tr1.insert(
        editor.state.doc.content.size + tr1.doc.lastChild!.nodeSize,
        schema.nodes.paragraph.create({ paraId: 'DUPLICATE' }, schema.text('dup-b')),
      );
      editor.dispatch(tr1);

      const report = repairDuplicateBlockIdentities(editor);
      expect(report).not.toBeNull();
      expect(report!.renames[0].replacementValue).not.toBe('00000001');
      expect(report!.renames[0].replacementValue).toMatch(/^[0-9A-F]{8}$/);
    } finally {
      editor.destroy();
    }
  });

  it('marks the repair transaction with addToHistory=false and a typed meta key', async () => {
    const editor = await makeEditorWithDuplicateParaId('XYZ00000');
    try {
      // Spy on dispatch via a one-shot wrapper so we can inspect the tr meta.
      let observedTr: { getMeta: (k: unknown) => unknown } | null = null;
      const originalDispatch = editor.dispatch.bind(editor);
      editor.dispatch = (tr: any) => {
        observedTr = tr;
        originalDispatch(tr);
      };

      const report = repairDuplicateBlockIdentities(editor);
      expect(report).not.toBeNull();
      expect(observedTr).not.toBeNull();
      expect(observedTr!.getMeta('addToHistory')).toBe(false);
      // Repair report propagates via meta so observers (collab, telemetry)
      // can attribute the transaction.
      expect(observedTr!.getMeta('superdoc/block-identity-repair')).toBeTruthy();
    } finally {
      editor.destroy();
    }
  });

  it('renames only the colliding paraId when paragraphs carry distinct sdBlockIds', async () => {
    // The customer-shape case from the original escalation: Word-imported
    // paragraphs share a w14:paraId while each session assigned them unique
    // sdBlockIds. The repair must rename ONLY the colliding attr group and
    // leave the distinct sdBlockIds untouched (they remain valid aliases).
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, mode: 'docx' });

    try {
      const schema = editor.state.schema;
      const tr1 = editor.state.tr;
      tr1.insert(
        editor.state.doc.content.size,
        schema.nodes.paragraph.create({ paraId: 'SHAREDPI', sdBlockId: 'sd-block-aaa' }, schema.text('first')),
      );
      tr1.insert(
        editor.state.doc.content.size + tr1.doc.lastChild!.nodeSize,
        schema.nodes.paragraph.create({ paraId: 'SHAREDPI', sdBlockId: 'sd-block-bbb' }, schema.text('second')),
      );
      editor.dispatch(tr1);

      const report = repairDuplicateBlockIdentities(editor);
      expect(report).not.toBeNull();
      expect(report!.duplicateBlockIds).toEqual(['SHAREDPI']);
      expect(report!.renames).toHaveLength(1);
      // The rename targets paraId ONLY — the distinct sdBlockIds were never
      // part of the colliding identity group.
      expect(report!.renames[0].attrs).toEqual(['paraId']);

      // Both sdBlockIds survive untouched; exactly one paragraph keeps the
      // original paraId and the other carries the 8-hex replacement.
      const observed: Array<{ paraId?: string; sdBlockId?: string }> = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name !== 'paragraph') return;
        if (node.attrs?.sdBlockId === 'sd-block-aaa' || node.attrs?.sdBlockId === 'sd-block-bbb') {
          observed.push({ paraId: node.attrs.paraId, sdBlockId: node.attrs.sdBlockId });
        }
      });
      expect(observed).toHaveLength(2);
      expect(observed.map((o) => o.sdBlockId).sort()).toEqual(['sd-block-aaa', 'sd-block-bbb']);
      const paraIds = observed.map((o) => o.paraId);
      expect(paraIds.filter((id) => id === 'SHAREDPI')).toHaveLength(1);
      expect(paraIds.find((id) => id !== 'SHAREDPI')).toMatch(/^[0-9A-F]{8}$/);
    } finally {
      editor.destroy();
    }
  });

  it('throws REPAIR_BLOCKED when the dispatched repair transaction does not apply', async () => {
    // Defensive contract: if some transaction filter vetoes the repair (the
    // dispatch is observed but the state never changes), the repair must NOT
    // silently report success — the post-dispatch verification throws an
    // explicit REPAIR_BLOCKED whose message carries the blocked ids (the
    // Python SDK strips structured details, so the message is the contract).
    const editor = await makeEditorWithDuplicateParaId('BLOCKED1');
    try {
      // Observe-but-drop dispatch: the repair tr never reaches the state.
      editor.dispatch = () => {};

      let thrown: unknown = null;
      try {
        repairDuplicateBlockIdentities(editor);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).not.toBeNull();
      const planErr = thrown as { code?: string; message: string; details?: { blockedNodeIds?: string[] } };
      expect(planErr.code).toBe('REPAIR_BLOCKED');
      // Message is the SDK-facing contract (Python strips details): it names
      // the rejection and carries a bounded preview of the blocked node ids.
      expect(planErr.message).toMatch(/identity repair was rejected/i);
      expect(planErr.message).toMatch(/doc\.open/);
      expect(planErr.details?.blockedNodeIds?.length).toBeGreaterThan(0);
    } finally {
      editor.destroy();
    }
  });

  it('buildBlockIndex populates explicitIdentities for the runtime repair fast path', async () => {
    // Pins the walk consolidation: the block index build
    // produces a side-channel map keyed by identity-attr value, so the repair
    // planner does not need a second full descendants pass to detect
    // duplicates on a 1000+ page customer doc.
    const editor = await makeEditorWithDuplicateParaId('SHAREDID');
    try {
      const index = buildBlockIndex(editor);
      expect(index.explicitIdentities).toBeDefined();
      const observations = index.explicitIdentities!.get('SHAREDID');
      expect(observations).toBeDefined();
      // The duplicate paraId is observed on two distinct paragraphs.
      expect(observations!.length).toBe(2);
      for (const observation of observations!) {
        expect(observation.attrs).toContain('paraId');
      }
    } finally {
      editor.destroy();
    }
  });
});
