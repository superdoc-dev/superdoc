import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import type { StoryLocator } from '@superdoc/document-api';

const mocks = vi.hoisted(() => ({
  checkRevision: vi.fn(),
  getRevision: vi.fn(() => '0'),
  executeDomainCommand: vi.fn(),
  resolveTrackedChangeInStory: vi.fn(),
  getTrackedChangeIndex: vi.fn(),
  resolveStoryRuntime: vi.fn(),
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

import { trackChangesAcceptAllWrapper, trackChangesAcceptWrapper } from './track-changes-wrappers.js';

const footnoteStory: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: '5' };

function makeEditor(commands: Record<string, unknown> = {}): Editor {
  return {
    commands,
    state: { doc: { textBetween: vi.fn(() => '') } },
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
});

describe('track-changes-wrappers revision guard', () => {
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
});
