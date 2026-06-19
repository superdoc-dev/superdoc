// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { PositionTracker } from '@core/PositionTracker.js';

/**
 * Real-editor regression guards for SD-3470 / PR #109.
 *
 * Built-in find froze for seconds when a short query matched many times because
 * match tracking dispatched one ProseMirror transaction per match. The fix batches
 * every range into a single positionTracker.trackMany() call (one dispatch). These
 * tests run against a real editor so they observe the actual dispatch shape, not a
 * mocked tracker (the mock-level contract test lives in search.session.test.js).
 */
describe('search batches tracker updates (SD-3470)', () => {
  /**
   * Run one search over a document containing `occurrences` copies of the query and
   * report the real dispatch shape.
   */
  function measureSearch(occurrences, runCommand) {
    const editor = createDocxTestEditor();
    // trackMany lives on the prototype, and the editor's tracker instance is created
    // lazily inside the search command, so spy the prototype before searching.
    const trackManySpy = vi.spyOn(PositionTracker.prototype, 'trackMany');
    let dispatchSpy;
    try {
      const { doc, paragraph, run } = editor.schema.nodes;
      const testDoc = doc.create(null, [
        paragraph.create(null, [run.create(null, [editor.schema.text('word '.repeat(occurrences))])]),
      ]);
      const baseState = EditorState.create({
        schema: editor.schema,
        doc: testDoc,
        plugins: editor.state.plugins,
      });
      editor.setState(baseState);

      // Spy after setup/state creation so setup dispatches do not pollute the count.
      // PositionTracker.trackMany calls this.#editor.dispatch, so editor.dispatch
      // (not editor.view.dispatch) is the chokepoint that scales with match count.
      dispatchSpy = vi.spyOn(editor, 'dispatch');
      const matches = runCommand(editor);

      return {
        matchCount: matches.length,
        dispatchCount: dispatchSpy.mock.calls.length,
        trackManyCalls: trackManySpy.mock.calls.length,
        trackManyRangeCount: trackManySpy.mock.calls[0]?.[0]?.length ?? 0,
      };
    } finally {
      if (dispatchSpy) dispatchSpy.mockRestore();
      trackManySpy.mockRestore();
      editor.destroy();
    }
  }

  // Both entry points share mapIndexMatchesToDocMatches, but the built-in find UI
  // calls setSearchSession with the visible search model, so guard that path directly.
  const ENTRY_POINTS = [
    { label: 'search', runCommand: (editor) => editor.commands.search('word') },
    {
      label: 'setSearchSession',
      runCommand: (editor) => editor.commands.setSearchSession('word', { searchModel: 'visible' }).matches,
    },
  ];

  for (const { label, runCommand } of ENTRY_POINTS) {
    it(`${label}: one batched trackMany, dispatch count does not scale with match count`, () => {
      const small = measureSearch(10, runCommand);
      const large = measureSearch(500, runCommand);

      expect(small.matchCount).toBe(10);
      expect(large.matchCount).toBe(500);

      // A single batched trackMany carries every range, at both sizes.
      expect(small.trackManyCalls).toBe(1);
      expect(large.trackManyCalls).toBe(1);
      expect(small.trackManyRangeCount).toBe(10);
      expect(large.trackManyRangeCount).toBe(500);

      // The durable invariant: tracker dispatches stay constant, not O(matches).
      // (Currently 2 per search: one untrackByType + the single trackMany.)
      expect(large.dispatchCount).toBe(small.dispatchCount);
    });
  }

  it('distributes tracker ids across the ranges of a real multi-range match', () => {
    const editor = createDocxTestEditor();
    try {
      const { doc, paragraph, run } = editor.schema.nodes;
      // "end start" matches across the paragraph boundary: one match with two ranges.
      const testDoc = doc.create(null, [
        paragraph.create(null, [run.create(null, [editor.schema.text('end')])]),
        paragraph.create(null, [run.create(null, [editor.schema.text('start')])]),
      ]);
      const baseState = EditorState.create({
        schema: editor.schema,
        doc: testDoc,
        plugins: editor.state.plugins,
      });
      editor.setState(baseState);

      const matches = editor.commands.search('end start');
      const match = matches.find((m) => m.ranges && m.ranges.length >= 2);

      expect(match).toBeDefined();
      // One tracker id per range, in order, with the match id taken from the first.
      expect(match.trackerIds).toHaveLength(match.ranges.length);
      expect(match.id).toBe(match.trackerIds[0]);

      // Every id resolves against the real position tracker.
      for (const id of match.trackerIds) {
        const resolved = editor.positionTracker.resolve(id);
        expect(resolved).not.toBeNull();
        expect(typeof resolved.from).toBe('number');
        expect(typeof resolved.to).toBe('number');
      }
    } finally {
      editor.destroy();
    }
  });
});
