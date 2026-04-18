import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { FieldAnnotationInteractionLayer } from './FieldAnnotationInteractionLayer.js';

describe('FieldAnnotationInteractionLayer', () => {
  let container: HTMLElement;
  let layer: FieldAnnotationInteractionLayer;

  type AnnotationFixtureOptions = {
    pmStart: string;
    pmEnd?: string;
    type?: string;
    displayLabel?: string;
    renderedText?: string;
    contentKind?: 'text' | 'image';
  };

  function createAnnotation(opts: AnnotationFixtureOptions): HTMLElement {
    const ann = document.createElement('span');
    ann.classList.add(DOM_CLASS_NAMES.ANNOTATION);
    ann.dataset.pmStart = opts.pmStart;
    if (opts.pmEnd) {
      ann.dataset.pmEnd = opts.pmEnd;
    }
    ann.dataset.layoutEpoch = '1';
    if (opts.type) ann.dataset.type = opts.type;
    if (opts.displayLabel !== undefined) {
      ann.dataset.displayLabel = opts.displayLabel;
    }

    const content = document.createElement('span');
    content.classList.add(DOM_CLASS_NAMES.ANNOTATION_CONTENT);
    if (opts.contentKind === 'image') {
      const img = document.createElement('img');
      img.alt = opts.renderedText ?? '';
      content.appendChild(img);
    } else {
      content.textContent = opts.renderedText ?? 'Field Label';
    }
    ann.appendChild(content);

    container.appendChild(ann);
    return ann;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    layer = new FieldAnnotationInteractionLayer();
    layer.setContainer(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('applies draggable attribute to annotations', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    expect(ann.draggable).toBe(true);
    expect(ann.dataset.draggable).toBe('true');
  });

  it('derives display label from annotation-content textContent', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    expect(ann.dataset.displayLabel).toBe('Field Label');
  });

  it('preserves canonical display labels for non-text annotations', () => {
    const ann = createAnnotation({
      pmStart: '10',
      pmEnd: '15',
      type: 'image',
      displayLabel: 'Photo Field',
      contentKind: 'image',
    });

    layer.apply(1);

    expect(ann.dataset.displayLabel).toBe('Photo Field');
  });

  it('mirrors data-type as data-variant', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15', type: 'signature' });
    layer.apply(1);
    expect(ann.dataset.variant).toBe('signature');
  });

  it('appends caret-anchor span with correct pm positions', () => {
    createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    const anchor = container.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`) as HTMLElement;
    expect(anchor).not.toBeNull();
    expect(anchor.dataset.pmStart).toBe('15');
    expect(anchor.dataset.pmEnd).toBe('15');
    expect(anchor.textContent).toBe('\u200B');
  });

  it('skips already-upgraded elements on repeat apply for same epoch', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    // Modify display label to detect re-processing
    ann.dataset.displayLabel = 'Modified';
    layer.apply(1);
    // Should still be 'Modified' because apply() skipped it
    expect(ann.dataset.displayLabel).toBe('Modified');
  });

  it('re-processes elements when epoch changes', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    ann.dataset.displayLabel = 'Modified';
    layer.apply(2);
    // Should be re-derived from content
    expect(ann.dataset.displayLabel).toBe('Field Label');
  });

  it('does not duplicate caret anchor on repeat apply', () => {
    createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    layer.apply(2);
    const anchors = container.querySelectorAll(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`);
    expect(anchors.length).toBe(1);
  });

  it('clear() removes all editing affordances', () => {
    const ann = createAnnotation({ pmStart: '10', pmEnd: '15' });
    layer.apply(1);
    expect(ann.draggable).toBe(true);

    layer.clear();
    expect(ann.hasAttribute('draggable')).toBe(false);
    expect(ann.dataset.draggable).toBeUndefined();
    expect(ann.dataset.displayLabel).toBeUndefined();
    expect(ann.dataset.variant).toBeUndefined();
    expect(container.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`)).toBeNull();
  });

  it('handles null container gracefully', () => {
    layer.setContainer(null);
    expect(() => layer.apply(1)).not.toThrow();
    expect(() => layer.clear()).not.toThrow();
  });

  it('handles annotations without pmEnd (no caret anchor)', () => {
    const ann = createAnnotation({ pmStart: '10', renderedText: '' });

    layer.apply(1);
    expect(ann.draggable).toBe(true);
    expect(container.querySelector(`.${DOM_CLASS_NAMES.ANNOTATION_CARET_ANCHOR}`)).toBeNull();
  });
});
