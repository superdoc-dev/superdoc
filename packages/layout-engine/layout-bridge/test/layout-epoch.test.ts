/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

vi.mock('../src/dom-mapping.ts', () => ({
  clickToPositionDom: vi.fn(() => 10),
}));

import { clickToPosition } from '../src/index.ts';

describe('clickToPosition layout epoch resolution', () => {
  const layout: Layout = {
    pageSize: { w: 500, h: 500 },
    pages: [{ number: 1, fragments: [] }],
  };
  const blocks: FlowBlock[] = [];
  const measures: Measure[] = [];

  let originalElementsFromPoint: ((x: number, y: number) => Element[]) | undefined;

  afterEach(() => {
    if (originalElementsFromPoint) {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      originalElementsFromPoint = undefined;
    } else {
      delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
    }
  });

  it('uses the newest layout epoch from the DOM hit chain', () => {
    const container = document.createElement('div');
    const page = document.createElement('div');
    const line = document.createElement('div');
    page.dataset.layoutEpoch = '8';
    line.dataset.layoutEpoch = '0';
    container.appendChild(page);
    page.appendChild(line);
    document.body.appendChild(container);

    originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [line, page]),
    });

    const result = clickToPosition(layout, blocks, measures, { x: 1, y: 1 }, container, 1, 1);
    expect(result?.layoutEpoch).toBe(8);

    document.body.removeChild(container);
  });
});
