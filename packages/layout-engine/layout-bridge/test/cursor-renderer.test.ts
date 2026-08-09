/**
 * Tests for CursorRenderer
 *
 * Validates cursor and selection rendering behavior.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { CursorRenderer, type CursorRect } from '../src/cursor-renderer';

describe('CursorRenderer', () => {
  let container: HTMLDivElement;
  let renderer: CursorRenderer;

  beforeEach(() => {
    // Create container element
    container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '800px';
    container.style.height = '1000px';
    document.body.appendChild(container);

    // Create renderer
    renderer = new CursorRenderer({
      container,
      cursorWidth: 2,
      cursorColor: 'black',
      blinkRate: 530,
    });
  });

  afterEach(() => {
    if (renderer) {
      renderer.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('constructor', () => {
    it('should create cursor element in container', () => {
      const cursorElements = container.querySelectorAll('[data-cursor="true"]');
      expect(cursorElements.length).toBe(1);
    });

    it('should apply default options', () => {
      const customRenderer = new CursorRenderer({ container });
      const cursorElement = container.querySelectorAll('[data-cursor="true"]')[1] as HTMLDivElement;

      expect(cursorElement.style.width).toBe('2px'); // Default width
      expect(cursorElement.style.backgroundColor).toBe('black'); // Default color

      customRenderer.destroy();
    });

    it('should apply custom options', () => {
      const customRenderer = new CursorRenderer({
        container,
        cursorWidth: 3,
        cursorColor: 'red',
        blinkRate: 1000,
      });

      const cursorElements = container.querySelectorAll('[data-cursor="true"]');
      const lastCursor = cursorElements[cursorElements.length - 1] as HTMLDivElement;

      expect(lastCursor.style.width).toBe('3px');
      expect(lastCursor.style.backgroundColor).toBe('red');

      customRenderer.destroy();
    });
  });

  describe('render', () => {
    it('should render cursor at specified position', () => {
      const rect: CursorRect = {
        x: 100,
        y: 200,
        height: 20,
        pageIndex: 0,
      };

      renderer.render(rect);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.left).toBe('100px');
      expect(cursorElement.style.top).toBe('200px');
      expect(cursorElement.style.height).toBe('20px');
      expect(cursorElement.style.display).toBe('block');
    });

    it('should hide cursor when rect is null', () => {
      renderer.render(null);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.display).toBe('none');
    });

    it('should update cursor position when called multiple times', () => {
      const rect1: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      const rect2: CursorRect = { x: 150, y: 250, height: 22, pageIndex: 0 };

      renderer.render(rect1);
      renderer.render(rect2);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.left).toBe('150px');
      expect(cursorElement.style.top).toBe('250px');
      expect(cursorElement.style.height).toBe('22px');
    });

    it('should position cursor element absolutely', () => {
      const rect: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      renderer.render(rect);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.position).toBe('absolute');
    });

    it('should make cursor non-interactive', () => {
      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.pointerEvents).toBe('none');
    });
  });

  describe('renderSelection', () => {
    it('should render single selection rectangle', () => {
      const rects: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects);

      const selectionElements = container.querySelectorAll('[data-selection="true"]');
      expect(selectionElements.length).toBe(1);

      const elem = selectionElements[0] as HTMLDivElement;
      expect(elem.style.left).toBe('50px');
      expect(elem.style.top).toBe('100px');
      expect(elem.style.height).toBe('20px');
    });

    it('should render multiple selection rectangles', () => {
      const rects: CursorRect[] = [
        { x: 50, y: 100, height: 20, pageIndex: 0 },
        { x: 50, y: 120, height: 20, pageIndex: 0 },
        { x: 50, y: 140, height: 20, pageIndex: 0 },
      ];

      renderer.renderSelection(rects);

      const selectionElements = container.querySelectorAll('[data-selection="true"]');
      expect(selectionElements.length).toBe(3);
    });

    it('should remove excess selection elements when rects decrease', () => {
      const rects1: CursorRect[] = [
        { x: 50, y: 100, height: 20, pageIndex: 0 },
        { x: 50, y: 120, height: 20, pageIndex: 0 },
        { x: 50, y: 140, height: 20, pageIndex: 0 },
      ];

      renderer.renderSelection(rects1);
      expect(container.querySelectorAll('[data-selection="true"]').length).toBe(3);

      const rects2: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects2);
      expect(container.querySelectorAll('[data-selection="true"]').length).toBe(1);
    });

    it('should clear all selection when given empty array', () => {
      const rects: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects);
      expect(container.querySelectorAll('[data-selection="true"]').length).toBe(1);

      renderer.renderSelection([]);
      expect(container.querySelectorAll('[data-selection="true"]').length).toBe(0);
    });

    it('should position selection elements absolutely', () => {
      const rects: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects);

      const elem = container.querySelector('[data-selection="true"]') as HTMLDivElement;
      expect(elem.style.position).toBe('absolute');
    });

    it('should make selection elements non-interactive', () => {
      const rects: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects);

      const elem = container.querySelector('[data-selection="true"]') as HTMLDivElement;
      expect(elem.style.pointerEvents).toBe('none');
    });
  });

  describe('setVisible', () => {
    it('should hide cursor when set to false', () => {
      const rect: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      renderer.render(rect);

      renderer.setVisible(false);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.display).toBe('none');
    });

    it('should show cursor when set to true', () => {
      const rect: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      renderer.render(rect);
      renderer.setVisible(false);

      renderer.setVisible(true);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.display).toBe('block');
    });
  });

  describe('blinking', () => {
    it('should start blinking when startBlink is called', () => {
      renderer.startBlink();
      expect(renderer.isBlinking()).toBe(true);
    });

    it('should stop blinking when stopBlink is called', () => {
      renderer.startBlink();
      renderer.stopBlink();
      expect(renderer.isBlinking()).toBe(false);
    });

    it('should toggle cursor opacity during blink', async () => {
      renderer.setBlinkRate(100); // Fast blink for testing
      renderer.startBlink();

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      const initialOpacity = cursorElement.style.opacity;

      // Wait for one blink cycle
      await new Promise((resolve) => setTimeout(resolve, 150));

      const afterOpacity = cursorElement.style.opacity;
      expect(afterOpacity).not.toBe(initialOpacity);

      renderer.stopBlink();
    });

    it('should not create multiple blink intervals', () => {
      renderer.startBlink();
      const isBlinking1 = renderer.isBlinking();
      renderer.startBlink();
      const isBlinking2 = renderer.isBlinking();

      expect(isBlinking1).toBe(true);
      expect(isBlinking2).toBe(true);

      renderer.stopBlink();
    });

    it('should reset blink when cursor moves', async () => {
      renderer.setBlinkRate(100);
      renderer.startBlink();

      const rect1: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      renderer.render(rect1);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.opacity).toBe('1');

      renderer.stopBlink();
    });
  });

  describe('style updates', () => {
    it('should update cursor color', () => {
      renderer.setCursorColor('red');

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.backgroundColor).toBe('red');
    });

    it('should update selection color', () => {
      const rects: CursorRect[] = [{ x: 50, y: 100, height: 20, pageIndex: 0 }];

      renderer.renderSelection(rects);
      renderer.setSelectionColor('green');

      const selectionElement = container.querySelector('[data-selection="true"]') as HTMLDivElement;
      expect(selectionElement.style.backgroundColor).toBe('green');
    });

    it('should update cursor width', () => {
      renderer.setCursorWidth(5);

      const cursorElement = container.querySelector('[data-cursor="true"]') as HTMLDivElement;
      expect(cursorElement.style.width).toBe('5px');
    });

    it('should update blink rate', () => {
      renderer.startBlink();
      renderer.setBlinkRate(200);

      expect(renderer.isBlinking()).toBe(true);
      renderer.stopBlink();
    });
  });

  describe('destroy', () => {
    it('should remove cursor element', () => {
      renderer.destroy();

      const cursorElements = container.querySelectorAll('[data-cursor="true"]');
      expect(cursorElements.length).toBe(0);
    });

    it('should remove all selection elements', () => {
      const rects: CursorRect[] = [
        { x: 50, y: 100, height: 20, pageIndex: 0 },
        { x: 50, y: 120, height: 20, pageIndex: 0 },
      ];

      renderer.renderSelection(rects);
      renderer.destroy();

      const selectionElements = container.querySelectorAll('[data-selection="true"]');
      expect(selectionElements.length).toBe(0);
    });

    it('should stop blinking', () => {
      renderer.startBlink();
      renderer.destroy();

      expect(renderer.isBlinking()).toBe(false);
    });
  });

  describe('state queries', () => {
    it('should report visibility state', () => {
      expect(renderer.isVisible()).toBe(true);

      renderer.setVisible(false);
      expect(renderer.isVisible()).toBe(false);
    });

    it('should report current position', () => {
      const rect: CursorRect = { x: 100, y: 200, height: 20, pageIndex: 0 };
      renderer.render(rect);

      const position = renderer.getCurrentPosition();
      expect(position).toEqual({ x: 100, y: 200, height: 20 });
    });

    it('should return null position when cursor is hidden', () => {
      renderer.render(null);

      const position = renderer.getCurrentPosition();
      expect(position).toBeNull();
    });

    it('should report selection count', () => {
      expect(renderer.getSelectionCount()).toBe(0);

      const rects: CursorRect[] = [
        { x: 50, y: 100, height: 20, pageIndex: 0 },
        { x: 50, y: 120, height: 20, pageIndex: 0 },
      ];

      renderer.renderSelection(rects);
      expect(renderer.getSelectionCount()).toBe(2);
    });
  });
});
