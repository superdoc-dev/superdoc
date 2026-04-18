import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryLocator, MutationStep } from '@superdoc/document-api';
import { selectionMutationWrapper } from './plan-wrappers.js';
import { encodeV4Ref } from '../story-runtime/story-ref-codec.js';
import { buildStoryKey } from '../story-runtime/story-key.js';
import { DocumentApiAdapterError } from '../errors.js';

const mockedDeps = vi.hoisted(() => ({
  resolveStoryRuntime: vi.fn(),
  compilePlan: vi.fn(),
  executeCompiledPlan: vi.fn(),
  checkRevision: vi.fn(),
  getRevision: vi.fn(() => 'rev-1'),
}));

vi.mock('../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: mockedDeps.resolveStoryRuntime,
}));

vi.mock('./compiler.js', () => ({
  compilePlan: mockedDeps.compilePlan,
}));

vi.mock('./executor.js', () => ({
  executeCompiledPlan: mockedDeps.executeCompiledPlan,
}));

vi.mock('./revision-tracker.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./revision-tracker.js')>();
  return {
    ...original,
    checkRevision: mockedDeps.checkRevision,
    getRevision: mockedDeps.getRevision,
  };
});

const headerStory: StoryLocator = {
  kind: 'story',
  storyType: 'headerFooterSlot',
  section: { kind: 'section', sectionId: 'sec-1' },
  headerFooterKind: 'header',
  variant: 'default',
  resolution: 'explicit',
  onWrite: 'error',
};

function makeRef(story: StoryLocator): string {
  return encodeV4Ref({
    v: 4,
    rev: 'story-rev-1',
    storyKey: buildStoryKey(story),
    scope: 'match',
    matchId: 'm:0',
    segments: [{ blockId: 'p1', start: 0, end: 5 }],
  });
}

function makeCompiledPlan(step: MutationStep) {
  return {
    mutationSteps: [
      {
        step,
        targets: [
          {
            kind: 'range',
            stepId: step.id,
            op: step.op,
            blockId: 'p1',
            from: 0,
            to: 5,
            absFrom: 1,
            absTo: 6,
            text: 'Hello',
            marks: [],
          },
        ],
      },
    ],
    assertSteps: [],
    compiledRevision: 'story-rev-1',
  };
}

describe('selectionMutationWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedDeps.resolveStoryRuntime.mockReturnValue({
      locator: headerStory,
      storyKey: buildStoryKey(headerStory),
      editor: { id: 'header-editor' },
      kind: 'headerFooter',
    });

    mockedDeps.compilePlan.mockImplementation((_editor: unknown, steps: MutationStep[]) => makeCompiledPlan(steps[0]));

    mockedDeps.executeCompiledPlan.mockImplementation(
      (_editor: unknown, compiled: ReturnType<typeof makeCompiledPlan>) => ({
        steps: [
          {
            stepId: compiled.mutationSteps[0].step.id,
            effect: 'changed',
          },
        ],
      }),
    );
  });

  it('resolves the write runtime from a V4 ref story when the mutation is ref-only', () => {
    const hostEditor = { id: 'host-editor' } as any;
    const ref = makeRef(headerStory);

    const receipt = selectionMutationWrapper(hostEditor, {
      kind: 'replace',
      ref,
      text: 'Updated header',
    });

    expect(receipt.success).toBe(true);
    expect(mockedDeps.resolveStoryRuntime).toHaveBeenCalledWith(hostEditor, headerStory, { intent: 'write' });
    expect(mockedDeps.compilePlan).toHaveBeenCalledWith(
      mockedDeps.resolveStoryRuntime.mock.results[0].value.editor,
      expect.any(Array),
    );
  });

  it('rejects ref-only mutations whose explicit input.in conflicts with the ref story semantics', () => {
    const hostEditor = { id: 'host-editor' } as any;
    const ref = makeRef({
      ...headerStory,
      resolution: undefined,
      onWrite: undefined,
    });

    expect(() =>
      selectionMutationWrapper(hostEditor, {
        kind: 'replace',
        ref,
        text: 'Updated header',
        in: headerStory,
      }),
    ).toThrow(DocumentApiAdapterError);

    expect(mockedDeps.resolveStoryRuntime).not.toHaveBeenCalled();
  });
});
