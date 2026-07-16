import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// Mocks — the new wrappers use mutatePart/compoundMutation instead of
// executeDomainCommand/executeOutOfBandMutation. We mock the parts system.
// ---------------------------------------------------------------------------

vi.mock('./revision-tracker.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./revision-tracker.js')>();
  return {
    ...actual,
    getRevision: vi.fn(() => 'rev-1'),
    checkRevision: vi.fn(),
    incrementRevision: vi.fn(),
    restoreRevision: vi.fn(),
  };
});

vi.mock('../helpers/adapter-utils.js', () => ({
  paginate: vi.fn((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveInlineInsertPosition: vi.fn(() => ({ from: 5, to: 5 })),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: vi.fn(),
}));

// Mock mutatePart to execute the mutation callback directly against the part
vi.mock('../../core/parts/mutation/mutate-part.js', () => ({
  mutatePart: vi.fn(
    (request: { mutate?: (ctx: { part: unknown; dryRun: boolean }) => unknown; editor: Editor; partId: string }) => {
      const converter = (
        request.editor as unknown as {
          converter?: { convertedXml?: Record<string, unknown> };
        }
      ).converter;
      const part = converter?.convertedXml?.[request.partId] ?? {};

      if (request.mutate) {
        request.mutate({ part, dryRun: false });
      }

      if (converter?.convertedXml) {
        converter.convertedXml[request.partId] = part;
      }

      return { changed: true, changedPaths: [], degraded: false, result: undefined };
    },
  ),
  closeUndoGroup: vi.fn(),
}));

// Mock compoundMutation to execute immediately
vi.mock('../../core/parts/mutation/compound-mutation.js', () => ({
  compoundMutation: vi.fn((request: { execute: () => boolean }) => {
    const success = request.execute();
    return { success };
  }),
}));

import { checkRevision } from './revision-tracker.js';
import {
  footnotesInsertWrapper,
  footnotesGetWrapper,
  footnotesUpdateWrapper,
  footnotesRemoveWrapper,
  footnotesConfigureWrapper,
  removeNoteEverywhere,
  removeNoteReferenceAt,
} from './footnote-wrappers.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDocWithFootnoteRefs(ids: string[] = []) {
  return {
    descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
      ids.forEach((id, index) => {
        cb({ type: { name: 'footnoteReference' }, attrs: { id } }, index + 1);
      });
      return true;
    },
    nodeAt: vi.fn(() => ({ nodeSize: 1 })),
  };
}

/** Minimal footnotes.xml OOXML structure. */
function makeFootnotesXml(entries: Array<{ id: string; text?: string; type?: string }> = []) {
  return {
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } },
    elements: [
      {
        type: 'element',
        name: 'w:footnotes',
        attributes: { 'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main' },
        elements: entries.map((e) => ({
          type: 'element',
          name: 'w:footnote',
          attributes: { 'w:id': e.id, ...(e.type ? { 'w:type': e.type } : {}) },
          elements: e.text
            ? [
                {
                  type: 'element',
                  name: 'w:p',
                  elements: [
                    {
                      type: 'element',
                      name: 'w:r',
                      elements: [
                        {
                          type: 'element',
                          name: 'w:t',
                          elements: [{ type: 'text', text: e.text }],
                        },
                      ],
                    },
                  ],
                },
              ]
            : [],
        })),
      },
    ],
  };
}

function makeEditor(
  footnoteEntries: Array<{ id: string; text?: string; type?: string }> = [],
  refs: string[] = [],
  opts?: { refsAfterDispatch?: string[]; omitFootnotesPart?: boolean },
): Editor {
  const footnotesXml = makeFootnotesXml(footnoteEntries);
  const footnotes = footnoteEntries.map((e) => ({
    id: e.id,
    type: e.type ?? null,
    content: e.text ? [{ type: 'paragraph', content: [{ type: 'text', text: e.text }] }] : [],
  }));

  const tr = {
    insert: vi.fn(),
    delete: vi.fn(),
    doc: makeDocWithFootnoteRefs(refs),
  };

  const editor = {
    state: {
      doc: makeDocWithFootnoteRefs(refs),
      tr,
      selection: { head: 1, from: 1, to: 1 },
    },
    schema: {
      nodes: {
        footnoteReference: { create: vi.fn((attrs: Record<string, unknown>) => ({ attrs })) },
        endnoteReference: { create: vi.fn((attrs: Record<string, unknown>) => ({ attrs })) },
      },
    },
    dispatch: vi.fn(() => {
      if (opts?.refsAfterDispatch !== undefined) {
        editor.state.doc = makeDocWithFootnoteRefs(opts.refsAfterDispatch) as typeof editor.state.doc;
      }
    }),
    converter: {
      convertedXml: {
        'word/document.xml': {},
        ...(opts?.omitFootnotesPart ? {} : { 'word/footnotes.xml': footnotesXml }),
        'word/settings.xml': {
          elements: [{ type: 'element', name: 'w:settings', elements: [] }],
        },
      },
      footnotes: opts?.omitFootnotesPart ? [] : footnotes,
    },
    options: {},
    safeEmit: vi.fn(() => []),
    emit: vi.fn(),
  } as unknown as Editor;

  return editor;
}

type XmlDoc = {
  elements: Array<{ elements: Array<{ name: string; attributes: Record<string, string> }> }>;
};

function getFootnoteElements(editor: Editor): Array<{ name: string; attributes: Record<string, string> }> {
  const converter = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
  const xml = converter.convertedXml['word/footnotes.xml'] as XmlDoc;
  return xml.elements[0].elements.filter((el) => el.name === 'w:footnote');
}

function getSessionManagedIds(editor: Editor, key: 'footnotes' | 'endnotes'): Set<string> {
  const converter = (editor as unknown as { converter: { sessionManagedNoteIds?: Record<string, Set<string>> } })
    .converter;
  return converter.sessionManagedNoteIds?.[key] ?? new Set();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('footnote-wrappers', () => {
  it('inserts a new footnote element into the canonical OOXML part', () => {
    const editor = makeEditor([], []);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'Inserted from test',
    });

    expect(result.success).toBe(true);
    const noteElements = getFootnoteElements(editor);
    expect(noteElements).toHaveLength(1);
    expect(noteElements[0].attributes['w:id']).toBe('1');
  });

  it('removeNoteEverywhere deletes ALL references but keeps the OOXML element (tombstone, SD-3400)', () => {
    // Two references to footnote id '2' (multi-ref note emptied in the area):
    // both markers go, the w:footnote element stays so undo can restore the
    // note text; export prunes session-registered unreferenced ids.
    const editor = makeEditor([{ id: '2', text: 'Shared note' }], ['2', '2']);

    const result = removeNoteEverywhere(editor, { noteId: '2', type: 'footnote' });

    expect(result.success).toBe(true);
    expect(editor.state.tr.delete).toHaveBeenCalledTimes(2);
    expect(getFootnoteElements(editor)).toHaveLength(1);
    expect(getSessionManagedIds(editor, 'footnotes').has('2')).toBe(true);
  });

  it('removeNoteEverywhere is type-aware: endnote id N never touches footnote id N (SD-3400)', () => {
    const editor = makeEditor([{ id: '2', text: 'Footnote two' }], []);
    // Document carries BOTH a footnote ref and an endnote ref with id '2'.
    const mixedDoc = {
      descendants: (cb: (node: unknown, pos: number) => boolean | void) => {
        cb({ type: { name: 'footnoteReference' }, attrs: { id: '2' } }, 1);
        cb({ type: { name: 'endnoteReference' }, attrs: { id: '2' } }, 5);
        return true;
      },
      nodeAt: vi.fn(() => ({ nodeSize: 1 })),
    };
    (editor.state as unknown as { doc: unknown }).doc = mixedDoc;
    (editor.state.tr as unknown as { doc: unknown }).doc = mixedDoc;

    const result = removeNoteEverywhere(editor, { noteId: '2', type: 'footnote' });

    expect(result.success).toBe(true);
    // Only the footnote reference (pos 1) is deleted; the endnote ref survives.
    expect(editor.state.tr.delete).toHaveBeenCalledTimes(1);
    expect(editor.state.tr.delete).toHaveBeenCalledWith(1, 2);
    // Tombstone: element kept; registered under the FOOTNOTE registry only.
    expect(getFootnoteElements(editor)).toHaveLength(1);
    expect(getSessionManagedIds(editor, 'footnotes').has('2')).toBe(true);
    expect(getSessionManagedIds(editor, 'endnotes').has('2')).toBe(false);
  });

  it('removeNoteReferenceAt deletes the reference at the exact position, not the first id match (SD-3400)', () => {
    // Two references to footnote id '2' at positions 1 and 2; the staged
    // delete targets the SECOND one. The element survives because the first
    // reference still exists.
    const editor = makeEditor([{ id: '2', text: 'Shared note' }], ['2', '2'], { refsAfterDispatch: ['2'] });

    const removed = removeNoteReferenceAt(editor, { pos: 2, noteId: '2', type: 'footnote' });

    expect(removed).toBe(true);
    expect(editor.state.tr.delete).toHaveBeenCalledTimes(1);
    expect(editor.state.tr.delete).toHaveBeenCalledWith(2, 3);
    expect(getFootnoteElements(editor)).toHaveLength(1);
  });

  it('removeNoteReferenceAt keeps the w:footnote element (tombstone) and registers the id (SD-3400)', () => {
    // Undo support: the element stays in the part so Cmd+Z restores the note
    // text; export prunes session-registered ids with no surviving reference.
    const editor = makeEditor([{ id: '2', text: 'Note 2' }], ['2'], { refsAfterDispatch: [] });

    const removed = removeNoteReferenceAt(editor, { pos: 1, noteId: '2', type: 'footnote' });

    expect(removed).toBe(true);
    expect(getFootnoteElements(editor)).toHaveLength(1);
    expect(getSessionManagedIds(editor, 'footnotes').has('2')).toBe(true);
  });

  it('removeNoteEverywhere is a NO_OP failure when no reference of that type exists', () => {
    const editor = makeEditor([{ id: '3', text: 'Orphan' }], []);

    const result = removeNoteEverywhere(editor, { noteId: '3', type: 'footnote' });

    expect(result.success).toBe(false);
    expect(editor.state.tr.delete).not.toHaveBeenCalled();
    expect(getFootnoteElements(editor)).toHaveLength(1);
  });

  it('rejects insertion from a story editor (footnote inside a note is non-conformant, SD-3400)', () => {
    // §17.11.14: a footnoteReference inside a footnote/endnote makes the
    // document non-conformant. Story editors carry options.parentEditor.
    const editor = makeEditor([], []);
    (editor as unknown as { options: Record<string, unknown> }).options = { parentEditor: makeEditor([], []) };

    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('INVALID_TARGET');
    }
    // Nothing was inserted anywhere.
    expect(editor.state.tr.insert).not.toHaveBeenCalled();
    expect(getFootnoteElements(editor)).toHaveLength(0);
  });

  it('inserts at the current selection head when at is omitted (SD-3400 toolbar path)', () => {
    const editor = makeEditor([], []);

    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: '' });

    expect(result.success).toBe(true);
    // The reference node lands at the selection head, no TextTarget required.
    expect(editor.state.tr.insert).toHaveBeenCalledWith(1, expect.anything());
    expect(getFootnoteElements(editor)).toHaveLength(1);
  });

  it('rejects target-less insert while the host editor has an active non-body story (SD-3400)', () => {
    // The default-cursor path would drop the marker into the BODY at its stale
    // selection head while the user is editing a header/footnote elsewhere.
    // Mirrors canInsertNoteAtCursor() for the host-editor path.
    const editor = makeEditor([], []);
    (editor as unknown as { presentationEditor: unknown }).presentationEditor = {
      getActiveStoryLocator: () => ({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' }),
    };

    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('INVALID_TARGET');
    }
    expect(editor.state.tr.insert).not.toHaveBeenCalled();
    expect(getFootnoteElements(editor)).toHaveLength(0);
  });

  it('allows target-less insert when no non-body story is active (locator null, SD-3400)', () => {
    const editor = makeEditor([], []);
    (editor as unknown as { presentationEditor: unknown }).presentationEditor = {
      getActiveStoryLocator: () => null,
    };

    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: '' });

    expect(result.success).toBe(true);
    expect(editor.state.tr.insert).toHaveBeenCalledWith(1, expect.anything());
  });

  it('preserves explicit-at insert even when a non-body story is active (SD-3400 AC3)', () => {
    // An explicit `at` is a caller-chosen body position, so the active-story
    // guard does not apply — explicit-target semantics are unchanged.
    const editor = makeEditor([], []);
    (editor as unknown as { presentationEditor: unknown }).presentationEditor = {
      getActiveStoryLocator: () => ({ kind: 'story', storyType: 'footnote', noteId: '1' }),
    };

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'Explicit target',
    });

    expect(result.success).toBe(true);
    // resolveInlineInsertPosition is mocked to return { from: 5, to: 5 }.
    expect(editor.state.tr.insert).toHaveBeenCalledWith(5, expect.anything());
    expect(getFootnoteElements(editor)).toHaveLength(1);
  });

  it('stamps w:pStyle FootnoteText on generated note paragraphs (Word fidelity, SD-3400)', () => {
    // Word always styles footnote body paragraphs with FootnoteText; without
    // it, exported new footnotes render at Normal/11pt in Word.
    const editor = makeEditor([], []);

    footnotesInsertWrapper(editor, { type: 'footnote', content: 'Styled note' });

    const note = getFootnoteElements(editor)[0] as unknown as {
      elements: Array<{ name: string; elements?: Array<{ name: string; attributes?: Record<string, string> }> }>;
    };
    const paragraph = note.elements.find((el) => el.name === 'w:p');
    const pPr = paragraph?.elements?.find((el) => el.name === 'w:pPr');
    const pStyle = (pPr as { elements?: Array<{ name: string; attributes?: Record<string, string> }> })?.elements?.find(
      (el) => el.name === 'w:pStyle',
    );
    expect(pStyle?.attributes?.['w:val']).toBe('FootnoteText');
  });

  it('bootstrap writes the special-footnote list to settings.xml (17.11.9, SD-3400)', () => {
    const editor = makeEditor([], [], { omitFootnotesPart: true });

    footnotesInsertWrapper(editor, { type: 'footnote', content: 'First footnote' });

    const converter = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
    const settingsRoot = (converter.convertedXml['word/settings.xml'] as XmlDoc).elements[0];
    const pr = settingsRoot.elements.find((el) => el.name === 'w:footnotePr') as unknown as {
      elements: Array<{ name: string; attributes: Record<string, string> }>;
    };
    const ids = pr.elements.filter((el) => el.name === 'w:footnote').map((el) => el.attributes['w:id']);
    expect(ids).toEqual(['-1', '0']);
  });

  it('bootstrap leaves settings.xml untouched when the notes part already exists', () => {
    // Imported documents own their settings; the special list is only seeded
    // alongside a freshly bootstrapped notes part.
    const editor = makeEditor([{ id: '1', text: 'Existing' }], ['1']);

    footnotesInsertWrapper(editor, { type: 'footnote', content: 'Second' });

    const converter = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;
    const settingsRoot = (converter.convertedXml['word/settings.xml'] as XmlDoc).elements[0];
    expect(settingsRoot.elements.find((el) => el.name === 'w:footnotePr')).toBeUndefined();
  });

  it('allocates a note id that avoids all existing ids', () => {
    const editor = makeEditor([], ['7', '3']);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'After existing refs',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // The allocator fills the lowest available gap: 1, 2 are free
      expect(result.footnote.noteId).toBe('1');
    }
  });

  it('updates footnote content in the canonical OOXML part via mutatePart', () => {
    const editor = makeEditor([{ id: '3', text: 'Line A' }], ['3']);

    const before = footnotesGetWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
    });
    expect(before.content).toBe('Line A');

    const update = footnotesUpdateWrapper(
      editor,
      {
        target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
        patch: { content: 'Updated content' },
      },
      { changeMode: 'direct' },
    );
    expect(update.success).toBe(true);
  });

  it('returns CAPABILITY_UNAVAILABLE for structured insert bodies on v1-backed sessions', () => {
    const editor = makeEditor([], []);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      body: { kind: 'paragraph', paragraph: { inlines: [] } } as any,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('returns CAPABILITY_UNAVAILABLE for structured update bodies on v1-backed sessions', () => {
    const editor = makeEditor([{ id: '3', text: 'Line A' }], ['3']);

    const result = footnotesUpdateWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
      patch: {
        body: { kind: 'paragraph', paragraph: { inlines: [] } } as any,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('CAPABILITY_UNAVAILABLE');
    }
  });

  it('footnotes.remove keeps the OOXML element and registers the id (undo-consistent API delete)', () => {
    const editor = makeEditor(
      [
        { id: '2', text: 'Note 2' },
        { id: '5', text: 'Note 5' },
      ],
      ['2', '5'],
      { refsAfterDispatch: ['5'] },
    );

    const result = footnotesRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '2' },
    });

    expect(result.success).toBe(true);

    // Tombstone: both elements stay in the part; '2' is registered so export
    // prunes it while it has no surviving reference.
    const noteElements = getFootnoteElements(editor);
    expect(noteElements).toHaveLength(2);
    expect(getSessionManagedIds(editor, 'footnotes').has('2')).toBe(true);
  });

  it('keeps OOXML note element when other references to the same note still exist', () => {
    const editor = makeEditor([{ id: '2', text: 'Note 2' }], ['2', '2'], { refsAfterDispatch: ['2'] });

    const result = footnotesRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '2' },
    });

    expect(result.success).toBe(true);

    // Note stays in the OOXML part since another reference exists. The id is
    // still registered (always-add): a later delete of the surviving marker
    // gets pruned at export by the reference scan.
    const noteElements = getFootnoteElements(editor);
    expect(noteElements).toHaveLength(1);
    expect(noteElements[0].attributes['w:id']).toBe('2');
    expect(getSessionManagedIds(editor, 'footnotes').has('2')).toBe(true);
  });

  it('footnotesInsertWrapper registers the allocated id as session-managed (insert-then-undo prunes at export)', () => {
    const editor = makeEditor([{ id: '1', text: 'Existing' }], ['1']);

    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: 'New note' });

    expect(result.success).toBe(true);
    const allocated = (result as { footnote?: { noteId?: string } }).footnote?.noteId;
    expect(allocated).toBeTruthy();
    expect(getSessionManagedIds(editor, 'footnotes').has(String(allocated))).toBe(true);
  });

  it('a tombstoned id stays reserved: insert after staged delete allocates the next free id', () => {
    // Staged-delete note '2' (element retained as tombstone), then insert:
    // allocateNextNoteId scans the OOXML part, so '2' is not reused and an
    // undo restoring marker '2' can never collide with the new note.
    const editor = makeEditor(
      [
        { id: '1', text: 'One' },
        { id: '2', text: 'Two' },
      ],
      ['1', '2'],
      { refsAfterDispatch: ['1'] },
    );

    removeNoteReferenceAt(editor, { pos: 2, noteId: '2', type: 'footnote' });
    const result = footnotesInsertWrapper(editor, { type: 'footnote', content: 'Fresh' });

    expect(result.success).toBe(true);
    expect((result as { footnote?: { noteId?: string } }).footnote?.noteId).toBe('3');
  });

  it('bootstraps a missing notes part and assigns unique ids (-1, 0, 1)', () => {
    const editor = makeEditor([], [], { omitFootnotesPart: true });

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'First footnote in doc',
    });

    expect(result.success).toBe(true);

    // The bootstrapped part should have separator(-1), continuationSeparator(0),
    // and the new real note(1) — all with distinct ids.
    const noteElements = getFootnoteElements(editor);
    const ids = noteElements.map((el) => el.attributes['w:id']);

    expect(ids).toContain('-1');
    expect(ids).toContain('0');
    expect(ids).toContain('1');
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it('allocates ids that skip over ids already present in the OOXML part', () => {
    // Simulate a part that has separator boilerplate occupying ids -1, 0
    // plus an existing real note at id 1
    const editor = makeEditor(
      [
        { id: '-1', type: 'separator' },
        { id: '0', type: 'continuationSeparator' },
        { id: '1', text: 'Existing note' },
      ],
      ['1'],
    );

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'Second footnote',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.footnote.noteId).toBe('2');
    }
  });

  // ---------------------------------------------------------------------------
  // Fix 1: expectedRevision must be checked for insert and remove
  // ---------------------------------------------------------------------------

  it('insert checks expectedRevision via checkRevision', () => {
    const editor = makeEditor([], []);

    footnotesInsertWrapper(
      editor,
      {
        at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
        type: 'footnote',
        content: 'rev-guarded insert',
      },
      { expectedRevision: 'rev-42', changeMode: 'direct' },
    );

    expect(checkRevision).toHaveBeenCalledWith(editor, 'rev-42');
  });

  it('remove checks expectedRevision via checkRevision', () => {
    const editor = makeEditor([{ id: '1', text: 'Note' }], ['1'], { refsAfterDispatch: [] });

    footnotesRemoveWrapper(
      editor,
      { target: { kind: 'entity', entityType: 'footnote', noteId: '1' } },
      { expectedRevision: 'rev-99', changeMode: 'direct' },
    );

    expect(checkRevision).toHaveBeenCalledWith(editor, 'rev-99');
  });

  // ---------------------------------------------------------------------------
  // Fix 2: dryRun insert must not leak bootstrapped notes part
  // ---------------------------------------------------------------------------

  it('dryRun insert does not leak a bootstrapped notes part into convertedXml', () => {
    const editor = makeEditor([], [], { omitFootnotesPart: true });
    const converter = (editor as unknown as { converter: { convertedXml: Record<string, unknown> } }).converter;

    // Precondition: no footnotes part
    expect(converter.convertedXml['word/footnotes.xml']).toBeUndefined();

    footnotesInsertWrapper(
      editor,
      {
        at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
        type: 'footnote',
        content: 'dry run',
      },
      { dryRun: true, changeMode: 'direct' },
    );

    // The part must still be absent after a dry run
    expect(converter.convertedXml['word/footnotes.xml']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Fix 3: configure must sync footnoteProperties.originalXml
  // ---------------------------------------------------------------------------

  it('configure updates footnoteProperties.originalXml so export uses the new values', () => {
    const editor = makeEditor([], []);
    const converter = (
      editor as unknown as {
        converter: {
          convertedXml: Record<string, unknown>;
          footnoteProperties: { source: string; originalXml: unknown; numFmt?: string } | null;
        };
      }
    ).converter;

    // Simulate imported footnoteProperties from settings.xml
    converter.footnoteProperties = {
      source: 'settings',
      numFmt: 'decimal',
      originalXml: {
        type: 'element',
        name: 'w:footnotePr',
        elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
      },
    };

    footnotesConfigureWrapper(
      editor,
      {
        type: 'footnote',
        numbering: { format: 'lowerRoman' },
      },
      { changeMode: 'direct' },
    );

    // The originalXml should now reflect the updated settings part
    const originalXml = converter.footnoteProperties?.originalXml as {
      elements?: Array<{ name: string; attributes: Record<string, string> }>;
    };
    expect(originalXml).toBeDefined();
    const numFmtEl = originalXml?.elements?.find((el: { name: string }) => el.name === 'w:numFmt');
    expect(numFmtEl?.attributes['w:val']).toBe('lowerRoman');
  });

  it('configure with dryRun does not sync footnoteProperties', () => {
    const editor = makeEditor([], []);
    const converter = (
      editor as unknown as {
        converter: {
          convertedXml: Record<string, unknown>;
          footnoteProperties: { source: string; originalXml: unknown; numFmt?: string } | null;
        };
      }
    ).converter;

    const originalXmlSnapshot = {
      type: 'element',
      name: 'w:footnotePr',
      elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'decimal' } }],
    };

    converter.footnoteProperties = {
      source: 'settings',
      numFmt: 'decimal',
      originalXml: structuredClone(originalXmlSnapshot),
    };

    footnotesConfigureWrapper(
      editor,
      {
        type: 'footnote',
        numbering: { format: 'lowerRoman' },
      },
      { dryRun: true, changeMode: 'direct' },
    );

    // originalXml should remain unchanged after dry run
    const originalXml = converter.footnoteProperties?.originalXml as {
      elements?: Array<{ name: string; attributes: Record<string, string> }>;
    };
    const numFmtEl = originalXml?.elements?.find((el: { name: string }) => el.name === 'w:numFmt');
    expect(numFmtEl?.attributes['w:val']).toBe('decimal');
  });

  it('endnote configure does not corrupt the footnote properties cache', () => {
    const editor = makeEditor([], []);
    const converter = (
      editor as unknown as {
        converter: {
          convertedXml: Record<string, unknown>;
          footnoteProperties: { source: string; originalXml: unknown; numFmt?: string } | null;
        };
      }
    ).converter;

    // Simulate imported footnoteProperties from settings.xml (footnote-specific)
    const originalFootnotePr = {
      type: 'element',
      name: 'w:footnotePr',
      elements: [{ type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'lowerRoman' } }],
    };
    converter.footnoteProperties = {
      source: 'settings',
      numFmt: 'lowerRoman',
      originalXml: structuredClone(originalFootnotePr),
    };

    // Configure endnotes — must not touch the footnote cache
    footnotesConfigureWrapper(
      editor,
      {
        type: 'endnote',
        numbering: { format: 'upperLetter' },
      },
      { changeMode: 'direct' },
    );

    // footnoteProperties must still point at w:footnotePr, not w:endnotePr
    const cached = converter.footnoteProperties?.originalXml as {
      name?: string;
      elements?: Array<{ name: string; attributes: Record<string, string> }>;
    };
    expect(cached?.name).toBe('w:footnotePr');
    const numFmtEl = cached?.elements?.find((el) => el.name === 'w:numFmt');
    expect(numFmtEl?.attributes['w:val']).toBe('lowerRoman');
  });
});
