import { describe, it, expect } from 'vitest';
import { resolveStoryFromInput } from './resolve-story-context.js';
import { DocumentApiAdapterError } from '../errors.js';
import type { StoryLocator } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const bodyLocator: StoryLocator = { kind: 'story', storyType: 'body' };

const footnoteLocator: StoryLocator = {
  kind: 'story',
  storyType: 'footnote',
  noteId: 'fn1',
};

const endnoteLocator: StoryLocator = {
  kind: 'story',
  storyType: 'endnote',
  noteId: 'en1',
};

const headerStoryLocator: StoryLocator = {
  kind: 'story',
  storyType: 'headerFooterSlot',
  section: { kind: 'section', sectionId: 'sec1' },
  headerFooterKind: 'header',
  variant: 'default',
};

// ---------------------------------------------------------------------------
// Default to body (undefined)
// ---------------------------------------------------------------------------

describe('resolveStoryFromInput — defaults', () => {
  it('returns undefined when all sources are absent', () => {
    expect(resolveStoryFromInput()).toBeUndefined();
  });

  it('returns undefined when input and target are both empty objects', () => {
    expect(resolveStoryFromInput({}, {})).toBeUndefined();
  });

  it('returns undefined when all three are empty objects', () => {
    expect(resolveStoryFromInput({}, {}, {})).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Single source
// ---------------------------------------------------------------------------

describe('resolveStoryFromInput — single source', () => {
  it('returns input.in when only it is set', () => {
    const result = resolveStoryFromInput({ in: footnoteLocator });
    expect(result).toBe(footnoteLocator);
  });

  it('returns target.story when only it is set', () => {
    const result = resolveStoryFromInput(undefined, { story: endnoteLocator });
    expect(result).toBe(endnoteLocator);
  });

  it('returns input.in when target is an empty object', () => {
    const result = resolveStoryFromInput({ in: bodyLocator }, {});
    expect(result).toBe(bodyLocator);
  });

  it('returns target.story when input is an empty object', () => {
    const result = resolveStoryFromInput({}, { story: footnoteLocator });
    expect(result).toBe(footnoteLocator);
  });
});

// ---------------------------------------------------------------------------
// Both match
// ---------------------------------------------------------------------------

describe('resolveStoryFromInput — both sources matching', () => {
  it('returns a locator when input.in and target.story agree', () => {
    const inputLocator: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: 'fn1' };
    const targetLocator: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: 'fn1' };

    const result = resolveStoryFromInput({ in: inputLocator }, { story: targetLocator });
    expect(result).toBeDefined();
    // Should return the input locator specifically.
    expect(result).toBe(inputLocator);
  });
});

// ---------------------------------------------------------------------------
// STORY_MISMATCH
// ---------------------------------------------------------------------------

describe('resolveStoryFromInput — STORY_MISMATCH', () => {
  it('throws when input.in and target.story differ', () => {
    expect(() => resolveStoryFromInput({ in: footnoteLocator }, { story: endnoteLocator })).toThrow(
      DocumentApiAdapterError,
    );
  });

  it('includes STORY_MISMATCH reason in details', () => {
    try {
      resolveStoryFromInput({ in: footnoteLocator }, { story: endnoteLocator });
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiAdapterError);
      const err = e as DocumentApiAdapterError;
      expect(err.code).toBe('INVALID_INPUT');
      expect((err.details as Record<string, unknown>)?.reason).toBe('STORY_MISMATCH');
    }
  });

  it('throws when body vs non-body', () => {
    expect(() => resolveStoryFromInput({ in: bodyLocator }, { story: footnoteLocator })).toThrow(
      DocumentApiAdapterError,
    );
  });

  it('throws when header/footer stories differ only by resolution mode', () => {
    expect(() =>
      resolveStoryFromInput(
        { in: headerStoryLocator },
        {
          story: {
            ...headerStoryLocator,
            resolution: 'explicit',
          },
        },
      ),
    ).toThrow(DocumentApiAdapterError);
  });

  it('throws when header/footer stories differ only by onWrite mode', () => {
    expect(() =>
      resolveStoryFromInput(
        { in: headerStoryLocator },
        {
          story: {
            ...headerStoryLocator,
            onWrite: 'error',
          },
        },
      ),
    ).toThrow(DocumentApiAdapterError);
  });
});

// ---------------------------------------------------------------------------
// within.story is rejected
// ---------------------------------------------------------------------------

describe('resolveStoryFromInput — within.story rejection', () => {
  it('throws INVALID_INPUT when within.story is set', () => {
    expect(() => resolveStoryFromInput({}, {}, { story: bodyLocator })).toThrow(DocumentApiAdapterError);
  });

  it('throws even when input and target are absent', () => {
    try {
      resolveStoryFromInput(undefined, undefined, { story: footnoteLocator });
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiAdapterError);
      expect((e as DocumentApiAdapterError).code).toBe('INVALID_INPUT');
    }
  });

  it('throws even when within.story matches input.in', () => {
    expect(() => resolveStoryFromInput({ in: footnoteLocator }, {}, { story: footnoteLocator })).toThrow(
      DocumentApiAdapterError,
    );
  });
});
