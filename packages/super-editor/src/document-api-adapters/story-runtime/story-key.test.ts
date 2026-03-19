import { describe, it, expect } from 'vitest';
import { buildStoryKey, parseStoryKeyType, BODY_STORY_KEY } from './story-key.js';
import type { StoryLocator } from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// buildStoryKey
// ---------------------------------------------------------------------------

describe('buildStoryKey', () => {
  it('returns "body" for a body locator', () => {
    const locator: StoryLocator = { kind: 'story', storyType: 'body' };
    expect(buildStoryKey(locator)).toBe('body');
  });

  it('equals the BODY_STORY_KEY constant for body', () => {
    const locator: StoryLocator = { kind: 'story', storyType: 'body' };
    expect(buildStoryKey(locator)).toBe(BODY_STORY_KEY);
  });

  it('returns "hf:slot:{sectionId}:{kind}:{variant}" for headerFooterSlot', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 'sec2' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    expect(buildStoryKey(locator)).toBe('hf:slot:sec2:header:default');
  });

  it('encodes all headerFooterSlot variant combinations', () => {
    const variants = ['default', 'first', 'even'] as const;
    const kinds = ['header', 'footer'] as const;

    for (const variant of variants) {
      for (const hfKind of kinds) {
        const locator: StoryLocator = {
          kind: 'story',
          storyType: 'headerFooterSlot',
          section: { kind: 'section', sectionId: 's1' },
          headerFooterKind: hfKind,
          variant,
        };
        expect(buildStoryKey(locator)).toBe(`hf:slot:s1:${hfKind}:${variant}`);
      }
    }
  });

  it('returns "hf:part:{refId}" for headerFooterPart', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterPart',
      refId: 'rId7',
    };
    expect(buildStoryKey(locator)).toBe('hf:part:rId7');
  });

  it('returns "fn:{noteId}" for footnote', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'footnote',
      noteId: '12',
    };
    expect(buildStoryKey(locator)).toBe('fn:12');
  });

  it('returns "en:{noteId}" for endnote', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'endnote',
      noteId: '3',
    };
    expect(buildStoryKey(locator)).toBe('en:3');
  });
});

// ---------------------------------------------------------------------------
// parseStoryKeyType
// ---------------------------------------------------------------------------

describe('parseStoryKeyType', () => {
  it('returns "body" for the body key', () => {
    expect(parseStoryKeyType('body')).toBe('body');
  });

  it('returns "headerFooter" for hf:slot keys', () => {
    expect(parseStoryKeyType('hf:slot:sec2:header:default')).toBe('headerFooter');
  });

  it('returns "headerFooter" for hf:part keys', () => {
    expect(parseStoryKeyType('hf:part:rId7')).toBe('headerFooter');
  });

  it('returns "note" for fn: keys', () => {
    expect(parseStoryKeyType('fn:12')).toBe('note');
  });

  it('returns "note" for en: keys', () => {
    expect(parseStoryKeyType('en:3')).toBe('note');
  });

  it('throws for unrecognized key prefixes', () => {
    expect(() => parseStoryKeyType('unknown:123')).toThrow(/Unrecognized story key prefix/);
    expect(() => parseStoryKeyType('')).toThrow(/Unrecognized story key prefix/);
  });
});
