import { beforeEach, describe, expect, it } from 'vitest';

import { createHiddenHost } from './HiddenHost.js';

/**
 * Comprehensive unit tests for the createHiddenHost function.
 *
 * The hidden host is a critical accessibility component that contains the actual
 * ProseMirror editor DOM while being visually hidden off-screen. These tests ensure
 * it's configured correctly to prevent scroll issues, maintain focusability, and
 * provide proper semantic structure for assistive technologies.
 */
describe('createHiddenHost', () => {
  let mockDocument: Document;

  beforeEach(() => {
    // Create a real document for testing (jsdom provides this in vitest)
    mockDocument = document.implementation.createHTMLDocument('test');
  });

  describe('basic element creation', () => {
    it('creates a div element', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.tagName).toBe('DIV');
    });

    it('sets the correct class name', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.className).toBe('presentation-editor__hidden-host');
    });
  });

  describe('positioning styles to prevent scroll', () => {
    it('uses position: fixed for off-screen placement', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.position).toBe('fixed');
    });

    it('positions element far off-screen with left: -9999px', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.left).toBe('-9999px');
    });

    it('positions element at top: 0', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.top).toBe('0px');
    });

    it('sets overflow-anchor: none to prevent scroll anchoring issues', () => {
      const host = createHiddenHost(mockDocument, 800);

      // Use getPropertyValue since overflow-anchor may not be a direct property
      const overflowAnchor = host.style.getPropertyValue('overflow-anchor');
      expect(overflowAnchor).toBe('none');
    });
  });

  describe('width configuration', () => {
    it('applies the specified width in pixels', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.width).toBe('800px');
    });

    it('handles different width values correctly', () => {
      const widths = [400, 612, 800, 1200];

      widths.forEach((width) => {
        const host = createHiddenHost(mockDocument, width);
        expect(host.style.width).toBe(`${width}px`);
      });
    });

    it('handles fractional widths correctly', () => {
      const host = createHiddenHost(mockDocument, 612.5);

      expect(host.style.width).toBe('612.5px');
    });
  });

  describe('accessibility and focusability', () => {
    it('uses opacity: 0 instead of visibility: hidden to maintain focusability', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.opacity).toBe('0');
      // Ensure visibility is NOT set to hidden
      expect(host.style.visibility).not.toBe('hidden');
    });

    it('does not set aria-hidden attribute', () => {
      const host = createHiddenHost(mockDocument, 800);

      // The hidden host must remain accessible to screen readers
      expect(host.hasAttribute('aria-hidden')).toBe(false);
    });

    it('sets z-index: -1 to layer element behind content', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.zIndex).toBe('-1');
    });
  });

  describe('interaction prevention', () => {
    it('sets pointer-events: none to prevent mouse interaction', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.pointerEvents).toBe('none');
    });

    it('sets user-select: none to prevent text selection', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.style.userSelect).toBe('none');
    });
  });

  describe('comprehensive style verification', () => {
    it('applies all required styles simultaneously', () => {
      const host = createHiddenHost(mockDocument, 800);

      // Verify all critical styles are present
      expect(host.style.position).toBe('fixed');
      expect(host.style.left).toBe('-9999px');
      expect(host.style.top).toBe('0px');
      expect(host.style.width).toBe('800px');
      expect(host.style.getPropertyValue('overflow-anchor')).toBe('none');
      expect(host.style.pointerEvents).toBe('none');
      expect(host.style.opacity).toBe('0');
      expect(host.style.zIndex).toBe('-1');
      expect(host.style.userSelect).toBe('none');
    });
  });

  describe('edge cases', () => {
    it('handles zero width gracefully', () => {
      const host = createHiddenHost(mockDocument, 0);

      expect(host.style.width).toBe('0px');
      // Should still have all other required styles
      expect(host.style.position).toBe('fixed');
      expect(host.style.left).toBe('-9999px');
    });

    it('handles very large width values', () => {
      const host = createHiddenHost(mockDocument, 99999);

      expect(host.style.width).toBe('99999px');
    });

    it('handles negative width values (browser strips invalid values)', () => {
      const host = createHiddenHost(mockDocument, -100);

      // Browsers strip invalid negative width values, leaving empty string
      expect(host.style.width).toBe('');
      // All other styles should still be applied correctly
      expect(host.style.position).toBe('fixed');
      expect(host.style.left).toBe('-9999px');
    });
  });

  describe('document isolation', () => {
    it('creates element in the provided document context', () => {
      const customDoc = document.implementation.createHTMLDocument('custom');
      const host = createHiddenHost(customDoc, 800);

      expect(host.ownerDocument).toBe(customDoc);
    });

    it('does not attach element to document automatically', () => {
      const host = createHiddenHost(mockDocument, 800);

      expect(host.parentNode).toBeNull();
    });
  });
});
