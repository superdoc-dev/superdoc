import { describe, expect, it } from 'vitest';
import {
  buildExistingImageDragPayload,
  buildInternalObjectDragPayload,
  buildStructuredContentDragPayload,
  INTERNAL_OBJECT_MIME_TYPE,
  parseInternalObjectDragPayload,
} from './internal-drag-payloads.js';

describe('internal-drag-payloads', () => {
  it('builds structured content payloads from visible label elements', () => {
    const label = document.createElement('span');
    label.dataset.dragSourceKind = 'structuredContent';
    label.dataset.sdtId = 'sdt-1';
    label.dataset.pmStart = '10';
    label.dataset.pmEnd = '20';
    label.dataset.nodeType = 'structuredContentBlock';
    label.dataset.displayLabel = 'Customer Name';
    label.dataset.lockMode = 'unlocked';

    expect(buildStructuredContentDragPayload(label)).toEqual({
      kind: 'structuredContent',
      nodeType: 'structuredContentBlock',
      sdtId: 'sdt-1',
      label: 'Customer Name',
      sourceStart: 10,
      sourceEnd: 20,
      lockMode: 'unlocked',
    });
    expect(buildInternalObjectDragPayload(label)).toEqual({
      kind: 'structuredContent',
      nodeType: 'structuredContentBlock',
      sdtId: 'sdt-1',
      label: 'Customer Name',
      sourceStart: 10,
      sourceEnd: 20,
      lockMode: 'unlocked',
    });
  });

  it('builds image payloads from rendered image roots', () => {
    const image = document.createElement('div');
    image.className = 'superdoc-image-fragment';
    image.dataset.dragSourceKind = 'existingImage';
    image.dataset.imageKind = 'block';
    image.dataset.nodeType = 'image';
    image.dataset.pmStart = '40';
    image.dataset.pmEnd = '46';
    image.dataset.displayLabel = 'Receipt image';
    image.setAttribute('data-block-id', 'image-1');

    expect(buildExistingImageDragPayload(image)).toEqual({
      kind: 'existingImage',
      imageKind: 'block',
      nodeType: 'image',
      sourceStart: 40,
      sourceEnd: 46,
      blockId: 'image-1',
      label: 'Receipt image',
    });
    expect(buildInternalObjectDragPayload(image)).toEqual({
      kind: 'existingImage',
      imageKind: 'block',
      nodeType: 'image',
      sourceStart: 40,
      sourceEnd: 46,
      blockId: 'image-1',
      label: 'Receipt image',
    });
  });

  it('ignores invalid source elements', () => {
    const element = document.createElement('div');
    element.dataset.dragSourceKind = 'structuredContent';
    expect(buildInternalObjectDragPayload(element)).toBeNull();
  });

  it('parses internal object payloads from data transfer', () => {
    const event = new MouseEvent('dragover') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        types: [INTERNAL_OBJECT_MIME_TYPE],
        getData: (mimeType: string) =>
          mimeType === INTERNAL_OBJECT_MIME_TYPE
            ? JSON.stringify({
                kind: 'structuredContent',
                nodeType: 'structuredContentBlock',
                sdtId: 'sdt-1',
                label: 'Customer Name',
                sourceStart: 10,
                sourceEnd: 20,
                lockMode: 'unlocked',
              })
            : '',
      },
    });

    expect(parseInternalObjectDragPayload(event)).toEqual({
      kind: 'structuredContent',
      nodeType: 'structuredContentBlock',
      sdtId: 'sdt-1',
      label: 'Customer Name',
      sourceStart: 10,
      sourceEnd: 20,
      lockMode: 'unlocked',
    });
  });
});
