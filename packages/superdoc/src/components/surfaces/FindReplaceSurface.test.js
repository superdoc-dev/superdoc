// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref, computed } from 'vue';
import FindReplaceSurface from './FindReplaceSurface.vue';

const DEFAULT_TEXTS = {
  findPlaceholder: 'Find',
  findAriaLabel: 'Find text',
  replacePlaceholder: 'Replace',
  replaceAriaLabel: 'Replace text',
  noResultsLabel: 'No results',
  previousMatchLabel: 'Previous',
  previousMatchAriaLabel: 'Previous',
  nextMatchLabel: 'Next',
  nextMatchAriaLabel: 'Next',
  closeLabel: 'Close',
  closeAriaLabel: 'Close',
  replaceLabel: 'Replace',
  replaceAllLabel: 'All',
  toggleReplaceLabel: 'Toggle replace',
  toggleReplaceAriaLabel: 'Toggle replace',
  matchCaseLabel: 'Aa',
  matchCaseAriaLabel: 'Match case',
  ignoreDiacriticsLabel: 'ä≡a',
  ignoreDiacriticsAriaLabel: 'Ignore diacritics',
};

/**
 * Build a ref-shaped findReplace handle that mirrors what useFindReplace provides.
 * goNext / goPrev simulate the real Search extension behaviour of focusing the
 * editor view (which is what causes SD-3045 in production) by moving focus to a
 * detached element supplied via `stealFocusInto`.
 */
function createHandle(overrides = {}) {
  const findQuery = ref('Lorem');
  const replaceText = ref('');
  const caseSensitive = ref(false);
  const ignoreDiacritics = ref(false);
  const showReplace = ref(false);
  const matchCount = ref(16);
  const activeMatchIndex = ref(0);

  return {
    findQuery,
    replaceText,
    caseSensitive,
    ignoreDiacritics,
    showReplace,
    matchCount,
    activeMatchIndex,
    matchLabel: computed(() => `${activeMatchIndex.value + 1} of ${matchCount.value}`),
    hasMatches: computed(() => matchCount.value > 0),
    replaceEnabled: true,
    texts: { ...DEFAULT_TEXTS },
    goNext: vi.fn(() => overrides.stealFocusInto?.focus()),
    goPrev: vi.fn(() => overrides.stealFocusInto?.focus()),
    replaceCurrent: vi.fn(),
    replaceAll: vi.fn(),
    registerFocusFn: vi.fn(),
    close: vi.fn(),
    ...overrides.handle,
  };
}

function mountSurface(handle) {
  return mount(FindReplaceSurface, {
    attachTo: document.body,
    props: {
      surfaceId: 'fr-1',
      mode: 'floating',
      request: {},
      resolve: vi.fn(),
      close: vi.fn(),
      findReplace: handle,
    },
  });
}

describe('FindReplaceSurface — keyboard focus (SD-3045)', () => {
  it('keeps focus on the find input after pressing Enter, even when goNext steals focus to another element', async () => {
    // The editor view focus steal is the real-world cause of SD-3045 — simulate it
    // with a detached div that goNext focuses synchronously, matching the Search
    // extension's editor.view.focus() side effect.
    const stealTarget = document.createElement('div');
    stealTarget.tabIndex = -1;
    document.body.appendChild(stealTarget);

    try {
      const handle = createHandle({ stealFocusInto: stealTarget });
      const wrapper = mountSurface(handle);
      const input = wrapper.find('.sd-find-replace__input').element;
      input.focus();
      expect(document.activeElement).toBe(input);

      await wrapper.find('.sd-find-replace__input').trigger('keydown', { key: 'Enter' });
      await nextTick();

      expect(handle.goNext).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(input);

      wrapper.unmount();
    } finally {
      stealTarget.remove();
    }
  });

  it('keeps focus on the find input after Shift+Enter (previous match)', async () => {
    const stealTarget = document.createElement('div');
    stealTarget.tabIndex = -1;
    document.body.appendChild(stealTarget);

    try {
      const handle = createHandle({ stealFocusInto: stealTarget });
      const wrapper = mountSurface(handle);
      const input = wrapper.find('.sd-find-replace__input').element;
      input.focus();

      await wrapper.find('.sd-find-replace__input').trigger('keydown', { key: 'Enter', shiftKey: true });
      await nextTick();

      expect(handle.goPrev).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(input);

      wrapper.unmount();
    } finally {
      stealTarget.remove();
    }
  });

  it('prevents the default Enter behaviour so the editor never receives the keystroke', () => {
    const handle = createHandle();
    const wrapper = mountSurface(handle);
    const input = wrapper.find('.sd-find-replace__input').element;
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});
