import { afterEach, describe, expect, it, vi } from 'vitest';

import { isEmptySdtPlaceholder, isLineAnchoredCaretElement, resolveCaretLineBox } from './CaretLineAnchoring.js';

function createRect(top: number, height: number): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function paintInLine(className: string, lineRect = createRect(200, 18)): HTMLElement {
  const line = document.createElement('div');
  line.className = 'superdoc-line';
  vi.spyOn(line, 'getBoundingClientRect').mockReturnValue(lineRect);

  const el = document.createElement('span');
  el.className = className;
  line.appendChild(el);
  document.body.appendChild(line);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('isEmptySdtPlaceholder', () => {
  it.each([
    'superdoc-empty-sdt-placeholder',
    'superdoc-empty-inline-sdt-placeholder',
    'superdoc-empty-block-sdt-placeholder',
  ])('matches %s', (className) => {
    expect(isEmptySdtPlaceholder(paintInLine(className))).toBe(true);
  });

  it('does not match a tab', () => {
    expect(isEmptySdtPlaceholder(paintInLine('superdoc-tab'))).toBe(false);
  });
});

describe('isLineAnchoredCaretElement', () => {
  it('matches tabs and empty SDT placeholders', () => {
    expect(isLineAnchoredCaretElement(paintInLine('superdoc-tab'))).toBe(true);
    expect(isLineAnchoredCaretElement(paintInLine('superdoc-empty-inline-sdt-placeholder'))).toBe(true);
  });

  it('does not match elements whose own box is the caret box', () => {
    expect(isLineAnchoredCaretElement(paintInLine('superdoc-inline-image'))).toBe(false);
  });
});

describe('resolveCaretLineBox', () => {
  it('returns the enclosing line box for a tab', () => {
    expect(resolveCaretLineBox(paintInLine('superdoc-tab'))).toMatchObject({ top: 200, height: 18 });
  });

  it('returns null for elements that are not line-anchored', () => {
    expect(resolveCaretLineBox(paintInLine('superdoc-inline-image'))).toBeNull();
  });

  it('returns null when the tab has no enclosing line', () => {
    const orphan = document.createElement('span');
    orphan.className = 'superdoc-tab';
    document.body.appendChild(orphan);

    expect(resolveCaretLineBox(orphan)).toBeNull();
  });

  it('returns null for a degenerate line box so callers keep the element box', () => {
    expect(resolveCaretLineBox(paintInLine('superdoc-tab', createRect(200, 0)))).toBeNull();
  });
});
