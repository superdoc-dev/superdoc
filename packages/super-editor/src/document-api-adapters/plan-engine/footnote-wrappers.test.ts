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

  it('removes the footnote via compoundMutation and cleans OOXML part', () => {
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

    // The OOXML part should have note '2' removed
    const noteElements = getFootnoteElements(editor);
    expect(noteElements).toHaveLength(1);
    expect(noteElements[0].attributes['w:id']).toBe('5');
  });

  it('keeps OOXML note element when other references to the same note still exist', () => {
    const editor = makeEditor([{ id: '2', text: 'Note 2' }], ['2', '2'], { refsAfterDispatch: ['2'] });

    const result = footnotesRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '2' },
    });

    expect(result.success).toBe(true);

    // Note should still be in the OOXML part since another reference exists
    const noteElements = getFootnoteElements(editor);
    expect(noteElements).toHaveLength(1);
    expect(noteElements[0].attributes['w:id']).toBe('2');
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
