import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { ImageInteractionLayer } from './ImageInteractionLayer.js';

describe('ImageInteractionLayer', () => {
  let container: HTMLElement;
  let layer: ImageInteractionLayer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    layer = new ImageInteractionLayer();
    layer.setContainer(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('marks rendered image roots as draggable move sources', () => {
    container.innerHTML = `
      <div
        class="superdoc-image-fragment"
        data-pm-start="10"
        data-pm-end="16"
        data-block-id="image-block"
        data-image-metadata='{"width":100}'
      >
        <img alt="Block image" />
      </div>
      <span class="superdoc-inline-image-clip-wrapper" data-pm-start="20" data-pm-end="24">
        <img class="superdoc-inline-image" data-image-metadata='{"width":50}' alt="Inline image" />
      </span>
      <img class="superdoc-inline-image" data-pm-start="30" data-pm-end="34" data-image-metadata='{"width":60}' alt="Loose inline image" />
    `;

    layer.apply(5);

    const block = container.querySelector(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}`) as HTMLElement;
    const wrapper = container.querySelector(`.${DOM_CLASS_NAMES.INLINE_IMAGE_CLIP_WRAPPER}`) as HTMLElement;
    const loose = container.querySelector('img.superdoc-inline-image[data-pm-start="30"]') as HTMLElement;

    expect(block.draggable).toBe(true);
    expect(block.dataset.dragSourceKind).toBe('existingImage');
    expect(block.dataset.imageKind).toBe('block');
    expect(block.dataset.displayLabel).toBe('Block image');
    expect(block.getAttribute('data-block-id')).toBe('image-block');

    expect(wrapper.draggable).toBe(true);
    expect(wrapper.dataset.dragSourceKind).toBe('existingImage');
    expect(wrapper.dataset.imageKind).toBe('inline');
    expect(wrapper.dataset.displayLabel).toBe('Inline image');

    expect(loose.draggable).toBe(true);
    expect(loose.dataset.imageKind).toBe('inline');
    expect(loose.dataset.displayLabel).toBe('Loose inline image');
  });

  it('marks block image fragments when metadata is on the fragment root', () => {
    container.innerHTML = `
      <div
        class="superdoc-image-fragment"
        data-pm-start="10"
        data-pm-end="16"
        data-image-metadata='{"width":100}'
      >
        <img alt="Block image" />
      </div>
    `;

    layer.apply(3);

    const block = container.querySelector(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}`) as HTMLElement;
    expect(block.draggable).toBe(true);
    expect(block.dataset.dragSourceKind).toBe('existingImage');
    expect(block.dataset.imageKind).toBe('block');
    expect(block.dataset.displayLabel).toBe('Block image');
  });

  it('skips elements without PM position metadata', () => {
    container.innerHTML = `
      <div class="superdoc-image-fragment">
        <img data-image-metadata='{"width":100}' alt="Missing position" />
      </div>
    `;

    layer.apply(2);

    const block = container.querySelector(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}`) as HTMLElement;
    expect(block.hasAttribute('draggable')).toBe(false);
    expect(block.dataset.dragSourceKind).toBeUndefined();
  });

  it('clear removes image drag affordances', () => {
    container.innerHTML = `
      <div class="superdoc-image-fragment" data-pm-start="10" data-pm-end="16" data-block-id="image-block">
        <img data-image-metadata='{"width":100}' alt="Block image" />
      </div>
    `;

    layer.apply(1);
    const block = container.querySelector(`.${DOM_CLASS_NAMES.IMAGE_FRAGMENT}`) as HTMLElement;
    expect(block.draggable).toBe(true);

    layer.clear();

    expect(block.hasAttribute('draggable')).toBe(false);
    expect(block.dataset.dragSourceKind).toBeUndefined();
    expect(block.dataset.imageKind).toBeUndefined();
    expect(block.dataset.displayLabel).toBeUndefined();
  });
});
