import { describe, it, expect } from 'vitest';
import type { Line, TabRun } from '@superdoc/contracts';
import {
  canPaintUnderlineAsBorder,
  canPaintUnderlineOverlay,
  renderInlineTabRun,
  renderPositionedTabRun,
  underlineBorderForRun,
} from './tab-run.js';

// A line with leading: lineHeight (24) exceeds ascent (12) + descent (4) by 8px.
// Adjacent text draws its `text-decoration` underline near the baseline, which
// sits at ascent + half-leading = 12 + 4 = 16px from the line-box top — well
// above the line-box bottom at 24px. SD-3330: a tab underline drawn at the
// line-box bottom lands ~8px below the text underline and the combined line
// looks broken. The tab underline must land in the baseline region instead.
const LINE: Line = {
  fromRun: 0,
  fromChar: 0,
  toRun: 0,
  toChar: 0,
  width: 200,
  ascent: 12,
  descent: 4,
  lineHeight: 24,
};

const underlinedTab = (fontSize?: number): TabRun =>
  ({
    kind: 'tab',
    text: '\t',
    width: 48,
    fontSize,
    underline: { style: 'single', color: '#000000' },
  }) as TabRun;

const plainTab = (): TabRun => ({ kind: 'tab', text: '\t', width: 48 });

describe('tab underline alignment (SD-3330)', () => {
  it('anchors the inline tab underline to the baseline region, not the line-box bottom', () => {
    const el = renderInlineTabRun(underlinedTab(), LINE, document, 0);

    // Border-bottom (not a selectable text-decoration filler) at the box bottom; the box
    // top is pinned to the line-box top and ends at the underline offset, so the border
    // lands near the baseline rather than the line-box bottom.
    expect(el.style.borderBottom).toContain('solid');
    expect(el.style.verticalAlign).toBe('top');
    const offset = parseFloat(el.style.height);
    expect(offset).toBeGreaterThanOrEqual(LINE.ascent);
    expect(offset).toBeLessThan(LINE.lineHeight);
  });

  it('matches the tab underline weight to the text underline (shared font-scaled thickness)', () => {
    const el = renderInlineTabRun(underlinedTab(48), LINE, document, 0);
    // 48 / 14 rounds to 3px — the same value applyRunStyles sets on text-decoration-thickness.
    expect(parseFloat(el.style.borderBottomWidth)).toBe(3);
  });

  it('anchors the positioned tab underline to the baseline region, not the line-box bottom', () => {
    const { element } = renderPositionedTabRun(underlinedTab(), LINE, document, 0, 0, 0);

    expect(element.style.borderBottom).toContain('solid');
    expect(element.style.visibility).not.toBe('hidden');
    const offset = parseFloat(element.style.height);
    expect(offset).toBeGreaterThanOrEqual(LINE.ascent);
    expect(offset).toBeLessThan(LINE.lineHeight);
  });

  it('does not draw a border on a plain (non-underlined) inline tab', () => {
    const el = renderInlineTabRun(plainTab(), LINE, document, 0);
    expect(el.style.borderBottom).toBe('');
  });

  it('keeps a plain positioned tab invisible with no border', () => {
    const { element } = renderPositionedTabRun(plainTab(), LINE, document, 0, 0, 0);
    expect(element.style.visibility).toBe('hidden');
    expect(element.style.borderBottom).toBe('');
  });
});

const withStyle = (style: string) => ({ underline: { style } });

// SD-3330: the line-level underline overlay is intentionally scoped to the styles a single CSS
// border-top reproduces. These guards stop a future change from quietly widening the allowlist
// (which would flatten a wavy/heavy style to solid inside a "continuous" line) or narrowing it.
describe('canPaintUnderlineOverlay - overlay scope', () => {
  it('accepts the styles a border-top reproduces', () => {
    for (const style of ['single', 'double', 'dotted', 'dashed']) {
      expect(canPaintUnderlineOverlay(withStyle(style))).toBe(true);
    }
  });

  it('defaults a missing style to single and accepts it', () => {
    expect(canPaintUnderlineOverlay({ underline: {} })).toBe(true);
  });

  it('rejects styles a border-top cannot draw, leaving them on the per-run path', () => {
    for (const style of [
      'words',
      'none',
      'wave',
      'thick',
      'dotDash',
      'dotDotDash',
      'dashLong',
      'dashLongHeavy',
      'wavyDouble',
    ]) {
      expect(canPaintUnderlineOverlay(withStyle(style))).toBe(false);
    }
  });

  it('rejects a run with no underline', () => {
    expect(canPaintUnderlineOverlay({ underline: undefined })).toBe(false);
    expect(canPaintUnderlineOverlay({})).toBe(false);
  });

  // wave/heavy still get a (degraded, solid-ish) border on the legacy per-run path - the overlay
  // simply does not own them. words/none paint no border on either path.
  it('keeps wave on the border path while excluding it from the overlay', () => {
    expect(canPaintUnderlineAsBorder(withStyle('wave'))).toBe(true);
    expect(canPaintUnderlineOverlay(withStyle('wave'))).toBe(false);
    expect(canPaintUnderlineAsBorder(withStyle('words'))).toBe(false);
    expect(canPaintUnderlineAsBorder(withStyle('none'))).toBe(false);
  });
});

describe('underlineBorderForRun - style and color', () => {
  it('paints no border for none/words', () => {
    expect(underlineBorderForRun(withStyle('none'))).toBeUndefined();
    expect(underlineBorderForRun(withStyle('words'))).toBeUndefined();
  });

  it('maps each overlay style to the matching border style', () => {
    expect(underlineBorderForRun(withStyle('single'))).toContain('solid');
    expect(underlineBorderForRun(withStyle('double'))).toContain('double');
    expect(underlineBorderForRun(withStyle('dotted'))).toContain('dotted');
    expect(underlineBorderForRun(withStyle('dashed'))).toContain('dashed');
  });

  it('uses the literal underline color without resolving theme tokens', () => {
    expect(underlineBorderForRun({ underline: { style: 'single', color: '#FF0000' } })).toContain('#FF0000');
  });
});
