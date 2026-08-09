import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { scrollToElement } from './scroll-helpers.js';

function createScrollFixture(scrollPaddingTop) {
  const container = document.createElement('div');
  const target = document.createElement('div');
  container.appendChild(target);
  document.body.appendChild(container);

  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 1_000 },
    scrollTop: { configurable: true, value: 120 },
  });
  Object.defineProperty(target, 'offsetHeight', { configurable: true, value: 40 });

  container.getBoundingClientRect = () => ({ top: 100 });
  target.getBoundingClientRect = () => ({ top: 500 });
  container.scrollTo = vi.fn();

  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    overflowY: element === container ? 'auto' : 'visible',
    scrollPaddingTop: element === container ? scrollPaddingTop : '',
  }));

  return { container, target };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('scrollToElement', () => {
  it.each([undefined, '', 'auto'])('preserves start alignment when scroll-padding-top is %s', (scrollPaddingTop) => {
    const { container, target } = createScrollFixture(scrollPaddingTop);

    scrollToElement(target, { behavior: 'smooth', block: 'start' });

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'smooth' });
  });

  it('leaves room for host chrome declared with scroll-padding-top', () => {
    const { container, target } = createScrollFixture('80px');

    scrollToElement(target, { behavior: 'smooth', block: 'start' });

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 440, behavior: 'smooth' });
  });

  it.each(['10%', 'Infinitypx', '-10px'])(
    'fails closed for unresolved scroll-padding-top value %s',
    (scrollPaddingTop) => {
      const { container, target } = createScrollFixture(scrollPaddingTop);

      scrollToElement(target, { behavior: 'auto', block: 'start' });

      expect(container.scrollTo).toHaveBeenCalledWith({ top: 520, behavior: 'auto' });
    },
  );

  it('does not apply scroll-padding-top to end alignment', () => {
    const { container, target } = createScrollFixture('80px');

    scrollToElement(target, { behavior: 'smooth', block: 'end' });

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 260, behavior: 'smooth' });
  });
});
