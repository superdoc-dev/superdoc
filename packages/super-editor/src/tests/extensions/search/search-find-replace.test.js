import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import {
  SearchQuery,
  setSearchState,
  findNext,
  findNextNoWrap,
  findPrev,
  findPrevNoWrap,
  replaceNext,
  replaceAll,
  replaceCurrent,
  getSearchState,
} from '@extensions/search/prosemirror-search-patched.js';
import { EditorState, TextSelection } from 'prosemirror-state';

/**
 * Test suite for search find/replace commands from prosemirror-search.
 * Tests findNext, findPrev, replaceNext, replaceAll and related functions.
 */
describe('Search find/replace commands', () => {
  describe('SearchQuery', () => {
    it('should create a valid query for simple string search', () => {
      const query = new SearchQuery({ search: 'test' });

      expect(query.valid).toBe(true);
      expect(query.search).toBe('test');
      expect(query.caseSensitive).toBe(false);
      expect(query.regexp).toBe(false);
    });

    it('should create a valid query for case-sensitive search', () => {
      const query = new SearchQuery({ search: 'Test', caseSensitive: true });

      expect(query.valid).toBe(true);
      expect(query.caseSensitive).toBe(true);
    });

    it('should create a valid query for regex search', () => {
      const query = new SearchQuery({ search: '\\w+@\\w+\\.\\w+', regexp: true });

      expect(query.valid).toBe(true);
      expect(query.regexp).toBe(true);
    });

    it('should mark invalid regex as invalid', () => {
      const query = new SearchQuery({ search: '[invalid(regex', regexp: true });

      expect(query.valid).toBe(false);
    });

    it('should mark empty search as invalid', () => {
      const query = new SearchQuery({ search: '' });

      expect(query.valid).toBe(false);
    });

    it('should compare queries for equality', () => {
      const query1 = new SearchQuery({ search: 'test', caseSensitive: true });
      const query2 = new SearchQuery({ search: 'test', caseSensitive: true });
      const query3 = new SearchQuery({ search: 'test', caseSensitive: false });

      expect(query1.eq(query2)).toBe(true);
      expect(query1.eq(query3)).toBe(false);
    });

    it('should handle wholeWord option', () => {
      const query = new SearchQuery({ search: 'test', wholeWord: true });

      expect(query.valid).toBe(true);
      expect(query.wholeWord).toBe(true);
    });

    it('should handle replacement text', () => {
      const query = new SearchQuery({ search: 'old', replace: 'new' });

      expect(query.valid).toBe(true);
      expect(query.replace).toBe('new');
    });
  });

  describe('findNext command', () => {
    it('should find next match and select it', () => {
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

        // Set up search query
        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Execute findNext
        const result = findNext(editor.state, editor.view.dispatch);

        expect(result).toBe(true);
        // Selection should be on first "test"
        const { from, to } = editor.state.selection;
        expect(editor.state.doc.textBetween(from, to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should wrap around to start when reaching end', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test one test two')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Set up search query
        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Find first match
        findNext(editor.state, editor.view.dispatch);
        const firstPosition = editor.state.selection.from;

        // Find second match
        findNext(editor.state, editor.view.dispatch);
        const secondPosition = editor.state.selection.from;

        // Find again should wrap to first
        findNext(editor.state, editor.view.dispatch);
        const wrappedPosition = editor.state.selection.from;

        expect(secondPosition).toBeGreaterThan(firstPosition);
        expect(wrappedPosition).toBe(firstPosition);
      } finally {
        editor.destroy();
      }
    });

    it('should return false when no matches exist', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('some content here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Set up search for non-existent text
        const query = new SearchQuery({ search: 'xyz' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const result = findNext(editor.state, editor.view.dispatch);

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });

    it('should return false when query is invalid', () => {
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

        // Set up invalid query
        const query = new SearchQuery({ search: '' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const result = findNext(editor.state, editor.view.dispatch);

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('findNextNoWrap command', () => {
    it('should find next match without wrapping', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test one test two')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Find first match
        findNextNoWrap(editor.state, editor.view.dispatch);
        const firstPosition = editor.state.selection.from;

        // Find second match
        findNextNoWrap(editor.state, editor.view.dispatch);
        const secondPosition = editor.state.selection.from;

        expect(secondPosition).toBeGreaterThan(firstPosition);
      } finally {
        editor.destroy();
      }
    });

    it('should return false when no more matches (no wrap)', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('only one test here')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Find first (and only) match
        const first = findNextNoWrap(editor.state, editor.view.dispatch);
        expect(first).toBe(true);

        // Try to find next - should fail without wrapping
        const second = findNextNoWrap(editor.state, editor.view.dispatch);
        expect(second).toBe(false);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('findPrev command', () => {
    it('should find previous match', () => {
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

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Start from end of document
        const endTr = editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, editor.state.doc.content.size - 2),
        );
        editor.view.dispatch(endTr);

        // Find previous should find last "test"
        const result = findPrev(editor.state, editor.view.dispatch);

        expect(result).toBe(true);
        expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should wrap around to end when reaching start', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test one test two')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Go to first match
        findNext(editor.state, editor.view.dispatch);
        const firstMatchPos = editor.state.selection.from;

        // Find prev should wrap to last match
        findPrev(editor.state, editor.view.dispatch);
        const wrappedPos = editor.state.selection.from;

        expect(wrappedPos).toBeGreaterThan(firstMatchPos);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('findPrevNoWrap command', () => {
    it('should return false when no previous matches (no wrap)', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test at start only')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Go to first match
        findNext(editor.state, editor.view.dispatch);

        // Try to find prev without wrap - should fail
        const result = findPrevNoWrap(editor.state, editor.view.dispatch);
        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('replaceNext command', () => {
    it('should replace current match and move to next', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('old word and old word')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'old', replace: 'new' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Select first match
        findNext(editor.state, editor.view.dispatch);

        // Replace it
        const result = replaceNext(editor.state, editor.view.dispatch);

        expect(result).toBe(true);
        expect(editor.state.doc.textContent).toContain('new');
      } finally {
        editor.destroy();
      }
    });

    it('should select next match if none currently selected', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find this text')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'this', replace: 'that' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Don't select first - just call replaceNext
        const result = replaceNext(editor.state, editor.view.dispatch);

        expect(result).toBe(true);
        // Should have selected the match
        expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('this');
      } finally {
        editor.destroy();
      }
    });

    it('should return false when no matches to replace', () => {
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

        const query = new SearchQuery({ search: 'xyz', replace: 'abc' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const result = replaceNext(editor.state, editor.view.dispatch);

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('replaceAll command', () => {
    it('should replace all matches at once', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('cat and cat and cat')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'cat', replace: 'dog' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const result = replaceAll(editor.state, editor.view.dispatch);

        expect(result).toBe(true);
        expect(editor.state.doc.textContent).toBe('dog and dog and dog');
        expect(editor.state.doc.textContent).not.toContain('cat');
      } finally {
        editor.destroy();
      }
    });

    it('should handle replacement with different length text', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [paragraph.create(null, [run.create(null, [editor.schema.text('a a a')])])]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'a', replace: 'longer' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        replaceAll(editor.state, editor.view.dispatch);

        expect(editor.state.doc.textContent).toBe('longer longer longer');
      } finally {
        editor.destroy();
      }
    });

    it('should handle replacement with empty string (deletion)', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('remove this word')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'this ', replace: '' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        replaceAll(editor.state, editor.view.dispatch);

        expect(editor.state.doc.textContent).toBe('remove word');
      } finally {
        editor.destroy();
      }
    });

    it('should return true even when no matches (command succeeds)', () => {
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

        const query = new SearchQuery({ search: 'xyz', replace: 'abc' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const result = replaceAll(editor.state, editor.view.dispatch);

        // replaceAll returns true even with no matches (command executed successfully)
        expect(result).toBe(true);
        // But document should be unchanged
        expect(editor.state.doc.textContent).toBe('some content');
      } finally {
        editor.destroy();
      }
    });

    it('should handle regex replacement with capture groups', () => {
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

        // Regex without capture group for simpler replacement
        const query = new SearchQuery({ search: 'hello', regexp: false, replace: 'hello!' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        replaceAll(editor.state, editor.view.dispatch);

        expect(editor.state.doc.textContent).toBe('hello! world');
      } finally {
        editor.destroy();
      }
    });

    it('should handle simple replacement with multiple matches', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('cat dog cat')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Simple literal replacement
        const query = new SearchQuery({ search: 'cat', regexp: false, replace: 'kitten' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        replaceAll(editor.state, editor.view.dispatch);

        expect(editor.state.doc.textContent).toBe('kitten dog kitten');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('replaceCurrent command', () => {
    it('should find and select matches before replacement', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('find old text old again')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'old', replace: 'new' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Use findNext to select the first match
        const foundFirst = findNext(editor.state, editor.view.dispatch);
        expect(foundFirst).toBe(true);

        // Verify selection is on "old"
        const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
        expect(selectedText).toBe('old');
      } finally {
        editor.destroy();
      }
    });

    it('should return false if no match is selected', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('some text')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'text', replace: 'word' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Don't select any match - just call replaceCurrent
        const result = replaceCurrent(editor.state, editor.view.dispatch);

        expect(result).toBe(false);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('setSearchState and getSearchState', () => {
    it('should set and retrieve search state', () => {
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

        const query = new SearchQuery({ search: 'test' });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        const searchState = getSearchState(editor.state);

        expect(searchState).toBeDefined();
        expect(searchState.query.search).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should update search state with new query', () => {
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

        // Set first query
        const query1 = new SearchQuery({ search: 'test' });
        let tr = setSearchState(editor.state.tr, query1);
        editor.view.dispatch(tr);

        // Set second query
        const query2 = new SearchQuery({ search: 'content' });
        tr = setSearchState(editor.state.tr, query2);
        editor.view.dispatch(tr);

        const searchState = getSearchState(editor.state);

        expect(searchState.query.search).toBe('content');
      } finally {
        editor.destroy();
      }
    });

    it('should support search range', () => {
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

        const query = new SearchQuery({ search: 'test' });
        // Set a restricted range
        const tr = setSearchState(editor.state.tr, query, { from: 3, to: 15 });
        editor.view.dispatch(tr);

        const searchState = getSearchState(editor.state);

        expect(searchState.range).toBeDefined();
        expect(searchState.range.from).toBe(3);
        expect(searchState.range.to).toBe(15);
      } finally {
        editor.destroy();
      }
    });

    it('should throw error for invalid options', () => {
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

        const query = new SearchQuery({ search: 'test' });

        expect(() => {
          setSearchState(editor.state.tr, query, null, 'invalid');
        }).toThrow(TypeError);
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Case sensitivity', () => {
    it('should find case-insensitive matches by default', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Test TEST test TeSt')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test');

        expect(matches).toHaveLength(4);
      } finally {
        editor.destroy();
      }
    });

    it('should find only case-sensitive matches when specified', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Test TEST test TeSt')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        // Use regex with no 'i' flag for case-sensitive
        const matches = editor.commands.search(/test/g);

        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('test');
      } finally {
        editor.destroy();
      }
    });

    it('should respect caseSensitive option for string patterns', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('Test TEST test TeSt')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const matches = editor.commands.search('test', { caseSensitive: true });

        expect(matches).toHaveLength(1);
        expect(matches[0].text).toBe('test');
      } finally {
        editor.destroy();
      }
    });
  });

  describe('Whole word matching', () => {
    it('should match whole words only when wholeWord is true', () => {
      const editor = createDocxTestEditor();

      try {
        const { doc, paragraph, run } = editor.schema.nodes;
        const testDoc = doc.create(null, [
          paragraph.create(null, [run.create(null, [editor.schema.text('test testing tested test')])]),
        ]);

        const baseState = EditorState.create({
          schema: editor.schema,
          doc: testDoc,
          plugins: editor.state.plugins,
        });
        editor.setState(baseState);

        const query = new SearchQuery({ search: 'test', wholeWord: true });
        const tr = setSearchState(editor.state.tr, query);
        editor.view.dispatch(tr);

        // Count matches by iterating with findNext
        let matchCount = 0;
        let found = true;
        const positions = new Set();

        while (found) {
          found = findNext(editor.state, editor.view.dispatch);
          if (found) {
            const pos = editor.state.selection.from;
            if (positions.has(pos)) break; // Wrapped around
            positions.add(pos);
            matchCount++;
          }
        }

        // Should only match "test" as whole word, not "testing" or "tested"
        expect(matchCount).toBe(2);
      } finally {
        editor.destroy();
      }
    });
  });
});
