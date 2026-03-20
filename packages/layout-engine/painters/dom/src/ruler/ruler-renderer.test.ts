import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createRulerElement,
  updateHandlePosition,
  createIndicatorElement,
  updateIndicator,
  RULER_CLASS_NAMES,
  type CreateRulerElementOptions,
} from './ruler-renderer.js';
import type { RulerDefinition } from './ruler-core.js';

describe('createRulerElement', () => {
  let doc: Document;
  let definition: RulerDefinition;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    doc = dom.window.document;

    // Standard ruler definition for 8.5 inch page
    definition = {
      widthPx: 816,
      heightPx: 25,
      ticks: [
        { size: 'main', height: '20%', label: 0, x: 0 },
        { size: 'eighth', height: '10%', x: 12 },
        { size: 'eighth', height: '10%', x: 24 },
        { size: 'eighth', height: '10%', x: 36 },
        { size: 'half', height: '40%', x: 48 },
        { size: 'eighth', height: '10%', x: 60 },
        { size: 'eighth', height: '10%', x: 72 },
        { size: 'eighth', height: '10%', x: 84 },
        { size: 'main', height: '20%', label: 1, x: 96 },
      ],
      leftMarginPx: 96,
      rightMarginPx: 720,
      pageWidthInches: 8.5,
    };
  });

  describe('non-interactive ruler', () => {
    it('creates a ruler element with correct dimensions', () => {
      const ruler = createRulerElement({ definition, doc });

      expect(ruler.tagName).toBe('DIV');
      expect(ruler.className).toBe(RULER_CLASS_NAMES.ruler);
      expect(ruler.style.width).toBe('816px');
      expect(ruler.style.height).toBe('25px');
    });

    it('creates tick elements for all ticks', () => {
      const ruler = createRulerElement({ definition, doc });

      const ticks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tick}`);
      expect(ticks.length).toBe(definition.ticks.length);
    });

    it('creates main tick with correct classes', () => {
      const ruler = createRulerElement({ definition, doc });

      const mainTicks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tickMain}`);
      expect(mainTicks.length).toBe(2); // Two main ticks in our definition
    });

    it('creates half tick with correct classes', () => {
      const ruler = createRulerElement({ definition, doc });

      const halfTicks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tickHalf}`);
      expect(halfTicks.length).toBe(1);
    });

    it('creates eighth ticks with correct classes', () => {
      const ruler = createRulerElement({ definition, doc });

      const eighthTicks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tickEighth}`);
      expect(eighthTicks.length).toBe(6);
    });

    it('positions tick elements correctly', () => {
      const ruler = createRulerElement({ definition, doc });

      const firstTick = ruler.querySelector(`.${RULER_CLASS_NAMES.tick}`) as HTMLElement;
      expect(firstTick.style.left).toBe('0px');

      const allTicks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tick}`) as NodeListOf<HTMLElement>;
      expect(allTicks[1].style.left).toBe('12px');
      expect(allTicks[4].style.left).toBe('48px'); // Half tick
    });

    it('adds labels to main ticks but skips the leading zero', () => {
      const ruler = createRulerElement({ definition, doc });

      const labels = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.label}`);
      expect(labels.length).toBe(1); // Label 0 is hidden to prevent overflow clipping

      expect(labels[0].textContent).toBe('1');
    });

    it('does not add labels to non-main ticks', () => {
      const ruler = createRulerElement({ definition, doc });

      const eighthTicks = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.tickEighth}`);
      eighthTicks.forEach((tick) => {
        const label = tick.querySelector(`.${RULER_CLASS_NAMES.label}`);
        expect(label).toBeNull();
      });
    });

    it('does not create handles when interactive is false', () => {
      const ruler = createRulerElement({ definition, doc, interactive: false });

      const handles = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.handle}`);
      expect(handles.length).toBe(0);
    });

    it('sets pointer-events to none for non-interactive ruler', () => {
      const ruler = createRulerElement({ definition, doc, interactive: false });

      expect(ruler.style.pointerEvents).toBe('none');
    });

    it('applies correct tick heights', () => {
      const ruler = createRulerElement({ definition, doc });

      const mainTick = ruler.querySelector(`.${RULER_CLASS_NAMES.tickMain}`) as HTMLElement;
      const halfTick = ruler.querySelector(`.${RULER_CLASS_NAMES.tickHalf}`) as HTMLElement;
      const eighthTick = ruler.querySelector(`.${RULER_CLASS_NAMES.tickEighth}`) as HTMLElement;

      expect(mainTick.style.height).toBe('20%');
      expect(halfTick.style.height).toBe('40%');
      expect(eighthTick.style.height).toBe('10%');
    });
  });

  describe('interactive ruler', () => {
    it('creates handles when interactive is true', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      const handles = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.handle}`);
      expect(handles.length).toBe(2);
    });

    it('creates left handle with correct position and classes', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;
      expect(leftHandle).not.toBeNull();
      expect(leftHandle.style.left).toBe('96px');
      expect(leftHandle.dataset.side).toBe('left');
    });

    it('creates right handle with correct position and classes', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      const rightHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleRight}`) as HTMLElement;
      expect(rightHandle).not.toBeNull();
      expect(rightHandle.style.left).toBe('720px');
      expect(rightHandle.dataset.side).toBe('right');
    });

    it('sets pointer-events to auto for interactive ruler', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      expect(ruler.style.pointerEvents).toBe('auto');
    });

    it('sets up drag listeners when callbacks are provided', () => {
      const onDragStart = vi.fn();
      const onDrag = vi.fn();
      const onDragEnd = vi.fn();

      const ruler = createRulerElement({
        definition,
        doc,
        interactive: true,
        onDragStart,
        onDrag,
        onDragEnd,
      });

      const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;
      expect(leftHandle).not.toBeNull();

      // Verify handle exists and has drag cursor
      expect(leftHandle.style.cursor).toBe('grab');
    });

    it('handles hover state changes', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;

      // Trigger mouseenter
      const enterEvent = new (doc.defaultView as Window).MouseEvent('mouseenter');
      leftHandle.dispatchEvent(enterEvent);

      expect(leftHandle.style.backgroundColor).toBe('rgba(37, 99, 235, 0.4)');

      // Trigger mouseleave
      const leaveEvent = new (doc.defaultView as Window).MouseEvent('mouseleave');
      leftHandle.dispatchEvent(leaveEvent);

      expect(leftHandle.style.backgroundColor).toBe('rgb(204, 204, 204)');
    });
  });

  describe('validation and edge cases', () => {
    it('warns and uses fallback for invalid width', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const invalidDefinition = { ...definition, widthPx: -100 };

      const ruler = createRulerElement({ definition: invalidDefinition, doc });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[createRulerElement] Invalid ruler width'));
      expect(ruler.style.width).toBe('1px'); // Fallback to 1px

      consoleWarnSpy.mockRestore();
    });

    it('warns and uses fallback for NaN width', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const invalidDefinition = { ...definition, widthPx: NaN };

      const ruler = createRulerElement({ definition: invalidDefinition, doc });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[createRulerElement] Invalid ruler width'));
      expect(ruler.style.width).toBe('1px');

      consoleWarnSpy.mockRestore();
    });

    it('warns when ticks array is empty', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const emptyTicksDefinition = { ...definition, ticks: [] };

      createRulerElement({ definition: emptyTicksDefinition, doc });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[createRulerElement] Ruler definition has no ticks'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('creates ruler with zero height', () => {
      const zeroHeightDefinition = { ...definition, heightPx: 0 };

      const ruler = createRulerElement({ definition: zeroHeightDefinition, doc });

      expect(ruler.style.height).toBe('0px');
    });

    it('handles tick without label (non-main tick)', () => {
      const singleTickDefinition: RulerDefinition = {
        ...definition,
        ticks: [{ size: 'eighth', height: '10%', x: 12 }],
      };

      const ruler = createRulerElement({ definition: singleTickDefinition, doc });

      const labels = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.label}`);
      expect(labels.length).toBe(0);
    });

    it('does not render label for tick with label value of 0', () => {
      const singleTickDefinition: RulerDefinition = {
        ...definition,
        ticks: [{ size: 'main', height: '20%', label: 0, x: 0 }],
      };

      const ruler = createRulerElement({ definition: singleTickDefinition, doc });

      const labels = ruler.querySelectorAll(`.${RULER_CLASS_NAMES.label}`);
      expect(labels.length).toBe(0);
    });
  });

  describe('DOM structure', () => {
    it('creates ruler with correct positioning styles', () => {
      const ruler = createRulerElement({ definition, doc });

      expect(ruler.style.position).toBe('relative');
      expect(ruler.style.display).toBe('flex');
      expect(ruler.style.alignItems).toBe('flex-end');
      expect(ruler.style.boxSizing).toBe('border-box');
      expect(ruler.style.userSelect).toBe('none');
    });

    it('creates ticks with absolute positioning', () => {
      const ruler = createRulerElement({ definition, doc });

      const tick = ruler.querySelector(`.${RULER_CLASS_NAMES.tick}`) as HTMLElement;
      expect(tick.style.position).toBe('absolute');
      expect(tick.style.bottom).toBe('0px');
    });

    it('creates handles with absolute positioning when interactive', () => {
      const ruler = createRulerElement({ definition, doc, interactive: true });

      const handle = ruler.querySelector(`.${RULER_CLASS_NAMES.handle}`) as HTMLElement;
      expect(handle.style.position).toBe('absolute');
      expect(handle.style.top).toBe('0px');
    });
  });
});

describe('updateHandlePosition', () => {
  let doc: Document;
  let ruler: HTMLElement;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    doc = dom.window.document;

    ruler = doc.createElement('div');
    ruler.className = RULER_CLASS_NAMES.ruler;

    const leftHandle = doc.createElement('div');
    leftHandle.className = `${RULER_CLASS_NAMES.handle} ${RULER_CLASS_NAMES.handleLeft}`;
    leftHandle.style.left = '96px';

    const rightHandle = doc.createElement('div');
    rightHandle.className = `${RULER_CLASS_NAMES.handle} ${RULER_CLASS_NAMES.handleRight}`;
    rightHandle.style.left = '720px';

    ruler.appendChild(leftHandle);
    ruler.appendChild(rightHandle);
  });

  it('updates left handle position', () => {
    updateHandlePosition(ruler, 'left', 144);

    const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;
    expect(leftHandle.style.left).toBe('144px');
  });

  it('updates right handle position', () => {
    updateHandlePosition(ruler, 'right', 672);

    const rightHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleRight}`) as HTMLElement;
    expect(rightHandle.style.left).toBe('672px');
  });

  it('handles zero position', () => {
    updateHandlePosition(ruler, 'left', 0);

    const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;
    expect(leftHandle.style.left).toBe('0px');
  });

  it('handles fractional position', () => {
    updateHandlePosition(ruler, 'left', 96.5);

    const leftHandle = ruler.querySelector(`.${RULER_CLASS_NAMES.handleLeft}`) as HTMLElement;
    expect(leftHandle.style.left).toBe('96.5px');
  });

  it('does nothing if handle is not found', () => {
    const emptyRuler = doc.createElement('div');

    // Should not throw
    expect(() => {
      updateHandlePosition(emptyRuler, 'left', 100);
    }).not.toThrow();
  });
});

describe('createIndicatorElement', () => {
  let doc: Document;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    doc = dom.window.document;
  });

  it('creates indicator element with correct class', () => {
    const indicator = createIndicatorElement(doc, 500);

    expect(indicator.tagName).toBe('DIV');
    expect(indicator.className).toBe(RULER_CLASS_NAMES.indicator);
  });

  it('creates indicator with correct height', () => {
    const indicator = createIndicatorElement(doc, 500);

    expect(indicator.style.height).toBe('500px');
  });

  it('creates indicator with display none by default', () => {
    const indicator = createIndicatorElement(doc, 500);

    expect(indicator.style.display).toBe('none');
  });

  it('creates indicator with correct positioning styles', () => {
    const indicator = createIndicatorElement(doc, 500);

    expect(indicator.style.position).toBe('absolute');
    expect(indicator.style.top).toBe('20px');
    expect(indicator.style.width).toBe('1px');
    expect(indicator.style.pointerEvents).toBe('none');
  });

  it('creates indicator with correct z-index', () => {
    const indicator = createIndicatorElement(doc, 500);

    expect(indicator.style.zIndex).toBe('100');
  });

  it('handles zero height', () => {
    const indicator = createIndicatorElement(doc, 0);

    expect(indicator.style.height).toBe('0px');
  });

  it('handles large height values', () => {
    const indicator = createIndicatorElement(doc, 10000);

    expect(indicator.style.height).toBe('10000px');
  });
});

describe('updateIndicator', () => {
  let doc: Document;
  let indicator: HTMLElement;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    doc = dom.window.document;
    indicator = createIndicatorElement(doc, 500);
  });

  it('shows indicator when visible is true', () => {
    updateIndicator(indicator, true, 100);

    expect(indicator.style.display).toBe('block');
  });

  it('hides indicator when visible is false', () => {
    updateIndicator(indicator, false);

    expect(indicator.style.display).toBe('none');
  });

  it('updates indicator position when visible and x is provided', () => {
    updateIndicator(indicator, true, 200);

    expect(indicator.style.left).toBe('200px');
  });

  it('does not update position when visible but x is undefined', () => {
    indicator.style.left = '100px';
    updateIndicator(indicator, true);

    expect(indicator.style.left).toBe('100px');
  });

  it('hides indicator without changing position when visible is false', () => {
    indicator.style.left = '100px';
    updateIndicator(indicator, false);

    expect(indicator.style.display).toBe('none');
    expect(indicator.style.left).toBe('100px');
  });

  it('handles zero position', () => {
    updateIndicator(indicator, true, 0);

    expect(indicator.style.left).toBe('0px');
    expect(indicator.style.display).toBe('block');
  });

  it('handles fractional position', () => {
    updateIndicator(indicator, true, 123.456);

    expect(indicator.style.left).toBe('123.456px');
  });

  it('can be toggled multiple times', () => {
    updateIndicator(indicator, true, 100);
    expect(indicator.style.display).toBe('block');

    updateIndicator(indicator, false);
    expect(indicator.style.display).toBe('none');

    updateIndicator(indicator, true, 200);
    expect(indicator.style.display).toBe('block');
    expect(indicator.style.left).toBe('200px');
  });
});

describe('RULER_CLASS_NAMES', () => {
  it('contains all expected class name constants', () => {
    expect(RULER_CLASS_NAMES.ruler).toBe('superdoc-ruler');
    expect(RULER_CLASS_NAMES.tick).toBe('superdoc-ruler-tick');
    expect(RULER_CLASS_NAMES.tickMain).toBe('superdoc-ruler-tick--main');
    expect(RULER_CLASS_NAMES.tickHalf).toBe('superdoc-ruler-tick--half');
    expect(RULER_CLASS_NAMES.tickEighth).toBe('superdoc-ruler-tick--eighth');
    expect(RULER_CLASS_NAMES.label).toBe('superdoc-ruler-label');
    expect(RULER_CLASS_NAMES.handle).toBe('superdoc-ruler-handle');
    expect(RULER_CLASS_NAMES.handleLeft).toBe('superdoc-ruler-handle--left');
    expect(RULER_CLASS_NAMES.handleRight).toBe('superdoc-ruler-handle--right');
    expect(RULER_CLASS_NAMES.indicator).toBe('superdoc-ruler-indicator');
  });

  it('uses consistent naming prefix', () => {
    const prefix = 'superdoc-ruler';

    expect(RULER_CLASS_NAMES.ruler).toContain(prefix);
    expect(RULER_CLASS_NAMES.tick).toContain(prefix);
    expect(RULER_CLASS_NAMES.handle).toContain(prefix);
    expect(RULER_CLASS_NAMES.indicator).toContain(prefix);
  });
});
