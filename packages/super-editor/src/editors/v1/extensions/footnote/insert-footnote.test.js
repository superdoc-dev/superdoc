import { describe, it, expect, vi } from 'vitest';
import { insertFootnoteAtCursor } from './insert-footnote.js';

const makeEditor = ({ insertResult, presentationEditor } = {}) => ({
  doc: { footnotes: { insert: vi.fn(() => insertResult) } },
  presentationEditor,
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
