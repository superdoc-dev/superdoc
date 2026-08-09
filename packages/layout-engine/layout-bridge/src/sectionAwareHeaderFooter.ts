import type { FlowBlock, SectionMetadata, SectionRefType } from '@superdoc/contracts';
import { OOXML_PCT_DIVISOR } from '@superdoc/contracts';
import type { HeaderFooterConstraints } from '@superdoc/layout-engine';

export type HeaderFooterSectionKind = 'header' | 'footer';
export type HeaderFooterRefs = Partial<Record<SectionRefType, string>>;

export type SectionAwareHeaderFooterMeasurementGroup = {
  rId: string;
  sectionIndices: Set<number>;
  sectionConstraints: HeaderFooterConstraints;
  effectiveWidth: number;
};

const HEADER_FOOTER_VARIANTS: SectionRefType[] = ['default', 'first', 'even', 'odd'];

export function buildSectionAwareHeaderFooterLayoutKey(rId: string, sectionIndex: number): string {
  return `${rId}::s${sectionIndex}`;
}

export function buildSectionContentWidth(section: SectionMetadata, fallback: HeaderFooterConstraints): number {
  const pageWidth = section.pageSize?.w ?? fallback.pageWidth ?? 0;
  const marginLeft = section.margins?.left ?? fallback.margins?.left ?? 0;
  const marginRight = section.margins?.right ?? fallback.margins?.right ?? 0;

  return pageWidth - marginLeft - marginRight;
}

export function buildEffectiveHeaderFooterRefsBySection(
  sectionMetadata: SectionMetadata[],
  kind: HeaderFooterSectionKind,
): Map<number, HeaderFooterRefs> {
  const effectiveRefsBySection = new Map<number, HeaderFooterRefs>();
  let inheritedRefs: HeaderFooterRefs = {};

  for (const section of sectionMetadata) {
    const explicitRefs = kind === 'header' ? section.headerRefs : section.footerRefs;
    const effectiveRefs: HeaderFooterRefs = { ...inheritedRefs };

    for (const variant of HEADER_FOOTER_VARIANTS) {
      const refId = explicitRefs?.[variant];
      if (refId) {
        effectiveRefs[variant] = refId;
      }
    }

    if (Object.keys(effectiveRefs).length > 0) {
      effectiveRefsBySection.set(section.sectionIndex, effectiveRefs);
    }

    inheritedRefs = effectiveRefs;
  }

  return effectiveRefsBySection;
}

export function collectReferencedHeaderFooterRIds(effectiveRefsBySection: Map<number, HeaderFooterRefs>): Set<string> {
  const referencedRIds = new Set<string>();

  for (const refs of effectiveRefsBySection.values()) {
    for (const variant of HEADER_FOOTER_VARIANTS) {
      const refId = refs[variant];
      if (refId) {
        referencedRIds.add(refId);
      }
    }
  }

  return referencedRIds;
}

function buildConstraintsForSection(
  section: SectionMetadata,
  fallback: HeaderFooterConstraints,
): HeaderFooterConstraints {
  const pageWidth = section.pageSize?.w ?? fallback.pageWidth ?? 0;
  const pageHeight = section.pageSize?.h ?? fallback.pageHeight;
  const marginLeft = section.margins?.left ?? fallback.margins?.left ?? 0;
  const marginRight = section.margins?.right ?? fallback.margins?.right ?? 0;
  const marginTop = section.margins?.top ?? fallback.margins?.top;
  const marginBottom = section.margins?.bottom ?? fallback.margins?.bottom;
  const headerMargin = section.margins?.header ?? fallback.margins?.header;
  const footerMargin = section.margins?.footer ?? fallback.margins?.footer;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const sectionMarginTop = marginTop ?? 0;
  const sectionMarginBottom = marginBottom ?? 0;
  const sectionHeight =
    pageHeight != null ? Math.max(1, pageHeight - sectionMarginTop - sectionMarginBottom) : fallback.height;

  return {
    width: contentWidth,
    height: sectionHeight,
    pageWidth,
    pageHeight,
    margins: {
      left: marginLeft,
      right: marginRight,
      top: marginTop,
      bottom: marginBottom,
      header: headerMargin,
      footer: footerMargin,
    },
    overflowBaseHeight: fallback.overflowBaseHeight,
  };
}

export function buildSectionAwareHeaderFooterMeasurementGroups(
  kind: HeaderFooterSectionKind,
  blocksByRId: Map<string, FlowBlock[]> | undefined,
  sectionMetadata: SectionMetadata[],
  fallbackConstraints: HeaderFooterConstraints,
): SectionAwareHeaderFooterMeasurementGroup[] {
  if (!blocksByRId || sectionMetadata.length === 0) {
    return [];
  }

  const effectiveRefsBySection = buildEffectiveHeaderFooterRefsBySection(sectionMetadata, kind);
  const groups = new Map<string, SectionAwareHeaderFooterMeasurementGroup>();

  for (const section of sectionMetadata) {
    const refs = effectiveRefsBySection.get(section.sectionIndex);
    if (!refs) continue;

    const uniqueRIds = new Set<string>();
    for (const variant of HEADER_FOOTER_VARIANTS) {
      const refId = refs[variant];
      if (refId) {
        uniqueRIds.add(refId);
      }
    }

    for (const rId of uniqueRIds) {
      if (!blocksByRId.has(rId)) continue;

      const sectionConstraints = buildConstraintsForSection(section, fallbackConstraints);
      const effectiveWidth = sectionConstraints.width;
      const groupKey = [
        rId,
        `w${effectiveWidth}`,
        `ph${sectionConstraints.pageHeight ?? ''}`,
        `mt${sectionConstraints.margins?.top ?? ''}`,
        `mb${sectionConstraints.margins?.bottom ?? ''}`,
        `mh${sectionConstraints.margins?.header ?? ''}`,
        `mf${sectionConstraints.margins?.footer ?? ''}`,
      ].join('::');

      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        existingGroup.sectionIndices.add(section.sectionIndex);
        continue;
      }

      groups.set(groupKey, {
        rId,
        sectionIndices: new Set([section.sectionIndex]),
        sectionConstraints,
        effectiveWidth,
      });
    }
  }

  return Array.from(groups.values());
}
