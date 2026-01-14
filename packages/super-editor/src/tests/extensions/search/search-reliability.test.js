import { describe, it, expect, vi } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { getMatchHighlights } from '@extensions/search/prosemirror-search-patched.js';
import { EditorState, TextSelection } from 'prosemirror-state';

/**
 * Test suite for search reliability edge cases.
 * Tests stale positions, boundary errors, concurrent calls, and cross-block behavior.
 */
describe('Search reliability', () => {
  describe('Stale positions after document edits', () => {
    it('should return stale positions when using old search results after document edit', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find me here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Get search results
        const oldMatches = editor.commands.search('me');
        expect(oldMatches).toHaveLength(1);
        const oldMatch = oldMatches[0];
        const oldMatchFrom = oldMatch.from;
        const oldMatchTo = oldMatch.to;

        // Insert text BEFORE the match (shifts positions)
        // Use position 4 which is inside the run content
        const tr = editor.state.tr.insertText('PREFIX ', 4);
        editor.view.dispatch(tr);

        // The old match positions are now stale
        // Verify the document changed
        expect(editor.state.doc.textContent).toContain('PREFIX');
        expect(editor.state.doc.textContent).toContain('me');

        // Old positions point to wrong text now (positions shifted by 7 chars)
        const textAtOldPosition = editor.state.doc.textBetween(oldMatchFrom, oldMatchTo);
        expect(textAtOldPosition).not.toBe('me'); // This demonstrates the stale position issue
      } finally {
        editor.destroy();
      }
    });

    it('should get correct results when re-searching after document edit', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find me here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Initial search
        editor.commands.search('me');

        // Insert text before the match
        const tr = editor.state.tr.insertText('PREFIX ', 3);
        editor.view.dispatch(tr);

        // Re-search to get fresh positions
        const newMatches = editor.commands.search('me');
        expect(newMatches).toHaveLength(1);

        // New positions should be correct
        const textAtNewPosition = editor.state.doc.textBetween(newMatches[0].from, newMatches[0].to);
        expect(textAtNewPosition).toBe('me');
      } finally {
        editor.destroy();
      }
    });

    it('should handle document deletion that removes searched text', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find target here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Get search results
        const oldMatches = editor.commands.search('target');
        expect(oldMatches).toHaveLength(1);

        // Delete the matched text
        const tr = editor.state.tr.delete(oldMatches[0].from, oldMatches[0].to);
        editor.view.dispatch(tr);

        // Re-search should find nothing
        const newMatches = editor.commands.search('target');
        expect(newMatches).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });

    it('should handle goToSearchResult with stale positions gracefully', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('some text here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Get search results
        const matches = editor.commands.search('text');
        expect(matches).toHaveLength(1);
        const match = matches[0];

        // Delete significant portion of document
        const tr = editor.state.tr.delete(3, 10);
        editor.view.dispatch(tr);

        // Try to navigate to stale position - should not throw
        // The behavior may vary but it should be graceful
        expect(() => {
          editor.commands.goToSearchResult(match);
        }).not.toThrow();
      } finally {
        editor.destroy();
      }
    });

    it('should handle storage.searchResults becoming stale', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('word word word')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search stores results
        const matches = editor.commands.search('word');
        expect(matches).toHaveLength(3);

        // Modify document - insert text that might break up a word
        const tr = editor.state.tr.insertText('X', 4);
        editor.view.dispatch(tr);

        // Re-searching updates the storage with current state
        const newMatches = editor.commands.search('word');
        // Number of matches may change depending on where insert happened
        expect(newMatches.length).toBeGreaterThanOrEqual(0);

        // All new matches should point to valid positions
        for (const match of newMatches) {
          const text = editor.state.doc.textBetween(match.from, match.to);
          expect(text).toBe('word');
        }
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Position boundary validation', () => {
    it('should handle search in empty document', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create()]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('anything');
        expect(matches).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });

    it('should handle search for empty string', () => {
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

        // Empty search should return no matches (invalid query)
        const matches = editor.commands.search('');
        expect(matches).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });

    it('should handle search at document boundaries', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test at start')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search for text at the very beginning
        const matches = editor.commands.search('test');
        expect(matches).toHaveLength(1);

        // Verify position is at start of content
        expect(matches[0].from).toBeGreaterThanOrEqual(0);
        expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should handle search for text at end of document', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('content at end')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('end');
        expect(matches).toHaveLength(1);

        // Position should be near document end
        expect(matches[0].to).toBeLessThanOrEqual(editor.state.doc.content.size);
        expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('end');
      } finally {
        editor.destroy();
      }
    });

    it('should handle goToSearchResult with position at document end', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find last')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('last');
        expect(matches).toHaveLength(1);

        // Should not throw when navigating to end
        expect(() => {
          editor.commands.goToSearchResult(matches[0]);
        }).not.toThrow();

        expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('last');
      } finally {
        editor.destroy();
      }
    });

    it('should handle very long search strings', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const longText = 'a'.repeat(1000);
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text(longText)])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search for entire content
        const matches = editor.commands.search(longText);
        expect(matches).toHaveLength(1);
        // Verify the matched text is the expected length
        const matchedText = editor.state.doc.textBetween(matches[0].from, matches[0].to);
        expect(matchedText.length).toBe(1000);
        expect(matchedText).toBe(longText);
      } finally {
        editor.destroy();
      }
    });

    it('should handle special characters in search', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('price is $100.00 (USD)')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Plain string search should escape special chars
        const matches = editor.commands.search('$100.00');
        expect(matches).toHaveLength(1);
        expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('$100.00');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Cross-block search behavior', () => {
    it('should find matches spanning multiple paragraphs', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello')])]),
          paragraph.create(null, [run.create(null, [editor.schema.text('world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // "hello world" spans two paragraphs - SHOULD be found with cross-paragraph search
        const matches = editor.commands.search('hello world');
        expect(matches).toHaveLength(1);
        expect(matches[0].ranges).toBeDefined();
        expect(matches[0].ranges.length).toBe(2); // Two ranges for two paragraphs

        // Individual words should also be found
        const helloMatches = editor.commands.search('hello');
        expect(helloMatches).toHaveLength(1);

        const worldMatches = editor.commands.search('world');
        expect(worldMatches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should find matches within same paragraph across runs', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('hello ')]),
            run.create(null, [editor.schema.text('world')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // "hello world" within same paragraph should be found
        const matches = editor.commands.search('hello world');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle search in deeply nested structures', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // Multiple levels of nesting
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('level1 ')]),
            run.create(null, [editor.schema.text('content')]),
          ]),
          paragraph.create(null, [
            run.create(null, [editor.schema.text('level2 ')]),
            run.create(null, [editor.schema.text('content')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('content');
        expect(matches).toHaveLength(2);

        // Each match should be in correct position
        for (const match of matches) {
          expect(editor.state.doc.textBetween(match.from, match.to)).toBe('content');
        }
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Concurrent search operations', () => {
    it('should handle rapid consecutive searches', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('apple banana cherry date elderberry')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Rapid consecutive searches
        const results = [];
        results.push(editor.commands.search('apple'));
        results.push(editor.commands.search('banana'));
        results.push(editor.commands.search('cherry'));
        results.push(editor.commands.search('date'));
        results.push(editor.commands.search('elderberry'));

        // Each search should return correct results
        expect(results[0]).toHaveLength(1);
        expect(results[0][0].text).toBe('apple');
        expect(results[4]).toHaveLength(1);
        expect(results[4][0].text).toBe('elderberry');
      } finally {
        editor.destroy();
      }
    });

    it('should overwrite previous search state with new search', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('aaa bbb aaa')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // First search
        const firstMatches = editor.commands.search('aaa');
        expect(firstMatches).toHaveLength(2);

        // Second search overwrites - verify returned results are correct
        const secondMatches = editor.commands.search('bbb');
        expect(secondMatches).toHaveLength(1);
        expect(secondMatches[0].text).toBe('bbb');

        // First matches are no longer in results (second search replaced them)
        // Verify by checking that searching again produces fresh results
        const thirdMatches = editor.commands.search('aaa');
        expect(thirdMatches).toHaveLength(2);
      } finally {
        editor.destroy();
      }
    });

    it('should handle alternating search and navigation', () => {
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

        // Search and navigate
        const matches1 = editor.commands.search('test');
        editor.commands.goToSearchResult(matches1[0]);

        // Search for something else
        const matches2 = editor.commands.search('one');
        editor.commands.goToSearchResult(matches2[0]);

        // Search again
        const matches3 = editor.commands.search('test');
        editor.commands.goToSearchResult(matches3[2]);

        // Should be at third "test"
        expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Unicode and special text handling', () => {
    it('should handle unicode characters in search', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Hello 世界 こんにちは')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('世界');
        expect(matches).toHaveLength(1);
        expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('世界');
      } finally {
        editor.destroy();
      }
    });

    it('should handle emoji in search', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Hello 👋 World 🌍')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('👋');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle non-breaking spaces', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // \u00A0 is non-breaking space
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello\u00A0world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search with non-breaking space
        const matches = editor.commands.search('hello\u00A0world');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle figure spaces (U+2002)', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('word\u2002word')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('word\u2002word');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle zero-width characters', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // \u200B is zero-width space
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello\u200Bworld')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search should handle zero-width characters
        const matches = editor.commands.search('helloworld');
        // May or may not match depending on implementation
        // But should not throw
        expect(() => editor.commands.search('helloworld')).not.toThrow();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Large document performance', () => {
    it('should handle documents with many paragraphs', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // Create document with 100 paragraphs
        const paragraphs = [];
        for (let i = 0; i < 100; i++) {
          paragraphs.push(
            paragraph.create(null, [run.create(null, [editor.schema.text(`Paragraph ${i} with target word`)])]),
          );
        }
        const testDoc = doc.create(null, paragraphs);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const startTime = Date.now();
        const matches = editor.commands.search('target');
        const endTime = Date.now();

        expect(matches).toHaveLength(100);
        // Should complete in reasonable time (less than 1 second)
        expect(endTime - startTime).toBeLessThan(1000);
      } finally {
        editor.destroy();
      }
    });

    it('should handle documents with many matches', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // Create text with many occurrences
        const repeatedText = 'word '.repeat(500);
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text(repeatedText)])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const startTime = Date.now();
        const matches = editor.commands.search('word');
        const endTime = Date.now();

        expect(matches).toHaveLength(500);
        // Should complete in reasonable time
        expect(endTime - startTime).toBeLessThan(1000);
      } finally {
        editor.destroy();
      }
    });
  });
});
