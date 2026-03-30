import { afterEach, describe, expect, it } from 'vitest';
import type { PaintSnapshot } from '@superdoc/painter-dom';
import { PresentationPaintIndex } from './PresentationPaintIndex.js';

function createConnectedElement(className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  document.body.appendChild(element);
  return element;
}

function createSnapshot(): PaintSnapshot {
  const annotation = createConnectedElement('annotation');
  const blockSdtA = createConnectedElement('superdoc-structured-content-block');
  const blockSdtB = createConnectedElement('superdoc-structured-content-block');
  const inlineSdt = createConnectedElement('superdoc-structured-content-inline');
  const inlineImageWrapper = createConnectedElement('superdoc-inline-image-clip-wrapper');
  const inlineImage = createConnectedElement('superdoc-inline-image');
  const fragmentImage = createConnectedElement('superdoc-image-fragment');

  return {
    formatVersion: 1,
    pageCount: 1,
    lineCount: 0,
    markerCount: 0,
    tabCount: 0,
    pages: [],
    entities: {
      annotations: [
        {
          element: annotation,
          pageIndex: 0,
          pmStart: 12,
          pmEnd: 13,
          type: 'html',
          fieldId: 'field-1',
        },
      ],
      structuredContentBlocks: [
        {
          element: blockSdtA,
          pageIndex: 0,
          sdtId: 'block-sdt-1',
        },
        {
          element: blockSdtB,
          pageIndex: 1,
          sdtId: 'block-sdt-1',
        },
      ],
      structuredContentInlines: [
        {
          element: inlineSdt,
          pageIndex: 0,
          sdtId: 'inline-sdt-1',
        },
      ],
      images: [
        {
          element: inlineImageWrapper,
          pageIndex: 0,
          kind: 'inline',
          pmStart: 25,
          pmEnd: 26,
        },
        {
          element: inlineImage,
          pageIndex: 0,
          kind: 'inline',
          pmStart: 25,
          pmEnd: 26,
        },
        {
          element: fragmentImage,
          pageIndex: 0,
          kind: 'fragment',
          pmStart: 40,
          pmEnd: 41,
          blockId: 'image-block-1',
        },
      ],
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PresentationPaintIndex', () => {
  it('indexes annotations, structured content, and images from the latest snapshot', () => {
    const index = new PresentationPaintIndex();
    const snapshot = createSnapshot();

    index.update(snapshot);

    expect(index.snapshot).toBe(snapshot);
    expect(index.getAnnotationElementByPmStart(12)).toBe(snapshot.entities.annotations[0].element);
    expect(index.getAnnotationEntitiesByType('html')).toEqual([snapshot.entities.annotations[0]]);
    expect(index.getStructuredContentBlockElementsById('block-sdt-1')).toEqual([
      snapshot.entities.structuredContentBlocks[0].element,
      snapshot.entities.structuredContentBlocks[1].element,
    ]);
    expect(index.getStructuredContentInlineElementsById('inline-sdt-1')).toEqual([
      snapshot.entities.structuredContentInlines[0].element,
    ]);
    expect(index.getInlineImageElementByPmStart(25)).toBe(snapshot.entities.images[0].element);
    expect(index.getImageFragmentElementByPmStart(40)).toBe(snapshot.entities.images[2].element);
  });

  it('drops disconnected entities when rebuilding the index', () => {
    const index = new PresentationPaintIndex();
    const snapshot = createSnapshot();
    const disconnected = snapshot.entities.annotations[0].element;

    disconnected.remove();
    index.update(snapshot);

    expect(index.getAnnotationElementByPmStart(12)).toBeNull();
    expect(index.getAnnotationEntitiesByType('html')).toEqual([]);
  });

  it('clears all lookups on reset', () => {
    const index = new PresentationPaintIndex();

    index.update(createSnapshot());
    index.reset();

    expect(index.snapshot).toBeNull();
    expect(index.getStructuredContentBlockElementsById('block-sdt-1')).toEqual([]);
    expect(index.getInlineImageElementByPmStart(25)).toBeNull();
  });
});
