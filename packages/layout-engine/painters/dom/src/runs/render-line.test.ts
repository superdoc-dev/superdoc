import { describe, expect, it } from 'vite-plus/test';
import type { Line, ParagraphBlock, Run, TextRun } from '@superdoc/contracts';
import { renderLine } from './render-line.js';
import type { RunRenderContext } from './types.js';

const makeRunContext = (overrides: Partial<RunRenderContext> = {}): RunRenderContext => ({
  doc: document,
  layoutEpoch: 0,
  showFormattingMarks: false,
  contentControlsChrome: 'default',
  resolvePhysical: (family) => family,
  pendingTooltips: new WeakMap<HTMLElement, string>(),
  getNextLinkId: () => 'link-1',
  applySdtDataset: () => {},
  buildImageHyperlinkAnchor: (child) => child,
  resolveTrackedChangesConfig: () => ({ mode: 'final', enabled: false }),
  applyTrackedChangeDecorations: () => {},
  resolveRunSdtId: () => null,
  createInlineSdtWrapper: () => document.createElement('span'),
  syncInlineSdtWrapperTypography: () => {},
  expandSdtWrapperPmRange: () => {},
  ...overrides,
});

describe('renderLine positioned tabs with vanished segments', () => {
  it('sizes an underlined positioned tab to the next visible aligned segment', () => {
    const hidden: TextRun = {
      kind: 'text',
      text: 'hidden',
      fontFamily: 'Arial',
      fontSize: 16,
      vanish: true,
    };
    const visible: TextRun = {
      kind: 'text',
      text: 'X',
      fontFamily: 'Arial',
      fontSize: 16,
    };
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'positioned-tab-vanish',
      attrs: {},
      runs: [
        {
          kind: 'tab',
          text: '\t',
          width: 48,
          fontSize: 16,
          underline: { style: 'single', color: '#000000' },
        } as Run,
        hidden,
        visible,
      ],
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 2,
      toChar: 1,
      width: 110,
      maxWidth: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 24,
      segments: [
        { runIndex: 1, fromChar: 0, toChar: hidden.text.length, width: 0 },
        { runIndex: 2, fromChar: 0, toChar: 1, width: 10, x: 100, precedingTabEndX: 100 },
      ],
    };

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });

    const tab = lineEl.querySelector('.superdoc-tab') as HTMLElement;
    const overlay = lineEl.querySelector('.superdoc-underline-overlay') as HTMLElement;
    const visibleRun = Array.from(lineEl.querySelectorAll('span')).find((span) => span.textContent === 'X') as
      | HTMLElement
      | undefined;

    expect(tab.style.left).toBe('0px');
    expect(tab.style.width).toBe('100px');
    expect(overlay.style.left).toBe('0px');
    expect(overlay.style.width).toBe('100px');
    expect(visibleRun?.style.left).toBe('100px');
  });

  it('renders a reviewable paragraph-mark deletion anchor even when layout omits its zero-width segment', () => {
    const hidden: TextRun = {
      kind: 'text',
      text: '\u200B',
      fontFamily: 'Arial',
      fontSize: 16,
      vanish: true,
      dataAttrs: { 'data-paragraph-mark-deletion-anchor': 'true' },
      trackedChange: {
        id: 'tc-delete-mark',
        kind: 'delete',
        type: 'structural',
        subtype: 'paragraph-mark-deletion',
        targetKind: 'paragraph-mark',
      },
    };
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'positioned-paragraph-mark-delete',
      attrs: {},
      runs: [{ kind: 'text', text: 'First paragraph', fontFamily: 'Arial', fontSize: 16 }, hidden],
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 1,
      toChar: 1,
      width: 110,
      maxWidth: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 24,
      segments: [{ runIndex: 0, fromChar: 0, toChar: 15, width: 110, x: 0 }],
    };

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext({
        showFormattingMarks: true,
        resolveTrackedChangesConfig: () => ({ enabled: true, mode: 'review' }),
        applyTrackedChangeDecorations: (el) => {
          el.classList.add('track-delete-dec', 'highlighted');
        },
      }),
    });

    const mark = lineEl.querySelector<HTMLElement>('.superdoc-tracked-paragraph-mark');
    expect(mark?.textContent).toBe('¶');
    expect(mark?.dataset.trackChangeId).toBe('tc-delete-mark');
    expect(mark?.dataset.trackChangeMarker).toBe('paragraph');
    expect(mark?.classList.contains('superdoc-tracked-paragraph-mark')).toBe(true);
    expect(mark?.style.left).toBe('110px');
  });

  it('uses measured segment positions for horizontally scaled LTR text', () => {
    const run: TextRun = {
      kind: 'text',
      text: 'February 2025',
      fontFamily: 'Arial',
      fontSize: 16,
      horizontalScale: 0.9,
    };
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'scaled-text',
      attrs: {},
      runs: [run],
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: run.text.length,
      width: 96,
      maxWidth: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 24,
      segments: [{ runIndex: 0, fromChar: 0, toChar: run.text.length, width: 96 }],
    };

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });
    const text = Array.from(lineEl.querySelectorAll<HTMLElement>('span')).find(
      (element) => element.textContent === run.text,
    );

    expect(text?.style.position).toBe('absolute');
    expect(text?.style.left).toBe('0px');
    expect(text?.style.transform).toBe('scaleX(0.9)');
  });

  it.each([
    { scale: 0.5, measuredWidth: 80 },
    { scale: 1.5, measuredWidth: 240 },
  ])('uses a $measuredWidth px inline advance for scaleX($scale) RTL text', ({ scale, measuredWidth }) => {
    const run: TextRun = {
      kind: 'text',
      text: 'שלוםשלום',
      fontFamily: 'Arial',
      fontSize: 40,
      horizontalScale: scale,
      bidi: { rtl: true },
      pmStart: 10,
      pmEnd: 18,
    };
    const followingRun: TextRun = {
      kind: 'text',
      text: 'NEXT',
      fontFamily: 'Arial',
      fontSize: 40,
      pmStart: 18,
      pmEnd: 22,
    };
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: `rtl-scaled-${scale}`,
      attrs: { directionContext: { inlineDirection: 'rtl', writingMode: 'horizontal-tb' } },
      runs: [run, followingRun],
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 1,
      toChar: followingRun.text.length,
      width: measuredWidth + 100,
      maxWidth: 600,
      ascent: 40,
      descent: 10,
      lineHeight: 50,
      segments: [
        { runIndex: 0, fromChar: 0, toChar: run.text.length, width: measuredWidth },
        { runIndex: 1, fromChar: 0, toChar: followingRun.text.length, width: 100 },
      ],
    };

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });
    const advance = lineEl.querySelector<HTMLElement>('.superdoc-scaled-inline-advance');
    const text = advance?.querySelector<HTMLElement>('.superdoc-text-run');

    expect(lineEl.dir).toBe('rtl');
    expect(advance?.style.width).toBe(`${measuredWidth}px`);
    expect(text?.style.position).toBe('');
    expect(text?.style.transform).toBe(`scaleX(${scale})`);
    expect(text?.style.transformOrigin).toBe('right center');
    expect(advance?.nextElementSibling?.textContent).toBe('NEXT');
  });
});

describe('renderLine inline boxes', () => {
  const makeInlineBoxLine = (explicitPositioning: boolean): { block: ParagraphBlock; line: Line } => {
    const text = 'beforeboxedafter';
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: explicitPositioning ? 'positioned-inline-box' : 'flow-inline-box',
      attrs: {},
      runs: [{ kind: 'text', text, fontFamily: 'Arial', fontSize: 16, pmStart: 20, pmEnd: 36 }],
    };
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: text.length,
      width: 134,
      maxWidth: 200,
      ascent: 12,
      descent: 4,
      lineHeight: 22,
      segments: [
        { runIndex: 0, fromChar: 0, toChar: 6, width: 48, ...(explicitPositioning ? { x: 0 } : {}) },
        { runIndex: 0, fromChar: 6, toChar: 11, width: 40 },
        { runIndex: 0, fromChar: 11, toChar: text.length, width: 40 },
      ],
      inlineBoxes: [
        {
          id: 'provider:box',
          from: 6,
          to: 11,
          x: 51,
          width: 46,
          top: 0,
          height: 22,
          startsRange: true,
          endsRange: true,
          style: {
            paddingInlineStart: 2,
            paddingInlineEnd: 2,
            paddingBlockStart: 1,
            paddingBlockEnd: 1,
            gapBefore: 3,
            gapAfter: 4,
            borderWidth: 1,
            borderColor: '#333333',
            borderStyle: 'solid',
            borderRadius: 4,
            backgroundColor: '#eeeeee',
          },
        },
      ],
    };
    return { block, line };
  };

  it.each([
    { branch: 'inline flow', explicitPositioning: false, expectedPosition: '' },
    { branch: 'explicit positioning', explicitPositioning: true, expectedPosition: 'absolute' },
  ])('paints resolved box slices in the $branch branch', ({ explicitPositioning, expectedPosition }) => {
    const { block, line } = makeInlineBoxLine(explicitPositioning);

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });
    const leaves = Array.from(lineEl.querySelectorAll<HTMLElement>('.superdoc-text-run'));
    const boxed = leaves.find((leaf) => leaf.textContent === 'boxed');

    expect(lineEl.textContent).toBe('beforeboxedafter');
    expect(leaves).toHaveLength(3);
    expect(boxed?.getAttribute('data-superdoc-inline-box-id')).toBe('provider:box');
    expect(boxed?.style.position).toBe(expectedPosition);
    expect(boxed?.style.paddingLeft).toBe('2px');
    expect(boxed?.style.paddingRight).toBe('2px');
    expect(boxed?.dataset.pmStart).toBe('26');
    expect(boxed?.dataset.pmEnd).toBe('31');
    expect(boxed?.getAttribute('data-superdoc-inline-box-from')).toBeNull();
    if (explicitPositioning) {
      const after = leaves.find((leaf) => leaf.textContent === 'after');
      expect(after?.style.left).toBe('101px');
    }
  });

  it('preserves atomic runs while painting the visible text range after them', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      id: 'tabbed-inline-box',
      attrs: {},
      runs: [
        { kind: 'tab', text: '\t', width: 40, fontSize: 16 },
        { kind: 'text', text: 'abcdefghij', fontFamily: 'Arial', fontSize: 16, pmStart: 20, pmEnd: 30 },
      ],
    };
    const { line } = makeInlineBoxLine(false);
    line.fromRun = 0;
    line.toRun = 1;
    line.toChar = 10;
    line.segments = [
      { runIndex: 1, fromChar: 0, toChar: 5, width: 40 },
      { runIndex: 1, fromChar: 5, toChar: 10, width: 40 },
    ];
    line.inlineBoxes = line.inlineBoxes?.map((box) => ({ ...box, from: 6, to: 11 }));

    const lineEl = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });

    expect(lineEl.querySelector('.superdoc-tab')).not.toBeNull();
    expect(lineEl.querySelector('[data-superdoc-inline-box-id]')?.textContent).toBe('fghij');
  });

  it('removes owned box styling on a canonical repaint after clear', () => {
    const { block, line } = makeInlineBoxLine(false);
    const painted = renderLine({
      block,
      line,
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });
    const cleared = renderLine({
      block,
      line: { ...line, inlineBoxes: undefined },
      context: { pageNumber: 1, totalPages: 1, section: 'body' },
      runContext: makeRunContext(),
    });

    expect(painted.querySelector('[data-superdoc-inline-box-id]')).not.toBeNull();
    expect(cleared.querySelector('[data-superdoc-inline-box-id]')).toBeNull();
    expect(cleared.textContent).toBe('beforeboxedafter');
  });
});
