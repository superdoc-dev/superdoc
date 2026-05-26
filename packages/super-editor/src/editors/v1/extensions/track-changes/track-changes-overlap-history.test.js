// @ts-check
/**
 * Phase 005 — undo/redo restores successor fragment ids verbatim.
 *
 * Plan: v1-3220 / phase0-005 "Undo/Redo Requirements".
 *
 *   "Do not recompute new ids on redo. The decision engine must write the
 *    full successor-fragment mark state into the dispatched transaction so
 *    ProseMirror history restores it verbatim. Redo must not rerun the
 *    decision engine to mint ids again."
 *
 * These integration tests prove that a partial-range accept on a tracked
 * insertion:
 *
 *   1) writes deterministic successor fragment ids in the dispatched
 *      transaction (already covered by the decision-engine unit tests);
 *   2) survives undo with the source logical id restored;
 *   3) survives redo with the SAME successor ids (not re-minted by re-running
 *      the engine on redo).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { TrackInsertMarkName } from './constants.js';

const ALICE = { name: 'Alice', email: 'alice@example.com' };

const setup = () => {
  const { editor } = initTestEditor({
    mode: 'text',
    content: '<p>Hello world</p>',
    user: ALICE,
    trackedChanges: {},
  });
  editor.commands.enableTrackChanges();
  return editor;
};

const collectInsertMarks = (state) => {
  const marks = [];
  state.doc.descendants((node, pos) => {
    if (!node.marks) return;
    for (const mark of node.marks) {
      if (mark.type.name !== TrackInsertMarkName) continue;
      marks.push({
        id: mark.attrs.id,
        splitFromId: mark.attrs.splitFromId,
        revisionGroupId: mark.attrs.revisionGroupId,
        text: node.text ?? '',
        pos,
      });
    }
  });
  return marks;
};

describe('overlap — partial accept + undo/redo preserves successor ids', () => {
  let editor;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('preserves successor fragment ids verbatim across undo / redo', () => {
    editor = setup();

    // Insert a tracked insertion spanning a known range.
    editor.commands.insertTrackedChange({
      from: 6,
      to: 6,
      text: 'INSERTED',
      user: ALICE,
      id: 'logical-ins',
    });

    const beforeMarks = collectInsertMarks(editor.state);
    expect(beforeMarks).toHaveLength(1);
    expect(beforeMarks[0].id).toBe('logical-ins');

    // Find the inserted-mark range in the document; the inserted text is
    // 'INSERTED' (8 chars). Accept only the middle 4 chars to force a
    // partial decision that mints two successor fragments.
    const insertedPos = beforeMarks[0].pos;
    const partialFrom = insertedPos + 2; // skip 'IN'
    const partialTo = insertedPos + 6; // through 'SERT'

    const applied = editor.commands.acceptTrackedChangesBetween(partialFrom, partialTo);
    expect(applied).toBe(true);

    const afterMarks = collectInsertMarks(editor.state);
    // Source id retired; two successor fragments remain with splitFromId.
    expect(afterMarks).toHaveLength(2);
    for (const m of afterMarks) {
      expect(m.splitFromId).toBe('logical-ins');
      expect(m.id).not.toBe('logical-ins');
    }
    // Capture the minted successor ids so we can compare across history.
    const successorIds = afterMarks.map((m) => m.id).sort();
    expect(successorIds[0]).not.toBe(successorIds[1]);

    // Undo — original logical id restored, successor ids gone.
    const undid = editor.commands.undo();
    expect(undid).toBe(true);
    const undoneMarks = collectInsertMarks(editor.state);
    expect(undoneMarks).toHaveLength(1);
    expect(undoneMarks[0].id).toBe('logical-ins');
    expect(undoneMarks[0].splitFromId).toBe('');

    // Redo — the SAME successor ids must come back. Re-running the engine
    // would mint new ids; PM history restores the dispatched transaction
    // verbatim, including the typed successor marks.
    const redid = editor.commands.redo();
    expect(redid).toBe(true);
    const redoneMarks = collectInsertMarks(editor.state);
    const redoneSuccessorIds = redoneMarks.map((m) => m.id).sort();
    expect(redoneSuccessorIds).toEqual(successorIds);
    for (const m of redoneMarks) {
      expect(m.splitFromId).toBe('logical-ins');
    }
  });

  it('preserves successor revisionGroupId across undo / redo', () => {
    editor = setup();
    editor.commands.insertTrackedChange({
      from: 6,
      to: 6,
      text: 'INSERTED',
      user: ALICE,
      id: 'group-ins',
    });

    const before = collectInsertMarks(editor.state);
    const baseGroup = before[0].revisionGroupId || before[0].id;
    const insertedPos = before[0].pos;

    editor.commands.acceptTrackedChangesBetween(insertedPos + 2, insertedPos + 6);
    const after = collectInsertMarks(editor.state);
    for (const m of after) {
      // Successor fragments inherit the source's revisionGroupId so the
      // graph can correlate them as one logical group.
      expect(m.revisionGroupId).toBe(baseGroup);
    }

    editor.commands.undo();
    editor.commands.redo();

    const redone = collectInsertMarks(editor.state);
    for (const m of redone) {
      expect(m.revisionGroupId).toBe(baseGroup);
    }
  });
});
