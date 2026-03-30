import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { getCustomSearchDecorations } from '@extensions/search/search.js';
import { EditorState } from 'prosemirror-state';

/**
 * Test suite for the search highlight control feature.
 * Tests the ability to search for matches without applying CSS highlight classes
 * via the { highlight: false } option.
 */
describe('Search highlight control', () => {
  describe('Basic highlight control', () => {
    it('should highlight matches by default when no options provided', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test string with test words')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');

        expect(matches).toHaveLength(2);

        // Verify decorations have CSS classes for highlighting
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(2);

        decorations.forEach((deco) => {
          expect(deco.type.attrs).toBeDefined();
          expect(deco.type.attrs.class).toBeDefined();
          expect(deco.type.attrs.class).toMatch(/ProseMirror-search-match|ProseMirror-active-search-match/);
        });
      } finally {
        editor.destroy();
      }
    });

    it('should highlight matches when highlight option is explicitly true', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test string with test words')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { highlight: true });

        expect(matches).toHaveLength(2);

        // Verify decorations have CSS classes for highlighting
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(2);

        decorations.forEach((deco) => {
          expect(deco.type.attrs).toBeDefined();
          expect(deco.type.attrs.class).toBeDefined();
          expect(deco.type.attrs.class).toMatch(/ProseMirror-search-match|ProseMirror-active-search-match/);
        });
      } finally {
        editor.destroy();
      }
    });

    it('should not add CSS classes when highlight option is false', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test string with test words')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { highlight: false });

        expect(matches).toHaveLength(2);

        // Verify decorations exist but have no CSS classes
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(2);

        decorations.forEach((deco) => {
          expect(deco.type.attrs).toBeDefined();
          expect(deco.type.attrs.class).toBeUndefined();
          // Should only have id attribute (for tracking), no class
          expect(deco.type.attrs.id).toBeDefined();
        });
      } finally {
        editor.destroy();
      }
    });

    it('should still return match positions when highlight is false', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test string with test words')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { highlight: false });

        expect(matches).toHaveLength(2);
        expect(matches[0]).toHaveProperty('from');
        expect(matches[0]).toHaveProperty('to');
        expect(matches[0]).toHaveProperty('text', 'test');
        expect(matches[0]).toHaveProperty('id');
        expect(matches[1]).toHaveProperty('text', 'test');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Regex search with highlight control', () => {
    it('should find regex matches without highlighting when highlight is false', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Email: test@example.com')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search(/\w+@\w+\.\w+/i, { highlight: false });

        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('test@example.com');

        // Verify no CSS classes on decorations
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(1);
        expect(decorations[0].type.attrs.class).toBeUndefined();
      } finally {
        editor.destroy();
      }
    });

    it('should highlight regex matches when highlight is true', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Email: test@example.com')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search(/\w+@\w+\.\w+/i, { highlight: true });

        expect(matches).toHaveLength(1);

        // Verify CSS classes are present
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(1);
        expect(decorations[0].type.attrs.class).toBeDefined();
        expect(decorations[0].type.attrs.class).toMatch(/ProseMirror-search-match/);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Complex document structures with highlight control', () => {
    it('should handle highlight control with multiple run nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            run.create(null, [editor.schema.text('test ')]),
            run.create(null, [editor.schema.text('string ')]),
            run.create(null, [editor.schema.text('with ')]),
            run.create(null, [editor.schema.text('test ')]),
            run.create(null, [editor.schema.text('words')]),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { highlight: false });

        expect(matches).toHaveLength(2);

        // Verify decorations exist without CSS classes
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(2);
        decorations.forEach((deco) => {
          expect(deco.type.attrs.class).toBeUndefined();
        });
      } finally {
        editor.destroy();
      }
    });

    it('should handle highlight control with bookmark nodes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run, bookmarkStart, bookmarkEnd } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [
            bookmarkStart.create({ id: 'bm-1', name: 'bookmark' }),
            run.create(null, [editor.schema.text('test content')]),
            bookmarkEnd.create({ id: 'bm-1' }),
          ]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { highlight: false });

        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('test');

        // Verify no CSS classes
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations).toHaveLength(1);
        expect(decorations[0].type.attrs.class).toBeUndefined();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Edge cases and validation', () => {
    it('should default to highlight: true when options is null', () => {
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

        const matches = editor.commands.search('test', null);

        expect(matches).toHaveLength(1);

        // Should highlight since null should default to true
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();
      } finally {
        editor.destroy();
      }
    });

    it('should default to highlight: true when options is undefined', () => {
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

        const matches = editor.commands.search('test', undefined);

        expect(matches).toHaveLength(1);

        // Should highlight since undefined should default to true
        const highlights = getCustomSearchDecorations(editor.view.state);
        const decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();
      } finally {
        editor.destroy();
      }
    });

    it('should throw error when options is a string', () => {
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

        expect(() => {
          editor.commands.search('test', 'invalid');
        }).toThrow(TypeError);
        expect(() => {
          editor.commands.search('test', 'invalid');
        }).toThrow('Search options must be an object');
      } finally {
        editor.destroy();
      }
    });

    it('should throw error when options is a number', () => {
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

        expect(() => {
          editor.commands.search('test', 123);
        }).toThrow(TypeError);
        expect(() => {
          editor.commands.search('test', 123);
        }).toThrow('Search options must be an object');
      } finally {
        editor.destroy();
      }
    });

    it('should throw error when options is an array', () => {
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

        expect(() => {
          editor.commands.search('test', []);
        }).toThrow(TypeError);
        expect(() => {
          editor.commands.search('test', []);
        }).toThrow('Search options must be an object');
      } finally {
        editor.destroy();
      }
    });

    it('should default to highlight: true when highlight property is not a boolean', () => {
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

        // Test with string value
        const matches1 = editor.commands.search('test', { highlight: 'yes' });
        expect(matches1).toHaveLength(1);
        let highlights = getCustomSearchDecorations(editor.view.state);
        let decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();

        // Test with number value
        const matches2 = editor.commands.search('test', { highlight: 1 });
        expect(matches2).toHaveLength(1);
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();

        // Test with null value
        const matches3 = editor.commands.search('test', { highlight: null });
        expect(matches3).toHaveLength(1);
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('State persistence', () => {
    it('should preserve highlight setting across document changes', () => {
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

        // Search without highlighting
        editor.commands.search('test', { highlight: false });

        // Verify no highlighting
        let highlights = getCustomSearchDecorations(editor.view.state);
        let decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeUndefined();

        // Make a document change (insert text)
        const tr = editor.view.state.tr.insertText(' more', editor.view.state.doc.content.size - 1);
        editor.view.dispatch(tr);

        // Verify highlighting is still disabled after document change
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        if (decorations.length > 0) {
          decorations.forEach((deco) => {
            expect(deco.type.attrs.class).toBeUndefined();
          });
        }
      } finally {
        editor.destroy();
      }
    });

    it('should preserve highlight setting across selection changes', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test content with test words')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Search without highlighting
        editor.commands.search('test', { highlight: false });

        // Verify no highlighting
        let highlights = getCustomSearchDecorations(editor.view.state);
        let decorations = highlights.find();
        expect(decorations).toHaveLength(2);
        expect(decorations[0].type.attrs.class).toBeUndefined();

        // Change selection
        const tr = editor.view.state.tr.setSelection(
          editor.view.state.selection.constructor.create(editor.view.state.doc, 5, 10),
        );
        editor.view.dispatch(tr);

        // Verify highlighting is still disabled after selection change
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        expect(decorations).toHaveLength(2);
        decorations.forEach((deco) => {
          expect(deco.type.attrs.class).toBeUndefined();
        });
      } finally {
        editor.destroy();
      }
    });

    it('should allow switching from non-highlighted to highlighted search', () => {
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

        // First search without highlighting
        editor.commands.search('test', { highlight: false });
        let highlights = getCustomSearchDecorations(editor.view.state);
        let decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeUndefined();

        // Second search with highlighting
        editor.commands.search('test', { highlight: true });
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();
        expect(decorations[0].type.attrs.class).toMatch(/ProseMirror-search-match/);
      } finally {
        editor.destroy();
      }
    });

    it('should allow switching from highlighted to non-highlighted search', () => {
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

        // First search with highlighting
        editor.commands.search('test', { highlight: true });
        let highlights = getCustomSearchDecorations(editor.view.state);
        let decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeDefined();

        // Second search without highlighting
        editor.commands.search('test', { highlight: false });
        highlights = getCustomSearchDecorations(editor.view.state);
        decorations = highlights.find();
        expect(decorations[0].type.attrs.class).toBeUndefined();
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Empty and no-match cases', () => {
    it('should handle empty search results with highlight: false', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('no matches here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('xyz', { highlight: false });

        expect(matches).toHaveLength(0);

        const highlights = getCustomSearchDecorations(editor.view.state);
        // When there are no matches, decorations may be null or empty
        const decorations = highlights ? highlights.find() : [];
        expect(decorations).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });

    it('should handle empty document with highlight: false', () => {
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

        const matches = editor.commands.search('test', { highlight: false });

        expect(matches).toHaveLength(0);

        const highlights = getCustomSearchDecorations(editor.view.state);
        // When there are no matches, decorations may be null or empty
        const decorations = highlights ? highlights.find() : [];
        expect(decorations).toHaveLength(0);
      } finally {
        editor.destroy();
      }
    });
  });
});
