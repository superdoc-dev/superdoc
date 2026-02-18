/**
 * Tests for image clip-path helpers: resolveClipPath and applyImageClipPath.
 * These are used when rendering cropped images (a:srcRect / inset clip-path).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveClipPath, applyImageClipPath } from './image-clip-path.js';

describe('resolveClipPath', () => {
  it('returns trimmed string for non-empty string value', () => {
    expect(resolveClipPath('inset(10% 20% 30% 40%)')).toBe('inset(10% 20% 30% 40%)');
    expect(resolveClipPath('  inset(0% 0% 0% 0%)  ')).toBe('inset(0% 0% 0% 0%)');
  });

  it('returns undefined for empty or whitespace-only string', () => {
    expect(resolveClipPath('')).toBeUndefined();
    expect(resolveClipPath('   ')).toBeUndefined();
  });

  it('returns undefined for non-string values', () => {
    expect(resolveClipPath(null)).toBeUndefined();
    expect(resolveClipPath(undefined)).toBeUndefined();
    expect(resolveClipPath(123)).toBeUndefined();
    expect(resolveClipPath({})).toBeUndefined();
  });
});

describe('applyImageClipPath', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('applies clip-path and transform for valid inset() value', () => {
    applyImageClipPath(el, 'inset(10% 20% 30% 40%)');
    expect(el.style.clipPath).toBe('inset(10% 20% 30% 40%)');
    expect(el.style.transformOrigin).toBe('0 0');
    expect(el.style.transform).toMatch(/translate\([-\d.]+%,\s*[-\d.]+%\)\s*scale\([-\d.]+,\s*[-\d.]+\)/);
  });

  it('applies only clip-path when value is not inset() (no scale)', () => {
    applyImageClipPath(el, 'circle(50%)');
    expect(el.style.clipPath).toBe('circle(50%)');
    expect(el.style.transformOrigin).toBe('');
    expect(el.style.transform).toBe('');
  });

  it('does nothing for empty or invalid value', () => {
    applyImageClipPath(el, '');
    expect(el.style.clipPath).toBe('');
    applyImageClipPath(el, null as unknown);
    expect(el.style.clipPath).toBe('');
  });

  it('cropped portion math: full inset 0,0,0,0 gives identity transform', () => {
    applyImageClipPath(el, 'inset(0% 0% 0% 0%)');
    expect(el.style.transform).toBe('translate(0%, 0%) scale(1, 1)');
  });

  it('sets overflow:hidden on clipContainer when clipPath resolves', () => {
    const container = document.createElement('div');
    applyImageClipPath(el, 'inset(10% 20% 30% 40%)', { clipContainer: container });
    expect(container.style.overflow).toBe('hidden');
    expect(el.style.clipPath).toBe('inset(10% 20% 30% 40%)');
  });

  it('does not set overflow when clipPath is empty', () => {
    const container = document.createElement('div');
    applyImageClipPath(el, '', { clipContainer: container });
    expect(container.style.overflow).toBe('');
  });

  it('does not set overflow when clipContainer is not provided', () => {
    applyImageClipPath(el, 'inset(10% 20% 30% 40%)');
    // No error thrown, only el is affected
    expect(el.style.clipPath).toBe('inset(10% 20% 30% 40%)');
  });
});
