import { describe, it, expect, vi } from 'vitest';
import { insertFootnoteAtCursor, canInsertNoteAtCursor } from './insert-footnote.js';

const makeEditor = ({ insertResult, presentationEditor, options } = {}) => ({
  doc: { footnotes: { insert: vi.fn(() => insertResult) } },
  presentationEditor,
  options,
});

describe('insertFootnoteAtCursor', () => {
  it('inserts at the cursor and focuses the new note session', () => {
    const activateNoteSession = vi.fn(() => true);
    const editor = makeEditor({
      insertResult: { success: true, footnote: { kind: 'entity', entityType: 'footnote', noteId: 7 } },
      presentationEditor: { activateNoteSession },
    });

    expect(insertFootnoteAtCursor(editor)).toBe(true);
    expect(editor.doc.footnotes.insert).toHaveBeenCalledWith({ type: 'footnote', content: '' });
    expect(activateNoteSession).toHaveBeenCalledWith({ storyType: 'footnote', noteId: '7' });
  });

  it('returns false and does not activate when the insert fails', () => {
    const activateNoteSession = vi.fn();
    const editor = makeEditor({
      insertResult: { success: false, failure: { code: 'NO_OP', message: 'nope' } },
      presentationEditor: { activateNoteSession },
    });

    expect(insertFootnoteAtCursor(editor)).toBe(false);
    expect(activateNoteSession).not.toHaveBeenCalled();
  });

  it('still succeeds when no presentation editor is attached (headless)', () => {
    const editor = makeEditor({
      insertResult: { success: true, footnote: { kind: 'entity', entityType: 'footnote', noteId: '3' } },
      presentationEditor: undefined,
    });

    expect(insertFootnoteAtCursor(editor)).toBe(true);
  });
});

describe('insert guard: header/footer/note contexts (SD-3400)', () => {
  const successResult = { success: true, footnote: { kind: 'entity', entityType: 'footnote', noteId: '9' } };

  it('blocks insertion while a header/footer session is active (host editor path)', () => {
    const editor = makeEditor({
      insertResult: successResult,
      presentationEditor: {
        activateNoteSession: vi.fn(),
        getActiveStoryLocator: () => ({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' }),
      },
    });

    expect(insertFootnoteAtCursor(editor)).toBe(false);
    // Nothing inserted into the BODY while the user edits the header.
    expect(editor.doc.footnotes.insert).not.toHaveBeenCalled();
  });

  it('blocks insertion while a note session is active (host editor path)', () => {
    const editor = makeEditor({
      insertResult: successResult,
      presentationEditor: {
        activateNoteSession: vi.fn(),
        getActiveStoryLocator: () => ({ kind: 'story', storyType: 'footnote', noteId: '1' }),
      },
    });

    expect(insertFootnoteAtCursor(editor)).toBe(false);
    expect(editor.doc.footnotes.insert).not.toHaveBeenCalled();
  });

  it('blocks insertion when the target editor is itself a story editor', () => {
    const editor = makeEditor({ insertResult: successResult, options: { parentEditor: {} } });

    expect(insertFootnoteAtCursor(editor)).toBe(false);
    expect(editor.doc.footnotes.insert).not.toHaveBeenCalled();
  });

  it('allows insertion in plain body context (locator null)', () => {
    const editor = makeEditor({
      insertResult: successResult,
      presentationEditor: { activateNoteSession: vi.fn(), getActiveStoryLocator: () => null },
    });

    expect(insertFootnoteAtCursor(editor)).toBe(true);
    expect(editor.doc.footnotes.insert).toHaveBeenCalled();
  });

  it('canInsertNoteAtCursor mirrors the same checks for toolbar disabled state', () => {
    expect(canInsertNoteAtCursor(null)).toBe(false);
    expect(canInsertNoteAtCursor(makeEditor({ options: { parentEditor: {} } }))).toBe(false);
    expect(
      canInsertNoteAtCursor(
        makeEditor({ presentationEditor: { getActiveStoryLocator: () => ({ storyType: 'footnote' }) } }),
      ),
    ).toBe(false);
    expect(canInsertNoteAtCursor(makeEditor({}))).toBe(true);
    expect(canInsertNoteAtCursor(makeEditor({ presentationEditor: { getActiveStoryLocator: () => null } }))).toBe(true);
  });
});
