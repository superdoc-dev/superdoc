import { describe, it, expect } from 'vitest';
import { buildImagePmSelector, buildInlineImagePmSelector } from './image-selectors.js';

describe('buildImagePmSelector', () => {
  it('returns a compound selector covering all three image class types', () => {
    const selector = buildImagePmSelector(42);
    expect(selector).toContain('.superdoc-image-fragment[data-pm-start="42"]');
    expect(selector).toContain('.superdoc-inline-image-clip-wrapper[data-pm-start="42"]');
    expect(selector).toContain('.superdoc-inline-image[data-pm-start="42"]');
  });

  it('includes value verbatim (callers handle escaping)', () => {
    const escaped = CSS.escape('a:b');
    const selector = buildImagePmSelector(escaped);
    expect(selector).toContain(`[data-pm-start="${escaped}"]`);
  });

  it('accepts string values', () => {
    const selector = buildImagePmSelector('100');
    expect(selector).toContain('[data-pm-start="100"]');
  });
});

describe('buildInlineImagePmSelector', () => {
  it('returns a compound selector for clip-wrapper and inline image only', () => {
    const selector = buildInlineImagePmSelector(7);
    expect(selector).toContain('.superdoc-inline-image-clip-wrapper[data-pm-start="7"]');
    expect(selector).toContain('.superdoc-inline-image[data-pm-start="7"]');
    expect(selector).not.toContain('superdoc-image-fragment');
  });
});
