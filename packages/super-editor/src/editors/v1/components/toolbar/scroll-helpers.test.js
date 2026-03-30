import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scrollToElement } from './scroll-helpers.js';

describe('scroll-helpers', () => {
  let container;
  let child;

  beforeEach(() => {
    container = document.createElement('div');
    Object.assign(container.style, {
      overflowY: 'auto',
      height: '100px',
    });
    Object.defineProperty(container, 'clientHeight', { value: 100 });
    Object.defineProperty(container, 'scrollHeight', { value: 200 });
    container.scrollTop = 0;
    container.getBoundingClientRect = vi.fn(() => ({ top: 10, bottom: 110, height: 100 }));
    Object.defineProperty(container, 'scrollTo', {
      value: vi.fn(({ top }) => {
        container.scrollTop = top;
      }),
    });

    child = document.createElement('div');
    Object.defineProperty(child, 'offsetHeight', { value: 20 });
    child.getBoundingClientRect = vi.fn(() => ({ top: 50, bottom: 70 }));

    container.appendChild(child);
    document.body.appendChild(container);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => ({ overflowY: el.style.overflowY || 'visible' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrolls container so that target aligns to top when block=start', () => {
    scrollToElement(child, { behavior: 'auto', block: 'start' });

    expect(container.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(container.scrollTop).toBe(40);
  });

  it('offsets scroll for block=end positioning', () => {
    scrollToElement(child, { behavior: 'smooth', block: 'end' });

    const expectedTop = 40 - container.clientHeight + child.offsetHeight;
    expect(container.scrollTo).toHaveBeenCalledWith({ top: expectedTop, behavior: 'smooth' });
  });
});
