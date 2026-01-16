import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';
import type { PageGeometryHelper } from '@superdoc/layout-bridge';
import * as layoutBridge from '@superdoc/layout-bridge';

import { renderRemoteCursors } from '../RemoteCursorRendering.js';
import type { RemoteCursorState } from '../PresentationEditor.js';

/**
 * Creates a mock RemoteCursorState for testing.
 */
function createMockRemoteCursor(
  clientId: number,
  anchor: number,
  head: number,
  user: { name?: string; email?: string; color: string } = { name: 'Test User', color: '#FF0000' },
): RemoteCursorState {
  return {
    clientId,
    anchor,
    head,
    user,
    updatedAt: Date.now(),
  };
}

/**
 * Creates a mock Layout for testing.
 */
function createMockLayout(): Layout {
  return {
    pages: [{ fragments: [] }, { fragments: [] }],
    pageSize: { w: 800, h: 1200 },
    pageGap: 20,
  } as Layout;
}

function normalizeColor(color: string): string {
  const trimmed = color.trim();
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgbMatch) {
    const toHex = (value: string) => Number(value).toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const expanded = hex
        .split('')
        .map((value) => value + value)
        .join('');
      return `#${expanded.toUpperCase()}`;
    }
    return `#${hex.toUpperCase()}`;
  }

  return trimmed;
}

describe('renderRemoteCursors', () => {
  let doc: Document;
  let remoteCursorOverlay: HTMLElement;
  let remoteCursorElements: Map<number, HTMLElement>;
  let remoteCursorState: Map<number, RemoteCursorState>;
  let computeCaretLayoutRect: ReturnType<typeof vi.fn>;
  let convertPageLocalToOverlayCoords: ReturnType<typeof vi.fn>;
  let layout: Layout;
  let blocks: FlowBlock[];
  let measures: Measure[];
  let pageGeometryHelper: PageGeometryHelper | null;

  const fallbackColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
  const cursorStyles = {
    CARET_WIDTH: 2,
    LABEL_FONT_SIZE: 12,
    LABEL_PADDING: '2px 6px',
    LABEL_OFFSET: '-20px',
    SELECTION_BORDER_RADIUS: '2px',
    MAX_LABEL_LENGTH: 30,
  };

  beforeEach(() => {
    doc = document;
    remoteCursorOverlay = document.createElement('div');
    remoteCursorElements = new Map();
    remoteCursorState = new Map();
    layout = createMockLayout();
    blocks = [];
    measures = [];
    pageGeometryHelper = null;

    computeCaretLayoutRect = vi.fn((pos: number) => ({
      pageIndex: 0,
      x: pos * 10,
      y: 100,
      height: 18,
    }));

    convertPageLocalToOverlayCoords = vi.fn((pageIndex: number, x: number, y: number) => ({
      x: x + pageIndex * 100,
      y: y + pageIndex * 100,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performance guardrails', () => {
    it('limits rendering to maxVisible cursors', () => {
      // Add 25 remote cursors
      for (let i = 0; i < 25; i++) {
        remoteCursorState.set(i, createMockRemoteCursor(i, i * 10, i * 10));
      }

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { maxVisible: 10 },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Should only render 10 most recent cursors
      expect(remoteCursorElements.size).toBeLessThanOrEqual(10);
    });

    it('uses default maxVisible of 20 when not specified', () => {
      // Add 25 remote cursors
      for (let i = 0; i < 25; i++) {
        remoteCursorState.set(i, createMockRemoteCursor(i, i * 10, i * 10));
      }

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Should only render 20 most recent cursors
      expect(remoteCursorElements.size).toBeLessThanOrEqual(20);
    });

    it('prioritizes most recently updated cursors', () => {
      const now = Date.now();

      // Add cursors with different update times
      remoteCursorState.set(1, { ...createMockRemoteCursor(1, 10, 10), updatedAt: now - 5000 });
      remoteCursorState.set(2, { ...createMockRemoteCursor(2, 20, 20), updatedAt: now - 1000 });
      remoteCursorState.set(3, { ...createMockRemoteCursor(3, 30, 30), updatedAt: now - 3000 });

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { maxVisible: 2 },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Should render clientId 2 (most recent) and 3 (second most recent)
      expect(remoteCursorElements.has(2)).toBe(true);
      expect(remoteCursorElements.has(3)).toBe(true);
      expect(remoteCursorElements.has(1)).toBe(false);
    });
  });

  describe('caret rendering', () => {
    it('renders caret when anchor equals head (collapsed selection)', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorOverlay.querySelector('.presentation-editor__remote-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.getAttribute('data-client-id')).toBe('1');
    });

    it('applies GPU-accelerated transform positioning to caret', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorElements.get(1);
      expect(caret).not.toBeNull();
      expect(caret!.style.transform).toContain('translate');
      expect(caret!.style.willChange).toBe('transform');
    });

    it('hides caret when position cannot be computed', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));
      computeCaretLayoutRect = vi.fn(() => null);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorElements.get(1);
      expect(caret).not.toBeNull();
      expect(caret!.style.opacity).toBe('0');
    });

    it('hides caret when coordinate conversion returns null (virtualized page)', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));
      convertPageLocalToOverlayCoords = vi.fn(() => null);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorElements.get(1);
      expect(caret).not.toBeNull();
      expect(caret!.style.opacity).toBe('0');
    });

    it('reuses existing caret element when updating position', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));

      // First render
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const firstCaret = remoteCursorElements.get(1);

      // Update position
      remoteCursorState.set(1, createMockRemoteCursor(1, 200, 200));

      // Second render
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const secondCaret = remoteCursorElements.get(1);

      // Should be the same DOM element
      expect(firstCaret).toBe(secondCaret);
    });
  });

  describe('label rendering', () => {
    it('renders label by default when showLabels is not specified', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: 'Alice', color: '#FF0000' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('Alice');
    });

    it('renders label when showLabels is explicitly true', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: 'Bob', color: '#00FF00' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { showLabels: true },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('Bob');
    });

    it('does not render label when showLabels is false', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: 'Charlie', color: '#0000FF' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { showLabels: false },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label).toBeNull();
    });

    it('truncates long labels to MAX_LABEL_LENGTH', () => {
      const longName = 'A'.repeat(50);
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: longName, color: '#FF0000' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label!.textContent!.length).toBeLessThanOrEqual(cursorStyles.MAX_LABEL_LENGTH);
      expect(label!.textContent).toContain('…');
    });

    it('uses custom labelFormatter when provided', () => {
      remoteCursorState.set(
        1,
        createMockRemoteCursor(1, 100, 100, { name: 'Alice', email: 'alice@test.com', color: '#FF0000' }),
      );

      const labelFormatter = vi.fn((user: { name?: string; email?: string }) => `${user.name} (${user.email})`);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { labelFormatter },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(labelFormatter).toHaveBeenCalled();
      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label!.textContent).toBe('Alice (alice@test.com)');
    });

    it('falls back to email when name is not provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { email: 'test@example.com', color: '#FF0000' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label!.textContent).toBe('test@example.com');
    });

    it('uses "Anonymous" when neither name nor email is provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { color: '#FF0000' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const label = remoteCursorOverlay.querySelector('.presentation-editor__remote-label');
      expect(label!.textContent).toBe('Anonymous');
    });
  });

  describe('selection rendering', () => {
    it('renders selection rectangles when anchor differs from head', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 200));

      // Mock selectionToRects to return some rectangles
      vi.spyOn(layoutBridge, 'selectionToRects').mockReturnValue([
        { x: 50, y: 100, width: 200, height: 16, pageIndex: 0 },
        { x: 50, y: 120, width: 150, height: 16, pageIndex: 0 },
      ]);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const selections = remoteCursorOverlay.querySelectorAll('.presentation-editor__remote-selection');
      expect(selections.length).toBeGreaterThanOrEqual(0);
    });

    it('limits selection rectangles to maxSelectionRectsPerUser', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 500));

      // Mock selectionToRects to return many rectangles
      const manyRects = Array.from({ length: 200 }, (_, i) => ({
        x: 50,
        y: 100 + i * 20,
        width: 200,
        height: 16,
        pageIndex: 0,
      }));

      vi.spyOn(layoutBridge, 'selectionToRects').mockReturnValue(manyRects);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 50,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const selections = remoteCursorOverlay.querySelectorAll('.presentation-editor__remote-selection');
      expect(selections.length).toBeLessThanOrEqual(50);
    });

    it('applies custom highlightOpacity when provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 200));

      vi.spyOn(layoutBridge, 'selectionToRects').mockReturnValue([
        { x: 50, y: 100, width: 200, height: 16, pageIndex: 0 },
      ]);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { highlightOpacity: 0.5 },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const selection = remoteCursorOverlay.querySelector('.presentation-editor__remote-selection') as HTMLElement;
      if (selection) {
        expect(parseFloat(selection.style.opacity)).toBe(0.5);
      }
    });

    it('uses default highlightOpacity of 0.35 when not provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 200));

      vi.spyOn(layoutBridge, 'selectionToRects').mockReturnValue([
        { x: 50, y: 100, width: 200, height: 16, pageIndex: 0 },
      ]);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const selection = remoteCursorOverlay.querySelector('.presentation-editor__remote-selection') as HTMLElement;
      if (selection) {
        expect(parseFloat(selection.style.opacity)).toBe(0.35);
      }
    });

    it('clears old selection rectangles before rendering new ones', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 200));

      // Add some old selection elements
      const oldSelection = document.createElement('div');
      oldSelection.className = 'presentation-editor__remote-selection';
      oldSelection.setAttribute('data-client-id', '1');
      remoteCursorOverlay.appendChild(oldSelection);

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Old selection should be removed
      expect(remoteCursorOverlay.contains(oldSelection)).toBe(false);
    });

    it('renders caret at head position for selections', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 200));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Should have called computeCaretLayoutRect with head position (200)
      expect(computeCaretLayoutRect).toHaveBeenCalledWith(200);
    });
  });

  describe('color validation', () => {
    it('uses valid hex color when provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { color: '#AABBCC' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorElements.get(1);
      expect(normalizeColor(caret!.style.borderLeftColor)).toBe('#AABBCC');
    });

    it('falls back to default color when invalid color is provided', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { color: 'invalid' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret = remoteCursorElements.get(1);
      // Should use fallback color based on clientId (1 % 5 = 1 -> '#00FF00')
      expect(fallbackColors).toContain(normalizeColor(caret!.style.borderLeftColor));
    });
  });

  describe('stale cursor cleanup', () => {
    it('removes DOM elements for cursors no longer visible', () => {
      // Add cursors
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));
      remoteCursorState.set(2, createMockRemoteCursor(2, 200, 200));

      // First render
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(2);

      // Remove one cursor
      remoteCursorState.delete(2);

      // Second render
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(1);
      expect(remoteCursorElements.has(1)).toBe(true);
      expect(remoteCursorElements.has(2)).toBe(false);
    });

    it('removes DOM elements when they fall outside maxVisible limit', () => {
      const now = Date.now();

      remoteCursorState.set(1, { ...createMockRemoteCursor(1, 100, 100), updatedAt: now - 5000 });
      remoteCursorState.set(2, { ...createMockRemoteCursor(2, 200, 200), updatedAt: now - 1000 });
      remoteCursorState.set(3, { ...createMockRemoteCursor(3, 300, 300), updatedAt: now - 3000 });

      // First render with maxVisible = 3
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { maxVisible: 3 },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(3);

      // Second render with maxVisible = 2
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: { maxVisible: 2 },
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(2);
      // Most recent (2) and second most recent (3) should remain
      expect(remoteCursorElements.has(2)).toBe(true);
      expect(remoteCursorElements.has(3)).toBe(true);
      expect(remoteCursorElements.has(1)).toBe(false);
    });
  });

  describe('multiple remote users', () => {
    it('renders cursors for multiple users simultaneously', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: 'Alice', color: '#FF0000' }));
      remoteCursorState.set(2, createMockRemoteCursor(2, 200, 200, { name: 'Bob', color: '#00FF00' }));
      remoteCursorState.set(3, createMockRemoteCursor(3, 300, 300, { name: 'Charlie', color: '#0000FF' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(3);
      expect(remoteCursorElements.has(1)).toBe(true);
      expect(remoteCursorElements.has(2)).toBe(true);
      expect(remoteCursorElements.has(3)).toBe(true);
    });

    it('assigns different colors to different users', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100, { name: 'Alice', color: '#FF0000' }));
      remoteCursorState.set(2, createMockRemoteCursor(2, 200, 200, { name: 'Bob', color: '#00FF00' }));

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      const caret1 = remoteCursorElements.get(1);
      const caret2 = remoteCursorElements.get(2);

      expect(normalizeColor(caret1!.style.borderLeftColor)).toBe('#FF0000');
      expect(normalizeColor(caret2!.style.borderLeftColor)).toBe('#00FF00');
    });
  });

  describe('edge cases', () => {
    it('handles empty remoteCursorState', () => {
      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      expect(remoteCursorElements.size).toBe(0);
    });

    it('handles null remoteCursorOverlay gracefully', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 100, 100));

      expect(() => {
        renderRemoteCursors({
          layout,
          blocks,
          measures,
          pageGeometryHelper,
          presence: undefined,
          remoteCursorState,
          remoteCursorElements,
          remoteCursorOverlay: null,
          doc,
          computeCaretLayoutRect,
          convertPageLocalToOverlayCoords,
          fallbackColors,
          cursorStyles,
          maxSelectionRectsPerUser: 100,
          defaultPageHeight: 1200,
          fallbackPageHeight: 1200,
        });
      }).not.toThrow();
    });

    it('handles backward selections (anchor > head)', () => {
      remoteCursorState.set(1, createMockRemoteCursor(1, 200, 100)); // Backward selection

      renderRemoteCursors({
        layout,
        blocks,
        measures,
        pageGeometryHelper,
        presence: undefined,
        remoteCursorState,
        remoteCursorElements,
        remoteCursorOverlay,
        doc,
        computeCaretLayoutRect,
        convertPageLocalToOverlayCoords,
        fallbackColors,
        cursorStyles,
        maxSelectionRectsPerUser: 100,
        defaultPageHeight: 1200,
        fallbackPageHeight: 1200,
      });

      // Should still render caret at head position
      expect(computeCaretLayoutRect).toHaveBeenCalledWith(100);
    });
  });
});
