/**
 * Regression tests for note story runtime resolution.
 *
 * These tests exercise edge cases in `extractNotePmJson` that caused
 * empty or blank notes to be misclassified as missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// SD-3400: mock the removal boundary so the commit-on-empty wiring can be
// asserted without exercising footnotesRemoveWrapper's internals (covered by
// footnote-wrappers.test.ts).
const mockFootnotesRemoveWrapper = vi.fn(() => ({ success: true }));
vi.mock('../plan-engine/footnote-wrappers.js', () => ({
  footnotesRemoveWrapper: (...args: unknown[]) => mockFootnotesRemoveWrapper(...args),
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

  it('normalizes empty footnote reference runs out of the editable note story', () => {
    const hostEditor = makeHostEditor([
      {
        id: '1',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'run', content: [], attrs: { runProperties: { styleId: 'FootnoteReference' } } },
              {
                type: 'run',
                content: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
        ],
      },
    ]);

    resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(mockCreateStoryEditor).toHaveBeenCalledWith(
      hostEditor,
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
        ],
      },
      expect.any(Object),
    );
  });

  it('normalizes note separator tabs out of the editable footnote story', () => {
    const hostEditor = makeHostEditor([
      {
        id: '1',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'run', content: [], attrs: { runProperties: { styleId: 'FootnoteReference' } } },
              {
                type: 'run',
                content: [{ type: 'tab' }, { type: 'text', text: 'Hello' }],
              },
            ],
          },
        ],
      },
    ]);

    resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(mockCreateStoryEditor).toHaveBeenCalledWith(
      hostEditor,
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
        ],
      },
      expect.any(Object),
    );
  });

  it('strips hidden passthrough field-code nodes out of the editable note story', () => {
    const hostEditor = makeHostEditor([
      {
        id: '1',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'Section ' }],
              },
              {
                type: 'run',
                content: [{ type: 'passthroughInline', attrs: { originalName: 'w:fldChar' } }],
              },
              {
                type: 'run',
                content: [{ type: 'text', text: '1.2(b)' }],
              },
            ],
          },
        ],
      },
    ]);

    resolveNoteRuntime(hostEditor, footnoteLocator);

    expect(mockCreateStoryEditor).toHaveBeenCalledWith(
      hostEditor,
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [{ type: 'text', text: 'Section ' }],
              },
              {
                type: 'run',
                content: [{ type: 'text', text: '1.2(b)' }],
              },
            ],
          },
        ],
      },
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

describe('SD-3400: clearing a note in the area removes the footnote on both sides', () => {
  beforeEach(() => mockFootnotesRemoveWrapper.mockClear());

  // Host editor whose body contains a footnoteReference id '1' (so real
  // findAllFootnotes confirms the reference exists before removal).
  const makeHost = () =>
    ({
      converter: { footnotes: [{ id: '1', content: [{ type: 'paragraph' }] }], endnotes: [] },
      state: { doc: { descendants: (cb: (n: unknown, p: number) => void) => cb({ type: { name: 'footnoteReference' }, attrs: { id: '1' } }, 5) } },
      on: vi.fn(),
    }) as any;

  const storyEditorWith = (descendants: (cb: (n: unknown, p: number) => boolean | void) => void) => ({
    state: { doc: { content: { size: 4 }, textBetween: () => '', descendants } },
    schema: {},
    getJSON: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
    getUpdatedJson: () => ({ type: 'doc', content: [{ type: 'paragraph' }] }),
    destroy: vi.fn(),
    on: vi.fn(),
  });

  it('removes both the body reference and the note element when the committed content is empty', () => {
    // Story doc holds only an empty paragraph — no text, no atoms.
    mockCreateStoryEditor.mockReturnValueOnce(
      storyEditorWith((cb) => {
        cb({ isText: false, isAtom: false, type: { name: 'paragraph' } }, 0);
      }) as never,
    );
    const host = makeHost();
    const runtime = resolveNoteRuntime(host, footnoteLocator);

    runtime.commit?.(host);

    expect(mockFootnotesRemoveWrapper).toHaveBeenCalledWith(host, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '1' },
    });
  });

  it('does not remove the footnote when the committed note still has content', () => {
    mockCreateStoryEditor.mockReturnValueOnce(
      storyEditorWith((cb) => {
        cb({ isText: false, isAtom: false, type: { name: 'paragraph' } }, 0);
        cb({ isText: true, isAtom: true, text: 'kept', type: { name: 'text' } }, 1);
      }) as never,
    );
    const host = makeHost();
    const runtime = resolveNoteRuntime(host, footnoteLocator);

    runtime.commit?.(host);

    expect(mockFootnotesRemoveWrapper).not.toHaveBeenCalled();
  });
});
