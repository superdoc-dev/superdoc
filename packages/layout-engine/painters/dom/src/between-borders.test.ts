import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyParagraphBorderStyles,
  getFragmentParagraphBorders,
  computeBetweenBorderFlags,
  type BlockLookup,
} from './renderer.js';
import { createDomPainter } from './index.js';
import type {
  ParagraphBorders,
  ParagraphBorder,
  ParagraphBlock,
  ListBlock,
  Fragment,
  FlowBlock,
  Layout,
  Measure,
  ParaFragment,
  ListItemFragment,
  ImageFragment,
} from '@superdoc/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeParagraphBlock = (id: string, borders?: ParagraphBorders): ParagraphBlock => ({
  kind: 'paragraph',
  id,
  runs: [],
  attrs: borders ? { borders } : undefined,
});

const makeListBlock = (id: string, items: { itemId: string; borders?: ParagraphBorders }[]): ListBlock => ({
  kind: 'list',
  id,
  listType: 'bullet',
  items: items.map((item) => ({
    id: item.itemId,
    marker: { text: '•' },
    paragraph: {
      kind: 'paragraph',
      id: `${id}-p-${item.itemId}`,
      runs: [],
      attrs: item.borders ? { borders: item.borders } : undefined,
    },
  })),
});

const stubMeasure = { kind: 'paragraph' as const, lines: [], totalHeight: 0 };
const stubListMeasure = {
  kind: 'list' as const,
  items: [],
  totalHeight: 0,
};

const buildLookup = (entries: { block: ParagraphBlock | ListBlock; measure?: unknown }[]): BlockLookup => {
  const map: BlockLookup = new Map();
  for (const e of entries) {
    map.set(e.block.id, {
      block: e.block,
      measure: (e.measure ?? (e.block.kind === 'list' ? stubListMeasure : stubMeasure)) as never,
      version: '1',
    });
  }
  return map;
};

const paraFragment = (blockId: string, overrides?: Partial<ParaFragment>): ParaFragment => ({
  kind: 'para',
  blockId,
  fromLine: 0,
  toLine: 1,
  x: 0,
  y: 0,
  width: 100,
  ...overrides,
});

const listItemFragment = (
  blockId: string,
  itemId: string,
  overrides?: Partial<ListItemFragment>,
): ListItemFragment => ({
  kind: 'list-item',
  blockId,
  itemId,
  fromLine: 0,
  toLine: 1,
  x: 0,
  y: 0,
  width: 100,
  markerWidth: 20,
  ...overrides,
});

const imageFragment = (blockId: string): ImageFragment => ({
  kind: 'image',
  blockId,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
});

const MATCHING_BORDERS: ParagraphBorders = {
  top: { style: 'solid', width: 1, color: '#000' },
  bottom: { style: 'solid', width: 1, color: '#000' },
  between: { style: 'solid', width: 1, color: '#000' },
};

// ---------------------------------------------------------------------------
// applyParagraphBorderStyles
// ---------------------------------------------------------------------------

describe('applyParagraphBorderStyles — between borders', () => {
  const el = () => document.createElement('div');

  // --- basic activation ---
  it('does not apply between border when showBetweenBorder is false', () => {
    const e = el();
    const borders: ParagraphBorders = {
      top: { style: 'solid', width: 1, color: '#000' },
      between: { style: 'solid', width: 2, color: '#FF0000' },
    };
    applyParagraphBorderStyles(e, borders, false);
    expect(e.style.getPropertyValue('border-top-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('');
  });

  it('does not apply between border when showBetweenBorder is undefined', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'solid', width: 2, color: '#F00' } });
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('');
  });

  it('applies between border as bottom border when showBetweenBorder is true', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'dashed', width: 3, color: '#0F0' } }, true);
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('dashed');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('3px');
    expect(e.style.getPropertyValue('border-bottom-color')).toBe('#0F0');
  });

  // --- overwrite semantics ---
  it('overwrites normal bottom border when between is active', () => {
    const e = el();
    applyParagraphBorderStyles(
      e,
      { bottom: { style: 'solid', width: 1, color: '#000' }, between: { style: 'double', width: 4, color: '#F00' } },
      true,
    );
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('double');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('4px');
    expect(e.style.getPropertyValue('border-bottom-color')).toBe('#F00');
  });

  it('preserves normal bottom border when showBetweenBorder is false', () => {
    const e = el();
    applyParagraphBorderStyles(
      e,
      { bottom: { style: 'solid', width: 1, color: '#000' }, between: { style: 'double', width: 4, color: '#F00' } },
      false,
    );
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('1px');
    expect(e.style.getPropertyValue('border-bottom-color')).toBe('#000');
  });

  it('applies all four sides plus between when active', () => {
    const e = el();
    const borders: ParagraphBorders = {
      top: { style: 'solid', width: 1, color: '#000' },
      right: { style: 'solid', width: 1, color: '#000' },
      bottom: { style: 'solid', width: 1, color: '#000' },
      left: { style: 'solid', width: 1, color: '#000' },
      between: { style: 'dashed', width: 2, color: '#F00' },
    };
    applyParagraphBorderStyles(e, borders, true);
    expect(e.style.getPropertyValue('border-top-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-right-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-left-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('dashed');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('2px');
  });

  // --- partial / degenerate border specs ---
  it('handles between border with none style', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'none', width: 0, color: '#000' } }, true);
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('none');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('0px');
  });

  it('defaults width to 1px when between border has no width', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'solid', color: '#F00' } }, true);
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('1px');
  });

  it('defaults color to #000 when between border has no color', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'solid', width: 2 } }, true);
    expect(e.style.getPropertyValue('border-bottom-color')).toBe('#000');
  });

  it('defaults style to solid when between border has no style', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { width: 2, color: '#F00' } }, true);
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('solid');
  });

  it('handles between border with only width', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { width: 5 } }, true);
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('solid');
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('5px');
    expect(e.style.getPropertyValue('border-bottom-color')).toBe('#000');
  });

  it('clamps negative width to 0px', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'solid', width: -3 } }, true);
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('0px');
  });

  it('handles width=0 (renders as zero-width border)', () => {
    const e = el();
    applyParagraphBorderStyles(e, { between: { style: 'solid', width: 0 } }, true);
    expect(e.style.getPropertyValue('border-bottom-width')).toBe('0px');
  });

  it('no-ops when showBetweenBorder=true but borders.between is undefined', () => {
    const e = el();
    applyParagraphBorderStyles(e, { top: { style: 'solid', width: 1 } }, true);
    // Should not crash, and no bottom border should appear
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('');
  });

  it('no-ops when borders is undefined', () => {
    const e = el();
    applyParagraphBorderStyles(e, undefined, true);
    expect(e.style.getPropertyValue('border-bottom-style')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getFragmentParagraphBorders
// ---------------------------------------------------------------------------

describe('getFragmentParagraphBorders', () => {
  it('returns borders from a paragraph block', () => {
    const borders: ParagraphBorders = { top: { style: 'solid', width: 1 } };
    const block = makeParagraphBlock('b1', borders);
    const lookup = buildLookup([{ block }]);
    expect(getFragmentParagraphBorders(paraFragment('b1'), lookup)).toEqual(borders);
  });

  it('returns undefined for paragraph block without borders', () => {
    const block = makeParagraphBlock('b1');
    const lookup = buildLookup([{ block }]);
    expect(getFragmentParagraphBorders(paraFragment('b1'), lookup)).toBeUndefined();
  });

  it('returns borders from a list-item block', () => {
    const borders: ParagraphBorders = { between: { style: 'solid', width: 1 } };
    const block = makeListBlock('l1', [{ itemId: 'i1', borders }]);
    const lookup = buildLookup([{ block }]);
    expect(getFragmentParagraphBorders(listItemFragment('l1', 'i1'), lookup)).toEqual(borders);
  });

  it('returns undefined when list item is not found', () => {
    const block = makeListBlock('l1', [{ itemId: 'i1' }]);
    const lookup = buildLookup([{ block }]);
    expect(getFragmentParagraphBorders(listItemFragment('l1', 'missing'), lookup)).toBeUndefined();
  });

  it('returns undefined when blockId is not in lookup', () => {
    const lookup = buildLookup([]);
    expect(getFragmentParagraphBorders(paraFragment('missing'), lookup)).toBeUndefined();
  });

  it('returns undefined for image fragment', () => {
    const block = makeParagraphBlock('b1', { top: { style: 'solid', width: 1 } });
    const lookup = buildLookup([{ block }]);
    expect(getFragmentParagraphBorders(imageFragment('b1'), lookup)).toBeUndefined();
  });

  it('returns undefined for kind/block mismatch (para fragment with list block)', () => {
    const block = makeListBlock('l1', [{ itemId: 'i1' }]);
    const lookup = buildLookup([{ block }]);
    // para fragment referencing a list block
    expect(getFragmentParagraphBorders(paraFragment('l1'), lookup)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeBetweenBorderFlags
// ---------------------------------------------------------------------------

describe('computeBetweenBorderFlags', () => {
  // --- basic matching ---
  it('flags index when two adjacent paragraphs have matching between borders', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.has(0)).toBe(true);
    expect(flags.size).toBe(1);
  });

  it('does not flag when between border is not defined', () => {
    const noBetween: ParagraphBorders = { top: { style: 'solid', width: 1 } };
    const b1 = makeParagraphBlock('b1', noBetween);
    const b2 = makeParagraphBlock('b2', noBetween);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  it('does not flag when border definitions do not match', () => {
    const borders1: ParagraphBorders = {
      top: { style: 'solid', width: 1, color: '#000' },
      between: { style: 'solid', width: 1, color: '#000' },
    };
    const borders2: ParagraphBorders = {
      top: { style: 'dashed', width: 2, color: '#F00' },
      between: { style: 'dashed', width: 2, color: '#F00' },
    };
    const b1 = makeParagraphBlock('b1', borders1);
    const b2 = makeParagraphBlock('b2', borders2);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  // --- page-split handling ---
  it('does not flag when fragment continuesOnNext (page split)', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1', { continuesOnNext: true }), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  it('does not flag when next fragment continuesFromPrev (page split continuation)', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2', { continuesFromPrev: true })];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  // --- same-block deduplication ---
  it('does not flag same blockId para fragments (same paragraph split across lines)', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }]);
    const fragments: Fragment[] = [
      paraFragment('b1', { fromLine: 0, toLine: 3 }),
      paraFragment('b1', { fromLine: 3, toLine: 6 }),
    ];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  it('does not flag same blockId + same itemId list-item fragments', () => {
    const block = makeListBlock('l1', [{ itemId: 'i1', borders: MATCHING_BORDERS }]);
    const lookup = buildLookup([{ block }]);
    const fragments: Fragment[] = [
      listItemFragment('l1', 'i1', { fromLine: 0, toLine: 2 }),
      listItemFragment('l1', 'i1', { fromLine: 2, toLine: 4 }),
    ];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  it('flags different itemIds in same list block', () => {
    const block = makeListBlock('l1', [
      { itemId: 'i1', borders: MATCHING_BORDERS },
      { itemId: 'i2', borders: MATCHING_BORDERS },
    ]);
    const lookup = buildLookup([{ block }]);
    const fragments: Fragment[] = [listItemFragment('l1', 'i1'), listItemFragment('l1', 'i2')];

    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.has(0)).toBe(true);
  });

  // --- non-paragraph fragments ---
  it('skips image fragments', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const imgBlock: ParagraphBlock = { kind: 'paragraph', id: 'img1', runs: [] };
    const lookup = buildLookup([{ block: b1 }, { block: imgBlock }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), imageFragment('img1'), paraFragment('b2')];

    // Index 0 can't pair with index 1 (image), index 1 is image (skip)
    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.has(0)).toBe(false);
    // Index 1 is image, skipped — but index 1→2 is image→para, image is skipped
    expect(flags.size).toBe(0);
  });

  // --- mixed para + list-item ---
  it('flags para followed by list-item with matching borders', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const block = makeListBlock('l1', [{ itemId: 'i1', borders: MATCHING_BORDERS }]);
    const lookup = buildLookup([{ block: b1 }, { block }]);
    const fragments: Fragment[] = [paraFragment('b1'), listItemFragment('l1', 'i1')];

    expect(computeBetweenBorderFlags(fragments, lookup).has(0)).toBe(true);
  });

  it('flags list-item followed by para with matching borders', () => {
    const block = makeListBlock('l1', [{ itemId: 'i1', borders: MATCHING_BORDERS }]);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block }, { block: b2 }]);
    const fragments: Fragment[] = [listItemFragment('l1', 'i1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).has(0)).toBe(true);
  });

  // --- multiple consecutive ---
  it('flags all boundaries in a chain of three matching paragraphs', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const b3 = makeParagraphBlock('b3', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }, { block: b3 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2'), paraFragment('b3')];

    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.has(0)).toBe(true);
    expect(flags.has(1)).toBe(true);
    expect(flags.size).toBe(2);
  });

  it('breaks chain when middle paragraph has different borders', () => {
    const different: ParagraphBorders = {
      top: { style: 'dashed', width: 3, color: '#F00' },
      between: { style: 'dashed', width: 3, color: '#F00' },
    };
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const b2 = makeParagraphBlock('b2', different);
    const b3 = makeParagraphBlock('b3', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }, { block: b3 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2'), paraFragment('b3')];

    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.size).toBe(0);
  });

  // --- asymmetric between definition ---
  it('does not flag when only first fragment has between border', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const noB: ParagraphBorders = { top: { style: 'solid', width: 1, color: '#000' } };
    const b2 = makeParagraphBlock('b2', noB);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  it('does not flag when only second fragment has between border', () => {
    const noB: ParagraphBorders = { top: { style: 'solid', width: 1, color: '#000' } };
    const b1 = makeParagraphBlock('b1', noB);
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  // --- edge: empty / single fragment ---
  it('returns empty set for empty fragment list', () => {
    const lookup = buildLookup([]);
    expect(computeBetweenBorderFlags([], lookup).size).toBe(0);
  });

  it('returns empty set for single fragment', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }]);
    expect(computeBetweenBorderFlags([paraFragment('b1')], lookup).size).toBe(0);
  });

  // --- edge: missing block in lookup ---
  it('handles missing blockId in lookup gracefully', () => {
    const b2 = makeParagraphBlock('b2', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b2 }]);
    // b1 is not in lookup
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  // --- edge: between borders match but other sides differ ---
  it('does not flag when between borders match but other sides differ (different group)', () => {
    const borders1: ParagraphBorders = {
      top: { style: 'solid', width: 1, color: '#000' },
      between: { style: 'solid', width: 1, color: '#000' },
    };
    const borders2: ParagraphBorders = {
      top: { style: 'solid', width: 2, color: '#F00' },
      between: { style: 'solid', width: 1, color: '#000' },
    };
    const b1 = makeParagraphBlock('b1', borders1);
    const b2 = makeParagraphBlock('b2', borders2);
    const lookup = buildLookup([{ block: b1 }, { block: b2 }]);
    const fragments: Fragment[] = [paraFragment('b1'), paraFragment('b2')];

    // Full border hash differs (top is different), so not same border group
    expect(computeBetweenBorderFlags(fragments, lookup).size).toBe(0);
  });

  // --- edge: last fragment on page ---
  it('last fragment on page is never flagged (no next to pair with)', () => {
    const b1 = makeParagraphBlock('b1', MATCHING_BORDERS);
    const lookup = buildLookup([{ block: b1 }]);
    const fragments: Fragment[] = [paraFragment('b1')];

    const flags = computeBetweenBorderFlags(fragments, lookup);
    expect(flags.has(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Incremental update — between-border cache invalidation
// ---------------------------------------------------------------------------

describe('DomPainter between-border incremental update', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  const makeMeasure = (): Measure => ({
    kind: 'paragraph',
    lines: [
      {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: 0,
        width: 100,
        ascent: 14,
        descent: 2,
        lineHeight: 16,
      },
    ],
    totalHeight: 16,
  });

  const layout: Layout = {
    pageSize: { w: 400, h: 500 },
    pages: [
      {
        number: 1,
        fragments: [
          { kind: 'para', blockId: 'b1', fromLine: 0, toLine: 1, x: 0, y: 0, width: 100 },
          { kind: 'para', blockId: 'b2', fromLine: 0, toLine: 1, x: 0, y: 16, width: 100 },
        ],
      },
    ],
  };

  it('rebuilds fragment when between-border flag switches on via setData', () => {
    // Initial: no between borders
    const b1: FlowBlock = { kind: 'paragraph', id: 'b1', runs: [] };
    const b2: FlowBlock = { kind: 'paragraph', id: 'b2', runs: [] };

    const painter = createDomPainter({ blocks: [b1, b2], measures: [makeMeasure(), makeMeasure()] });
    painter.paint(layout, mount);

    const page = mount.querySelector('[data-page-number="1"]') as HTMLElement;
    const fragsBefore = page.querySelectorAll('[data-block-id]');
    const frag1Before = fragsBefore[0] as HTMLElement;
    expect(frag1Before.dataset.betweenBorder).toBeUndefined();

    // Update: add matching between borders to both blocks
    const b1Updated: FlowBlock = {
      kind: 'paragraph',
      id: 'b1',
      runs: [],
      attrs: { borders: MATCHING_BORDERS },
    };
    const b2Updated: FlowBlock = {
      kind: 'paragraph',
      id: 'b2',
      runs: [],
      attrs: { borders: MATCHING_BORDERS },
    };

    painter.setData!([b1Updated, b2Updated], [makeMeasure(), makeMeasure()]);
    painter.paint(layout, mount);

    const fragsAfter = page.querySelectorAll('[data-block-id]');
    const frag1After = fragsAfter[0] as HTMLElement;
    // Fragment was rebuilt (different DOM node)
    expect(frag1After).not.toBe(frag1Before);
    // Between border is now active
    expect(frag1After.dataset.betweenBorder).toBe('true');
  });

  it('rebuilds fragment when between-border flag switches off via setData', () => {
    // Initial: with matching between borders
    const b1: FlowBlock = {
      kind: 'paragraph',
      id: 'b1',
      runs: [],
      attrs: { borders: MATCHING_BORDERS },
    };
    const b2: FlowBlock = {
      kind: 'paragraph',
      id: 'b2',
      runs: [],
      attrs: { borders: MATCHING_BORDERS },
    };

    const painter = createDomPainter({ blocks: [b1, b2], measures: [makeMeasure(), makeMeasure()] });
    painter.paint(layout, mount);

    const page = mount.querySelector('[data-page-number="1"]') as HTMLElement;
    const fragsBefore = page.querySelectorAll('[data-block-id]');
    const frag1Before = fragsBefore[0] as HTMLElement;
    expect(frag1Before.dataset.betweenBorder).toBe('true');

    // Update: remove borders from both blocks
    const b1Updated: FlowBlock = { kind: 'paragraph', id: 'b1', runs: [] };
    const b2Updated: FlowBlock = { kind: 'paragraph', id: 'b2', runs: [] };

    painter.setData!([b1Updated, b2Updated], [makeMeasure(), makeMeasure()]);
    painter.paint(layout, mount);

    const fragsAfter = page.querySelectorAll('[data-block-id]');
    const frag1After = fragsAfter[0] as HTMLElement;
    // Fragment was rebuilt (different DOM node)
    expect(frag1After).not.toBe(frag1Before);
    // Between border is no longer active
    expect(frag1After.dataset.betweenBorder).toBeUndefined();
  });
});
