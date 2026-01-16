import { describe, expect, it, beforeEach } from 'vitest';

import { convertPageLocalToOverlayCoords, getPageOffsetX } from '../CoordinateTransform.js';

describe('CoordinateTransform', () => {
  let mockDom: {
    painterHost: HTMLElement;
    viewportHost: HTMLElement;
  };

  beforeEach(() => {
    const viewportHost = document.createElement('div');
    const painterHost = document.createElement('div');

    // Mock page element
    const pageEl = document.createElement('div');
    pageEl.className = 'superdoc-page';
    pageEl.setAttribute('data-page-index', '0');
    painterHost.appendChild(pageEl);

    viewportHost.appendChild(painterHost);
    document.body.appendChild(viewportHost);

    mockDom = { painterHost, viewportHost };
  });

  describe('getPageOffsetX', () => {
    it('returns null when painterHost is null', () => {
      const result = getPageOffsetX({
        painterHost: null,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
      });

      expect(result).toBe(null);
    });

    it('returns null when viewportHost is null', () => {
      const result = getPageOffsetX({
        painterHost: mockDom.painterHost,
        viewportHost: null,
        zoom: 1,
        pageIndex: 0,
      });

      expect(result).toBe(null);
    });

    it('returns null when page element not found', () => {
      const result = getPageOffsetX({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 99, // non-existent page
      });

      expect(result).toBe(null);
    });

    it('calculates page offset X correctly', () => {
      const result = getPageOffsetX({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
      });

      expect(result).not.toBe(null);
      expect(typeof result).toBe('number');
    });

    it('accounts for zoom in offset calculation', () => {
      const resultZoom1 = getPageOffsetX({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
      });

      const resultZoom2 = getPageOffsetX({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 2,
        pageIndex: 0,
      });

      expect(resultZoom1).not.toBe(null);
      expect(resultZoom2).not.toBe(null);
    });
  });

  describe('convertPageLocalToOverlayCoords', () => {
    it('returns null for invalid pageIndex (negative)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: -1,
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageIndex (NaN)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: NaN,
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageIndex (Infinity)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: Infinity,
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageLocalX (NaN)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: NaN,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageLocalX (Infinity)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: Infinity,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageLocalY (NaN)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: 100,
        pageLocalY: NaN,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('returns null for invalid pageLocalY (Infinity)', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: 100,
        pageLocalY: Infinity,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).toBe(null);
    });

    it('converts coordinates correctly for first page', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).not.toBe(null);
      expect(result?.y).toBe(200); // pageIndex 0, so Y = 0 * (792 + 10) + 200
    });

    it('accounts for page stacking in Y coordinate', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 2,
        pageLocalX: 100,
        pageLocalY: 50,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).not.toBe(null);
      // Y = 2 * (792 + 10) + 50 = 2 * 802 + 50 = 1654
      expect(result?.y).toBe(1654);
    });

    it('handles zoom level correctly', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 2,
        pageIndex: 0,
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).not.toBe(null);
      expect(typeof result?.x).toBe('number');
      expect(typeof result?.y).toBe('number');
    });

    it('handles negative page local coordinates', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 0,
        pageLocalX: -10,
        pageLocalY: -20,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).not.toBe(null);
      expect(result?.y).toBe(-20);
    });

    it('falls back to zero page offset when page element not found', () => {
      const result = convertPageLocalToOverlayCoords({
        painterHost: mockDom.painterHost,
        viewportHost: mockDom.viewportHost,
        zoom: 1,
        pageIndex: 99, // non-existent page
        pageLocalX: 100,
        pageLocalY: 200,
        pageHeight: 792,
        pageGap: 10,
      });

      expect(result).not.toBe(null);
      // Should use 0 as fallback for page offset X
      expect(result?.x).toBe(100);
    });
  });
});
