import { describe, expect, it } from 'vitest';
import { resolveEffectiveRef } from './header-footer-refs-mutation.js';
import type { SectionProjection } from './sections-resolver.js';

function projection(sectionIndex: number, refs: SectionProjection['range']['headerRefs']): SectionProjection {
  return {
    sectionId: `section-${sectionIndex}`,
    address: { kind: 'section', sectionId: `section-${sectionIndex}` },
    range: {
      sectionIndex,
      headerRefs: refs,
    } as SectionProjection['range'],
    target: { kind: 'body' },
    domain: {},
  };
}

describe('resolveEffectiveRef', () => {
  const editor = {} as never;

  it('does not inherit default for first variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(editor, sections, 1, 'header', 'first')).toBeNull();
  });

  it('does not inherit default for even variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(editor, sections, 1, 'header', 'even')).toBeNull();
  });

  it('inherits default for default variants', () => {
    const sections = [projection(0, { default: 'h0-default' }), projection(1, undefined)];

    expect(resolveEffectiveRef(editor, sections, 1, 'header', 'default')).toMatchObject({
      refId: 'h0-default',
      resolvedFromSection: { kind: 'section', sectionId: 'section-0' },
      resolvedVariant: 'default',
    });
  });
});
