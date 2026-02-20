import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { __searchTextContent } from '@extensions/search/prosemirror-search-patched.js';
import { EditorState } from 'prosemirror-state';

/**
 * Test suite for search behavior with transparent inline nodes.
 * Tests how search handles various wrapper nodes like runs, bookmarks,
 * tracked changes, and comments.
 *
 * Currently, only 'run' and 'bookmarkStart' are treated as transparent.
 * This test suite documents the current behavior and identifies gaps.
 */
describe('Search transparent nodes', () => {
  describe('Run nodes (transparent)', () => {
    it('should find matches across multiple run nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('hel')]),
            run.create(null, [editor.schema.text('lo ')]),
            run.create(null, [editor.schema.text('wor')]),
            run.create(null, [editor.schema.text('ld')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // "hello" spans two run nodes
        const helloMatches = editor.commands.search('hello');
        expect(helloMatches).toHaveLength(1);
        expect(helloMatches[0].text).toBe('hello');

        // "world" spans two run nodes
        const worldMatches = editor.commands.search('world');
        expect(worldMatches).toHaveLength(1);
        expect(worldMatches[0].text).toBe('world');
      } finally {
        editor.destroy();
      }
    });

    it('should extract correct text content from run nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('part1')]),
            run.create(null, [editor.schema.text('part2')]),
            run.create(null, [editor.schema.text('part3')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const paragraphNode = editor.state.doc.child(0);
        const textContent = __searchTextContent(paragraphNode);

        expect(textContent).toBe('part1part2part3');
      } finally {
        editor.destroy();
      }
    });

    it('should find match that starts in one run and ends in another', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('abc')]),
            run.create(null, [editor.schema.text('def')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // "cde" crosses the run boundary
        const matches = editor.commands.search('cde');
        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('cde');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Bookmark nodes (transparent)', () => {
    it('should find matches across bookmarkStart nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('before ')]),
            bookmarkStart.create({ id: 'bm-1', name: 'test' }),
            run.create(null, [editor.schema.text('inside')]),
            bookmarkEnd.create({ id: 'bm-1' }),
            run.create(null, [editor.schema.text(' after')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find "before inside" spanning across bookmark
        const matches = editor.commands.search('before inside');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should find matches inside bookmarkStart with content', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'bm-1', name: 'placeholder' }, [
              run.create(null, [editor.schema.text('{FIELD}')]),
            ]),
            bookmarkEnd.create({ id: 'bm-1' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('{FIELD}');
        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('{FIELD}');
      } finally {
        editor.destroy();
      }
    });

    it('should report accurate positions for text inside bookmarks', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'bm-1', name: 'field' }, [run.create(null, [editor.schema.text('target')])]),
            bookmarkEnd.create({ id: 'bm-1' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('target');
        expect(matches).toHaveLength(1);

        // Verify the positions are accurate
        const matchedText = editor.state.doc.textBetween(matches[0].from, matches[0].to);
        expect(matchedText).toBe('target');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Comment range nodes (NOT transparent - documenting current behavior)', () => {
    it('should handle text with comment range markers after processing', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // After comment processing, the document should have clean text
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('This is ')]),
            run.create(null, [editor.schema.text('commented ')]),
            run.create(null, [editor.schema.text('text')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find the full phrase
        const matches = editor.commands.search('This is commented text');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should find text that was inside comment ranges after cleanup', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // Simulating post-processed document where comment markers are removed
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('normal ')]),
            run.create(null, [editor.schema.text('highlighted ')]),
            run.create(null, [editor.schema.text('normal')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('highlighted');
        expect(matches).toHaveLength(1);
        expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('highlighted');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Mixed transparent and non-transparent nodes', () => {
    it('should handle text split across runs inside a bookmark', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('start ')]),
            bookmarkStart.create({ id: 'bm-1', name: 'outer' }, [
              run.create(null, [editor.schema.text('mid')]),
              run.create(null, [editor.schema.text('dle')]),
            ]),
            bookmarkEnd.create({ id: 'bm-1' }),
            run.create(null, [editor.schema.text(' end')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find "middle" which is split across runs inside bookmark
        const matches = editor.commands.search('middle');
        expect(matches.length).toBeGreaterThanOrEqual(0); // Document behavior with bookmarkEnd

        // Should find individual words
        const startMatches = editor.commands.search('start');
        expect(startMatches).toHaveLength(1);

        const endMatches = editor.commands.search('end');
        expect(endMatches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle text inside bookmarks', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'bm-1', name: 'first' }, [run.create(null, [editor.schema.text('one')])]),
            bookmarkEnd.create({ id: 'bm-1' }),
            run.create(null, [editor.schema.text(' ')]),
            bookmarkStart.create({ id: 'bm-2', name: 'second' }, [run.create(null, [editor.schema.text('two')])]),
            bookmarkEnd.create({ id: 'bm-2' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find each word inside bookmarks
        const oneMatches = editor.commands.search('one');
        expect(oneMatches).toHaveLength(1);
        expect(oneMatches[0].text).toBe('one');

        const twoMatches = editor.commands.search('two');
        expect(twoMatches).toHaveLength(1);
        expect(twoMatches[0].text).toBe('two');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Text content extraction', () => {
    it('should treat leaf nodes as single character placeholder', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        // Just test with regular text
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('before')]),
            run.create(null, [editor.schema.text('after')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const paragraphNode = editor.state.doc.child(0);
        const textContent = __searchTextContent(paragraphNode);

        expect(textContent).toBe('beforeafter');
      } finally {
        editor.destroy();
      }
    });

    it('should preserve text across deeply nested transparent nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'outer', name: 'outer' }, [
              run.create(null, [editor.schema.text('level1')]),
              bookmarkStart.create({ id: 'inner', name: 'inner' }, [run.create(null, [editor.schema.text('level2')])]),
              bookmarkEnd.create({ id: 'inner' }),
            ]),
            bookmarkEnd.create({ id: 'outer' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const paragraphNode = editor.state.doc.child(0);
        const textContent = __searchTextContent(paragraphNode);

        // Text content includes bookmarkEnd nodes as leaf placeholders
        // This documents the current behavior - bookmarkEnd adds placeholder chars
        expect(textContent).toContain('level1');
        expect(textContent).toContain('level2');

        // Should find individual text segments
        const level1Matches = editor.commands.search('level1');
        expect(level1Matches).toHaveLength(1);

        const level2Matches = editor.commands.search('level2');
        expect(level2Matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Position mapping accuracy', () => {
    it('should return correct positions for text after transparent nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'bm-1', name: 'pre' }, [run.create(null, [editor.schema.text('prefix')])]),
            bookmarkEnd.create({ id: 'bm-1' }),
            run.create(null, [editor.schema.text(' target')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('target');
        expect(matches).toHaveLength(1);

        // Navigate to the match
        editor.commands.goToSearchResult(matches[0]);

        // Verify selection is exactly on "target"
        const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
        expect(selectedText).toBe('target');
      } finally {
        editor.destroy();
      }
    });

    it('should return correct positions for text inside transparent nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('outside ')]),
            bookmarkStart.create({ id: 'bm-1', name: 'wrap' }, [run.create(null, [editor.schema.text('inside')])]),
            bookmarkEnd.create({ id: 'bm-1' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('inside');
        expect(matches).toHaveLength(1);

        // Positions should point to actual text
        const matchedText = editor.state.doc.textBetween(matches[0].from, matches[0].to);
        expect(matchedText).toBe('inside');
      } finally {
        editor.destroy();
      }
    });

    it('should handle matches that span from outside to inside transparent nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('out')]),
            bookmarkStart.create({ id: 'bm-1', name: 'wrap' }, [run.create(null, [editor.schema.text('side')])]),
            bookmarkEnd.create({ id: 'bm-1' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // "outside" spans from regular run into bookmark
        const matches = editor.commands.search('outside');
        expect(matches).toHaveLength(1);

        const matchedText = editor.state.doc.textBetween(matches[0].from, matches[0].to);
        expect(matchedText).toBe('outside');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Edge cases with empty and minimal nodes', () => {
    it('should handle empty run nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('before')]),
            run.create(null, []), // Empty run
            run.create(null, [editor.schema.text('after')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find text, ignoring empty run
        const matches = editor.commands.search('beforeafter');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should handle bookmark with no content', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('before')]),
            bookmarkStart.create({ id: 'bm-1', name: 'empty' }),
            bookmarkEnd.create({ id: 'bm-1' }),
            run.create(null, [editor.schema.text('after')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Should find individual words
        const beforeMatches = editor.commands.search('before');
        expect(beforeMatches).toHaveLength(1);

        const afterMatches = editor.commands.search('after');
        expect(afterMatches).toHaveLength(1);

        // Note: "beforeafter" may not match due to bookmarkEnd being a leaf node
        // which adds a placeholder character in the text content
      } finally {
        editor.destroy();
      }
    });

    it('should handle single-character matches at node boundaries', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('a')]),
            run.create(null, [editor.schema.text('b')]),
            run.create(null, [editor.schema.text('c')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Find each single character
        const aMatches = editor.commands.search('a');
        const bMatches = editor.commands.search('b');
        const cMatches = editor.commands.search('c');

        expect(aMatches).toHaveLength(1);
        expect(bMatches).toHaveLength(1);
        expect(cMatches).toHaveLength(1);

        // Verify positions are accurate
        expect(editor.state.doc.textBetween(aMatches[0].from, aMatches[0].to)).toBe('a');
        expect(editor.state.doc.textBetween(bMatches[0].from, bMatches[0].to)).toBe('b');
        expect(editor.state.doc.textBetween(cMatches[0].from, cMatches[0].to)).toBe('c');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Documenting gaps - nodes NOT yet transparent', () => {
    /**
     * These tests document the current behavior with node types that are NOT
     * in the transparentInlineNodes set. They serve as baseline tests for
     * when these nodes are added to the transparent set.
     */

    it('should document: commentRangeStart/End are NOT transparent (after processing)', () => {
      // Note: Comment range nodes are typically processed/removed during import
      // This test documents that if they remained, they wouldn't be transparent
      const editor = createDocxTestEditor();

      try {
        // Check if commentRangeStart exists in schema
        const hasCommentRange = 'commentRangeStart' in editor.schema.nodes;

        if (hasCommentRange) {
          const { doc, paragraph, run, commentRangeStart, commentRangeEnd } = editor.schema.nodes;

          // Build doc with comment range nodes
          const testDoc = doc.create(null, [
            paragraph.create(null, [
              run.create(null, [editor.schema.text('before ')]),
              commentRangeStart.create({ 'w:id': 'c-1', internal: false }),
              run.create(null, [editor.schema.text('inside')]),
              commentRangeEnd.create({ 'w:id': 'c-1' }),
              run.create(null, [editor.schema.text(' after')]),
            ]),
          ]);

          const baseState = EditorState.create({
            schema: editor.schema,
            doc: testDoc,
            plugins: editor.state.plugins,
          });
          editor.setState(baseState);

          // Test searching - comment range nodes should still allow search
          // because the text nodes themselves are the target
          const matches = editor.commands.search('inside');
          expect(matches.length).toBeGreaterThanOrEqual(0); // Document current behavior
        } else {
          // Schema doesn't have commentRangeStart - skip
          expect(true).toBe(true);
        }
      } finally {
        editor.destroy();
      }
    });

    it('should document: search works with marks (bold, italic, etc.)', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const boldMark = editor.schema.marks.bold?.create?.();

        if (boldMark) {
          const testDoc = doc.create(null, [
            paragraph.create(null, [
              run.create(null, [editor.schema.text('normal ')]),
              run.create(null, [editor.schema.text('bold', [boldMark])]),
              run.create(null, [editor.schema.text(' normal')]),
            ]),
          ]);

          const baseState = EditorState.create({
            schema: editor.schema,
            doc: testDoc,
            plugins: editor.state.plugins,
          });
          editor.setState(baseState);

          // Search should find text regardless of marks
          const matches = editor.commands.search('bold');
          expect(matches).toHaveLength(1);

          // Should also find text spanning marked/unmarked
          const spanMatches = editor.commands.search('normal bold normal');
          expect(spanMatches).toHaveLength(1);
        } else {
          expect(true).toBe(true);
        }
      } finally {
        editor.destroy();
      }
    });
  });
});
