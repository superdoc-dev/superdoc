import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { COMMAND_CATALOG, type StoryLocator } from '@superdoc/document-api';

const mocks = vi.hoisted(() => ({
  checkRevision: vi.fn(),
  getRevision: vi.fn(() => '0'),
  executeDomainCommand: vi.fn(),
  resolveTrackedChangeInStory: vi.fn(),
  getTrackedChangeIndex: vi.fn(),
  resolveStoryRuntime: vi.fn(),
  resolveCommentAnchorsById: vi.fn(),
}));

vi.mock('./revision-tracker.js', () => ({
  checkRevision: mocks.checkRevision,
  getRevision: mocks.getRevision,
}));

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: mocks.executeDomainCommand,
}));

vi.mock('../helpers/tracked-change-resolver.js', () => ({
  resolveTrackedChangeInStory: mocks.resolveTrackedChangeInStory,
  resolveTrackedChangeType: vi.fn(() => 'insert'),
}));

vi.mock('../tracked-changes/tracked-change-index.js', () => ({
  getTrackedChangeIndex: mocks.getTrackedChangeIndex,
}));

vi.mock('../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: mocks.resolveStoryRuntime,
}));

vi.mock('../helpers/comment-target-resolver.js', () => ({
  resolveCommentAnchorsById: mocks.resolveCommentAnchorsById,
}));

import {
  trackChangesAcceptAllWrapper,
  trackChangesAcceptWrapper,
  trackChangesDecideRangeWrapper,
  trackChangesGetWrapper,
  trackChangesListWrapper,
  trackChangesRejectWrapper,
  getCachedProjectedTrackedChangeSnapshot,
} from './track-changes-wrappers.js';

const footnoteStory: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: '5' };

function expectTrackChangesDecideReceiptCodeDeclared(code: string): void {
  expect(COMMAND_CATALOG['trackChanges.decide'].possibleFailureCodes).toContain(code);
}

function makeEditor(
  commands: Record<string, unknown> = {},
  options: Record<string, unknown> = { trackedChanges: {} },
): Editor {
  return {
    commands,
    options,
    state: { doc: { textBetween: vi.fn(() => '') } },
  } as unknown as Editor;
}

function makeTextNode(text: string) {
  return {
    type: { name: 'text' },
    attrs: {},
    text,
    nodeSize: text.length,
    isText: true,
    isLeaf: false,
    isBlock: false,
    childCount: 0,
    child: () => {
      throw new Error('text nodes do not have children');
    },
  };
}

function makeInlineWrapper(child: any) {
  return {
    type: { name: 'run' },
    attrs: {},
    nodeSize: child.nodeSize + 2,
    isText: false,
    isLeaf: false,
    isBlock: false,
    childCount: 1,
    child: (index: number) => {
      if (index !== 0) throw new Error('run child out of range');
      return child;
    },
  };
}

function makeParagraphNode(attrs: Record<string, unknown>, child: any = makeTextNode('abcdef')) {
  return {
    type: { name: 'paragraph' },
    attrs,
    nodeSize: child.nodeSize + 2,
    isText: false,
    isLeaf: false,
    isBlock: true,
    childCount: 1,
    child: (index: number) => {
      if (index !== 0) throw new Error('paragraph child out of range');
      return child;
    },
  };
}

function makeRangeDecisionEditor(
  commands: Record<string, unknown>,
  block = makeParagraphNode({ sdBlockId: 'p1' }),
  blockPos = 5,
): Editor {
  return {
    options: { trackedChanges: {} },
    commands,
    state: {
      doc: {
        descendants: (fn: (node: unknown, pos: number) => void | boolean) => {
          fn(block, blockPos);
        },
      },
    },
  } as unknown as Editor;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRevision.mockReturnValue('0');
  mocks.executeDomainCommand.mockReturnValue({ steps: [{ effect: 'changed' }] });
  mocks.getTrackedChangeIndex.mockReturnValue({
    get: vi.fn(() => []),
    getAll: vi.fn(() => []),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
    subscribe: vi.fn(),
    dispose: vi.fn(),
  });
  mocks.resolveCommentAnchorsById.mockReturnValue([{ commentId: 'comment-1' }]);
});

describe('track-changes-wrappers revision guard', () => {
  it('surfaces tracked-change provenance fields on list results', () => {
    const hostEditor = makeEditor();
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [
        {
          address: { kind: 'entity', entityType: 'trackedChange', entityId: 'canon-1' },
          runtimeRef: { storyKey: 'body', rawId: 'raw-1' },
          story: { kind: 'story', storyType: 'body' },
          type: 'insert',
          excerpt: 'new text',
          origin: 'google-docs',
          imported: true,
          storyLabel: 'Body',
          storyKind: 'body',
          anchorKey: 'tc::body::raw-1',
          hasInsert: true,
          hasDelete: false,
          hasFormat: false,
          range: { from: 1, to: 9 },
        },
      ]),
      getAll: vi.fn(() => []),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(hostEditor, {});

    expect(result.items[0]).toMatchObject({
      id: 'canon-1',
      origin: 'google-docs',
      imported: true,
    });
  });

  it('projects structural table changes back to legacy public types in list and get', () => {
    const hostEditor = makeEditor();
    const structuralSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'word:structural:2' },
      runtimeRef: { storyKey: 'body', rawId: 'word:structural:2' },
      story: { kind: 'story', storyType: 'body' },
      type: 'structural',
      subtype: 'table-insert',
      excerpt: 'Cell',
      origin: 'word',
      imported: true,
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::word:structural:2',
      hasInsert: false,
      hasDelete: false,
      hasFormat: false,
      range: { from: 9, to: 30 },
    };
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [structuralSnapshot]),
      getAll: vi.fn(() => []),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });
    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: hostEditor,
      story: { kind: 'story', storyType: 'body' },
      runtimeRef: { storyKey: 'body', rawId: 'word:structural:2' },
      change: { id: 'word:structural:2', rawId: 'word:structural:2', from: 9, to: 30, attrs: {} },
    });

    const listResult = trackChangesListWrapper(hostEditor, {});
    expect(listResult.items[0]).toMatchObject({ type: 'insert' });
    expect(listResult.items[0]).not.toHaveProperty('subtype');

    const filteredListResult = trackChangesListWrapper(hostEditor, { type: 'insert' });
    expect(filteredListResult.items).toHaveLength(1);
    expect(filteredListResult.items[0]).toMatchObject({ id: 'word:structural:2', type: 'insert' });

    const getResult = trackChangesGetWrapper(hostEditor, { id: 'word:structural:2' });
    expect(getResult).toMatchObject({ id: 'word:structural:2', type: 'insert' });
    expect(getResult).not.toHaveProperty('subtype');
  });

  it('checks expectedRevision on the host editor before accepting a non-body tracked change', () => {
    const hostEditor = makeEditor();
    const storyEditor = makeEditor({ acceptTrackedChangeById: vi.fn(() => true) });
    const commit = vi.fn();
    const index = {
      get: vi.fn(() => []),
      getAll: vi.fn(() => []),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: storyEditor,
      story: footnoteStory,
      runtimeRef: { storyKey: 'fn:5', rawId: 'raw-1' },
      change: {
        id: 'canon-1',
        rawId: 'raw-1',
        from: 1,
        to: 2,
        attrs: {},
      },
      commit,
    });
    mocks.getTrackedChangeIndex.mockReturnValue(index);

    const receipt = trackChangesAcceptWrapper(
      hostEditor,
      { id: 'canon-1', story: footnoteStory },
      { expectedRevision: '12' },
    );

    expect(receipt).toEqual({ success: true });
    expect(mocks.checkRevision).toHaveBeenCalledWith(hostEditor, '12');
    expect(mocks.executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function));
    expect(commit).toHaveBeenCalledWith(hostEditor);
    expect(index.invalidate).toHaveBeenCalledWith(footnoteStory);
  });

  it('preserves typed overlap decision failures for by-id document-api calls', () => {
    const hostEditor = makeEditor();
    const storyEditor = {
      ...makeEditor({ acceptTrackedChangeById: vi.fn(() => false) }),
      storage: {
        trackChanges: {
          lastDecisionFailure: {
            code: 'PERMISSION_DENIED',
            message: 'permission denied for accept of change "canon-1".',
            details: { changeId: 'canon-1' },
          },
        },
      },
    } as unknown as Editor;

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: storyEditor,
      story: footnoteStory,
      runtimeRef: { storyKey: 'fn:5', rawId: 'raw-1' },
      change: {
        id: 'canon-1',
        rawId: 'raw-1',
        from: 1,
        to: 2,
        attrs: {},
      },
    });
    mocks.executeDomainCommand.mockReturnValue({ steps: [{ effect: 'unchanged' }] });

    const receipt = trackChangesAcceptWrapper(hostEditor, { id: 'canon-1', story: footnoteStory });

    expect(receipt).toEqual({
      success: false,
      failure: {
        code: 'PERMISSION_DENIED',
        message: 'permission denied for accept of change "canon-1".',
        details: { changeId: 'canon-1' },
      },
    });
  });

  it('removes deleted tracked-change-linked comments from the host store after a successful decision', () => {
    const hostEditor = {
      ...makeEditor(),
      converter: {
        comments: [
          { commentId: 'comment-1', trackedChange: true, trackedChangeParentId: 'canon-1' },
          { commentId: 'reply-1', parentCommentId: 'comment-1' },
        ],
      },
    } as unknown as Editor;
    const storyEditor = {
      ...makeEditor({ rejectTrackedChangeById: vi.fn(() => true) }),
      storage: {
        trackChanges: {
          lastDecisionFailure: null,
          lastDecisionReceipt: {
            deletedComments: [{ id: 'comment-1' }],
          },
        },
      },
    } as unknown as Editor;

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: storyEditor,
      story: footnoteStory,
      runtimeRef: { storyKey: 'fn:5', rawId: 'raw-1' },
      change: {
        id: 'canon-1',
        rawId: 'raw-1',
        from: 1,
        to: 2,
        attrs: {},
      },
    });

    const receipt = trackChangesRejectWrapper(hostEditor, { id: 'canon-1', story: footnoteStory });

    expect(receipt).toEqual({ success: true });
    expect(hostEditor.converter!.comments).toEqual([]);
  });

  it('detaches surviving comments from tracked-change threading when the decision receipt says to detach them', () => {
    const hostEditor = {
      ...makeEditor(),
      converter: {
        comments: [
          {
            commentId: 'comment-2',
            trackedChange: true,
            trackedChangeParentId: 'canon-1',
            trackedChangeType: 'delete',
            trackedChangeAnchorKey: 'tc::body::canon-1',
            trackedChangeText: 'deleted text',
            deletedText: 'deleted text',
          },
        ],
      },
    } as unknown as Editor;
    const storyEditor = {
      ...makeEditor({ acceptTrackedChangeById: vi.fn(() => true) }),
      storage: {
        trackChanges: {
          lastDecisionFailure: null,
          lastDecisionReceipt: {
            detachedComments: [{ id: 'comment-2' }],
          },
        },
      },
    } as unknown as Editor;

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: storyEditor,
      story: footnoteStory,
      runtimeRef: { storyKey: 'fn:5', rawId: 'raw-1' },
      change: {
        id: 'canon-1',
        rawId: 'raw-1',
        from: 1,
        to: 2,
        attrs: {},
      },
    });

    const receipt = trackChangesAcceptWrapper(hostEditor, { id: 'canon-1', story: footnoteStory });

    expect(receipt).toEqual({ success: true });
    expect(hostEditor.converter!.comments[0]).toMatchObject({
      commentId: 'comment-2',
      trackedChange: false,
      trackedChangeParentId: null,
      trackedChangeType: null,
      trackedChangeAnchorKey: null,
      trackedChangeText: null,
      deletedText: null,
    });
  });

  it('prunes tracked-change comment roots whose anchors disappear even when the decision receipt does not enumerate them', () => {
    const hostEditor = {
      ...makeEditor(),
      options: { trackedChanges: {}, documentId: 'doc-1' },
      emit: vi.fn(),
      converter: {
        comments: [
          { commentId: 'comment-3', trackedChange: true, trackedChangeParentId: 'canon-1' },
          { commentId: 'reply-3', parentCommentId: 'comment-3' },
        ],
      },
    } as unknown as Editor;
    const storyEditor = {
      ...makeEditor({ acceptTrackedChangeById: vi.fn(() => true) }),
      storage: {
        trackChanges: {
          lastDecisionFailure: null,
          lastDecisionReceipt: null,
        },
      },
    } as unknown as Editor;

    mocks.resolveCommentAnchorsById.mockReturnValue([]);
    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor: storyEditor,
      story: footnoteStory,
      runtimeRef: { storyKey: 'fn:5', rawId: 'raw-1' },
      change: {
        id: 'canon-1',
        rawId: 'raw-1',
        from: 1,
        to: 2,
        attrs: {},
      },
    });

    const receipt = trackChangesAcceptWrapper(hostEditor, { id: 'canon-1', story: footnoteStory });

    expect(receipt).toEqual({ success: true });
    expect(hostEditor.converter!.comments).toEqual([]);
    expect(hostEditor.emit).toHaveBeenCalledWith('commentsUpdate', {
      type: 'deleted',
      comment: {
        commentId: 'comment-3',
        documentId: 'doc-1',
        fileId: 'doc-1',
      },
    });
  });

  it('checks expectedRevision once on the host editor for accept-all across multiple stories', () => {
    const hostEditor = makeEditor();
    const bodyEditor = makeEditor({ acceptAllTrackedChanges: vi.fn(() => true) });
    const footnoteEditor = makeEditor({ acceptAllTrackedChanges: vi.fn(() => true) });
    const bodyCommit = vi.fn();
    const footnoteCommit = vi.fn();

    const bodyStory = { kind: 'story', storyType: 'body' } as const;
    const snapshots = [
      {
        story: bodyStory,
        runtimeRef: { storyKey: 'body', rawId: 'raw-body' },
      },
      {
        story: footnoteStory,
        runtimeRef: { storyKey: 'fn:5', rawId: 'raw-fn' },
      },
    ];
    const index = {
      get: vi.fn(() => []),
      getAll: vi.fn(() => snapshots),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };

    mocks.getTrackedChangeIndex.mockReturnValue(index);
    mocks.resolveStoryRuntime.mockImplementation((_host: Editor, story: StoryLocator) => {
      if (story.storyType === 'body') {
        return { editor: bodyEditor, storyKey: 'body', locator: story, kind: 'body', commit: bodyCommit };
      }

      return { editor: footnoteEditor, storyKey: 'fn:5', locator: story, kind: 'note', commit: footnoteCommit };
    });

    const receipt = trackChangesAcceptAllWrapper(hostEditor, {}, { expectedRevision: '33' });

    expect(receipt).toEqual({ success: true });
    expect(mocks.checkRevision).toHaveBeenCalledTimes(1);
    expect(mocks.checkRevision).toHaveBeenCalledWith(hostEditor, '33');
    expect(mocks.executeDomainCommand).toHaveBeenNthCalledWith(1, bodyEditor, expect.any(Function));
    expect(mocks.executeDomainCommand).toHaveBeenNthCalledWith(2, footnoteEditor, expect.any(Function));
    expect(bodyCommit).toHaveBeenCalledWith(hostEditor);
    expect(footnoteCommit).toHaveBeenCalledWith(hostEditor);
    expect(index.invalidate).toHaveBeenCalledWith(bodyStory);
    expect(index.invalidate).toHaveBeenCalledWith(footnoteStory);
  });

  it('scopes accept-all to the requested story when a bulk story filter is provided', () => {
    const hostEditor = makeEditor();
    const bodyEditor = makeEditor({ acceptAllTrackedChanges: vi.fn(() => true) });
    const footnoteEditor = makeEditor({ acceptAllTrackedChanges: vi.fn(() => true) });
    const bodyCommit = vi.fn();
    const footnoteCommit = vi.fn();

    const bodyStory = { kind: 'story', storyType: 'body' } as const;
    const snapshots = [
      {
        story: bodyStory,
        runtimeRef: { storyKey: 'body', rawId: 'raw-body' },
      },
      {
        story: footnoteStory,
        runtimeRef: { storyKey: 'fn:5', rawId: 'raw-fn' },
      },
    ];
    const index = {
      get: vi.fn(() => []),
      getAll: vi.fn(() => snapshots),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    };

    mocks.getTrackedChangeIndex.mockReturnValue(index);
    mocks.resolveStoryRuntime.mockImplementation((_host: Editor, story: StoryLocator) => {
      if (story.storyType === 'body') {
        return { editor: bodyEditor, storyKey: 'body', locator: story, kind: 'body', commit: bodyCommit };
      }

      return { editor: footnoteEditor, storyKey: 'fn:5', locator: story, kind: 'note', commit: footnoteCommit };
    });

    const receipt = trackChangesAcceptAllWrapper(hostEditor, { story: footnoteStory });

    expect(receipt).toEqual({ success: true });
    expect(mocks.executeDomainCommand).toHaveBeenCalledTimes(1);
    expect(mocks.executeDomainCommand).toHaveBeenCalledWith(footnoteEditor, expect.any(Function));
    expect(bodyCommit).not.toHaveBeenCalled();
    expect(footnoteCommit).toHaveBeenCalledWith(hostEditor);
    expect(index.invalidate).toHaveBeenCalledTimes(1);
    expect(index.invalidate).toHaveBeenCalledWith(footnoteStory);
  });

  it('resolves range targets against v1 sdBlockId attributes', () => {
    const acceptTrackedChangesBetween = vi.fn(() => true);
    const invalidate = vi.fn();
    const hostEditor = makeRangeDecisionEditor({ acceptTrackedChangesBetween });
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => []),
      getAll: vi.fn(() => []),
      invalidate,
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const receipt = trackChangesDecideRangeWrapper(hostEditor, {
      decision: 'accept',
      range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 2, end: 4 } }] },
    });

    expect(receipt).toEqual({ success: true });
    expect(acceptTrackedChangesBetween).toHaveBeenCalledWith(8, 10);
    expect(invalidate).toHaveBeenCalledWith({ kind: 'story', storyType: 'body' });
  });

  it('resolves range targets through flattened text offsets for inline wrappers', () => {
    const acceptTrackedChangesBetween = vi.fn(() => true);
    const hostEditor = makeRangeDecisionEditor(
      { acceptTrackedChangesBetween },
      makeParagraphNode({ sdBlockId: 'p1' }, makeInlineWrapper(makeTextNode('Hi'))),
      5,
    );

    const receipt = trackChangesDecideRangeWrapper(hostEditor, {
      decision: 'accept',
      range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 2 } }] },
    });

    expect(receipt).toEqual({ success: true });
    expect(acceptTrackedChangesBetween).toHaveBeenCalledWith(7, 9);
  });

  it('preserves typed overlap decision failures for range document-api calls', () => {
    const acceptTrackedChangesBetween = vi.fn(() => false);
    const hostEditor = {
      options: { trackedChanges: {} },
      commands: { acceptTrackedChangesBetween },
      storage: {
        trackChanges: {
          lastDecisionFailure: {
            code: 'TARGET_NOT_FOUND',
            message: 'no tracked changes match the requested decision target.',
          },
        },
      },
      state: makeRangeDecisionEditor({}).state,
    } as unknown as Editor;

    const receipt = trackChangesDecideRangeWrapper(hostEditor, {
      decision: 'accept',
      range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 2, end: 4 } }] },
    });

    expect(receipt).toEqual({
      success: false,
      failure: {
        code: 'TARGET_NOT_FOUND',
        message: 'no tracked changes match the requested decision target.',
        details: {
          range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 2, end: 4 } }] },
          story: undefined,
        },
      },
    });
    expectTrackChangesDecideReceiptCodeDeclared('TARGET_NOT_FOUND');
  });

  it('keeps precondition range decision receipt failures declared in document-api metadata', () => {
    const acceptTrackedChangesBetween = vi.fn(() => false);
    const hostEditor = {
      options: { trackedChanges: {} },
      commands: { acceptTrackedChangesBetween },
      storage: {
        trackChanges: {
          lastDecisionFailure: {
            code: 'PRECONDITION_FAILED',
            message: 'tracked review graph has invariant errors before decision.',
            details: { diagnostics: [{ code: 'INV_REPLACEMENT_MISSING_SIDE' }] },
          },
        },
      },
      state: makeRangeDecisionEditor({}).state,
    } as unknown as Editor;

    const receipt = trackChangesDecideRangeWrapper(hostEditor, {
      decision: 'accept',
      range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 2, end: 4 } }] },
    });

    expect(receipt).toEqual({
      success: false,
      failure: {
        code: 'PRECONDITION_FAILED',
        message: 'tracked review graph has invariant errors before decision.',
        details: { diagnostics: [{ code: 'INV_REPLACEMENT_MISSING_SIDE' }] },
      },
    });
    expectTrackChangesDecideReceiptCodeDeclared('PRECONDITION_FAILED');
  });

  it('keeps unresolved range target receipt failures declared in document-api metadata', () => {
    const hostEditor = makeRangeDecisionEditor({ acceptTrackedChangesBetween: vi.fn(() => true) });

    const receipt = trackChangesDecideRangeWrapper(hostEditor, {
      decision: 'accept',
      range: { kind: 'text', segments: [{ blockId: 'missing', range: { start: 0, end: 1 } }] },
    });

    expect(receipt).toEqual({
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'trackChanges.decide range could not be resolved to a contiguous PM coordinate.',
        details: { range: { kind: 'text', segments: [{ blockId: 'missing', range: { start: 0, end: 1 } }] } },
      },
    });
    expectTrackChangesDecideReceiptCodeDeclared('INVALID_TARGET');
  });
});

describe('track-changes-wrappers projected id cache', () => {
  it('keeps default paired replacements as one replacement public list item', () => {
    const editor = makeEditor();
    const replacementSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-replacement-1' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-replacement-1' },
      story: { kind: 'story', storyType: 'body' },
      type: 'replacement',
      excerpt: 'oldnew',
      wordRevisionIds: { insert: '11', delete: '10' },
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-replacement-1',
      hasInsert: true,
      hasDelete: true,
      hasFormat: false,
      range: { from: 4, to: 10 },
    };

    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [replacementSnapshot]),
      getAll: vi.fn(() => [replacementSnapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(editor);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'tc-replacement-1',
      type: 'replacement',
      grouping: 'replacement-pair',
      wordRevisionIds: { insert: '11', delete: '10' },
    });
    expect(result.items[0]?.id).not.toContain('#');

    const replacementFiltered = trackChangesListWrapper(editor, { type: 'replacement' });
    expect(replacementFiltered.total).toBe(1);
    expect(replacementFiltered.items).toHaveLength(1);

    const insertFiltered = trackChangesListWrapper(editor, { type: 'insert' });
    expect(insertFiltered.total).toBe(0);
    expect(insertFiltered.items).toEqual([]);

    const deleteFiltered = trackChangesListWrapper(editor, { type: 'delete' });
    expect(deleteFiltered.total).toBe(0);
    expect(deleteFiltered.items).toEqual([]);
  });

  it('returns replacement type for paired replacement get lookups', () => {
    const editor = makeEditor();
    const replacementSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-replacement-1' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-replacement-1' },
      story: { kind: 'story', storyType: 'body' },
      type: 'replacement',
      excerpt: 'oldnew',
      wordRevisionIds: { insert: '11', delete: '10' },
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-replacement-1',
      hasInsert: true,
      hasDelete: true,
      hasFormat: false,
      range: { from: 4, to: 10 },
    };

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor,
      story: { kind: 'story', storyType: 'body' },
      runtimeRef: replacementSnapshot.runtimeRef,
      change: {
        id: 'tc-replacement-1',
        rawId: 'tc-replacement-1',
        from: 4,
        to: 10,
        hasInsert: true,
        hasDelete: true,
        hasFormat: false,
        attrs: {},
      },
    });
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [replacementSnapshot]),
      getAll: vi.fn(() => [replacementSnapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    expect(trackChangesGetWrapper(editor, { id: 'tc-replacement-1' })).toMatchObject({
      id: 'tc-replacement-1',
      type: 'replacement',
      grouping: 'replacement-pair',
      wordRevisionIds: { insert: '11', delete: '10' },
    });
  });

  it('preserves overlap metadata in trackChanges.list and trackChanges.get output', () => {
    const editor = makeEditor();
    const overlap = {
      visualLayers: [
        { id: 'tc-parent', type: 'insert', relationship: 'parent' },
        { id: 'tc-child', type: 'delete', relationship: 'child' },
      ],
      preferredContextTargetId: 'tc-child',
      preferredContextTarget: { id: 'tc-child', type: 'delete', relationship: 'child' },
    };
    const parentSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-parent' },
      runtimeRef: { storyKey: 'body', rawId: 'parent-raw' },
      story: { kind: 'story', storyType: 'body' },
      type: 'insert',
      excerpt: 'review',
      overlap,
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::parent-raw',
      hasInsert: true,
      hasDelete: false,
      hasFormat: false,
      range: { from: 4, to: 10 },
    };
    const childSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-child' },
      runtimeRef: { storyKey: 'body', rawId: 'child-raw' },
      story: { kind: 'story', storyType: 'body' },
      type: 'delete',
      excerpt: 'review',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::child-raw',
      hasInsert: false,
      hasDelete: true,
      hasFormat: false,
      range: { from: 4, to: 10 },
    };

    mocks.resolveTrackedChangeInStory.mockReturnValue({
      editor,
      story: { kind: 'story', storyType: 'body' },
      runtimeRef: parentSnapshot.runtimeRef,
      change: {
        id: 'tc-parent',
        rawId: 'parent-raw',
        from: 4,
        to: 10,
        hasInsert: true,
        hasDelete: false,
        hasFormat: false,
        attrs: {},
        overlap,
      },
    });
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [parentSnapshot, childSnapshot]),
      getAll: vi.fn(() => [parentSnapshot, childSnapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const listResult = trackChangesListWrapper(editor);

    expect(listResult.items).toHaveLength(2);
    expect(listResult.items[0]).toMatchObject({
      id: 'tc-parent',
      type: 'insert',
      grouping: 'standalone',
      overlap,
    });

    expect(trackChangesGetWrapper(editor, { id: 'tc-parent' })).toMatchObject({
      id: 'tc-parent',
      type: 'insert',
      grouping: 'standalone',
      overlap,
    });
  });

  it('collapses split paired replacements into one public replacement item by default', () => {
    const editor = makeEditor();
    const insertedSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-insert' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-insert' },
      story: { kind: 'story', storyType: 'body' },
      type: 'insert',
      excerpt: 'new',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-insert',
      commandRawId: 'replacement-command-1',
      replacementGroupId: 'replacement-1',
      replacementSideId: 'replacement-1#inserted',
      hasInsert: true,
      hasDelete: false,
      hasFormat: false,
      range: { from: 4, to: 7 },
    };
    const deletedSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-delete' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-delete' },
      story: { kind: 'story', storyType: 'body' },
      type: 'delete',
      excerpt: 'old',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-delete',
      commandRawId: 'replacement-command-1',
      replacementGroupId: 'replacement-1',
      replacementSideId: 'replacement-1#deleted',
      hasInsert: false,
      hasDelete: true,
      hasFormat: false,
      range: { from: 7, to: 10 },
    };

    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [insertedSnapshot, deletedSnapshot]),
      getAll: vi.fn(() => [insertedSnapshot, deletedSnapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(editor);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'tc-insert',
      type: 'replacement',
      grouping: 'replacement-pair',
      pairedWithChangeId: undefined,
      insertedText: 'new',
      deletedText: 'old',
    });
  });

  it('keeps split replacement sides separate in independent mode', () => {
    const editor = makeEditor({}, { trackedChanges: { replacements: 'independent' } });
    const insertedSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-insert' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-insert' },
      story: { kind: 'story', storyType: 'body' },
      type: 'insert',
      excerpt: 'new',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-insert',
      commandRawId: 'replacement-command-1',
      replacementGroupId: 'replacement-1',
      replacementSideId: 'replacement-1#inserted',
      hasInsert: true,
      hasDelete: false,
      hasFormat: false,
      range: { from: 4, to: 7 },
    };
    const deletedSnapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-delete' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-delete' },
      story: { kind: 'story', storyType: 'body' },
      type: 'delete',
      excerpt: 'old',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-delete',
      commandRawId: 'replacement-command-1',
      replacementGroupId: 'replacement-1',
      replacementSideId: 'replacement-1#deleted',
      hasInsert: false,
      hasDelete: true,
      hasFormat: false,
      range: { from: 7, to: 10 },
    };

    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [insertedSnapshot, deletedSnapshot]),
      getAll: vi.fn(() => [insertedSnapshot, deletedSnapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(editor);

    expect(result.total).toBe(2);
    expect(result.items.map((item) => [item.id, item.type, item.grouping, item.pairedWithChangeId])).toEqual([
      ['tc-insert', 'insert', 'standalone', undefined],
      ['tc-delete', 'delete', 'standalone', undefined],
    ]);
  });

  it('projects combined replacement snapshots as replacement even when raw type is format', () => {
    const editor = makeEditor();
    const snapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-replacement-2' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-replacement-2' },
      story: { kind: 'story', storyType: 'body' },
      type: 'format',
      excerpt: 'native replacement',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-replacement-2',
      hasInsert: true,
      hasDelete: true,
      hasFormat: true,
      range: { from: 10, to: 30 },
    };

    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [snapshot]),
      getAll: vi.fn(() => [snapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(editor);

    expect(result.items[0]).toMatchObject({
      id: 'tc-replacement-2',
      type: 'replacement',
      grouping: 'replacement-pair',
    });
  });

  it('caches list ids for reuse on the same editor revision', () => {
    const editor = makeEditor();
    const snapshot = {
      address: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc-del-1' },
      runtimeRef: { storyKey: 'body', rawId: 'tc-del-1' },
      story: { kind: 'story', storyType: 'body' },
      type: 'delete',
      excerpt: 'deleted text',
      storyLabel: 'Body',
      storyKind: 'body',
      anchorKey: 'tc::body::tc-del-1',
      hasInsert: false,
      hasDelete: true,
      hasFormat: false,
      range: { from: 19, to: 27 },
    };

    mocks.getRevision.mockReturnValue('4');
    mocks.getTrackedChangeIndex.mockReturnValue({
      get: vi.fn(() => [snapshot]),
      getAll: vi.fn(() => [snapshot]),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      subscribe: vi.fn(),
      dispose: vi.fn(),
    });

    const result = trackChangesListWrapper(editor);

    expect(result.items[0]?.id).toBe('tc-del-1');
    expect(getCachedProjectedTrackedChangeSnapshot(editor, 'tc-del-1')).toBe(snapshot);

    mocks.getRevision.mockReturnValue('5');
    expect(getCachedProjectedTrackedChangeSnapshot(editor, 'tc-del-1')).toBeNull();
  });
});
