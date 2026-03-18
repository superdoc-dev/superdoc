import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { BlockIndex, BlockCandidate } from './node-address-resolver.js';
import type { InlineIndex, InlineCandidate } from './inline-address-resolver.js';
import type { InlineNodeType } from '@superdoc/document-api';
import { getBlockIndex, getInlineIndex } from './index-cache.js';
import { getTextAdapter } from '../get-text-adapter.js';
import { groupTrackedChanges } from './tracked-change-resolver.js';
import { findAllSdtNodes } from './content-controls/index.js';
import {
  getLiveDocumentCounts,
  countWordsFromText,
  countBlockNodeTypes,
  countInlineImages,
  countUniqueCommentIds,
  countTrackedChanges,
  countSdtFields,
  countLists,
} from './live-document-counts.js';

vi.mock('./index-cache.js', () => ({
  getBlockIndex: vi.fn(),
  getInlineIndex: vi.fn(),
}));

vi.mock('../get-text-adapter.js', () => ({
  getTextAdapter: vi.fn(),
}));

vi.mock('./tracked-change-resolver.js', () => ({
  groupTrackedChanges: vi.fn(),
}));

vi.mock('./content-controls/index.js', () => ({
  findAllSdtNodes: vi.fn(),
  resolveControlType: (attrs: Record<string, unknown>) => attrs.controlType ?? attrs.type ?? 'unknown',
}));

const getBlockIndexMock = vi.mocked(getBlockIndex);
const getInlineIndexMock = vi.mocked(getInlineIndex);
const getTextAdapterMock = vi.mocked(getTextAdapter);
const groupTrackedChangesMock = vi.mocked(groupTrackedChanges);
const findAllSdtNodesMock = vi.mocked(findAllSdtNodes);

function makeBlockCandidate(nodeType: BlockCandidate['nodeType'], attrs?: Record<string, unknown>): BlockCandidate {
  return {
    node: {
      attrs,
      textContent: typeof attrs?.textContent === 'string' ? attrs.textContent : '',
    } as BlockCandidate['node'],
    pos: 0,
    end: 1,
    nodeType,
    nodeId: `${nodeType}-1`,
  };
}

function makeBlockIndex(candidates: BlockCandidate[]): BlockIndex {
  return {
    candidates,
    byId: new Map(),
    ambiguous: new Set(),
  };
}

function makeInlineCandidate(nodeType: InlineNodeType, attrs?: Record<string, unknown>): InlineCandidate {
  return {
    nodeType,
    anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
    blockId: 'p1',
    pos: 0,
    end: 1,
    attrs,
  };
}

function makeInlineIndex(candidates: InlineCandidate[]): InlineIndex {
  const byType = new Map<InlineNodeType, InlineCandidate[]>();
  for (const c of candidates) {
    const list = byType.get(c.nodeType) ?? [];
    list.push(c);
    byType.set(c.nodeType, list);
  }
  return {
    candidates,
    byType,
    byKey: new Map(),
  };
}

function makeEditor(doc: Record<string, unknown> = {}): Editor {
  return {
    state: {
      doc,
    },
  } as Editor;
}

describe('countWordsFromText', () => {
  it('counts whitespace-delimited tokens', () => {
    expect(countWordsFromText('hello world foo')).toBe(3);
  });

  it('returns 0 for empty text', () => {
    expect(countWordsFromText('')).toBe(0);
  });

  it('returns 0 for whitespace-only text', () => {
    expect(countWordsFromText('   \n\t  ')).toBe(0);
  });

  it('handles leading/trailing whitespace', () => {
    expect(countWordsFromText('  hello  world  ')).toBe(2);
  });
});

describe('countBlockNodeTypes', () => {
  it('counts paragraphs, headings, tables, and block images', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('heading'),
      makeBlockCandidate('table'),
      makeBlockCandidate('image'),
      makeBlockCandidate('image'),
    ]);

    expect(countBlockNodeTypes(index)).toEqual({
      paragraphs: 2,
      headings: 1,
      tables: 1,
      blockImages: 2,
    });
  });

  it('excludes list items from paragraph count', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('listItem'),
      makeBlockCandidate('listItem'),
    ]);

    const result = countBlockNodeTypes(index);
    expect(result.paragraphs).toBe(1);
  });

  it('skips tableRow, tableCell, tableOfContents, and sdt', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('tableRow'),
      makeBlockCandidate('tableCell'),
      makeBlockCandidate('tableOfContents'),
      makeBlockCandidate('sdt'),
    ]);

    expect(countBlockNodeTypes(index)).toEqual({
      paragraphs: 0,
      headings: 0,
      tables: 0,
      blockImages: 0,
    });
  });

  it('returns all zeros for empty index', () => {
    expect(countBlockNodeTypes(makeBlockIndex([]))).toEqual({
      paragraphs: 0,
      headings: 0,
      tables: 0,
      blockImages: 0,
    });
  });
});

describe('countInlineImages', () => {
  it('counts inline image candidates', () => {
    const index = makeInlineIndex([
      makeInlineCandidate('image'),
      makeInlineCandidate('image'),
      makeInlineCandidate('comment', { commentId: 'c1' }),
    ]);
    expect(countInlineImages(index)).toBe(2);
  });

  it('returns 0 when no inline images exist', () => {
    const index = makeInlineIndex([makeInlineCandidate('comment', { commentId: 'c1' })]);
    expect(countInlineImages(index)).toBe(0);
  });
});

describe('countUniqueCommentIds', () => {
  it('deduplicates repeated inline candidates for the same comment ID', () => {
    const index = makeInlineIndex([
      makeInlineCandidate('comment', { commentId: 'c-1' }),
      makeInlineCandidate('comment', { commentId: 'c-1' }),
      makeInlineCandidate('comment', { commentId: 'c-2' }),
    ]);
    expect(countUniqueCommentIds(index)).toBe(2);
  });

  it('resolves commentId from importedId and w:id fallbacks', () => {
    const index = makeInlineIndex([
      makeInlineCandidate('comment', { importedId: 'imported-1' }),
      makeInlineCandidate('comment', { 'w:id': 'w-1' }),
    ]);
    expect(countUniqueCommentIds(index)).toBe(2);
  });

  it('deduplicates mark-vs-range candidates for the same comment ID', () => {
    const markCandidate = makeInlineCandidate('comment', { commentId: 'c-1' });
    markCandidate.mark = {} as InlineCandidate['mark'];

    const rangeCandidate = makeInlineCandidate('comment', { commentId: 'c-1' });
    rangeCandidate.node = {} as InlineCandidate['node'];

    const index = makeInlineIndex([markCandidate, rangeCandidate]);
    expect(countUniqueCommentIds(index)).toBe(1);
  });

  it('skips candidates with no resolvable comment ID', () => {
    const index = makeInlineIndex([
      makeInlineCandidate('comment', {}),
      makeInlineCandidate('comment', { commentId: 'c-1' }),
    ]);
    expect(countUniqueCommentIds(index)).toBe(1);
  });

  it('returns 0 when no comments exist', () => {
    const index = makeInlineIndex([]);
    expect(countUniqueCommentIds(index)).toBe(0);
  });
});

describe('countTrackedChanges', () => {
  it('counts grouped tracked changes, not raw marks', () => {
    groupTrackedChangesMock.mockReturnValue([{ id: 'tc-1' }, { id: 'tc-2' }, { id: 'tc-3' }] as ReturnType<
      typeof groupTrackedChanges
    >);

    expect(countTrackedChanges(makeEditor())).toBe(3);
  });
});

describe('countSdtFields', () => {
  beforeEach(() => {
    findAllSdtNodesMock.mockReset();
  });

  it('counts only field-like SDT control types', () => {
    findAllSdtNodesMock.mockReturnValue([
      { kind: 'block', pos: 0, node: { attrs: { controlType: 'text' } } },
      { kind: 'inline', pos: 1, node: { attrs: { controlType: 'checkbox' } } },
      { kind: 'block', pos: 2, node: { attrs: { controlType: 'comboBox' } } },
      { kind: 'block', pos: 3, node: { attrs: { controlType: 'group' } } },
      { kind: 'block', pos: 4, node: { attrs: { controlType: 'repeatingSection' } } },
      { kind: 'block', pos: 5, node: { attrs: { controlType: 'unknown' } } },
    ] as ReturnType<typeof findAllSdtNodes>);

    expect(countSdtFields(makeEditor())).toBe(3);
  });
});

describe('countLists', () => {
  it('counts unique list sequences rather than individual list items', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      }),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      }),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 2, ilvl: 0 } },
      }),
      makeBlockCandidate('paragraph'),
    ]);

    index.candidates[0]!.nodeId = 'li-1';
    index.candidates[1]!.nodeId = 'li-2';
    index.candidates[2]!.nodeId = 'li-3';

    expect(countLists(makeEditor(), index)).toBe(2);
  });

  it('counts visible list runs when list items have marker/path data but no numId', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '1.', path: [1], numberingType: 'decimal' },
      }),
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '2.', path: [2], numberingType: 'decimal' },
      }),
    ]);

    index.candidates[0]!.nodeId = 'li-visible-1';
    index.candidates[1]!.nodeId = 'li-visible-2';

    expect(countLists(makeEditor(), index)).toBe(1);
  });

  it('counts visible list runs when list items only expose ilvl metadata', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { ilvl: 0 } },
      }),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { ilvl: 0 } },
      }),
    ]);

    index.candidates[0]!.nodeId = 'li-ilvl-1';
    index.candidates[1]!.nodeId = 'li-ilvl-2';

    expect(countLists(makeEditor(), index)).toBe(1);
  });

  it('starts a new visible list when fallback ordinals restart at the same level', () => {
    const index = makeBlockIndex([
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '1.', path: [1], numberingType: 'decimal' },
      }),
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '2.', path: [2], numberingType: 'decimal' },
      }),
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '1.', path: [1], numberingType: 'decimal' },
      }),
      makeBlockCandidate('listItem', {
        listRendering: { markerText: '2.', path: [2], numberingType: 'decimal' },
      }),
    ]);

    index.candidates[0]!.nodeId = 'li-reset-1';
    index.candidates[1]!.nodeId = 'li-reset-2';
    index.candidates[2]!.nodeId = 'li-reset-3';
    index.candidates[3]!.nodeId = 'li-reset-4';

    expect(countLists(makeEditor(), index)).toBe(2);
  });

  it('returns 0 when no list items exist', () => {
    expect(countLists(makeEditor(), makeBlockIndex([makeBlockCandidate('paragraph')]))).toBe(0);
  });
});

describe('getLiveDocumentCounts', () => {
  beforeEach(() => {
    getBlockIndexMock.mockReset();
    getInlineIndexMock.mockReset();
    getTextAdapterMock.mockReset();
    groupTrackedChangesMock.mockReset();
    findAllSdtNodesMock.mockReset();
  });

  it('assembles all counts from indexes and text projection', () => {
    const editor = makeEditor();
    getTextAdapterMock.mockReturnValue('hello world from the document');
    const blockIndex = makeBlockIndex([
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('paragraph'),
      makeBlockCandidate('heading'),
      makeBlockCandidate('heading'),
      makeBlockCandidate('table'),
      makeBlockCandidate('image'),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      }),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
      }),
      makeBlockCandidate('listItem', {
        paragraphProperties: { numberingProperties: { numId: 2, ilvl: 0 } },
      }),
    ]);
    blockIndex.candidates[7]!.nodeId = 'li-1';
    blockIndex.candidates[8]!.nodeId = 'li-2';
    blockIndex.candidates[9]!.nodeId = 'li-3';
    getBlockIndexMock.mockReturnValue(blockIndex);
    getInlineIndexMock.mockReturnValue(
      makeInlineIndex([
        makeInlineCandidate('image'),
        makeInlineCandidate('image'),
        makeInlineCandidate('comment', { commentId: 'c-1' }),
        makeInlineCandidate('comment', { commentId: 'c-1' }),
        makeInlineCandidate('comment', { commentId: 'c-2' }),
      ]),
    );
    groupTrackedChangesMock.mockReturnValue([{ id: 'tc-1' }, { id: 'tc-2' }] as ReturnType<typeof groupTrackedChanges>);
    findAllSdtNodesMock.mockReturnValue([
      { kind: 'block', pos: 0, node: { attrs: { controlType: 'text' } } },
      { kind: 'inline', pos: 1, node: { attrs: { controlType: 'checkbox' } } },
      { kind: 'block', pos: 2, node: { attrs: { controlType: 'group' } } },
    ] as ReturnType<typeof findAllSdtNodes>);

    const result = getLiveDocumentCounts(editor);

    expect(result).toEqual({
      words: 5,
      characters: 29,
      paragraphs: 3,
      headings: 2,
      tables: 1,
      images: 3, // 1 block + 2 inline
      comments: 2, // 2 unique IDs from 3 candidates
      trackedChanges: 2,
      sdtFields: 2,
      lists: 2,
    });
  });

  it('words and characters derive from the same text projection', () => {
    const editor = makeEditor();
    const text = 'one two three';
    getTextAdapterMock.mockReturnValue(text);
    getBlockIndexMock.mockReturnValue(makeBlockIndex([]));
    getInlineIndexMock.mockReturnValue(makeInlineIndex([]));
    groupTrackedChangesMock.mockReturnValue([] as ReturnType<typeof groupTrackedChanges>);
    findAllSdtNodesMock.mockReturnValue([] as ReturnType<typeof findAllSdtNodes>);

    const result = getLiveDocumentCounts(editor);

    expect(result.words).toBe(3);
    expect(result.characters).toBe(text.length);
  });

  it('reuses cached counts for repeated reads of the same document snapshot', () => {
    const editor = makeEditor({ docId: 'snapshot-1' });

    getTextAdapterMock.mockReturnValue('one two');
    getBlockIndexMock.mockReturnValue(makeBlockIndex([makeBlockCandidate('paragraph')]));
    getInlineIndexMock.mockReturnValue(makeInlineIndex([]));
    groupTrackedChangesMock.mockReturnValue([{ id: 'tc-1' }] as ReturnType<typeof groupTrackedChanges>);
    findAllSdtNodesMock.mockReturnValue([
      { kind: 'block', pos: 0, node: { attrs: { controlType: 'text' } } },
    ] as ReturnType<typeof findAllSdtNodes>);

    const first = getLiveDocumentCounts(editor);
    const second = getLiveDocumentCounts(editor);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(getTextAdapterMock).toHaveBeenCalledOnce();
    expect(getBlockIndexMock).toHaveBeenCalledOnce();
    expect(getInlineIndexMock).toHaveBeenCalledOnce();
    expect(groupTrackedChangesMock).toHaveBeenCalledOnce();
    expect(findAllSdtNodesMock).toHaveBeenCalledOnce();
  });

  it('invalidates the cache when the editor doc snapshot changes', () => {
    const editor = makeEditor({ docId: 'snapshot-1' }) as Editor & { state: { doc: Record<string, unknown> } };

    getTextAdapterMock.mockReturnValueOnce('one').mockReturnValueOnce('one two');
    getBlockIndexMock.mockReturnValue(makeBlockIndex([makeBlockCandidate('paragraph')]));
    getInlineIndexMock.mockReturnValue(makeInlineIndex([]));
    groupTrackedChangesMock.mockReturnValue([] as ReturnType<typeof groupTrackedChanges>);
    findAllSdtNodesMock.mockReturnValue([] as ReturnType<typeof findAllSdtNodes>);

    const first = getLiveDocumentCounts(editor);
    editor.state.doc = { docId: 'snapshot-2' };
    const second = getLiveDocumentCounts(editor);

    expect(first.words).toBe(1);
    expect(second.words).toBe(2);
    expect(getTextAdapterMock).toHaveBeenCalledTimes(2);
    expect(getBlockIndexMock).toHaveBeenCalledTimes(2);
    expect(getInlineIndexMock).toHaveBeenCalledTimes(2);
    expect(groupTrackedChangesMock).toHaveBeenCalledTimes(2);
    expect(findAllSdtNodesMock).toHaveBeenCalledTimes(2);
  });
});
