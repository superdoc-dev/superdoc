export type HeaderFooterKind = 'header' | 'footer';
export type HeaderFooterVariant = 'default' | 'first' | 'even' | 'odd';

export type HeaderFooterSectionRefs = Partial<Record<HeaderFooterVariant, string | null>>;

export type HeaderFooterResolutionSection = {
  sectionIndex: number;
  titlePg?: boolean;
  headerRefs?: HeaderFooterSectionRefs | null;
  footerRefs?: HeaderFooterSectionRefs | null;
};

export type HeaderFooterVariantSelectionInput = {
  documentPageNumber: number;
  sectionPageNumber: number;
  titlePg?: boolean;
  alternateHeaders?: boolean;
};

export type HeaderFooterEffectiveRefInput = {
  sections: readonly HeaderFooterResolutionSection[];
  sectionIndex: number;
  kind: HeaderFooterKind;
  variant: HeaderFooterVariant;
};

export type HeaderFooterEffectiveRefResult = {
  refId: string;
  matchedSectionIndex: number;
  matchedVariant: HeaderFooterVariant;
};

export function selectHeaderFooterVariantForPage({
  documentPageNumber,
  sectionPageNumber,
  titlePg,
  alternateHeaders,
}: HeaderFooterVariantSelectionInput): HeaderFooterVariant | null {
  if (!Number.isFinite(documentPageNumber) || !Number.isFinite(sectionPageNumber)) return null;
  if (sectionPageNumber < 1) return null;
  if (sectionPageNumber === 1 && titlePg === true) return 'first';
  if (alternateHeaders === true) return documentPageNumber % 2 === 0 ? 'even' : 'odd';
  return 'default';
}

function candidateVariantsFor(variant: HeaderFooterVariant): readonly HeaderFooterVariant[] {
  return variant === 'odd' ? ['odd', 'default'] : [variant];
}

function sectionRefsFor(
  section: HeaderFooterResolutionSection | undefined,
  kind: HeaderFooterKind,
): HeaderFooterSectionRefs | null | undefined {
  return kind === 'header' ? section?.headerRefs : section?.footerRefs;
}

export function resolveEffectiveHeaderFooterRef({
  sections,
  sectionIndex,
  kind,
  variant,
}: HeaderFooterEffectiveRefInput): HeaderFooterEffectiveRefResult | null {
  if (sectionIndex < 0) return null;

  const sectionsByIndex = new Map<number, HeaderFooterResolutionSection>();
  for (const section of sections) {
    sectionsByIndex.set(section.sectionIndex, section);
  }

  const candidates = candidateVariantsFor(variant);
  for (let currentIndex = sectionIndex; currentIndex >= 0; currentIndex -= 1) {
    const refs = sectionRefsFor(sectionsByIndex.get(currentIndex), kind);
    if (!refs) continue;

    for (const candidate of candidates) {
      const refId = refs[candidate];
      if (refId) {
        return {
          refId,
          matchedSectionIndex: currentIndex,
          matchedVariant: candidate,
        };
      }
    }
  }

  return null;
}
