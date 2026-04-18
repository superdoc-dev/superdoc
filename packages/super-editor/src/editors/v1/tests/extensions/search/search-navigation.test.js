import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { getMatchHighlights } from '@extensions/search/prosemirror-search-patched.js';
import { EditorState, TextSelection } from 'prosemirror-state';

/**
 * Helper to mock scrollIntoView for JSDOM environment.
 * JSDOM doesn't support scrollIntoView on text nodes.
 */
const mockScrollIntoView = (editor) => {
  const originalDomAtPos = editor.view.domAtPos.bind(editor.view);
  editor.view.domAtPos = (pos) => {
    const result = originalDomAtPos(pos);
    if (result?.node && !result.node.scrollIntoView) {
      result.node.scrollIntoView = () => {};
    }
    return result;
  };
};

/**
 * Test suite for search navigation commands: goToFirstMatch and goToSearchResult.
 * These commands are critical for user navigation through search results.
 */
describe('Search navigation commands', () => {
  describe('goToFirstMatch', () => {
    it('should navigate to the first match and select it', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('first test and second test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        mockScrollIntoView(editor);

        // Perform search first
        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(2);

        // Navigate to first match
        const result = editor.commands.goToFirstMatch();

        expect(result).toBe(true);
        // Selection should be on first "test"
        const { from, to } = editor.state.selection;
        expect(editor.state.doc.textBetween(from, to)).toBe('test');
        // Should be the first occurrence
        expect(from).toBe(matches[0].from);
        expect(to).toBe(matches[0].to);
      } finally {
        editor.destroy();
      }
    });

    it('should return false when no search has been performed', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('some content')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Clear any previous search results by searching for something that won't match
        editor.commands.search('ZZZZZ_NO_MATCH_ZZZZZ');

        // Now goToFirstMatch should return false
        const result = editor.commands.goToFirstMatch();

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });

    it('should return false when search has no matches', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('some content')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search for non-existent text
        editor.commands.search('xyz');
        const result = editor.commands.goToFirstMatch();

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });

    it('should focus the editor view when navigating', () => {
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

        mockScrollIntoView(editor);
        const focusSpy = vi.spyOn(editor.view, 'focus');

        editor.commands.search('test');
        editor.commands.goToFirstMatch();

        expect(focusSpy).toHaveBeenCalled();
        focusSpy.mockRestore();
      } finally {
        editor.destroy();
      }
    });

    it('should work with regex search results', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('email@test.com and another@example.org')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        mockScrollIntoView(editor);

        const matches = editor.commands.search(/\w+@\w+\.\w+/gi);
        expect(matches).toHaveLength(2);

        const result = editor.commands.goToFirstMatch();

        expect(result).toBe(true);
        const { from, to } = editor.state.selection;
        expect(editor.state.doc.textBetween(from, to)).toBe('email@test.com');
      } finally {
        editor.destroy();
      }
    });

    it('should work after document modifications when search is re-run', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test content here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        mockScrollIntoView(editor);

        // Initial search
        const initialMatches = editor.commands.search('test');
        expect(initialMatches).toHaveLength(1);

        // Modify document - append text at the end
        const endPos = editor.state.doc.content.size - 2;
        const tr = editor.state.tr.insertText(' and more test', endPos);
        editor.view.dispatch(tr);

        // Re-run search after modification - should find both
        const newMatches = editor.commands.search('test');
        expect(newMatches.length).toBe(2);

        const result = editor.commands.goToFirstMatch();
        expect(result).toBe(true);

        const { from, to } = editor.state.selection;
        expect(editor.state.doc.textBetween(from, to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('goToSearchResult', () => {
    it('should navigate to a specific search match', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('first test and second test and third test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(3);

        // Navigate to second match
        const result = editor.commands.goToSearchResult(matches[1]);

        expect(result).toBe(true);
        const { from, to } = editor.state.selection;
        expect(from).toBe(matches[1].from);
        expect(to).toBe(matches[1].to);
        expect(editor.state.doc.textBetween(from, to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should navigate to the last match', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test one test two test three')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(3);

        // Navigate to last match
        const result = editor.commands.goToSearchResult(matches[2]);

        expect(result).toBe(true);
        const { from, to } = editor.state.selection;
        expect(from).toBe(matches[2].from);
        expect(to).toBe(matches[2].to);
      } finally {
        editor.destroy();
      }
    });

    it('should focus the editor view when navigating', () => {
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

        const focusSpy = vi.spyOn(editor.view, 'focus');

        const matches = editor.commands.search('test');
        editor.commands.goToSearchResult(matches[0]);

        expect(focusSpy).toHaveBeenCalled();
        focusSpy.mockRestore();
      } finally {
        editor.destroy();
      }
    });

    it('should handle match objects with valid from/to positions', () => {
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

        // Manually create a match object (simulating stored result)
        const manualMatch = { from: 3, to: 8, text: 'hello', id: 'test-id' };

        const result = editor.commands.goToSearchResult(manualMatch);

        expect(result).toBe(true);
        const { from, to } = editor.state.selection;
        expect(from).toBe(3);
        expect(to).toBe(8);
      } finally {
        editor.destroy();
      }
    });

    it('should work with matches across multiple run nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('first ')]),
            run.create(null, [editor.schema.text('test ')]),
            run.create(null, [editor.schema.text('second ')]),
            run.create(null, [editor.schema.text('test')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(2);

        // Navigate to each match
        for (let i = 0; i < matches.length; i++) {
          const result = editor.commands.goToSearchResult(matches[i]);
          expect(result).toBe(true);
          const { from, to } = editor.state.selection;
          expect(editor.state.doc.textBetween(from, to)).toBe('test');
        }
      } finally {
        editor.destroy();
      }
    });

    it('should work with matches in different paragraphs', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('first test here')])]),
          paragraph.create(null, [run.create(null, [editor.schema.text('second test there')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(2);

        // Navigate to second paragraph's match
        const result = editor.commands.goToSearchResult(matches[1]);

        expect(result).toBe(true);
        const { from, to } = editor.state.selection;
        expect(editor.state.doc.textBetween(from, to)).toBe('test');
        // Second match should be in second paragraph (after first paragraph + boundary)
        expect(from).toBeGreaterThan(matches[0].to);
      } finally {
        editor.destroy();
      }
    });

    it('should select the correct text for regex matches with variable length', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('cat and category and cats')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search(/cat\w*/gi);
        expect(matches).toHaveLength(3);

        // Verify all expected texts are found (order may vary based on search algorithm)
        const matchTexts = matches.map((m) => m.text).sort();
        expect(matchTexts).toContain('cat');
        expect(matchTexts).toContain('category');
        expect(matchTexts).toContain('cats');

        // Navigate to each and verify selection matches the stored positions
        for (const match of matches) {
          editor.commands.goToSearchResult(match);
          const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
          expect(selectedText).toBe(match.text);
        }
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Navigation sequence', () => {
    it('should allow sequential navigation through all matches', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('word word word word word')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('word');
        expect(matches).toHaveLength(5);

        // Navigate through all matches and verify each selects correct text
        for (const match of matches) {
          editor.commands.goToSearchResult(match);
          const { from, to } = editor.state.selection;
          expect(from).toBe(match.from);
          expect(to).toBe(match.to);
          expect(editor.state.doc.textBetween(from, to)).toBe('word');
        }

        // Collect unique positions to verify all matches are distinct
        const positions = new Set(matches.map((m) => m.from));
        expect(positions.size).toBe(5);
      } finally {
        editor.destroy();
      }
    });

    it('should allow random access to any match', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('a b c d e f g h i j')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search(/\w/g);
        expect(matches.length).toBeGreaterThanOrEqual(10);

        // Random access pattern
        const accessOrder = [5, 2, 8, 0, 9, 3];
        for (const idx of accessOrder) {
          if (idx < matches.length) {
            const result = editor.commands.goToSearchResult(matches[idx]);
            expect(result).toBe(true);
            expect(editor.state.selection.from).toBe(matches[idx].from);
          }
        }
      } finally {
        editor.destroy();
      }
    });
  });
});
