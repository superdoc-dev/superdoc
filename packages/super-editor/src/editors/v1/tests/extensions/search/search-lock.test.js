import { describe, it, expect } from 'vitest';
import { createDocxTestEditor } from '../../helpers/editor-test-utils.js';
import { EditorState } from 'prosemirror-state';

/**
 * Test suite for replaceAllSearchMatches interaction with locked SDTs (IT-1202).
 * Matches inside contentLocked/sdtContentLocked structured content controls
 * must be skipped without blocking replacement of other matches.
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

function setupEditor() {
  const editor = createDocxTestEditor();
  mockScrollIntoView(editor);
  return editor;
}

function applyDoc(editor, doc) {
  const baseState = EditorState.create({
    schema: editor.schema,
    doc,
    plugins: editor.state.plugins,
  });
  editor.setState(baseState);
}

// The Search extension's config has no `name`, so its extensionStorage key
// defaults to 'extension' rather than 'Search' (a pre-existing quirk, not
// something introduced by this fix — use-find-replace.js's getSearchStorage
// works around the same thing by scanning for the storage shape instead of
// a fixed key). Do the same here rather than relying on a specific key.
function getSearchStorage(editor) {
  for (const value of Object.values(editor.extensionStorage)) {
    if (value && typeof value === 'object' && 'searchResults' in value) {
      return value;
    }
  }
  return null;
}

/** doc: paragraph[ run(beforeText)?, structuredContent(lockMode, run(sdtText)), run(afterText)? ] */
function buildDocWithSDT(
  editor,
  { lockMode, sdtText = 'hello world', beforeText = 'Before hello ', afterText = ' After' },
) {
  const { doc, paragraph, run, structuredContent } = editor.schema.nodes;
  const inner = run.create(null, [editor.schema.text(sdtText)]);
  const sdt = structuredContent.create({ id: 'sdt-1', lockMode }, [inner]);
  const children = [
    ...(beforeText ? [run.create(null, [editor.schema.text(beforeText)])] : []),
    sdt,
    ...(afterText ? [run.create(null, [editor.schema.text(afterText)])] : []),
  ];
  return doc.create(null, [paragraph.create(null, children)]);
}

describe('replaceAllSearchMatches — locked SDT handling (IT-1202)', () => {
  it('replaces all matches when nothing is locked (baseline)', () => {
    const editor = createDocxTestEditor();

    try {
      const { doc, paragraph, run } = editor.schema.nodes;
      const testDoc = doc.create(null, [
        paragraph.create(null, [run.create(null, [editor.schema.text('hello there, hello world')])]),
      ]);
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('hi');

      expect(result).toEqual({ replacedCount: 2, skippedCount: 0 });
      expect(editor.state.doc.textContent).toBe('hi there, hi world');
    } finally {
      editor.destroy();
    }
  });

  it('skips all matches when every match is inside a contentLocked SDT', () => {
    const editor = setupEditor();

    try {
      const testDoc = buildDocWithSDT(editor, {
        lockMode: 'contentLocked',
        sdtText: 'hello world',
        beforeText: '',
        afterText: '',
      });
      applyDoc(editor, testDoc);

      const originalText = editor.state.doc.textContent;
      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('hi');

      expect(result).toEqual({ replacedCount: 0, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe(originalText);
      // Session left populated with the remaining (skipped) match.
      expect(getSearchStorage(editor).searchResults).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it('replaces unlocked matches and skips locked ones (mixed — the core bug scenario)', () => {
    const editor = setupEditor();

    try {
      const testDoc = buildDocWithSDT(editor, {
        lockMode: 'contentLocked',
        sdtText: 'hello world',
        beforeText: 'Before hello ',
        afterText: ' hello After',
      });
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('hi');

      expect(result).toEqual({ replacedCount: 2, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe('Before hi hello world hi After');

      // Session refreshed, not cleared — the remaining locked match is tracked.
      const remaining = getSearchStorage(editor).searchResults;
      expect(remaining).toHaveLength(1);
      expect(editor.state.doc.textBetween(remaining[0].ranges[0].from, remaining[0].ranges[0].to)).toBe('hello');
    } finally {
      editor.destroy();
    }
  });

  it.each([
    ['unlocked', 2, 0],
    ['sdtLocked', 2, 0], // wrapper-locked only; content still editable
    ['contentLocked', 1, 1],
    ['sdtContentLocked', 1, 1],
  ])('lock mode %s: replacedCount=%i skippedCount=%i', (lockMode, expectedReplaced, expectedSkipped) => {
    const editor = setupEditor();

    try {
      const testDoc = buildDocWithSDT(editor, {
        lockMode,
        sdtText: 'hello world',
        beforeText: 'Before hello ',
        afterText: '',
      });
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('hi');

      expect(result).toEqual({ replacedCount: expectedReplaced, skippedCount: expectedSkipped });
    } finally {
      editor.destroy();
    }
  });

  it('handles multiple SDTs — one locked, one unlocked', () => {
    const editor = setupEditor();

    try {
      const { doc, paragraph, run, structuredContent } = editor.schema.nodes;
      const unlockedSdt = structuredContent.create({ id: 'sdt-unlocked', lockMode: 'unlocked' }, [
        run.create(null, [editor.schema.text('hello one')]),
      ]);
      const lockedSdt = structuredContent.create({ id: 'sdt-locked', lockMode: 'contentLocked' }, [
        run.create(null, [editor.schema.text('hello two')]),
      ]);
      const testDoc = doc.create(null, [
        paragraph.create(null, [unlockedSdt, run.create(null, [editor.schema.text(' middle ')]), lockedSdt]),
      ]);
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('hi');

      expect(result).toEqual({ replacedCount: 1, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe('hi one middle hello two');
    } finally {
      editor.destroy();
    }
  });

  it('skips a multi-range match whose outer span straddles a locked SDT sitting in the gap between ranges', () => {
    const editor = setupEditor();

    try {
      const { doc, paragraph, run, structuredContent } = editor.schema.nodes;
      const before = run.create(null, [editor.schema.text('brown ')]);
      // sdtLocked (not contentLocked): an outer span that fully contains an
      // SDT is "deleting the wrapper," which contentLocked alone permits —
      // only sdtLocked/sdtContentLocked block wrapper deletion, so that's
      // the lock mode that actually exercises the gap-overlap path.
      const lockedSdt = structuredContent.create({ id: 'gap-sdt', lockMode: 'sdtContentLocked' }, [
        run.create(null, [editor.schema.text('XXX')]),
      ]);
      const after = run.create(null, [editor.schema.text(' fox')]);
      const testDoc = doc.create(null, [paragraph.create(null, [before, lockedSdt, after])]);
      applyDoc(editor, testDoc);

      // Locate "brown" and "fox" positions to build a synthetic cross-gap
      // match — neither range individually touches the locked SDT, but the
      // outer span [range1.from, range2.to] does, since the SDT sits in the
      // gap between the two ranges.
      let brownRange;
      let foxRange;
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        if (node.text === 'brown ') brownRange = { from: pos, to: pos + 5 };
        if (node.text === ' fox') foxRange = { from: pos + 1, to: pos + 4 };
        return true;
      });

      const originalText = editor.state.doc.textContent;
      const syntheticMatch = {
        text: 'brown fox',
        from: brownRange.from,
        to: foxRange.to,
        id: 'synthetic-gap-match',
        ranges: [brownRange, foxRange],
      };
      getSearchStorage(editor).searchResults = [syntheticMatch];
      getSearchStorage(editor).query = 'brown fox';

      const result = editor.commands.replaceAllSearchMatches('red dog');

      expect(result).toEqual({ replacedCount: 0, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe(originalText);
    } finally {
      editor.destroy();
    }
  });

  it('dry-run (dispatch falsy) reports counts without mutating doc or session', () => {
    const editor = setupEditor();

    try {
      const testDoc = buildDocWithSDT(editor, {
        lockMode: 'contentLocked',
        sdtText: 'hello world',
        beforeText: 'Before hello ',
        afterText: '',
      });
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const originalText = editor.state.doc.textContent;
      const originalResultsLength = getSearchStorage(editor).searchResults.length;

      const canResult = editor.can().replaceAllSearchMatches('hi');

      expect(canResult).toEqual({ replacedCount: 1, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe(originalText);
      expect(getSearchStorage(editor).searchResults).toHaveLength(originalResultsLength);
    } finally {
      editor.destroy();
    }
  });

  it('respects empty replacement (deletion) through the same partition', () => {
    const editor = setupEditor();

    try {
      const testDoc = buildDocWithSDT(editor, {
        lockMode: 'contentLocked',
        sdtText: 'hello world',
        beforeText: 'Before hello ',
        afterText: '',
      });
      applyDoc(editor, testDoc);

      editor.commands.setSearchSession('hello');
      const result = editor.commands.replaceAllSearchMatches('');

      expect(result).toEqual({ replacedCount: 1, skippedCount: 1 });
      expect(editor.state.doc.textContent).toBe('Before  hello world');
    } finally {
      editor.destroy();
    }
  });
});
