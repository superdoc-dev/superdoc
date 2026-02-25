import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Layout, Measure } from '@superdoc/contracts';

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('DomPainter clipPath cache invalidation', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  it('rebuilds inline image run when only clipPath changes via setData', () => {
    const initialClipPath = 'inset(10% 20% 30% 40%)';
    const updatedClipPath = 'inset(15% 15% 15% 15%)';

    const imageBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'inline-image-block',
      runs: [
        {
          kind: 'image',
          src: DATA_URL,
          width: 80,
          height: 60,
          clipPath: initialClipPath,
        },
      ],
    };

    const imageMeasure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 0,
          width: 80,
          ascent: 60,
          descent: 0,
          lineHeight: 60,
        },
      ],
      totalHeight: 60,
    };

    const imageLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'para',
              blockId: 'inline-image-block',
              fromLine: 0,
              toLine: 1,
              x: 0,
              y: 0,
              width: 80,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [imageBlock], measures: [imageMeasure] });
    painter.paint(imageLayout, mount);

    const wrapperBefore = mount.querySelector('.superdoc-inline-image-clip-wrapper') as HTMLElement;
    expect(wrapperBefore).toBeTruthy();
    const imgBefore = wrapperBefore.querySelector('img') as HTMLElement;
    expect(imgBefore.style.clipPath).toBe(initialClipPath);

    const updatedImageBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'inline-image-block',
      runs: [
        {
          kind: 'image',
          src: DATA_URL,
          width: 80,
          height: 60,
          clipPath: updatedClipPath,
        },
      ],
    };

    painter.setData?.([updatedImageBlock], [imageMeasure]);
    painter.paint(imageLayout, mount);

    const wrapperAfter = mount.querySelector('.superdoc-inline-image-clip-wrapper') as HTMLElement;
    const imgAfter = wrapperAfter.querySelector('img') as HTMLElement;
    expect(wrapperAfter).not.toBe(wrapperBefore);
    expect(imgAfter.style.clipPath).toBe(updatedClipPath);
  });

  it('rebuilds image fragment when only clipPath changes via setData', () => {
    const initialClipPath = 'inset(5% 5% 5% 5%)';
    const updatedClipPath = 'inset(25% 10% 15% 5%)';

    const imageBlock: FlowBlock = {
      kind: 'image',
      id: 'image-block',
      src: DATA_URL,
      width: 120,
      height: 90,
      attrs: { clipPath: initialClipPath },
    };

    const imageMeasure: Measure = {
      kind: 'image',
      width: 120,
      height: 90,
    };

    const imageLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'image',
              blockId: 'image-block',
              x: 24,
              y: 24,
              width: 120,
              height: 90,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [imageBlock], measures: [imageMeasure] });
    painter.paint(imageLayout, mount);

    const fragmentBefore = mount.querySelector('.superdoc-image-fragment') as HTMLElement;
    expect(fragmentBefore).toBeTruthy();
    const imageBefore = fragmentBefore.querySelector('img') as HTMLElement;
    expect(imageBefore.style.clipPath).toBe(initialClipPath);

    const updatedImageBlock: FlowBlock = {
      kind: 'image',
      id: 'image-block',
      src: DATA_URL,
      width: 120,
      height: 90,
      attrs: { clipPath: updatedClipPath },
    };

    painter.setData?.([updatedImageBlock], [imageMeasure]);
    painter.paint(imageLayout, mount);

    const fragmentAfter = mount.querySelector('.superdoc-image-fragment') as HTMLElement;
    const imageAfter = fragmentAfter.querySelector('img') as HTMLElement;
    expect(fragmentAfter).not.toBe(fragmentBefore);
    expect(imageAfter.style.clipPath).toBe(updatedClipPath);
  });

  it('rebuilds drawing image fragment when only clipPath changes via setData', () => {
    const initialClipPath = 'inset(10% 10% 10% 10%)';
    const updatedClipPath = 'inset(20% 0% 20% 0%)';

    const geometry = { width: 120, height: 90, rotation: 0, flipH: false, flipV: false };

    const drawingBlock: FlowBlock = {
      kind: 'drawing',
      id: 'drawing-image-block',
      drawingKind: 'image',
      src: DATA_URL,
      width: 120,
      height: 90,
      attrs: { clipPath: initialClipPath },
    };

    const drawingMeasure: Measure = {
      kind: 'drawing',
      drawingKind: 'image',
      width: 120,
      height: 90,
      scale: 1,
      naturalWidth: 120,
      naturalHeight: 90,
      geometry,
    };

    const drawingLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: [
        {
          number: 1,
          fragments: [
            {
              kind: 'drawing',
              blockId: 'drawing-image-block',
              drawingKind: 'image',
              x: 24,
              y: 24,
              width: 120,
              height: 90,
              geometry,
              scale: 1,
            },
          ],
        },
      ],
    };

    const painter = createDomPainter({ blocks: [drawingBlock], measures: [drawingMeasure] });
    painter.paint(drawingLayout, mount);

    const fragmentBefore = mount.querySelector('.superdoc-drawing-fragment') as HTMLElement;
    expect(fragmentBefore).toBeTruthy();
    const imageBefore = fragmentBefore.querySelector('.superdoc-drawing-image') as HTMLElement;
    expect(imageBefore.style.clipPath).toBe(initialClipPath);

    const updatedDrawingBlock: FlowBlock = {
      kind: 'drawing',
      id: 'drawing-image-block',
      drawingKind: 'image',
      src: DATA_URL,
      width: 120,
      height: 90,
      attrs: { clipPath: updatedClipPath },
    };

    painter.setData?.([updatedDrawingBlock], [drawingMeasure]);
    painter.paint(drawingLayout, mount);

    const fragmentAfter = mount.querySelector('.superdoc-drawing-fragment') as HTMLElement;
    const imageAfter = fragmentAfter.querySelector('.superdoc-drawing-image') as HTMLElement;
    expect(fragmentAfter).not.toBe(fragmentBefore);
    expect(imageAfter.style.clipPath).toBe(updatedClipPath);
  });
});
