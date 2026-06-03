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
