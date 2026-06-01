import { describe, expect, it } from 'vitest';
import { resolveEffectiveRef } from './header-footer-refs-mutation.js';
import type { SectionProjection } from './sections-resolver.js';

function projection(
  sectionIndex: number,
  refs: SectionProjection['range']['headerRefs'],
  domainRefs?: SectionProjection['domain']['headerRefs'],
): SectionProjection {
  return {
    sectionId: `section-${sectionIndex}`,
    address: { kind: 'section', sectionId: `section-${sectionIndex}` },
    range: {
      sectionIndex,
      headerRefs: refs,
    } as SectionProjection['range'],
    target: { kind: 'body' },
    domain: {
      ...(domainRefs && { headerRefs: domainRefs }),
    },
  };
}

describe('resolveEffectiveRef', () => {
  it('does not inherit default for first variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(sections, 1, 'header', 'first')).toBeNull();
  });

  it('does not inherit default for even variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(sections, 1, 'header', 'even')).toBeNull();
  });

  it('inherits default for default variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(sections, 1, 'header', 'default')).toMatchObject({
      refId: 'h0-default',
      resolvedFromSection: { kind: 'section', sectionId: 'section-0' },
      resolvedVariant: 'default',
    });
  });

  it('inherits converter-preserved refs exposed through section domain metadata', () => {
    const sections = [projection(0, undefined, { default: 'h0-domain-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(sections, 1, 'header', 'default')).toMatchObject({
      refId: 'h0-domain-default',
      resolvedFromSection: { kind: 'section', sectionId: 'section-0' },
      resolvedVariant: 'default',
    });
  });

  it('returns null when resolving before the first section', () => {
    const sections = [projection(0, { default: 'h0-default' })];

    expect(resolveEffectiveRef(sections, 0, 'header', 'default')).toBeNull();
  });
});
