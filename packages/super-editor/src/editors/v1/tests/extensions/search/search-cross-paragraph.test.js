import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { EditorState } from 'prosemirror-state';
import { SearchIndex } from '@extensions/search/SearchIndex.js';

/**
 * Test suite for cross-paragraph search functionality.
 * Tests the enhanced search that matches across paragraph boundaries.
 */
describe('Cross-paragraph search', () => {
  describe('SearchIndex', () => {
    describe('flattening', () => {
      it('should flatten a simple document with multiple paragraphs', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('First paragraph')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('Second paragraph')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          // Should have newline separator between paragraphs
          expect(index.text).toContain('First paragraph');
          expect(index.text).toContain('Second paragraph');
          expect(index.text).toContain('\n');
          expect(index.valid).toBe(true);
        } finally {
          editor.destroy();
        }
      });

      it('should produce segments that align with textBetween output', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('Hello')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('World')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          // The text length should match the last segment's offsetEnd
          const lastSegment = index.segments[index.segments.length - 1];
          expect(lastSegment.offsetEnd).toBe(index.text.length);
        } finally {
          editor.destroy();
        }
      });

      it('should mark the index as stale after invalidation', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('Some text')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          expect(index.valid).toBe(true);

          index.invalidate();

          expect(index.valid).toBe(false);
        } finally {
          editor.destroy();
        }
      });
    });

    describe('searching', () => {
      it('should find matches within a single paragraph', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('test one test two')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('test');

          expect(matches).toHaveLength(2);
          expect(matches[0].text).toBe('test');
          expect(matches[1].text).toBe('test');
        } finally {
          editor.destroy();
        }
      });

      it('should find matches across paragraph boundaries', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('end of first')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('start of second')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          // Search with whitespace-flexible pattern
          const matches = index.search('first start');

          expect(matches.length).toBeGreaterThan(0);
        } finally {
          editor.destroy();
        }
      });

      it('should find matches across paragraph boundaries without whitespace in query', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('February 7, 2023')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('Via Electronic Mail')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('2023Via');

          expect(matches).toHaveLength(1);
          expect(matches[0].text).toBe('2023\nVia');
        } finally {
          editor.destroy();
        }
      });

      it('should handle case-insensitive search', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('Test TEST test')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('test', { caseSensitive: false });

          expect(matches).toHaveLength(3);
        } finally {
          editor.destroy();
        }
      });

      it('should handle case-sensitive search', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('Test TEST test')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('test', { caseSensitive: true });

          expect(matches).toHaveLength(1);
        } finally {
          editor.destroy();
        }
      });

      it('should respect maxMatches limit', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('a a a a a a a a a a')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('a', { maxMatches: 3 });

          expect(matches).toHaveLength(3);
        } finally {
          editor.destroy();
        }
      });

      it('should handle regex search', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('cat bat rat')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search(/[cbr]at/g);

          expect(matches).toHaveLength(3);
        } finally {
          editor.destroy();
        }
      });
    });

    describe('toFlexiblePattern', () => {
      it('should generate pattern with block separators between characters', () => {
        const pattern = SearchIndex.toFlexiblePattern('abc');
        expect(pattern).toBe('a(?:\\n)*b(?:\\n)*c');
      });

      it('should handle multi-word input with whitespace between words', () => {
        const pattern = SearchIndex.toFlexiblePattern('ab cd');
        expect(pattern).toBe('a(?:\\n)*b[\\s\\u00a0]+c(?:\\n)*d');
      });

      it('should preserve leading whitespace in pattern', () => {
        const pattern = SearchIndex.toFlexiblePattern(' abc');
        expect(pattern).toBe('[\\s\\u00a0]+a(?:\\n)*b(?:\\n)*c');
      });

      it('should preserve trailing whitespace in pattern', () => {
        const pattern = SearchIndex.toFlexiblePattern('abc ');
        expect(pattern).toBe('a(?:\\n)*b(?:\\n)*c[\\s\\u00a0]+');
      });

      it('should return empty string for empty input', () => {
        const pattern = SearchIndex.toFlexiblePattern('');
        expect(pattern).toBe('');
      });

      it('should return whitespace pattern for whitespace-only input', () => {
        const pattern = SearchIndex.toFlexiblePattern('   ');
        expect(pattern).toBe('[\\s\\u00a0]+');
      });

      it('should match across multiple consecutive block separators', () => {
        const pattern = SearchIndex.toFlexiblePattern('ab');
        const regex = new RegExp(pattern);
        expect(regex.test('a\n\n\nb')).toBe(true);
      });
    });

    describe('offset mapping', () => {
      it('should map single-paragraph match to correct doc positions', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('hello world')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('world');
          expect(matches).toHaveLength(1);

          const ranges = index.offsetRangeToDocRanges(matches[0].start, matches[0].end);
          expect(ranges).toHaveLength(1);

          const matchedText = testDoc.textBetween(ranges[0].from, ranges[0].to);
          expect(matchedText).toBe('world');
        } finally {
          editor.destroy();
        }
      });

      it('should map cross-paragraph match to multiple doc ranges', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('end')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('start')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('end start');
          expect(matches.length).toBeGreaterThan(0);

          const ranges = index.offsetRangeToDocRanges(matches[0].start, matches[0].end);
          // Should have 2 ranges (one for each paragraph's text)
          expect(ranges).toHaveLength(2);
        } finally {
          editor.destroy();
        }
      });

      it('should map cross-paragraph match without whitespace to multiple ranges', () => {
        const editor = createDocxTestEditor();

        try {
          const { doc, paragraph, run } = editor.schema.nodes;
          const testDoc = doc.create(null, [
            paragraph.create(null, [run.create(null, [editor.schema.text('February 7, 2023')])]),
            paragraph.create(null, [run.create(null, [editor.schema.text('Via Electronic Mail')])]),
          ]);

          const index = new SearchIndex();
          index.build(testDoc);

          const matches = index.search('2023Via');
          expect(matches.length).toBeGreaterThan(0);

          const ranges = index.offsetRangeToDocRanges(matches[0].start, matches[0].end);
          expect(ranges).toHaveLength(2);

          const combinedText = ranges.map((range) => testDoc.textBetween(range.from, range.to)).join('');
          expect(combinedText).toBe('2023Via');
        } finally {
          editor.destroy();
        }
      });
    });
  });

  describe('editor.commands.search cross-paragraph', () => {
    it('should find matches spanning multiple paragraphs', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('The quick brown')])]),
          paragraph.create(null, [run.create(null, [editor.schema.text('fox jumps over')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('brown fox');

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].ranges).toBeDefined();
        expect(matches[0].ranges.length).toBeGreaterThanOrEqual(1);
      } finally {
        editor.destroy();
      }
    });

    it('should include ranges array in match result', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('simple test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');

        expect(matches).toHaveLength(1);
        expect(matches[0].ranges).toBeDefined();
        expect(Array.isArray(matches[0].ranges)).toBe(true);
        expect(matches[0].ranges[0]).toHaveProperty('from');
        expect(matches[0].ranges[0]).toHaveProperty('to');
      } finally {
        editor.destroy();
      }
    });

    it('should include trackerIds array in match result', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('tracked test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');

        expect(matches).toHaveLength(1);
        expect(matches[0].trackerIds).toBeDefined();
        expect(Array.isArray(matches[0].trackerIds)).toBe(true);
      } finally {
        editor.destroy();
      }
    });

    it('should match with flexible whitespace', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('hello    world')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search with single space should match multiple spaces
        const matches = editor.commands.search('hello world');

        expect(matches.length).toBeGreaterThan(0);
      } finally {
        editor.destroy();
      }
    });

    it('should maintain backward compatibility with from/to properties', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('find me')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('find');

        expect(matches).toHaveLength(1);
        expect(typeof matches[0].from).toBe('number');
        expect(typeof matches[0].to).toBe('number');
        expect(matches[0].to).toBeGreaterThan(matches[0].from);
      } finally {
        editor.destroy();
      }
    });

    it('should work with regex patterns', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('cat bat rat')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search(/[cbr]at/gi);

        expect(matches).toHaveLength(3);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('lazy index rebuild', () => {
    it('should rebuild index after document changes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('original text')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // First search
        let matches = editor.commands.search('original');
        expect(matches).toHaveLength(1);

        // Modify the document
        const tr = editor.state.tr.insertText(' modified', 14);
        editor.view.dispatch(tr);

        // Search should find new text
        matches = editor.commands.search('modified');
        expect(matches).toHaveLength(1);
      } finally {
        editor.destroy();
      }
    });

    it('should not search stale content after edit', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('delete me')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // First search finds it
        let matches = editor.commands.search('delete');
        expect(matches).toHaveLength(1);

        // Delete the word by replacing document content
        const newDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('keep me')])])]);
        const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, newDoc.content);
        editor.view.dispatch(tr);

        // Search should not find deleted text
        matches = editor.commands.search('delete');
        expect(matches).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });
  });
});
