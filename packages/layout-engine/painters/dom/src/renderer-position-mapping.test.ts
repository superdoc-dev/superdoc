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
  it.each(['footnote-1-abc', 'endnote-1-abc', '__sd_semantic_footnote-1-abc', '__sd_semantic_endnote-1-abc'])(
    'does not remap %s fragments with body transaction mappings',
    (blockId) => {
      const painter = new DomPainter();
      const { fragment, span } = makeFragment(blockId, 2, 30);

      (painter as any).updatePositionAttributes(fragment, shiftByTwo);

      expect(fragment.dataset.pmStart).toBe('2');
      expect(fragment.dataset.pmEnd).toBe('30');
      expect(span.dataset.pmStart).toBe('2');
      expect(span.dataset.pmEnd).toBe('30');
    },
  );

  it.each([
    ['footnote-1-abc', 'false'],
    ['endnote-1-abc', null],
    ['__sd_semantic_footnote-1-abc', null],
    ['__sd_semantic_endnote-1-abc', null],
  ] as const)('preserves painter read-only behavior for %s', (blockId, expected) => {
    const painter = new DomPainter();
    const fragment = {
      kind: 'image',
      blockId,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
    };
    const el = document.createElement('div');

    (painter as any).applyFragmentFrame(el, fragment);

    expect(el.getAttribute('contenteditable')).toBe(expected);
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
