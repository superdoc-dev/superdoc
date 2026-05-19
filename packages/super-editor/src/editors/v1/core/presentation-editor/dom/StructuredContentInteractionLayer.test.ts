import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StructuredContentInteractionLayer } from './StructuredContentInteractionLayer.js';

describe('StructuredContentInteractionLayer', () => {
  let container: HTMLElement;
  let layer: StructuredContentInteractionLayer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    layer = new StructuredContentInteractionLayer();
    layer.setContainer(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('marks only SDT title areas as draggable move sources', () => {
    container.innerHTML = `
      <div class="superdoc-structured-content-block" data-sdt-id="block-1" data-pm-start="10" data-pm-end="24" data-sdt-scope="block" data-lock-mode="unlocked">
        <div class="superdoc-structured-content__label">Block Title</div>
        <p>Body</p>
      </div>
      <span class="superdoc-structured-content-inline" data-sdt-id="inline-1" data-pm-start="30" data-pm-end="42" data-sdt-scope="inline" data-lock-mode="unlocked">
        <span class="superdoc-structured-content-inline__label">Inline Title</span>
        <span class="superdoc-structured-content__content">Value</span>
      </span>
    `;

    layer.apply(7);

    const blockLabel = container.querySelector('.superdoc-structured-content__label') as HTMLElement;
    const inlineLabel = container.querySelector('.superdoc-structured-content-inline__label') as HTMLElement;
    const body = container.querySelector('p') as HTMLElement;

    expect(blockLabel.draggable).toBe(true);
    expect(blockLabel.dataset.dragSourceKind).toBe('structuredContent');
    expect(blockLabel.dataset.sdtId).toBe('block-1');
    expect(blockLabel.dataset.sdtScope).toBe('block');
    expect(blockLabel.dataset.lockMode).toBe('unlocked');

    expect(inlineLabel.draggable).toBe(true);
    expect(inlineLabel.dataset.dragSourceKind).toBe('structuredContent');
    expect(inlineLabel.dataset.sdtId).toBe('inline-1');
    expect(inlineLabel.dataset.sdtScope).toBe('inline');

    expect(body.hasAttribute('draggable')).toBe(false);
  });

  it('does not mark locked SDTs as draggable', () => {
    container.innerHTML = `
      <div class="superdoc-structured-content-block" data-sdt-id="locked-block" data-pm-start="10" data-pm-end="24" data-sdt-scope="block" data-lock-mode="sdtLocked">
        <div class="superdoc-structured-content__label">Locked block</div>
        <p>Body</p>
      </div>
      <span class="superdoc-structured-content-inline" data-sdt-id="locked-inline" data-pm-start="30" data-pm-end="42" data-sdt-scope="inline" data-lock-mode="contentLocked">
        <span class="superdoc-structured-content-inline__label">Locked inline</span>
        <span>Value</span>
      </span>
    `;

    layer.apply(11);

    const blockLabel = container.querySelector('.superdoc-structured-content__label') as HTMLElement;
    const inlineLabel = container.querySelector('.superdoc-structured-content-inline__label') as HTMLElement;

    expect(blockLabel.draggable).toBe(false);
    expect(blockLabel.dataset.dragSourceKind).toBeUndefined();
    expect(inlineLabel.draggable).toBe(false);
    expect(inlineLabel.dataset.dragSourceKind).toBeUndefined();
  });

  it('marks block SDT labels draggable when the container is a table fragment with a PM range', () => {
    container.innerHTML = `
      <div class="superdoc-structured-content-block superdoc-table-fragment" data-sdt-id="table-block-1" data-pm-start="12" data-pm-end="34" data-sdt-scope="block" data-lock-mode="unlocked">
        <div class="superdoc-structured-content__label">Table block</div>
        <table><tbody><tr><td>cell</td></tr></tbody></table>
      </div>
    `;

    layer.apply(13);

    const label = container.querySelector('.superdoc-structured-content__label') as HTMLElement;
    expect(label.draggable).toBe(true);
    expect(label.dataset.dragSourceKind).toBe('structuredContent');
    expect(label.dataset.sdtId).toBe('table-block-1');
    expect(label.dataset.pmStart).toBe('12');
    expect(label.dataset.pmEnd).toBe('34');
  });

  it('clear removes SDT drag affordances', () => {
    container.innerHTML = `
      <div class="superdoc-structured-content-block" data-sdt-id="block-1" data-pm-start="10" data-pm-end="24" data-sdt-scope="block" data-lock-mode="unlocked">
        <div class="superdoc-structured-content__label">Block Title</div>
      </div>
    `;

    layer.apply(3);
    const label = container.querySelector('.superdoc-structured-content__label') as HTMLElement;
    expect(label.draggable).toBe(true);

    layer.clear();

    expect(label.hasAttribute('draggable')).toBe(false);
    expect(label.dataset.dragSourceKind).toBeUndefined();
    expect(label.dataset.sdtId).toBeUndefined();
    expect(label.dataset.pmStart).toBeUndefined();
    expect(label.dataset.pmEnd).toBeUndefined();
    expect(label.dataset.sdtScope).toBeUndefined();
    expect(label.dataset.lockMode).toBeUndefined();
  });
});
