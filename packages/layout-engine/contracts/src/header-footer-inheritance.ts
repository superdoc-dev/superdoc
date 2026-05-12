import type { HeaderFooterType } from './index.js';

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

export type ResolvedInheritedHeaderFooterRef = {
  ref: string;
  variantType: HeaderFooterType;
};

function resolveVariantRef(
  refs: HeaderFooterRefMap | undefined,
  variantType: HeaderFooterType,
): ResolvedInheritedHeaderFooterRef | null {
  if (!refs) return null;
  const direct = refs[variantType];
  if (direct) return { ref: direct, variantType };
  if (variantType === 'odd' && refs.default) return { ref: refs.default, variantType: 'default' };
  return null;
}

export function resolveInheritedHeaderFooterRefWithType({
  identifier,
  sectionIndex,
  kind,
  variantType,
  pageRefs,
}: ResolveInheritedHeaderFooterRefInput): ResolvedInheritedHeaderFooterRef | null {
  const fromPage = resolveVariantRef(pageRefs, variantType);
  if (fromPage) return fromPage;

  const sectionMap = kind === 'header' ? identifier.sectionHeaderIds : identifier.sectionFooterIds;
  const legacyIds = kind === 'header' ? identifier.headerIds : identifier.footerIds;

  const sectionIds = sectionMap?.get(sectionIndex);
  const fromSection = resolveVariantRef(sectionIds, variantType);
  if (fromSection) return fromSection;

  if (sectionMap) {
    for (let index = sectionIndex - 1; index >= 0; index -= 1) {
      const inherited = resolveVariantRef(sectionMap.get(index), variantType);
      if (inherited) return inherited;
    }
  }

  return resolveVariantRef(legacyIds, variantType);
}

export function resolveInheritedHeaderFooterRef(input: ResolveInheritedHeaderFooterRefInput): string | null {
  return resolveInheritedHeaderFooterRefWithType(input)?.ref ?? null;
}
