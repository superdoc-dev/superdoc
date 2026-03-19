import { describe, it, expect } from 'vitest';
import {
  isStoryLocator,
  isBodyStory,
  storyLocatorToKey,
  type StoryLocator,
  type BodyStoryLocator,
  type HeaderFooterSlotStoryLocator,
  type HeaderFooterPartStoryLocator,
  type FootnoteStoryLocator,
  type EndnoteStoryLocator,
} from './story.types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const bodyLocator: BodyStoryLocator = { kind: 'story', storyType: 'body' };

const hfSlotLocator: HeaderFooterSlotStoryLocator = {
  kind: 'story',
  storyType: 'headerFooterSlot',
  section: { kind: 'section', sectionId: 'sec1' },
  headerFooterKind: 'header',
  variant: 'default',
};

const hfPartLocator: HeaderFooterPartStoryLocator = {
  kind: 'story',
  storyType: 'headerFooterPart',
  refId: 'rId7',
};

const footnoteLocator: FootnoteStoryLocator = {
  kind: 'story',
  storyType: 'footnote',
  noteId: 'fn1',
};

const endnoteLocator: EndnoteStoryLocator = {
  kind: 'story',
  storyType: 'endnote',
  noteId: 'en3',
};

const allLocators: StoryLocator[] = [bodyLocator, hfSlotLocator, hfPartLocator, footnoteLocator, endnoteLocator];

// ---------------------------------------------------------------------------
// isStoryLocator
// ---------------------------------------------------------------------------

describe('isStoryLocator', () => {
  it.each(allLocators)('returns true for valid locator (storyType=$storyType)', (locator) => {
    expect(isStoryLocator(locator)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isStoryLocator(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isStoryLocator(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isStoryLocator({})).toBe(false);
  });

  it('returns false for object with unknown kind', () => {
    expect(isStoryLocator({ kind: 'other', storyType: 'body' })).toBe(false);
  });

  it('returns false for object with unknown storyType', () => {
    expect(isStoryLocator({ kind: 'story', storyType: 'unknown' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isStoryLocator('body')).toBe(false);
    expect(isStoryLocator(42)).toBe(false);
    expect(isStoryLocator(true)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isStoryLocator([{ kind: 'story', storyType: 'body' }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isBodyStory
// ---------------------------------------------------------------------------

describe('isBodyStory', () => {
  it('returns true for a body locator', () => {
    expect(isBodyStory(bodyLocator)).toBe(true);
  });

  it('returns false for non-body locators', () => {
    expect(isBodyStory(hfSlotLocator)).toBe(false);
    expect(isBodyStory(hfPartLocator)).toBe(false);
    expect(isBodyStory(footnoteLocator)).toBe(false);
    expect(isBodyStory(endnoteLocator)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// storyLocatorToKey
// ---------------------------------------------------------------------------

describe('storyLocatorToKey', () => {
  it('produces "story:body" for body locator', () => {
    expect(storyLocatorToKey(bodyLocator)).toBe('story:body');
  });

  it('produces correct key for headerFooterSlot', () => {
    expect(storyLocatorToKey(hfSlotLocator)).toBe('story:headerFooterSlot:sec1:header:default');
  });

  it('produces correct key for headerFooterSlot with different variants', () => {
    const evenFooter: HeaderFooterSlotStoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 'sec2' },
      headerFooterKind: 'footer',
      variant: 'even',
    };
    expect(storyLocatorToKey(evenFooter)).toBe('story:headerFooterSlot:sec2:footer:even');
  });

  it('produces correct key for headerFooterPart', () => {
    expect(storyLocatorToKey(hfPartLocator)).toBe('story:headerFooterPart:rId7');
  });

  it('produces correct key for footnote', () => {
    expect(storyLocatorToKey(footnoteLocator)).toBe('story:footnote:fn1');
  });

  it('produces correct key for endnote', () => {
    expect(storyLocatorToKey(endnoteLocator)).toBe('story:endnote:en3');
  });

  it('produces deterministic keys (same locator always yields same key)', () => {
    const key1 = storyLocatorToKey(hfSlotLocator);
    const key2 = storyLocatorToKey({ ...hfSlotLocator });
    expect(key1).toBe(key2);
  });
});
