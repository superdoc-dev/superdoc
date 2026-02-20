import type { FlowBlock } from '@superdoc/contracts';
import { describe, expect, it } from 'vitest';

import { computeNextSectionPropsAtBreak } from './section-props';

const sectionBreak = (overrides: Partial<FlowBlock> & { id: string }): FlowBlock =>
  ({
    kind: 'sectionBreak',
    attrs: { source: 'sectPr' },
    ...overrides,
  }) as FlowBlock;

describe('computeNextSectionPropsAtBreak', () => {
  it('maps DOCX breaks to the next section properties (falling back to itself when last)', () => {
    const blocks: FlowBlock[] = [
      sectionBreak({ id: 'sb-0', columns: { count: 1, gap: 0 } }),
      { kind: 'paragraph', id: 'p-1', runs: [] } as FlowBlock,
      sectionBreak({ id: 'sb-2', columns: { count: 2, gap: 48 } }),
    ];

    const map = computeNextSectionPropsAtBreak(blocks);

    expect(map.get(0)?.columns).toEqual({ count: 2, gap: 48 });
    expect(map.get(2)?.columns).toEqual({ count: 2, gap: 48 });
  });

  it('captures full margin sets when mapping to the next section', () => {
    const blocks: FlowBlock[] = [
      sectionBreak({ id: 'sb-0', margins: { left: 10, right: 20 } }),
      { kind: 'paragraph', id: 'p-1', runs: [] } as FlowBlock,
      sectionBreak({
        id: 'sb-2',
        margins: { top: 40, right: 25, bottom: 50, left: 15, header: 12, footer: 18 },
      }),
    ];

    const map = computeNextSectionPropsAtBreak(blocks);

    expect(map.get(0)?.margins).toEqual({ top: 40, right: 25, bottom: 50, left: 15, header: 12, footer: 18 });
  });

  it('ignores section breaks that did not originate from DOCX sectPr', () => {
    const blocks: FlowBlock[] = [
      { kind: 'sectionBreak', id: 'runtime', attrs: {}, columns: { count: 3, gap: 24 } } as FlowBlock,
      sectionBreak({ id: 'sb-docx', columns: { count: 2, gap: 48 } }),
    ];

    const map = computeNextSectionPropsAtBreak(blocks);

    expect(map.has(0)).toBe(false);
    expect(map.get(1)?.columns).toEqual({ count: 2, gap: 48 });
  });

  it('clones values so later mutations do not leak into the source blocks', () => {
    const sourceColumns = { count: 2, gap: 48 };
    const blocks: FlowBlock[] = [sectionBreak({ id: 'sb-0', columns: sourceColumns })];

    const map = computeNextSectionPropsAtBreak(blocks);
    const snapshot = map.get(0);

    expect(snapshot?.columns).toEqual({ count: 2, gap: 48 });
    expect(snapshot?.columns).not.toBe(sourceColumns);
  });
});
