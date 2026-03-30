import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaintSnapshot } from '@superdoc/painter-dom';

import { PresentationPainterAdapter } from './PresentationPainterAdapter.js';

const { mockCreateDomPainter, mockPainterHandle } = vi.hoisted(() => {
  const mockPainterHandle = {
    paint: vi.fn(),
    setProviders: vi.fn(),
    setZoom: vi.fn(),
    setScrollContainer: vi.fn(),
    setVirtualizationPins: vi.fn(),
    onScroll: vi.fn(),
    getMountedPageIndices: vi.fn(() => []),
  };

  return {
    mockCreateDomPainter: vi.fn(() => mockPainterHandle),
    mockPainterHandle,
  };
});

vi.mock('@superdoc/painter-dom', () => ({
  createDomPainter: mockCreateDomPainter,
}));

describe('PresentationPainterAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reapplies cached painter surface state when the painter is created', () => {
    const adapter = new PresentationPainterAdapter();
    const scrollContainer = document.createElement('div');
    const headerProvider = vi.fn();
    const footerProvider = vi.fn();

    adapter.setProviders(headerProvider, footerProvider);
    adapter.setZoom(1.5);
    adapter.setScrollContainer(scrollContainer);
    adapter.setVirtualizationPins([3, 1, 3, 2]);

    adapter.ensurePainter({});

    expect(mockPainterHandle.setProviders).toHaveBeenCalledWith(headerProvider, footerProvider);
    expect(mockPainterHandle.setZoom).toHaveBeenCalledWith(1.5);
    expect(mockPainterHandle.setScrollContainer).toHaveBeenCalledWith(scrollContainer);
    expect(mockPainterHandle.setVirtualizationPins).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('deduplicates equivalent virtualization pin updates', () => {
    const adapter = new PresentationPainterAdapter();
    adapter.ensurePainter({});

    mockPainterHandle.setVirtualizationPins.mockClear();

    adapter.setVirtualizationPins([2, 1, 2]);
    adapter.setVirtualizationPins([1, 2]);

    expect(mockPainterHandle.setVirtualizationPins).toHaveBeenCalledTimes(1);
    expect(mockPainterHandle.setVirtualizationPins).toHaveBeenCalledWith([1, 2]);
  });

  it('prefers mounted page indices from the live painter handle', () => {
    const adapter = new PresentationPainterAdapter();
    adapter.ensurePainter({});

    mockPainterHandle.getMountedPageIndices.mockReturnValue([2, 5]);

    expect(adapter.getMountedPageIndices()).toEqual([2, 5]);
  });

  it('falls back to the latest paint snapshot when the painter has no mounted page state', () => {
    const adapter = new PresentationPainterAdapter();
    adapter.ensurePainter({});

    const painterOptions = mockCreateDomPainter.mock.calls[0][0] as {
      onPaintSnapshot?: (snapshot: PaintSnapshot) => void;
    };

    painterOptions.onPaintSnapshot?.({
      formatVersion: 1,
      pageCount: 2,
      lineCount: 0,
      markerCount: 0,
      tabCount: 0,
      pages: [
        { index: 2, lineCount: 0, lines: [] },
        { index: 5, lineCount: 0, lines: [] },
      ],
      entities: {
        annotations: [],
        structuredContentBlocks: [],
        structuredContentInlines: [],
        images: [],
      },
    });

    mockPainterHandle.getMountedPageIndices.mockReturnValue(undefined);

    expect(adapter.getMountedPageIndices()).toEqual([2, 5]);
  });
});
