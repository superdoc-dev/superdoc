import { describe, it, expect } from 'vitest';
import type { StoryLocator } from '@superdoc/document-api';
import { classifyStoryKind, describeStoryLocation } from './story-labels.js';

describe('classifyStoryKind', () => {
  it('classifies body stories', () => {
    expect(classifyStoryKind({ kind: 'story', storyType: 'body' })).toBe('body');
  });

  it('classifies header/footer slot stories as headerFooter', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: 's1' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    expect(classifyStoryKind(locator)).toBe('headerFooter');
  });

  it('classifies header/footer part stories as headerFooter', () => {
    expect(classifyStoryKind({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId1' })).toBe('headerFooter');
  });

  it('classifies footnote and endnote stories', () => {
    expect(classifyStoryKind({ kind: 'story', storyType: 'footnote', noteId: '1' })).toBe('footnote');
    expect(classifyStoryKind({ kind: 'story', storyType: 'endnote', noteId: '2' })).toBe('endnote');
  });
});

describe('describeStoryLocation', () => {
  it('returns an empty string for body stories', () => {
    expect(describeStoryLocation({ kind: 'story', storyType: 'body' })).toBe('');
  });

  it('labels default header/footer slots with kind and section', () => {
    const locator: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: '3' },
      headerFooterKind: 'header',
      variant: 'default',
    };
    expect(describeStoryLocation(locator)).toBe('Header · Section 3');
  });

  it('includes variant when header/footer slot is first or even', () => {
    const first: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: '1' },
      headerFooterKind: 'footer',
      variant: 'first',
    };
    expect(describeStoryLocation(first)).toBe('Footer · Section 1 · First page');

    const even: StoryLocator = {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section: { kind: 'section', sectionId: '2' },
      headerFooterKind: 'header',
      variant: 'even',
    };
    expect(describeStoryLocation(even)).toBe('Header · Section 2 · Even pages');
  });

  it('labels header/footer parts with their refId', () => {
    expect(describeStoryLocation({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' })).toBe(
      'Header/Footer · rId7',
    );
  });

  it('labels footnotes and endnotes with their noteId', () => {
    expect(describeStoryLocation({ kind: 'story', storyType: 'footnote', noteId: '12' })).toBe('Footnote 12');
    expect(describeStoryLocation({ kind: 'story', storyType: 'endnote', noteId: '4' })).toBe('Endnote 4');
  });
});
