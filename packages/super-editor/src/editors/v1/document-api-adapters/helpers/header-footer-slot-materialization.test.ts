import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureExplicitHeaderFooterSlot, normalizeVariant } from './header-footer-slot-materialization.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSectionProjections = vi.fn();
vi.mock('./sections-resolver.js', () => ({
  resolveSectionProjections: (...args: unknown[]) => mockSectionProjections(...args),
}));

const mockReadTargetSectPr = vi.fn();
vi.mock('./section-projection-access.js', () => ({
  readTargetSectPr: (...args: unknown[]) => mockReadTargetSectPr(...args),
}));

const mockCreateHeaderFooterPart = vi.fn();
vi.mock('./header-footer-parts.js', () => ({
  createHeaderFooterPart: (...args: unknown[]) => mockCreateHeaderFooterPart(...args),
}));

const mockResolveEffectiveRef = vi.fn();
vi.mock('./header-footer-refs-mutation.js', () => ({
  resolveEffectiveRef: (...args: unknown[]) => mockResolveEffectiveRef(...args),
}));

const mockApplySectPrToProjection = vi.fn();
vi.mock('./section-mutation-wrapper.js', () => ({
  applySectPrToProjection: (...args: unknown[]) => mockApplySectPrToProjection(...args),
}));

// compoundMutation: execute callback directly (transparent wrapper for tests)
vi.mock('../../core/parts/mutation/compound-mutation.js', () => ({
  compoundMutation: ({ execute }: { execute: () => boolean }) => {
    try {
      const success = execute();
      return { success };
    } catch {
      return { success: false };
    }
  },
}));

const mockRemovePart = vi.fn();
const mockHasPart = vi.fn().mockReturnValue(false);
vi.mock('../../core/parts/store/part-store.js', () => ({
  removePart: (...args: unknown[]) => mockRemovePart(...args),
  hasPart: (...args: unknown[]) => mockHasPart(...args),
}));

const mockRemoveInvalidationHandler = vi.fn();
vi.mock('../../core/parts/invalidation/part-invalidation-registry.js', () => ({
  removeInvalidationHandler: (...args: unknown[]) => mockRemoveInvalidationHandler(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEditor(): unknown {
  return { state: { doc: {} }, dispatch: vi.fn() };
}

function createProjection(sectionId: string, sectionIndex: number) {
  return {
    sectionId,
    address: { kind: 'section', sectionId },
    range: { sectionIndex },
    target: { kind: 'body' },
    domain: {},
  };
}

function createSectPr(headerRefs?: Record<string, string>, footerRefs?: Record<string, string>) {
  const elements: Array<{ type: string; name: string; attributes: Record<string, string>; elements: unknown[] }> = [];
  if (headerRefs) {
    for (const [variant, refId] of Object.entries(headerRefs)) {
      elements.push({
        type: 'element',
        name: 'w:headerReference',
        attributes: { 'w:type': variant, 'r:id': refId },
        elements: [],
      });
    }
  }
  if (footerRefs) {
    for (const [variant, refId] of Object.entries(footerRefs)) {
      elements.push({
        type: 'element',
        name: 'w:footerReference',
        attributes: { 'w:type': variant, 'r:id': refId },
        elements: [],
      });
    }
  }
  return { type: 'element', name: 'w:sectPr', elements };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeVariant', () => {
  it('maps "odd" to "default"', () => {
    expect(normalizeVariant('odd')).toBe('default');
  });

  it('passes through valid variants', () => {
    expect(normalizeVariant('default')).toBe('default');
    expect(normalizeVariant('first')).toBe('first');
    expect(normalizeVariant('even')).toBe('even');
  });

  it('throws on unrecognized variant', () => {
    expect(() => normalizeVariant('unknown')).toThrow('Unrecognized header/footer variant');
  });
});

describe('ensureExplicitHeaderFooterSlot', () => {
  const editor = createEditor();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when section not found', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-99',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();
    // No mutations should have occurred
    expect(mockCreateHeaderFooterPart).not.toHaveBeenCalled();
  });

  it('returns existing ref with created=false when slot already exists', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr({ default: 'rId7' }));

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId7');
    expect(result!.created).toBe(false);
    expect(mockCreateHeaderFooterPart).not.toHaveBeenCalled();
  });

  it('creates a new slot when no explicit ref exists', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr()); // no refs
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId10',
      relationshipTarget: 'word/header1.xml',
    });
    mockApplySectPrToProjection.mockImplementation(() => {});

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId10');
    expect(result!.created).toBe(true);
    expect(result!.createdPartPath).toBe('word/header1.xml');
    expect(result!.materializedFromRefId).toBeNull();
    expect(mockCreateHeaderFooterPart).toHaveBeenCalledWith(
      editor,
      expect.objectContaining({ kind: 'header', variant: 'default' }),
    );
    expect(mockApplySectPrToProjection).toHaveBeenCalled();
  });

  it('clones from inherited source when available', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0), createProjection('section-1', 1)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr()); // no refs on section-1
    mockResolveEffectiveRef.mockReturnValue({
      refId: 'rId5',
      resolvedFromSection: { kind: 'section', sectionId: 'section-0' },
      resolvedVariant: 'default',
    });
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId11',
      relationshipTarget: 'word/header2.xml',
    });
    mockApplySectPrToProjection.mockImplementation(() => {});

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-1',
      kind: 'header',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId11');
    expect(result!.created).toBe(true);
    expect(result!.materializedFromRefId).toBe('rId5');
    expect(mockCreateHeaderFooterPart).toHaveBeenCalledWith(editor, expect.objectContaining({ sourceRefId: 'rId5' }));
  });

  it('uses explicit sourceRefId over inherited ref', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr());
    mockResolveEffectiveRef.mockReturnValue({
      refId: 'rId-inherited',
      resolvedFromSection: { kind: 'section', sectionId: 'section-0' },
      resolvedVariant: 'default',
    });
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId12',
      relationshipTarget: 'word/footer1.xml',
    });
    mockApplySectPrToProjection.mockImplementation(() => {});

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'footer',
      variant: 'default',
      sourceRefId: 'rId-explicit-source',
    });

    expect(result).not.toBeNull();
    expect(result!.materializedFromRefId).toBe('rId-explicit-source');
    expect(mockCreateHeaderFooterPart).toHaveBeenCalledWith(
      editor,
      expect.objectContaining({ sourceRefId: 'rId-explicit-source' }),
    );
  });

  it('is idempotent — second call returns existing with created=false', () => {
    // First call: no existing ref
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr());
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId10',
      relationshipTarget: 'word/header1.xml',
    });
    mockApplySectPrToProjection.mockImplementation(() => {});

    const first = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });
    expect(first!.created).toBe(true);

    // Second call: existing ref is now present
    mockReadTargetSectPr.mockReturnValue(createSectPr({ default: 'rId10' }));

    const second = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });
    expect(second!.created).toBe(false);
    expect(second!.refId).toBe('rId10');
  });

  it('returns null when createHeaderFooterPart throws (compound rollback)', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr());
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockImplementation(() => {
      throw new Error('Part creation failed');
    });

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();
  });

  it('cleans up created parts and invalidation handler when applySectPrToProjection throws', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr());
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId10',
      relationshipTarget: 'word/header1.xml',
    });
    // Part was created by createHeaderFooterPart
    mockHasPart.mockReturnValue(true);
    mockApplySectPrToProjection.mockImplementation(() => {
      throw new Error('sectPr mutation failed');
    });

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();
    // Verify orphan part cleanup
    expect(mockRemovePart).toHaveBeenCalledWith(editor, 'word/header1.xml');
    expect(mockRemoveInvalidationHandler).toHaveBeenCalledWith('word/header1.xml');
    // Verify rels part cleanup
    expect(mockRemovePart).toHaveBeenCalledWith(editor, 'word/_rels/header1.xml.rels');
  });

  it('skips part removal when parts were not actually created', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr());
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId10',
      relationshipTarget: 'word/header1.xml',
    });
    // Parts don't exist (createHeaderFooterPart returned but parts weren't persisted)
    mockHasPart.mockReturnValue(false);
    mockApplySectPrToProjection.mockImplementation(() => {
      throw new Error('sectPr mutation failed');
    });

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).toBeNull();
    // removePart should NOT be called since hasPart returned false
    expect(mockRemovePart).not.toHaveBeenCalled();
    // Invalidation handler should still be cleaned up
    expect(mockRemoveInvalidationHandler).toHaveBeenCalledWith('word/header1.xml');
  });

  it('handles footer kind correctly', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr(undefined, { default: 'rId-footer-1' }));

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'footer',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId-footer-1');
    expect(result!.created).toBe(false);
  });

  it('handles first variant correctly', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(createSectPr({ first: 'rId-first' }));

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'first',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId-first');
    expect(result!.created).toBe(false);
  });

  it('handles null sectPr (blank document) by creating fresh slot', () => {
    mockSectionProjections.mockReturnValue([createProjection('section-0', 0)]);
    mockReadTargetSectPr.mockReturnValue(null); // blank doc, no sectPr
    mockResolveEffectiveRef.mockReturnValue(null);
    mockCreateHeaderFooterPart.mockReturnValue({
      refId: 'rId20',
      relationshipTarget: 'word/header1.xml',
    });
    mockApplySectPrToProjection.mockImplementation(() => {});

    const result = ensureExplicitHeaderFooterSlot(editor as any, {
      sectionId: 'section-0',
      kind: 'header',
      variant: 'default',
    });

    expect(result).not.toBeNull();
    expect(result!.refId).toBe('rId20');
    expect(result!.created).toBe(true);
  });
});
