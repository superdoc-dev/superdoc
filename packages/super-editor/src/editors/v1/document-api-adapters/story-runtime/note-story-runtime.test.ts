/**
 * Regression tests for note story runtime resolution.
 *
 * These tests exercise edge cases in `extractNotePmJson` that caused
 * empty or blank notes to be misclassified as missing.
 */

import { describe, it, expect, vi } from 'vitest';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Module mocks — isolate extractNotePmJson from editor/converter internals
// ---------------------------------------------------------------------------

const mockCreateStoryEditor = vi.fn(() => ({
  state: { doc: { content: { size: 2 }, textBetween: () => '' } },
  schema: {},
  getJSON: () => ({ type: 'doc', content: [] }),
  getUpdatedJson: () => ({ type: 'doc', content: [] }),
  destroy: vi.fn(),
  on: vi.fn(),
}));

vi.mock('../../core/story-editor-factory.js', () => ({
  createStoryEditor: (...args: unknown[]) => mockCreateStoryEditor(...args),
}));

vi.mock('../../core/parts/mutation/mutate-part.js', () => ({
  mutatePart: vi.fn(),
}));

vi.mock('../../core/parts/adapters/notes-part-descriptor.js', () => ({
  getNotesConfig: vi.fn(() => ({ partId: 'notes', childElementName: 'w:footnote' })),
  getNoteElements: vi.fn(() => []),
  ensureFootnoteRefRun: vi.fn(),
  updateNoteElement: vi.fn(),
}));

// Import after mocks are set up
import { resolveNoteRuntime } from './note-story-runtime.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHostEditor(footnotes: unknown[], endnotes: unknown[] = []) {
  return {
    converter: { footnotes, endnotes },
    on: vi.fn(),
  } as any;
}

const footnoteLocator = {
  kind: 'story' as const,
  storyType: 'footnote' as const,
  noteId: '1',
};

const endnoteLocator = {
  kind: 'story' as const,
  storyType: 'endnote' as const,
  noteId: '1',
};

// ---------------------------------------------------------------------------
// Empty note content — regression for STORY_NOT_FOUND on blank notes
// ---------------------------------------------------------------------------

describe('resolveNoteRuntime — empty note content', () => {
  it('resolves a note with content: [] as a valid empty story', () => {
    const hostEditor = makeHostEditor([{ id: '1', content: [] }]);

    const runtime = resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(runtime.storyKey).toBe('fn:1');
    expect(runtime.kind).toBe('note');
    // The story editor should receive a minimal doc with an empty paragraph
    expect(mockCreateStoryEditor).toHaveBeenCalledWith(
      hostEditor,
      { type: 'doc', content: [{ type: 'paragraph' }] },
      expect.any(Object),
    );
  });

  it('resolves a note with non-empty content normally', () => {
    const noteContent = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }];
    const hostEditor = makeHostEditor([{ id: '1', content: noteContent }]);

    resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(mockCreateStoryEditor).toHaveBeenCalledWith(
      hostEditor,
      { type: 'doc', content: noteContent },
      expect.any(Object),
    );
  });

  it('resolves an endnote with content: [] as a valid empty story', () => {
    const hostEditor = makeHostEditor([], [{ id: '1', content: [] }]);

    const runtime = resolveNoteRuntime(hostEditor, endnoteLocator);

    expect(runtime.storyKey).toBe('en:1');
    expect(runtime.kind).toBe('note');
  });

  it('throws STORY_NOT_FOUND when the note ID does not exist at all', () => {
    const hostEditor = makeHostEditor([{ id: '99', content: [] }]);

    expect(() => resolveNoteRuntime(hostEditor, footnoteLocator)).toThrow(DocumentApiAdapterError);
    expect(() => resolveNoteRuntime(hostEditor, footnoteLocator)).toThrow('not found');
  });

  it('resolves a note with a doc field', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
    const hostEditor = makeHostEditor([{ id: '1', doc }]);

    resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(mockCreateStoryEditor).toHaveBeenCalledWith(hostEditor, doc, expect.any(Object));
  });
});
