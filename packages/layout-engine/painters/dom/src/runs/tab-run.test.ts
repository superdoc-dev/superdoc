import { describe, it, expect } from 'vitest';
import type { Line, TabRun } from '@superdoc/contracts';
import { renderInlineTabRun, renderPositionedTabRun } from './tab-run.js';

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
  it('draws the inline tab underline with baseline-aligned text-decoration (matches text)', () => {
    const el = renderInlineTabRun(underlinedTab(), LINE, document, 0);

    // Same mechanism as adjacent text: text-decoration on a baseline-aligned box, so the
    // browser places the underline on the same baseline and at the same weight (not a
    // separate border guessing the position).
    expect(el.style.textDecorationLine).toBe('underline');
    expect(el.style.borderBottom).toBe('');
    expect(el.style.verticalAlign).toBe('baseline');
    // Filler whitespace overfills the tab so the (horizontally clipped) underline spans it.
    expect(el.textContent.length).toBeGreaterThan(0);
    expect(el.textContent.trim()).toBe('');
  });

  it('matches the tab underline weight to the text underline (shared font-scaled thickness)', () => {
    const el = renderInlineTabRun(underlinedTab(48), LINE, document, 0);
    // 48 / 14 rounds to 3px — the same value applyRunStyles sets on text-decoration-thickness.
    expect(el.style.textDecorationThickness).toBe('3px');
  });

  it('anchors the positioned tab underline to the baseline region, not the line-box bottom', () => {
    const { element } = renderPositionedTabRun(underlinedTab(), LINE, document, 0, 0, 0);

    expect(element.style.borderBottom).toContain('solid');
    expect(element.style.visibility).not.toBe('hidden');
    const offset = parseFloat(element.style.height);
    expect(offset).toBeGreaterThanOrEqual(LINE.ascent);
    expect(offset).toBeLessThan(LINE.lineHeight);
  });

  it('does not underline a plain (non-underlined) inline tab', () => {
    const el = renderInlineTabRun(plainTab(), LINE, document, 0);
    expect(el.style.textDecorationLine).toBe('');
    expect(el.style.borderBottom).toBe('');
  });

  it('keeps a plain positioned tab invisible with no border', () => {
    const { element } = renderPositionedTabRun(plainTab(), LINE, document, 0, 0, 0);
    expect(element.style.visibility).toBe('hidden');
    expect(element.style.borderBottom).toBe('');
  });
});
