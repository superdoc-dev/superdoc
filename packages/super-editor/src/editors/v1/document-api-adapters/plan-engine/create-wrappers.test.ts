/**
 * Regression tests for create.paragraph and create.heading story routing.
 *
 * Validates that create operations honor the `in` (StoryLocator) field by
 * resolving a story runtime and executing on the correct editor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryLocator } from '@superdoc/document-api';
import { createParagraphWrapper, createHeadingWrapper } from './create-wrappers.js';
import type { Editor } from '../../core/Editor.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  resolveStoryRuntime: vi.fn(),
  executeDomainCommand: vi.fn(),
  resolveCreateAnchor: vi.fn(),
  clearIndexCache: vi.fn(),
  getBlockIndex: vi.fn(),
  collectTrackInsertRefsInRange: vi.fn(),
  requireEditorCommand: vi.fn((cmd: unknown) => cmd),
  ensureTrackedCapability: vi.fn(),
}));

vi.mock('../story-runtime/resolve-story-runtime.js', () => ({
  resolveStoryRuntime: mocks.resolveStoryRuntime,
}));

vi.mock('./plan-wrappers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./plan-wrappers.js')>();
  return {
    ...original,
    resolveWriteStoryRuntime: (editor: Editor, locator?: StoryLocator) =>
      mocks.resolveStoryRuntime(editor, locator, { intent: 'write' }),
    executeDomainCommand: mocks.executeDomainCommand,
    disposeEphemeralWriteRuntime: vi.fn(),
  };
});

vi.mock('./create-insertion.js', () => ({
  resolveCreateAnchor: mocks.resolveCreateAnchor,
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: mocks.clearIndexCache,
  getBlockIndex: mocks.getBlockIndex,
}));

vi.mock('../helpers/tracked-change-refs.js', () => ({
  collectTrackInsertRefsInRange: mocks.collectTrackInsertRefsInRange,
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  requireEditorCommand: mocks.requireEditorCommand,
  ensureTrackedCapability: mocks.ensureTrackedCapability,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const footnoteLocator: StoryLocator = {
  kind: 'story',
  storyType: 'footnote',
  noteId: 'fn1',
};

function makeStoryEditor(): Editor {
  return {
    commands: {
      insertParagraphAt: vi.fn(() => true),
      insertHeadingAt: vi.fn(() => true),
    },
    can: () => ({
      insertParagraphAt: vi.fn(() => true),
      insertHeadingAt: vi.fn(() => true),
    }),
    state: {
      doc: {
        content: { size: 10 },
      },
    },
  } as unknown as Editor;
}

function makeHostEditor(): Editor {
  return {
    commands: {
      insertParagraphAt: vi.fn(() => true),
      insertHeadingAt: vi.fn(() => true),
    },
    can: () => ({
      insertParagraphAt: vi.fn(() => true),
      insertHeadingAt: vi.fn(() => true),
    }),
    state: {
      doc: {
        content: { size: 20 },
      },
    },
  } as unknown as Editor;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  mocks.executeDomainCommand.mockReturnValue({
    steps: [{ effect: 'changed' }],
  });
});

// ---------------------------------------------------------------------------
// create.paragraph — story routing
// ---------------------------------------------------------------------------

describe('createParagraphWrapper — story routing', () => {
  it('resolves the story runtime from input.in and executes on the story editor', () => {
    const hostEditor = makeHostEditor();
    const storyEditor = makeStoryEditor();
    const commitSpy = vi.fn();

    mocks.resolveStoryRuntime.mockReturnValue({
      locator: footnoteLocator,
      storyKey: 'fn:fn1',
      editor: storyEditor,
      kind: 'note',
      commit: commitSpy,
    });

    createParagraphWrapper(hostEditor, { in: footnoteLocator, text: 'Hello' });

    // Should resolve with the footnote locator
    expect(mocks.resolveStoryRuntime).toHaveBeenCalledWith(hostEditor, footnoteLocator, { intent: 'write' });

    // Should execute the command on the story editor, not the host editor
    expect(mocks.executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function), expect.any(Object));

    // Should commit changes back to the OOXML part
    expect(commitSpy).toHaveBeenCalledWith(hostEditor);
  });

  it('defaults to body when input.in is undefined', () => {
    const hostEditor = makeHostEditor();

    mocks.resolveStoryRuntime.mockReturnValue({
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'body',
      editor: hostEditor,
      kind: 'body',
    });

    createParagraphWrapper(hostEditor, { text: 'Hello' });

    // Should resolve with undefined (body default)
    expect(mocks.resolveStoryRuntime).toHaveBeenCalledWith(hostEditor, undefined, { intent: 'write' });
  });
});

// ---------------------------------------------------------------------------
// create.heading — story routing
// ---------------------------------------------------------------------------

describe('createHeadingWrapper — story routing', () => {
  it('resolves the story runtime from input.in and executes on the story editor', () => {
    const hostEditor = makeHostEditor();
    const storyEditor = makeStoryEditor();
    const commitSpy = vi.fn();

    mocks.resolveStoryRuntime.mockReturnValue({
      locator: footnoteLocator,
      storyKey: 'fn:fn1',
      editor: storyEditor,
      kind: 'note',
      commit: commitSpy,
    });

    createHeadingWrapper(hostEditor, { in: footnoteLocator, level: 2, text: 'Title' });

    // Should resolve with the footnote locator
    expect(mocks.resolveStoryRuntime).toHaveBeenCalledWith(hostEditor, footnoteLocator, { intent: 'write' });

    // Should execute on the story editor
    expect(mocks.executeDomainCommand).toHaveBeenCalledWith(storyEditor, expect.any(Function), expect.any(Object));

    // Should commit changes
    expect(commitSpy).toHaveBeenCalledWith(hostEditor);
  });

  it('defaults to body when input.in is undefined', () => {
    const hostEditor = makeHostEditor();

    mocks.resolveStoryRuntime.mockReturnValue({
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'body',
      editor: hostEditor,
      kind: 'body',
    });

    createHeadingWrapper(hostEditor, { level: 1, text: 'Heading' });

    expect(mocks.resolveStoryRuntime).toHaveBeenCalledWith(hostEditor, undefined, { intent: 'write' });
  });
});
