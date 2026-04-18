import { describe, it, expect } from 'vitest';
import { buildStoryKey, parseStoryKey, parseStoryKeyType, BODY_STORY_KEY } from './story-key.js';
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

  it('returns a normalized key for headerFooterSlot locators', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 'sec2' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    expect(buildStoryKey(locator)).toBe('hf:slot:sec2:header:default:effective:materializeIfInherited');
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
        expect(buildStoryKey(locator)).toBe(`hf:slot:s1:${hfKind}:${variant}:effective:materializeIfInherited`);
      }
    }
  });

  it('distinguishes headerFooterSlot keys by resolution mode', () => {
    const effective: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 's1' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    const explicit: StoryLocator = {
      ...effective,
      resolution: 'explicit',
    };

    expect(buildStoryKey(effective)).not.toBe(buildStoryKey(explicit));
  });

  it('distinguishes headerFooterSlot keys by onWrite mode', () => {
    const materialize: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 's1' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    const strict: StoryLocator = {
      ...materialize,
      onWrite: 'error',
    };

    expect(buildStoryKey(materialize)).not.toBe(buildStoryKey(strict));
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
// parseStoryKey
// ---------------------------------------------------------------------------

describe('parseStoryKey', () => {
  it('round-trips a normalized headerFooterSlot key', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 'sec2' },
      headerFooterKind: 'footer',
      variant: 'even',
      resolution: 'explicit',
      onWrite: 'error',
    };

    expect(parseStoryKey(buildStoryKey(locator))).toEqual(locator);
  });

  it('expands legacy headerFooterSlot keys to default semantics', () => {
    expect(parseStoryKey('hf:slot:sec2:header:default')).toEqual({
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 'sec2' },
      headerFooterKind: 'header',
      variant: 'default',
      resolution: 'effective',
      onWrite: 'materializeIfInherited',
    });
  });

  it('parses body, part, footnote, and endnote keys', () => {
    expect(parseStoryKey('body')).toEqual({ kind: 'story', storyType: 'body' });
    expect(parseStoryKey('hf:part:rId7')).toEqual({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' });
    expect(parseStoryKey('fn:12')).toEqual({ kind: 'story', storyType: 'footnote', noteId: '12' });
    expect(parseStoryKey('en:3')).toEqual({ kind: 'story', storyType: 'endnote', noteId: '3' });
  });

  it('throws for malformed headerFooterSlot keys', () => {
    expect(() => parseStoryKey('hf:slot:sec2:header')).toThrow(/Malformed header\/footer slot story key/);
    expect(() => parseStoryKey('hf:slot:sec2:header:default:sideways:error')).toThrow(/invalid resolution/i);
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
    expect(parseStoryKeyType('hf:slot:sec2:header:default:effective:materializeIfInherited')).toBe('headerFooter');
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
