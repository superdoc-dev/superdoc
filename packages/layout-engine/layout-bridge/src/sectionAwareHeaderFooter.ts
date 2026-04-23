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

type TableWidthSpec = {
  type: 'pct' | 'grid' | 'px';
  value: number;
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
  minWidth?: number,
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
  const maxWidth = pageWidth - marginLeft;
  const effectiveWidth = minWidth ? Math.min(Math.max(contentWidth, minWidth), maxWidth) : contentWidth;
  const sectionMarginTop = marginTop ?? 0;
  const sectionMarginBottom = marginBottom ?? 0;
  const sectionHeight =
    pageHeight != null ? Math.max(1, pageHeight - sectionMarginTop - sectionMarginBottom) : fallback.height;

  return {
    width: effectiveWidth,
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

function getTableWidthSpec(blocks: FlowBlock[]): TableWidthSpec | undefined {
  let widestSpec: TableWidthSpec | undefined;
  let maxResolvedWidth = 0;

  for (const block of blocks) {
    if (block.kind !== 'table') continue;

    const tableWidth = (block as { attrs?: { tableWidth?: { width?: number; value?: number; type?: string } } }).attrs
      ?.tableWidth;
    const widthValue = tableWidth?.width ?? tableWidth?.value;

    if (tableWidth?.type === 'pct' && typeof widthValue === 'number' && widthValue > 0) {
      if (!widestSpec || widestSpec.type !== 'pct' || widthValue > widestSpec.value) {
        widestSpec = { type: 'pct', value: widthValue };
        maxResolvedWidth = Number.POSITIVE_INFINITY;
      }
      continue;
    }

    if ((tableWidth?.type === 'px' || tableWidth?.type === 'pixel') && typeof widthValue === 'number') {
      if (widthValue > maxResolvedWidth) {
        maxResolvedWidth = widthValue;
        widestSpec = { type: 'px', value: widthValue };
      }
      continue;
    }

    if (block.columnWidths && block.columnWidths.length > 0) {
      const gridWidth = block.columnWidths.reduce((sum, columnWidth) => sum + columnWidth, 0);
      if (gridWidth > maxResolvedWidth) {
        maxResolvedWidth = gridWidth;
        widestSpec = { type: 'grid', value: gridWidth };
      }
    }
  }

  return widestSpec;
}

function resolveTableMinWidth(spec: TableWidthSpec | undefined, contentWidth: number): number {
  if (!spec) return 0;
  if (spec.type === 'pct') {
    return contentWidth * (spec.value / OOXML_PCT_DIVISOR);
  }

  return spec.value;
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
  const tableWidthSpecByRId = new Map<string, TableWidthSpec>();

  for (const [rId, blocks] of blocksByRId) {
    const tableWidthSpec = getTableWidthSpec(blocks);
    if (tableWidthSpec) {
      tableWidthSpecByRId.set(rId, tableWidthSpec);
    }
  }

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

      const contentWidth = buildSectionContentWidth(section, fallbackConstraints);
      const tableWidthSpec = tableWidthSpecByRId.get(rId);
      const tableMinWidth = resolveTableMinWidth(tableWidthSpec, contentWidth);
      const sectionConstraints = buildConstraintsForSection(section, fallbackConstraints, tableMinWidth || undefined);
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
