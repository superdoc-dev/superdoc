import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../helpers/editor-test-utils.js';
import { EditorState } from 'prosemirror-state';
import { positionTrackerKey } from '@core/PositionTracker.js';

/**
 * Test suite for PositionTracker - a core module for tracking document positions
 * across edits. Used by search to maintain accurate match positions after
 * document modifications.
 */
describe('PositionTracker', () => {
  describe('track() and resolve()', () => {
    it('should track a range and resolve it back', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        expect(tracker).toBeDefined();

        // Track "world" (positions 9-14 in "hello world")
        const id = tracker.track(9, 14, { type: 'test' });

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');

        const resolved = tracker.resolve(id);
        expect(resolved).not.toBeNull();
        expect(resolved.from).toBe(9);
        expect(resolved.to).toBe(14);
        expect(resolved.spec.type).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should return null when resolving non-existent id', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const resolved = tracker.resolve('non-existent-id');

        expect(resolved).toBeNull();
      } finally {
        editor.destroy();
      }
    });

    it('should include metadata in tracked range spec', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test content')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const id = tracker.track(3, 7, {
          type: 'search',
          metadata: { text: 'test', index: 0 },
        });

        const resolved = tracker.resolve(id);
        expect(resolved.spec.metadata).toEqual({ text: 'test', index: 0 });
      } finally {
        editor.destroy();
      }
    });
  });

  describe('untrack()', () => {
    it('should remove a tracked range', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const id = tracker.track(3, 8, { type: 'test' });

        // Verify it exists
        expect(tracker.resolve(id)).not.toBeNull();

        // Untrack it
        tracker.untrack(id);

        // Should no longer exist
        expect(tracker.resolve(id)).toBeNull();
      } finally {
        editor.destroy();
      }
    });

    it('should handle untracking non-existent id gracefully', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Should not throw
        expect(() => tracker.untrack('non-existent-id')).not.toThrow();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('trackMany() and untrackMany()', () => {
    it('should track multiple ranges at once', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('one two three')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const ids = tracker.trackMany([
          { from: 3, to: 6, spec: { type: 'word' } }, // "one"
          { from: 7, to: 10, spec: { type: 'word' } }, // "two"
          { from: 11, to: 16, spec: { type: 'word' } }, // "three"
        ]);

        expect(ids).toHaveLength(3);

        // All should be resolvable
        for (const id of ids) {
          expect(tracker.resolve(id)).not.toBeNull();
        }
      } finally {
        editor.destroy();
      }
    });

    it('should untrack multiple ranges at once', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('a b c d')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const ids = tracker.trackMany([
          { from: 3, to: 4, spec: { type: 'test' } },
          { from: 5, to: 6, spec: { type: 'test' } },
          { from: 7, to: 8, spec: { type: 'test' } },
        ]);

        // Untrack first two
        tracker.untrackMany([ids[0], ids[1]]);

        expect(tracker.resolve(ids[0])).toBeNull();
        expect(tracker.resolve(ids[1])).toBeNull();
        expect(tracker.resolve(ids[2])).not.toBeNull();
      } finally {
        editor.destroy();
      }
    });

    it('should handle empty array for untrackMany', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('test')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Should not throw
        expect(() => tracker.untrackMany([])).not.toThrow();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('untrackByType()', () => {
    it('should remove all ranges of a specific type', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Track some as 'search', some as 'highlight'
        const searchId1 = tracker.track(3, 8, { type: 'search' });
        const searchId2 = tracker.track(9, 14, { type: 'search' });
        const highlightId = tracker.track(15, 19, { type: 'highlight' });

        // Remove all 'search' types
        tracker.untrackByType('search');

        // Search ranges should be gone
        expect(tracker.resolve(searchId1)).toBeNull();
        expect(tracker.resolve(searchId2)).toBeNull();

        // Highlight should remain
        expect(tracker.resolve(highlightId)).not.toBeNull();
      } finally {
        editor.destroy();
      }
    });

    it('should handle untrackByType when no ranges of that type exist', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const id = tracker.track(3, 8, { type: 'other' });

        // Should not throw and should not affect other types
        expect(() => tracker.untrackByType('nonexistent')).not.toThrow();
        expect(tracker.resolve(id)).not.toBeNull();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('resolveMany()', () => {
    it('should resolve multiple ids at once', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('one two three')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const ids = tracker.trackMany([
          { from: 3, to: 6, spec: { type: 'test' } },
          { from: 7, to: 10, spec: { type: 'test' } },
        ]);

        const resolved = tracker.resolveMany(ids);

        expect(resolved).toBeInstanceOf(Map);
        expect(resolved.size).toBe(2);

        for (const id of ids) {
          expect(resolved.get(id)).not.toBeNull();
        }
      } finally {
        editor.destroy();
      }
    });

    it('should return null for non-existent ids in resolveMany', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('test')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const existingId = tracker.track(3, 7, { type: 'test' });

        const resolved = tracker.resolveMany([existingId, 'fake-id-1', 'fake-id-2']);

        expect(resolved.get(existingId)).not.toBeNull();
        expect(resolved.get('fake-id-1')).toBeNull();
        expect(resolved.get('fake-id-2')).toBeNull();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('findByType()', () => {
    it('should find all ranges of a specific type', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('one two three four')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        tracker.track(3, 6, { type: 'search' });
        tracker.track(7, 10, { type: 'search' });
        tracker.track(11, 16, { type: 'highlight' });
        tracker.track(17, 21, { type: 'search' });

        const searchRanges = tracker.findByType('search');
        const highlightRanges = tracker.findByType('highlight');

        expect(searchRanges).toHaveLength(3);
        expect(highlightRanges).toHaveLength(1);

        for (const range of searchRanges) {
          expect(range.spec.type).toBe('search');
        }
      } finally {
        editor.destroy();
      }
    });

    it('should return empty array when no ranges of type exist', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        tracker.track(3, 8, { type: 'other' });

        const results = tracker.findByType('nonexistent');
        expect(results).toEqual([]);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Position mapping after document edits', () => {
    /**
     * Helper to find the position of a substring in the document.
     * Returns { from, to } for the first occurrence.
     */
    const findTextPosition = (doc, searchText) => {
      let result = null;
      doc.descendants((node, pos) => {
        if (node.isText && result === null) {
          const index = node.text.indexOf(searchText);
          if (index !== -1) {
            result = { from: pos + index, to: pos + index + searchText.length };
          }
        }
      });
      return result;
    };

    it('should update positions when text is inserted before tracked range', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Find actual position of "world"
        const worldPos = findTextPosition(editor.state.doc, 'world');
        const id = tracker.track(worldPos.from, worldPos.to, { type: 'test' });

        // Verify initial tracking is correct
        expect(editor.state.doc.textBetween(worldPos.from, worldPos.to)).toBe('world');

        // Find position of "hello" and insert before it
        const helloPos = findTextPosition(editor.state.doc, 'hello');
        const tr = editor.state.tr.insertText('PREFIX ', helloPos.from);
        editor.view.dispatch(tr);

        // Positions should have shifted
        const resolved = tracker.resolve(id);
        expect(resolved).not.toBeNull();

        // Verify the text at new position is still "world"
        expect(editor.state.doc.textBetween(resolved.from, resolved.to)).toBe('world');
      } finally {
        editor.destroy();
      }
    });

    it('should update positions when text is inserted after tracked range', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Find actual position of "hello"
        const helloPos = findTextPosition(editor.state.doc, 'hello');
        const id = tracker.track(helloPos.from, helloPos.to, { type: 'test' });

        // Verify initial tracking is correct
        expect(editor.state.doc.textBetween(helloPos.from, helloPos.to)).toBe('hello');

        // Find end of document content and insert there
        const worldPos = findTextPosition(editor.state.doc, 'world');
        const tr = editor.state.tr.insertText(' SUFFIX', worldPos.to);
        editor.view.dispatch(tr);

        // Positions should remain unchanged for text before insertion
        const resolved = tracker.resolve(id);
        expect(resolved).not.toBeNull();
        expect(resolved.from).toBe(helloPos.from);
        expect(resolved.to).toBe(helloPos.to);
        expect(editor.state.doc.textBetween(resolved.from, resolved.to)).toBe('hello');
      } finally {
        editor.destroy();
      }
    });

    it('should handle deletion that removes tracked range entirely', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Find actual position of "world"
        const worldPos = findTextPosition(editor.state.doc, 'world');
        const id = tracker.track(worldPos.from, worldPos.to, { type: 'test' });

        // Delete "world" entirely
        const tr = editor.state.tr.delete(worldPos.from, worldPos.to);
        editor.view.dispatch(tr);

        // When content is fully deleted, the inline decoration is removed
        // This is expected ProseMirror behavior for inline decorations
        const resolved = tracker.resolve(id);
        expect(resolved).toBeNull();
      } finally {
        editor.destroy();
      }
    });

    it('should handle partial deletion of tracked range', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Find actual position of "world"
        const worldPos = findTextPosition(editor.state.doc, 'world');
        const id = tracker.track(worldPos.from, worldPos.to, { type: 'test' });
        const originalLength = worldPos.to - worldPos.from;

        // Delete first 3 chars of "world" ("wor")
        const tr = editor.state.tr.delete(worldPos.from, worldPos.from + 3);
        editor.view.dispatch(tr);

        // Range should be shorter
        const resolved = tracker.resolve(id);
        expect(resolved).not.toBeNull();
        expect(resolved.to - resolved.from).toBeLessThan(originalLength);
      } finally {
        editor.destroy();
      }
    });

    it('should update multiple tracked ranges correctly', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('one two three')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Find actual positions
        const onePos = findTextPosition(editor.state.doc, 'one');
        const twoPos = findTextPosition(editor.state.doc, 'two');
        const threePos = findTextPosition(editor.state.doc, 'three');

        // Track all three words
        const ids = tracker.trackMany([
          { from: onePos.from, to: onePos.to, spec: { type: 'word' } },
          { from: twoPos.from, to: twoPos.to, spec: { type: 'word' } },
          { from: threePos.from, to: threePos.to, spec: { type: 'word' } },
        ]);

        // Insert "PREFIX " at start (before "one")
        const tr = editor.state.tr.insertText('PREFIX ', onePos.from);
        editor.view.dispatch(tr);

        // All positions should have shifted, but text should still match
        const resolved = tracker.resolveMany(ids);

        const one = resolved.get(ids[0]);
        const two = resolved.get(ids[1]);
        const three = resolved.get(ids[2]);

        expect(editor.state.doc.textBetween(one.from, one.to)).toBe('one');
        expect(editor.state.doc.textBetween(two.from, two.to)).toBe('two');
        expect(editor.state.doc.textBetween(three.from, three.to)).toBe('three');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('generation counter', () => {
    it('should increment generation on document changes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        const initialGen = tracker.generation;

        // Make a document change
        const tr = editor.state.tr.insertText(' world', 8);
        editor.view.dispatch(tr);

        expect(tracker.generation).toBeGreaterThan(initialGen);
      } finally {
        editor.destroy();
      }
    });

    it('should not increment generation on non-doc-changing transactions', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;

        // Track something (creates a transaction but doesn't change doc)
        tracker.track(3, 8, { type: 'test' });

        const genAfterTrack = tracker.generation;

        // Untrack (also doesn't change doc)
        tracker.untrackByType('test');

        expect(tracker.generation).toBe(genAfterTrack);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('plugin state', () => {
    it('should initialize with empty decorations', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('hello')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const pluginState = positionTrackerKey.getState(editor.state);

        expect(pluginState).toBeDefined();
        expect(pluginState.decorations.find()).toHaveLength(0);
        expect(pluginState.generation).toBe(0);
      } finally {
        editor.destroy();
      }
    });

    it('should store decorations in plugin state', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const tracker = editor.positionTracker;
        tracker.track(3, 8, { type: 'test1' });
        tracker.track(9, 14, { type: 'test2' });

        const pluginState = positionTrackerKey.getState(editor.state);
        const decorations = pluginState.decorations.find();

        expect(decorations).toHaveLength(2);
      } finally {
        editor.destroy();
      }
    });
  });
});
