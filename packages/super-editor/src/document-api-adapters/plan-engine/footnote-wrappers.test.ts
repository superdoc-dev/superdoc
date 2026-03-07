import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
}));

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

vi.mock('../out-of-band-mutation.js', () => ({
  executeOutOfBandMutation: vi.fn(
    (_editor: Editor, run: (dryRun: boolean) => unknown, options?: { dryRun?: boolean }) =>
      run(options?.dryRun ?? false),
  ),
}));

import {
  footnotesInsertWrapper,
  footnotesGetWrapper,
  footnotesUpdateWrapper,
  footnotesRemoveWrapper,
} from './footnote-wrappers.js';

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

function makeEditor(footnotes: unknown, refs: string[] = [], opts?: { refsAfterDispatch?: string[] }): Editor {
  const currentRefs = [...refs];
  const tr = {
    insert: vi.fn(),
    delete: vi.fn(),
    doc: makeDocWithFootnoteRefs(refs),
  };

  const editor = {
    state: {
      doc: makeDocWithFootnoteRefs(currentRefs),
      tr,
    },
    schema: {
      nodes: {
        footnoteReference: { create: vi.fn((attrs: Record<string, unknown>) => ({ attrs })) },
        endnoteReference: { create: vi.fn((attrs: Record<string, unknown>) => ({ attrs })) },
      },
    },
    dispatch: vi.fn(() => {
      // After dispatch, update editor.state.doc to reflect the post-mutation state
      if (opts?.refsAfterDispatch !== undefined) {
        editor.state.doc = makeDocWithFootnoteRefs(opts.refsAfterDispatch) as typeof editor.state.doc;
      }
    }),
    converter: {
      convertedXml: { 'word/document.xml': {} },
      footnotes,
    },
    options: {},
  } as unknown as Editor;

  return editor;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('footnote-wrappers', () => {
  it('stores inserted footnote content in converter.footnotes as exporter-compatible array entries', () => {
    const editor = makeEditor([], []);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'Inserted from test',
    });

    expect(result.success).toBe(true);
    const footnotes = (editor as unknown as { converter: { footnotes: Array<{ id: string; content: unknown[] }> } })
      .converter.footnotes;
    expect(Array.isArray(footnotes)).toBe(true);
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]?.id).toBe('1');
    expect(footnotes[0]?.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Inserted from test' }] },
    ]);
  });

  it('normalizes legacy map-based footnote storage and allocates the next numeric id', () => {
    const editor = makeEditor({ '5': { content: 'Legacy note' } }, []);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'New note',
    });

    expect(result.success).toBe(true);
    const footnotes = (editor as unknown as { converter: { footnotes: Array<{ id: string; content: unknown[] }> } })
      .converter.footnotes;
    expect(Array.isArray(footnotes)).toBe(true);
    expect(footnotes.map((entry) => entry.id)).toEqual(['5', '6']);
  });

  it('reads and updates footnote content when converter.footnotes uses array entries', () => {
    const editor = makeEditor(
      [
        {
          id: '3',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Line A' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Line B' }] },
          ],
        },
      ],
      ['3'],
    );

    const before = footnotesGetWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
    });
    expect(before.content).toBe('Line A\nLine B');

    const update = footnotesUpdateWrapper(
      editor,
      {
        target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
        patch: { content: 'Updated content' },
      },
      { changeMode: 'direct' },
    );
    expect(update.success).toBe(true);

    const after = footnotesGetWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '3' },
    });
    expect(after.content).toBe('Updated content');
  });

  it('allocates a note id higher than existing doc references', () => {
    const editor = makeEditor([], ['7', '3']);

    const result = footnotesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 0 } }] },
      type: 'footnote',
      content: 'After existing refs',
    });

    expect(result.success).toBe(true);
    const footnotes = (editor as unknown as { converter: { footnotes: Array<{ id: string }> } }).converter.footnotes;
    expect(footnotes[0]?.id).toBe('8');
  });

  it('removes note entry from converter when footnote is deleted and no longer referenced', () => {
    const entries = [
      { id: '2', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 2' }] }] },
      { id: '5', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 5' }] }] },
    ];
    // Before dispatch: refs include '2' and '5'. After dispatch: only '5' remains.
    const editor = makeEditor(entries, ['2', '5'], { refsAfterDispatch: ['5'] });

    const result = footnotesRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '2' },
    });

    expect(result.success).toBe(true);
    const footnotes = (editor as unknown as { converter: { footnotes: Array<{ id: string }> } }).converter.footnotes;
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]?.id).toBe('5');
  });

  it('keeps note entry when other references to the same note still exist', () => {
    const entries = [{ id: '2', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note 2' }] }] }];
    // After dispatch: another reference to '2' still exists
    const editor = makeEditor(entries, ['2', '2'], { refsAfterDispatch: ['2'] });

    const result = footnotesRemoveWrapper(editor, {
      target: { kind: 'entity', entityType: 'footnote', noteId: '2' },
    });

    expect(result.success).toBe(true);
    const footnotes = (editor as unknown as { converter: { footnotes: Array<{ id: string }> } }).converter.footnotes;
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]?.id).toBe('2');
  });
});
