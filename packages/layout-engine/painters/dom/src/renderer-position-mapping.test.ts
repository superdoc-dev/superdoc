import { describe, expect, it } from 'vitest';
import { DomPainter } from './renderer.js';

function makeFragment(blockId: string, pmStart: number, pmEnd: number) {
  const fragment = document.createElement('div');
  fragment.dataset.blockId = blockId;
  fragment.dataset.pmStart = String(pmStart);
  fragment.dataset.pmEnd = String(pmEnd);

  const span = document.createElement('span');
  span.dataset.pmStart = String(pmStart);
  span.dataset.pmEnd = String(pmEnd);
  fragment.appendChild(span);

  return { fragment, span };
}

const shiftByTwo = {
  map(pos: number) {
    return pos + 2;
  },
  maps: [{}],
};

describe('DomPainter.updatePositionAttributes', () => {
  it('does not remap footnote fragments with body transaction mappings', () => {
    const painter = new DomPainter();
    const { fragment, span } = makeFragment('footnote-1-abc', 2, 30);

    (painter as any).updatePositionAttributes(fragment, shiftByTwo);

    expect(fragment.dataset.pmStart).toBe('2');
    expect(fragment.dataset.pmEnd).toBe('30');
    expect(span.dataset.pmStart).toBe('2');
    expect(span.dataset.pmEnd).toBe('30');
  });

  it('still remaps body fragments when the mapping applies', () => {
    const painter = new DomPainter();
    const { fragment, span } = makeFragment('body-paragraph-1', 25, 30);

    (painter as any).updatePositionAttributes(fragment, shiftByTwo);

    expect(fragment.dataset.pmStart).toBe('27');
    expect(fragment.dataset.pmEnd).toBe('32');
    expect(span.dataset.pmStart).toBe('27');
    expect(span.dataset.pmEnd).toBe('32');
  });
});
