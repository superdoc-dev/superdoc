import { describe, expect, it } from 'vitest';
import { resolveEffectiveHeaderFooterRef, selectHeaderFooterVariantForPage } from './header-footer-resolution.js';
import type { HeaderFooterResolutionSection } from './header-footer-resolution.js';

describe('header/footer effective ref resolution', () => {
  it('inherits matching variants across more than one previous section', () => {
    const sections: HeaderFooterResolutionSection[] = [
      { sectionIndex: 0, titlePg: true, headerRefs: { first: 'h0-first' } },
      { sectionIndex: 1, titlePg: true, headerRefs: { default: 'h1-default' } },
      { sectionIndex: 2, titlePg: true, headerRefs: {} },
    ];

    expect(
      resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 2, kind: 'header', variant: 'first' }),
    ).toMatchObject({
      refId: 'h0-first',
      matchedSectionIndex: 0,
      matchedVariant: 'first',
    });
  });

  it('preserves inherited missing variants when a later section partially overrides another variant', () => {
    const sections: HeaderFooterResolutionSection[] = [
      { sectionIndex: 0, footerRefs: { default: 'f0-default', even: 'f0-even' } },
      { sectionIndex: 1, footerRefs: { default: 'f1-default' } },
    ];

    expect(
      resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 1, kind: 'footer', variant: 'even' }),
    ).toMatchObject({
      refId: 'f0-even',
      matchedSectionIndex: 0,
      matchedVariant: 'even',
    });
  });

  it('does not let first inherit default when titlePg selects first', () => {
    const sections: HeaderFooterResolutionSection[] = [
      { sectionIndex: 0, titlePg: true, headerRefs: { default: 'h0-default' } },
    ];

    const variant = selectHeaderFooterVariantForPage({
      documentPageNumber: 1,
      sectionPageNumber: 1,
      titlePg: true,
      alternateHeaders: false,
    });

    expect(variant).toBe('first');
    expect(resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 0, kind: 'header', variant: 'first' })).toBeNull();
  });

  it('does not let even inherit default when odd/even headers are enabled', () => {
    const sections: HeaderFooterResolutionSection[] = [{ sectionIndex: 0, headerRefs: { default: 'h0-default' } }];

    expect(resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 0, kind: 'header', variant: 'even' })).toBeNull();
  });

  it('resolves odd from explicit odd before OOXML default', () => {
    const sections: HeaderFooterResolutionSection[] = [
      { sectionIndex: 0, headerRefs: { default: 'h0-default' } },
      { sectionIndex: 1, headerRefs: { odd: 'h1-odd', default: 'h1-default' } },
    ];

    expect(
      resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 1, kind: 'header', variant: 'odd' }),
    ).toMatchObject({
      refId: 'h1-odd',
      matchedVariant: 'odd',
    });
  });

  it('resolves odd from OOXML default when explicit odd is absent', () => {
    const sections: HeaderFooterResolutionSection[] = [{ sectionIndex: 0, headerRefs: { default: 'h0-default' } }];

    expect(
      resolveEffectiveHeaderFooterRef({ sections, sectionIndex: 0, kind: 'header', variant: 'odd' }),
    ).toMatchObject({
      refId: 'h0-default',
      matchedVariant: 'default',
    });
  });

  it('uses document page number for even/odd selection', () => {
    expect(
      selectHeaderFooterVariantForPage({
        documentPageNumber: 4,
        sectionPageNumber: 1,
        titlePg: false,
        alternateHeaders: true,
      }),
    ).toBe('even');
  });

  it('accepts non-positive document page numbers for parity when the section page is valid', () => {
    expect(
      selectHeaderFooterVariantForPage({
        documentPageNumber: 0,
        sectionPageNumber: 1,
        titlePg: false,
        alternateHeaders: true,
      }),
    ).toBe('even');
    expect(
      selectHeaderFooterVariantForPage({
        documentPageNumber: -1,
        sectionPageNumber: 1,
        titlePg: false,
        alternateHeaders: true,
      }),
    ).toBe('odd');
  });

  it('returns null when the section page number is invalid', () => {
    expect(
      selectHeaderFooterVariantForPage({
        documentPageNumber: 1,
        sectionPageNumber: 0,
        titlePg: false,
        alternateHeaders: false,
      }),
    ).toBeNull();
    expect(
      selectHeaderFooterVariantForPage({
        documentPageNumber: -1,
        sectionPageNumber: -1,
        titlePg: false,
        alternateHeaders: true,
      }),
    ).toBeNull();
  });
});
