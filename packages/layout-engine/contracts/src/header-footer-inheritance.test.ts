import { describe, expect, it } from 'vitest';
import {
  resolveInheritedHeaderFooterRef,
  resolveInheritedHeaderFooterRefWithType,
} from './header-footer-inheritance.js';

describe('header/footer inheritance', () => {
  it('uses legacy refs when section maps are empty', () => {
    const ref = resolveInheritedHeaderFooterRef({
      identifier: {
        headerIds: { default: 'legacy-default' },
        sectionHeaderIds: new Map(),
      },
      sectionIndex: 0,
      kind: 'header',
      variantType: 'default',
    });

    expect(ref).toBe('legacy-default');
  });

  it('returns null for section zero when no page, section, or legacy refs exist', () => {
    const ref = resolveInheritedHeaderFooterRef({
      identifier: { sectionHeaderIds: new Map() },
      sectionIndex: 0,
      kind: 'header',
      variantType: 'default',
    });

    expect(ref).toBeNull();
  });

  it('walks back past intermediate sections with no entry', () => {
    const ref = resolveInheritedHeaderFooterRef({
      identifier: {
        sectionHeaderIds: new Map([[0, { first: 'section-0-first' }]]),
      },
      sectionIndex: 3,
      kind: 'header',
      variantType: 'first',
    });

    expect(ref).toBe('section-0-first');
  });

  it('prefers page refs over section refs', () => {
    const resolved = resolveInheritedHeaderFooterRefWithType({
      identifier: {
        sectionFooterIds: new Map([[0, { default: 'section-default' }]]),
      },
      sectionIndex: 0,
      kind: 'footer',
      variantType: 'default',
      pageRefs: { default: 'page-default' },
    });

    expect(resolved).toEqual({ ref: 'page-default', variantType: 'default' });
  });

  it('uses default refs for odd pages and reports the effective variant', () => {
    const resolved = resolveInheritedHeaderFooterRefWithType({
      identifier: {
        headerIds: { default: 'legacy-default' },
      },
      sectionIndex: 0,
      kind: 'header',
      variantType: 'odd',
    });

    expect(resolved).toEqual({ ref: 'legacy-default', variantType: 'default' });
  });

  it('does not fall back from first to default', () => {
    const ref = resolveInheritedHeaderFooterRef({
      identifier: {
        headerIds: { default: 'legacy-default' },
      },
      sectionIndex: 0,
      kind: 'header',
      variantType: 'first',
    });

    expect(ref).toBeNull();
  });

  it('does not fall back from even to default', () => {
    const ref = resolveInheritedHeaderFooterRef({
      identifier: {
        headerIds: { default: 'legacy-default' },
      },
      sectionIndex: 0,
      kind: 'header',
      variantType: 'even',
    });

    expect(ref).toBeNull();
  });
});
