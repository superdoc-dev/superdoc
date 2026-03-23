import { beforeEach, describe, expect, it } from 'vitest';

import { createHiddenHost } from '../dom/HiddenHost.js';

/**
 * Unit tests for the createHiddenHost function.
 *
 * The hidden host is a critical accessibility component that contains the actual
 * ProseMirror editor DOM while being visually hidden off-screen. It is wrapped in
 * a scroll-isolation container that prevents the browser's native caret-tracking
 * scroll from hijacking the page's scroll position.
 */
describe('createHiddenHost', () => {
  let mockDocument: Document;

  beforeEach(() => {
    mockDocument = document.implementation.createHTMLDocument('test');
  });

  describe('return value', () => {
    it('returns both wrapper and host elements', () => {
      const { wrapper, host } = createHiddenHost(mockDocument, 800);

      expect(wrapper).toBeInstanceOf(HTMLElement);
      expect(host).toBeInstanceOf(HTMLElement);
    });

    it('host is a child of wrapper', () => {
      const { wrapper, host } = createHiddenHost(mockDocument, 800);

      expect(host.parentElement).toBe(wrapper);
    });
  });

  describe('scroll-isolation wrapper', () => {
    it('uses position: fixed for viewport-relative placement', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.style.position).toBe('fixed');
    });

    it('positions far off-screen', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.style.left).toBe('-9999px');
    });

    it('is 1×1 with overflow:hidden to trap browser caret scroll', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.style.width).toBe('1px');
      expect(wrapper.style.height).toBe('1px');
      expect(wrapper.style.overflow).toBe('hidden');
    });

    it('is invisible and non-interactive', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.style.opacity).toBe('0');
      expect(wrapper.style.zIndex).toBe('-1');
      expect(wrapper.style.pointerEvents).toBe('none');
    });

    it('has the correct class name', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.className).toBe('presentation-editor__hidden-host-wrapper');
    });
  });

  describe('inner host element', () => {
    it('has the correct class name', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.className).toBe('presentation-editor__hidden-host');
    });

    it('uses position: absolute inside the wrapper', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.style.position).toBe('absolute');
    });

    it('applies the specified width for text measurement', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.style.width).toBe('800px');
    });

    it('sets overflow-anchor: none to prevent scroll anchoring', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.style.getPropertyValue('overflow-anchor')).toBe('none');
    });

    it('sets user-select: none', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.style.userSelect).toBe('none');
    });

    it('does not set visibility: hidden (prevents focusing)', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.style.visibility).not.toBe('hidden');
    });

    it('does not set aria-hidden (must remain accessible)', () => {
      const { host } = createHiddenHost(mockDocument, 800);

      expect(host.hasAttribute('aria-hidden')).toBe(false);
    });
  });

  describe('width configuration', () => {
    it('handles different width values', () => {
      for (const width of [400, 612, 800, 1200]) {
        const { host } = createHiddenHost(mockDocument, width);
        expect(host.style.width).toBe(`${width}px`);
      }
    });

    it('handles fractional widths', () => {
      const { host } = createHiddenHost(mockDocument, 612.5);

      expect(host.style.width).toBe('612.5px');
    });

    it('handles zero width', () => {
      const { host } = createHiddenHost(mockDocument, 0);

      expect(host.style.width).toBe('0px');
    });

    it('skips negative width values', () => {
      const { host } = createHiddenHost(mockDocument, -100);

      expect(host.style.width).toBe('');
    });
  });

  describe('document isolation', () => {
    it('creates elements in the provided document context', () => {
      const customDoc = document.implementation.createHTMLDocument('custom');
      const { wrapper, host } = createHiddenHost(customDoc, 800);

      expect(wrapper.ownerDocument).toBe(customDoc);
      expect(host.ownerDocument).toBe(customDoc);
    });

    it('does not attach wrapper to document automatically', () => {
      const { wrapper } = createHiddenHost(mockDocument, 800);

      expect(wrapper.parentNode).toBeNull();
    });
  });
});
