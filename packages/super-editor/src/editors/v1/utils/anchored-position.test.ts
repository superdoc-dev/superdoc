/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAnchoredPosition, getAvailableSpace, getAvailableSpaceForPlacement } from './anchored-position.js';

const GUTTER = 8;

/**
 * Creates a mock HTMLElement with a fixed bounding rect and optional offsetWidth/offsetHeight.
 */
const makeTrigger = (rect: {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}): HTMLElement => {
  const el = document.createElement('div');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect);
  return el;
};

const makeContent = (width: number, height: number): HTMLElement => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { get: () => width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { get: () => height, configurable: true });
  return el;
};

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
};

describe('getAvailableSpace', () => {
  beforeEach(() => {
    setViewport(1000, 800);
  });

  it('returns correct space around a centered element', () => {
    const trigger = makeTrigger({ top: 350, bottom: 450, left: 400, right: 600, width: 200, height: 100 });
    const space = getAvailableSpace(trigger);
    // top - GUTTER = 350 - 8 = 342
    expect(space.availableAbove).toBe(342);
    // viewportHeight - bottom - GUTTER = 800 - 450 - 8 = 342
    expect(space.availableBelow).toBe(342);
    // left - GUTTER = 400 - 8 = 392
    expect(space.availableLeft).toBe(392);
    // viewportWidth - right - GUTTER = 1000 - 600 - 8 = 392
    expect(space.availableRight).toBe(392);
  });

  it('clamps to 0 when trigger is outside viewport edges', () => {
    // Trigger extends beyond the top and left edges
    const trigger = makeTrigger({ top: -20, bottom: 810, left: -5, right: 1010, width: 55, height: 30 });
    const space = getAvailableSpace(trigger);
    expect(space.availableAbove).toBe(0);
    expect(space.availableLeft).toBe(0);
    expect(space.availableBelow).toBe(0);
    expect(space.availableRight).toBe(0);
  });

  it('incorporates offset into available space', () => {
    const trigger = makeTrigger({ top: 200, bottom: 300, left: 100, right: 200, width: 100, height: 100 });
    const withoutOffset = getAvailableSpace(trigger, 0);
    const withOffset = getAvailableSpace(trigger, 20);
    // Adding offset shrinks available space in each direction
    expect(withOffset.availableAbove).toBe(withoutOffset.availableAbove - 20);
    expect(withOffset.availableBelow).toBe(withoutOffset.availableBelow - 20);
    expect(withOffset.availableLeft).toBe(withoutOffset.availableLeft - 20);
    expect(withOffset.availableRight).toBe(withoutOffset.availableRight - 20);
  });
});

describe('getAnchoredPosition', () => {
  beforeEach(() => {
    setViewport(1000, 800);
  });

  describe('basic placements', () => {
    it('positions content above trigger for placement "top"', () => {
      const trigger = makeTrigger({ top: 400, bottom: 450, left: 200, right: 600, width: 400, height: 50 });
      const content = makeContent(100, 40);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'top', offset: 0 });
      // top - contentHeight = 400 - 40 = 360
      expect(top).toBe(360);
      // left + (triggerWidth - contentWidth) / 2 = 200 + (400 - 100)/2 = 350
      expect(left).toBe(350);
      expect(computedPlacement).toBe('top');
    });

    it('positions content below trigger for placement "bottom"', () => {
      const trigger = makeTrigger({ top: 100, bottom: 150, left: 100, right: 300, width: 200, height: 50 });
      const content = makeContent(100, 40);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, {
        placement: 'bottom',
        offset: 5,
      });
      // triggerBottom + offset = 150 + 5 = 155
      expect(top).toBe(155);
      // triggerLeft + (triggerWidth - contentWidth) / 2 = 100 + (200 - 100)/2 = 150
      expect(left).toBe(150);
      expect(computedPlacement).toBe('bottom');
    });

    it('positions content to the left of trigger for placement "left"', () => {
      const trigger = makeTrigger({ top: 300, bottom: 400, left: 500, right: 600, width: 100, height: 100 });
      const content = makeContent(80, 40);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'left', offset: 0 });
      // triggerTop + (triggerHeight - contentHeight) / 2 = 300 + (100 - 40)/2 = 330
      expect(top).toBe(330);
      // triggerLeft - contentWidth = 500 - 80 = 420
      expect(left).toBe(420);
      expect(computedPlacement).toBe('left');
    });

    it('positions content to the right of trigger for placement "right"', () => {
      const trigger = makeTrigger({ top: 300, bottom: 400, left: 100, right: 200, width: 100, height: 100 });
      const content = makeContent(80, 40);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'right', offset: 0 });
      // triggerTop + (triggerHeight - contentHeight) / 2 = 300 + (100 - 40)/2 = 330
      expect(top).toBe(330);
      // triggerRight = 200
      expect(left).toBe(200);
      expect(computedPlacement).toBe('right');
    });
  });

  describe('alignment for start and end placements', () => {
    it('aligns to start for "bottom-start"', () => {
      const trigger = makeTrigger({ top: 100, bottom: 150, left: 200, right: 500, width: 300, height: 50 });
      const content = makeContent(120, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'bottom-start' });
      expect(top).toBe(150);
      expect(left).toBe(200);
      expect(computedPlacement).toBe('bottom-start');
    });

    it('aligns to end for "bottom-end"', () => {
      const trigger = makeTrigger({ top: 100, bottom: 150, left: 200, right: 500, width: 300, height: 50 });
      const content = makeContent(120, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'bottom-end' });
      expect(top).toBe(150);
      // triggerRight - contentWidth = 500 - 120 = 380
      expect(left).toBe(380);
      expect(computedPlacement).toBe('bottom-end');
    });

    it('aligns to start for "top-start"', () => {
      const trigger = makeTrigger({ top: 300, bottom: 350, left: 200, right: 500, width: 300, height: 50 });
      const content = makeContent(120, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'top-start' });
      // triggerTop - contentHeight = 300 - 60 = 240
      expect(top).toBe(240);
      expect(left).toBe(200);
      expect(computedPlacement).toBe('top-start');
    });

    it('aligns to end for "top-end"', () => {
      const trigger = makeTrigger({ top: 300, bottom: 350, left: 200, right: 500, width: 300, height: 50 });
      const content = makeContent(120, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'top-end' });
      // triggerTop - contentHeight = 300 - 60 = 240
      expect(top).toBe(240);
      // triggerRight - contentWidth = 500 - 120 = 380
      expect(left).toBe(380);
      expect(computedPlacement).toBe('top-end');
    });

    it('aligns to start for "left-start"', () => {
      const trigger = makeTrigger({ top: 200, bottom: 300, left: 400, right: 500, width: 100, height: 100 });
      const content = makeContent(80, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'left-start' });
      expect(top).toBe(200);
      // triggerLeft - contentWidth = 400 - 80 = 320
      expect(left).toBe(320);
      expect(computedPlacement).toBe('left-start');
    });

    it('aligns to start for "right-start"', () => {
      const trigger = makeTrigger({ top: 200, bottom: 300, left: 100, right: 200, width: 100, height: 100 });
      const content = makeContent(80, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'right-start' });
      expect(top).toBe(200);
      expect(left).toBe(200);
      expect(computedPlacement).toBe('right-start');
    });

    it('aligns to start for "left-end"', () => {
      const trigger = makeTrigger({ top: 200, bottom: 300, left: 400, right: 500, width: 100, height: 100 });
      const content = makeContent(80, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'left-end' });
      // triggerBottom - contentHeight = 300 - 60 = 240
      expect(top).toBe(240);
      // triggerLeft - contentWidth = 400 - 80 = 320
      expect(left).toBe(320);
      expect(computedPlacement).toBe('left-end');
    });

    it('aligns to start for "right-end"', () => {
      const trigger = makeTrigger({ top: 200, bottom: 300, left: 100, right: 200, width: 100, height: 100 });
      const content = makeContent(80, 60);
      const { top, left, computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'right-end' });
      // triggerBottom - contentHeight = 300 - 60 = 240
      expect(top).toBe(240);
      expect(left).toBe(200);
      expect(computedPlacement).toBe('right-end');
    });
  });

  describe('clamping behavior', () => {
    it('clamps left to GUTTER when content would overflow the left edge', () => {
      // Trigger near left edge, content wider than trigger
      const trigger = makeTrigger({ top: 100, bottom: 150, left: 10, right: 110, width: 100, height: 50 });
      const content = makeContent(200, 40);
      const { left } = getAnchoredPosition(trigger, content, { placement: 'bottom' });
      // Without clamping: left = 10 + (100 - 200)/2 = -40. With clamping: GUTTER = 8
      expect(left).toBe(GUTTER);
    });

    it('clamps left to keep content inside right edge of viewport', () => {
      // Trigger near right edge 1000px
      const trigger = makeTrigger({ top: 100, bottom: 150, left: 900, right: 990, width: 90, height: 50 });
      const content = makeContent(200, 40);
      const { left } = getAnchoredPosition(trigger, content, { placement: 'bottom' });
      // Without clamping: left = 900 + (90 - 200)/2 = 845. Max: 1000 - 200 - 8 = 792
      expect(left).toBe(1000 - 200 - GUTTER);
    });
  });

  describe('flip behavior', () => {
    it('flips from "top" to "bottom" when there is not enough space above', () => {
      // Trigger near the top of the viewport; content height is large
      const trigger = makeTrigger({ top: 20, bottom: 70, left: 400, right: 600, width: 200, height: 50 });
      const content = makeContent(100, 200);
      // availableAbove = 20 - 8 = 12, availableBelow = 800 - 70 - 8 = 722
      const { computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'top', flip: true });
      expect(computedPlacement).toBe('bottom');
    });

    it('flips from "bottom" to "top" when there is not enough space below', () => {
      // Trigger near the bottom of the viewport
      const trigger = makeTrigger({ top: 720, bottom: 770, left: 400, right: 600, width: 200, height: 50 });
      const content = makeContent(100, 100);
      // availableBelow = 800 - 770 - 8 = 22, availableAbove = 720 - 8 = 712
      const { computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'bottom', flip: true });
      expect(computedPlacement).toBe('top');
    });

    it('flips from "left" to "right" when there is not enough space to the left', () => {
      const trigger = makeTrigger({ top: 300, bottom: 400, left: 20, right: 120, width: 100, height: 100 });
      const content = makeContent(200, 40);
      // availableLeft = 20 - 8 = 12, availableRight = 1000 - 120 - 8 = 872
      const { computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'left', flip: true });
      expect(computedPlacement).toBe('right');
    });

    it('flips from "right" to "left" when there is not enough space to the right', () => {
      const trigger = makeTrigger({ top: 300, bottom: 400, left: 800, right: 900, width: 100, height: 100 });
      const content = makeContent(200, 40);
      // availableRight = 1000 - 900 - 8 = 92, availableLeft = 800 - 8 = 792
      const { computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'right', flip: true });
      expect(computedPlacement).toBe('left');
    });

    it('does not flip when flip is false', () => {
      const trigger = makeTrigger({ top: 20, bottom: 70, left: 400, right: 600, width: 200, height: 50 });
      const content = makeContent(100, 200);
      const { computedPlacement } = getAnchoredPosition(trigger, content, { placement: 'top', flip: false });
      expect(computedPlacement).toBe('top');
    });
  });
});

describe('getAvailableSpaceForPlacement', () => {
  beforeEach(() => {
    setViewport(1000, 800);
  });

  it('returns viewport width and available-above height for "top"', () => {
    const trigger = makeTrigger({ top: 400, bottom: 450, left: 300, right: 700, width: 400, height: 50 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'top');
    expect(maxWidth).toBe(1000 - GUTTER * 2);
    // availableAbove = 400 - 8 = 392
    expect(maxHeight).toBe(392);
  });

  it('returns viewport width and available-below height for "bottom"', () => {
    const trigger = makeTrigger({ top: 100, bottom: 150, left: 300, right: 700, width: 400, height: 50 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'bottom');
    expect(maxWidth).toBe(1000 - GUTTER * 2);
    // availableBelow = 800 - 150 - 8 = 642
    expect(maxHeight).toBe(642);
  });

  it('returns available-left width and viewport height for "left"', () => {
    const trigger = makeTrigger({ top: 200, bottom: 300, left: 400, right: 500, width: 100, height: 100 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'left');
    // availableLeft = 400 - 8 = 392
    expect(maxWidth).toBe(392);
    expect(maxHeight).toBe(800 - GUTTER * 2);
  });

  it('returns available-right width and viewport height for "right"', () => {
    const trigger = makeTrigger({ top: 200, bottom: 300, left: 400, right: 600, width: 200, height: 100 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'right');
    // availableRight = 1000 - 600 - 8 = 392
    expect(maxWidth).toBe(392);
    expect(maxHeight).toBe(800 - GUTTER * 2);
  });

  it('returns correct size for "top-start"', () => {
    const trigger = makeTrigger({ top: 300, bottom: 350, left: 200, right: 500, width: 300, height: 50 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'top-start');
    // availableRight + triggerWidth = (1000 - 500 - 8) + 300 = 792
    expect(maxWidth).toBe(792);
    // availableAbove = 300 - 8 = 292
    expect(maxHeight).toBe(292);
  });

  it('returns correct size for "bottom-end"', () => {
    const trigger = makeTrigger({ top: 100, bottom: 150, left: 200, right: 500, width: 300, height: 50 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'bottom-end');
    // availableLeft + triggerWidth = (200 - 8) + 300 = 492
    expect(maxWidth).toBe(492);
    // availableBelow = 800 - 150 - 8 = 642
    expect(maxHeight).toBe(642);
  });

  it('returns correct size for "left-start"', () => {
    const trigger = makeTrigger({ top: 200, bottom: 400, left: 300, right: 400, width: 100, height: 200 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'left-start');
    // availableLeft = 300 - 8 = 292
    expect(maxWidth).toBe(292);
    // availableBelow + triggerHeight = (800 - 400 - 8) + 200 = 592
    expect(maxHeight).toBe(592);
  });

  it('returns correct size for "right-end"', () => {
    const trigger = makeTrigger({ top: 300, bottom: 500, left: 400, right: 600, width: 200, height: 200 });
    const { maxWidth, maxHeight } = getAvailableSpaceForPlacement(trigger, 'right-end');
    // availableRight = 1000 - 600 - 8 = 392
    expect(maxWidth).toBe(392);
    // availableAbove + triggerHeight = (300 - 8) + 200 = 492
    expect(maxHeight).toBe(492);
  });

  it('incorporates offset into calculations', () => {
    const trigger = makeTrigger({ top: 300, bottom: 350, left: 200, right: 500, width: 300, height: 50 });
    const withoutOffset = getAvailableSpaceForPlacement(trigger, 'top', 0);
    const withOffset = getAvailableSpaceForPlacement(trigger, 'top', 20);
    // offset reduces availableAbove, so maxHeight decreases
    expect(withOffset.maxHeight).toBe(withoutOffset.maxHeight - 20);
  });
});
