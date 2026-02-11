import { afterEach, describe, expect, it, vi } from 'vitest';

import { denormalizeClientPoint, normalizeClientPoint } from './PointerNormalization.js';

describe('PointerNormalization', () => {
  const makeHosts = () => {
    const viewportHost = document.createElement('div');
    const visibleHost = document.createElement('div');
    viewportHost.appendChild(visibleHost);

    vi.spyOn(viewportHost, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      top: 10,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    (visibleHost as HTMLElement & { scrollLeft: number; scrollTop: number }).scrollLeft = 30;
    (visibleHost as HTMLElement & { scrollLeft: number; scrollTop: number }).scrollTop = 40;

    return { viewportHost, visibleHost };
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete (document as Document & { elementsFromPoint?: Document['elementsFromPoint'] }).elementsFromPoint;
  });

  describe('normalizeClientPoint', () => {
    it('returns null for non-finite client coordinates', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 1,
        getPageOffsetX: () => 0,
        getPageOffsetY: () => 0,
      };

      expect(normalizeClientPoint(options, NaN, 0)).toBe(null);
      expect(normalizeClientPoint(options, 0, Infinity)).toBe(null);
      expect(normalizeClientPoint(options, -Infinity, 0)).toBe(null);
    });

    it('normalizes client coordinates to layout coordinates with zoom and scroll', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 2,
        getPageOffsetX: () => 0,
        getPageOffsetY: () => 0,
      };

      const result = normalizeClientPoint(options, 200, 150);
      expect(result).toEqual({ x: 105, y: 90 });
    });

    it('adjusts X when the pointer is over a page with a known offset', () => {
      const { viewportHost, visibleHost } = makeHosts();
      const pageEl = document.createElement('div');
      pageEl.className = 'superdoc-page';
      pageEl.dataset.pageIndex = '2';

      (document as Document & { elementsFromPoint: Document['elementsFromPoint'] }).elementsFromPoint = vi
        .fn()
        .mockReturnValue([pageEl]);

      const options = {
        viewportHost,
        visibleHost,
        zoom: 2,
        getPageOffsetX: (pageIndex: number) => (pageIndex === 2 ? 12 : null),
        getPageOffsetY: (pageIndex: number) => (pageIndex === 2 ? 8 : null),
      };

      const result = normalizeClientPoint(options, 200, 150);
      expect(result).toEqual({ x: 93, y: 82 });
    });

    it('does not adjust X when page offset is unavailable', () => {
      const { viewportHost, visibleHost } = makeHosts();
      const pageEl = document.createElement('div');
      pageEl.className = 'superdoc-page';
      pageEl.dataset.pageIndex = '3';

      (document as Document & { elementsFromPoint: Document['elementsFromPoint'] }).elementsFromPoint = vi
        .fn()
        .mockReturnValue([pageEl]);

      const options = {
        viewportHost,
        visibleHost,
        zoom: 2,
        getPageOffsetX: () => null,
        getPageOffsetY: () => null,
      };

      const result = normalizeClientPoint(options, 200, 150);
      expect(result).toEqual({ x: 105, y: 90 });
    });
  });

  describe('denormalizeClientPoint', () => {
    it('returns null for non-finite layout coordinates', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 1,
        getPageOffsetX: () => 0,
        getPageOffsetY: () => 0,
      };

      expect(denormalizeClientPoint(options, NaN, 0)).toBe(null);
      expect(denormalizeClientPoint(options, 0, Infinity)).toBe(null);
    });

    it('denormalizes layout coordinates to client coordinates', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 2,
        getPageOffsetX: () => 0,
        getPageOffsetY: () => 0,
      };

      const result = denormalizeClientPoint(options, 50, 60);
      expect(result).toEqual({ x: 90, y: 90 });
    });

    it('applies page offsets when a page index is provided', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 2,
        getPageOffsetX: () => 15,
        getPageOffsetY: () => 25,
      };

      const result = denormalizeClientPoint(options, 50, 60, 3);
      expect(result).toEqual({ x: 120, y: 140 });
    });

    it('scales height based on the zoom level when provided', () => {
      const { viewportHost, visibleHost } = makeHosts();

      const options = {
        viewportHost,
        visibleHost,
        zoom: 1.5,
        getPageOffsetX: () => 0,
        getPageOffsetY: () => 0,
      };

      const result = denormalizeClientPoint(options, 10, 12, undefined, 8);
      expect(result).toEqual({ x: 5, y: -12, height: 12 });
    });
  });
});
