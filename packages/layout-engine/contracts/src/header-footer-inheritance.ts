type HeaderFooterType = 'default' | 'first' | 'even' | 'odd';

export type HeaderFooterRefMap = Partial<Record<HeaderFooterType, string | null | undefined>>;

export type HeaderFooterRefIdentifier = {
  headerIds?: HeaderFooterRefMap;
  footerIds?: HeaderFooterRefMap;
  sectionCount?: number;
  sectionHeaderIds?: Map<number, HeaderFooterRefMap>;
  sectionFooterIds?: Map<number, HeaderFooterRefMap>;
};

export type ResolveInheritedHeaderFooterRefInput = {
  identifier: HeaderFooterRefIdentifier;
  sectionIndex: number;
  kind: 'header' | 'footer';
  variantType: HeaderFooterType;
  pageRefs?: HeaderFooterRefMap;
};

function resolveVariantRef(refs: HeaderFooterRefMap | undefined, variantType: HeaderFooterType): string | null {
  if (!refs) return null;
  const direct = refs[variantType];
  if (direct) return direct;
  if (variantType === 'odd' && refs.default) return refs.default;
  return null;
}

export function resolveInheritedHeaderFooterRef({
  identifier,
  sectionIndex,
  kind,
  variantType,
  pageRefs,
}: ResolveInheritedHeaderFooterRefInput): string | null {
  const fromPage = resolveVariantRef(pageRefs, variantType);
  if (fromPage) return fromPage;

  const sectionMap = kind === 'header' ? identifier.sectionHeaderIds : identifier.sectionFooterIds;
  const legacyIds = kind === 'header' ? identifier.headerIds : identifier.footerIds;

  const sectionIds = sectionMap?.get(sectionIndex);
  const fromSection = resolveVariantRef(sectionIds, variantType);
  if (fromSection) return fromSection;

  const hasSectionAwareRefs =
    sectionMap != null && (sectionMap.has(sectionIndex) || (identifier.sectionCount ?? 0) > sectionIndex);
  if (hasSectionAwareRefs) {
    for (let index = sectionIndex - 1; index >= 0; index -= 1) {
      const inherited = resolveVariantRef(sectionMap.get(index), variantType);
      if (inherited) return inherited;
    }
    return null;
  }

  return resolveVariantRef(legacyIds, variantType);
}
