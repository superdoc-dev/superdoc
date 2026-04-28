import { beforeEach, describe, expect, it } from 'vitest';

import {
  createStoryHiddenHost,
  STORY_HIDDEN_HOST_CLASS,
  STORY_HIDDEN_HOST_WRAPPER_CLASS,
} from './createStoryHiddenHost.js';

describe('createStoryHiddenHost', () => {
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
  });

  it('returns wrapper + host with body-hidden-host invariants', () => {
    const { wrapper, host } = createStoryHiddenHost(doc, 800);

    // Wrapper keeps scroll-isolation invariants from createHiddenHost
    expect(wrapper.style.position).toBe('fixed');
    expect(wrapper.style.overflow).toBe('hidden');
    expect(wrapper.style.width).toBe('1px');
    expect(wrapper.style.height).toBe('1px');

    // Host must remain focusable + in the a11y tree
    expect(host.style.visibility).not.toBe('hidden');
    expect(host.hasAttribute('aria-hidden')).toBe(false);
  });

  it('adds the story-specific class markers', () => {
    const { wrapper, host } = createStoryHiddenHost(doc, 800);
    expect(wrapper.classList.contains(STORY_HIDDEN_HOST_WRAPPER_CLASS)).toBe(true);
    expect(host.classList.contains(STORY_HIDDEN_HOST_CLASS)).toBe(true);
  });

  it('propagates storyKey/storyKind as data attributes when provided', () => {
    const { host } = createStoryHiddenHost(doc, 800, {
      storyKey: 'story:headerFooterPart:rId7',
      storyKind: 'headerFooter',
    });
    expect(host.getAttribute('data-story-key')).toBe('story:headerFooterPart:rId7');
    expect(host.getAttribute('data-story-kind')).toBe('headerFooter');
  });

  it('omits data attributes when options are not supplied', () => {
    const { host } = createStoryHiddenHost(doc, 800);
    expect(host.hasAttribute('data-story-key')).toBe(false);
    expect(host.hasAttribute('data-story-kind')).toBe(false);
  });
});
