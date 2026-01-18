import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createDomPainter } from './index.js';
import type { DrawingBlock, DrawingMeasure, Layout } from '@superdoc/contracts';

describe('DomPainter custom geometry shapes', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('renders a:custGeom paths when kind is "custom" (no preset warning)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const drawingBlock: DrawingBlock = {
      kind: 'drawing',
      id: 'shape-custom-1',
      drawingKind: 'vectorShape',
      geometry: { width: 100, height: 80, rotation: 0, flipH: false, flipV: false },
      shapeKind: 'custom',
      fillColor: '#ff0000',
      strokeColor: '#0000ff',
      strokeWidth: 2,
      attrs: {
        customGeometry: {
          paths: [{ d: 'M 0 0 L 100 0 L 100 80 L 0 80 Z' }],
        },
      },
    };

    const drawingMeasure: DrawingMeasure = {
      kind: 'drawing',
      drawingKind: 'vectorShape',
      width: 100,
      height: 80,
      scale: 1,
      naturalWidth: 100,
      naturalHeight: 80,
      geometry: { width: 100, height: 80, rotation: 0, flipH: false, flipV: false },
    };

    const drawingLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'drawing',
              blockId: 'shape-custom-1',
              drawingKind: 'vectorShape',
              x: 20,
              y: 30,
              width: 100,
              height: 80,
              geometry: { width: 100, height: 80, rotation: 0, flipH: false, flipV: false },
              scale: 1,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [drawingBlock], measures: [drawingMeasure] });
    painter.paint(drawingLayout, mount);

    const path = mount.querySelector('svg path');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('d')).toBe('M 0 0 L 100 0 L 100 80 L 0 80 Z');
    expect(path?.getAttribute('fill')).toBe('#ff0000');
    expect(path?.getAttribute('stroke')).toBe('#0000ff');
    expect(path?.getAttribute('stroke-width')).toBe('2');

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
