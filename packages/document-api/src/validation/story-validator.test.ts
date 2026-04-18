import { describe, it, expect } from 'vitest';
import { validateStoryLocator, validateStoryConsistency } from './story-validator.js';
import { DocumentApiValidationError } from '../errors.js';
import type { StoryLocator } from '../types/story.types.js';

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

const hfSlotLocator: StoryLocator = {
  kind: 'story',
  storyType: 'headerFooterSlot',
  section: { kind: 'section', sectionId: 'sec1' },
  headerFooterKind: 'header',
  variant: 'default',
};

// ---------------------------------------------------------------------------
// validateStoryLocator
// ---------------------------------------------------------------------------

describe('validateStoryLocator', () => {
  it('passes for undefined', () => {
    expect(() => validateStoryLocator(undefined, 'input.in')).not.toThrow();
  });

  it('passes for null', () => {
    expect(() => validateStoryLocator(null, 'input.in')).not.toThrow();
  });

  it('passes for a valid body locator', () => {
    expect(() => validateStoryLocator(bodyLocator, 'input.in')).not.toThrow();
  });

  it('passes for a valid footnote locator', () => {
    expect(() => validateStoryLocator(footnoteLocator, 'input.in')).not.toThrow();
  });

  it('passes for a valid endnote locator', () => {
    expect(() => validateStoryLocator(endnoteLocator, 'input.in')).not.toThrow();
  });

  it('passes for a valid headerFooterSlot locator', () => {
    expect(() => validateStoryLocator(hfSlotLocator, 'input.in')).not.toThrow();
  });

  it('throws INVALID_INPUT for empty object', () => {
    expect(() => validateStoryLocator({}, 'input.in')).toThrow(DocumentApiValidationError);
  });

  it('throws INVALID_INPUT for wrong kind', () => {
    expect(() => validateStoryLocator({ kind: 'other', storyType: 'body' }, 'input.in')).toThrow(
      DocumentApiValidationError,
    );
  });

  it('throws INVALID_INPUT for unknown storyType', () => {
    expect(() => validateStoryLocator({ kind: 'story', storyType: 'unknown' }, 'input.in')).toThrow(
      DocumentApiValidationError,
    );
  });

  it('throws INVALID_INPUT for an incomplete headerFooterSlot locator', () => {
    expect(() => validateStoryLocator({ kind: 'story', storyType: 'headerFooterSlot' }, 'input.in')).toThrow(
      DocumentApiValidationError,
    );
  });

  it('throws INVALID_INPUT for a headerFooterSlot locator with an invalid section shape', () => {
    expect(() =>
      validateStoryLocator(
        {
          kind: 'story',
          storyType: 'headerFooterSlot',
          section: { kind: 'other', sectionId: 'sec1' },
          headerFooterKind: 'header',
          variant: 'default',
        },
        'input.in',
      ),
    ).toThrow(DocumentApiValidationError);
  });

  it('throws INVALID_INPUT for a string', () => {
    expect(() => validateStoryLocator('body', 'input.in')).toThrow(DocumentApiValidationError);
  });

  it('throws INVALID_INPUT for a number', () => {
    expect(() => validateStoryLocator(42, 'input.in')).toThrow(DocumentApiValidationError);
  });

  it('includes the field name in the error', () => {
    try {
      validateStoryLocator({}, 'myField');
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiValidationError);
      const err = e as DocumentApiValidationError;
      expect(err.code).toBe('INVALID_INPUT');
      expect(err.message).toContain('myField');
    }
  });
});

// ---------------------------------------------------------------------------
// validateStoryConsistency
// ---------------------------------------------------------------------------

describe('validateStoryConsistency', () => {
  it('passes when both inputIn and targetStory are undefined', () => {
    expect(() => validateStoryConsistency(undefined, undefined, undefined)).not.toThrow();
  });

  it('passes when only inputIn is set', () => {
    expect(() => validateStoryConsistency(footnoteLocator, undefined, undefined)).not.toThrow();
  });

  it('passes when only targetStory is set', () => {
    expect(() => validateStoryConsistency(undefined, endnoteLocator, undefined)).not.toThrow();
  });

  it('passes when inputIn and targetStory match', () => {
    const locatorA: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: 'fn1' };
    const locatorB: StoryLocator = { kind: 'story', storyType: 'footnote', noteId: 'fn1' };
    expect(() => validateStoryConsistency(locatorA, locatorB, undefined)).not.toThrow();
  });

  it('throws STORY_MISMATCH when inputIn and targetStory differ', () => {
    try {
      validateStoryConsistency(footnoteLocator, endnoteLocator, undefined);
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiValidationError);
      expect((e as DocumentApiValidationError).code).toBe('STORY_MISMATCH');
    }
  });

  it('throws STORY_MISMATCH for body vs footnote', () => {
    expect(() => validateStoryConsistency(bodyLocator, footnoteLocator, undefined)).toThrow(DocumentApiValidationError);
  });

  it('throws STORY_MISMATCH when header/footer slot locators differ only by resolution mode', () => {
    expect(() =>
      validateStoryConsistency(
        hfSlotLocator,
        {
          ...hfSlotLocator,
          resolution: 'explicit',
        },
        undefined,
      ),
    ).toThrow(DocumentApiValidationError);
  });

  it('throws STORY_MISMATCH when header/footer slot locators differ only by onWrite mode', () => {
    expect(() =>
      validateStoryConsistency(
        hfSlotLocator,
        {
          ...hfSlotLocator,
          onWrite: 'error',
        },
        undefined,
      ),
    ).toThrow(DocumentApiValidationError);
  });

  it('throws INVALID_INPUT when withinStory is set', () => {
    try {
      validateStoryConsistency(undefined, undefined, bodyLocator);
      expect.fail('Expected an error');
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentApiValidationError);
      expect((e as DocumentApiValidationError).code).toBe('INVALID_INPUT');
    }
  });

  it('throws for withinStory even if inputIn and targetStory match', () => {
    expect(() => validateStoryConsistency(footnoteLocator, footnoteLocator, bodyLocator)).toThrow(
      DocumentApiValidationError,
    );
  });

  it('throws for withinStory even when it matches inputIn', () => {
    expect(() => validateStoryConsistency(footnoteLocator, undefined, footnoteLocator)).toThrow(
      DocumentApiValidationError,
    );
  });
});
