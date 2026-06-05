/**
 * Read-only builder for the header/footer story-part layout snapshot.
 *
 * Pure projection of {@link HeaderFooterSessionManager} state into the
 * editor-neutral {@link HeaderFooterLayoutSnapshot}. It reads the per-page region
 * facts and the per-rId raw/resolved layouts the manager already holds and emits
 * deterministic, JSON-safe summaries — no Maps, DOM nodes, or editor/session
 * instances leak out, geometry is rounded, and ordering is stable so repeated
 * reads serialize identically. It does not touch the DOM, rerun layout, or mutate
 * session state.
 *
 * @module presentation-editor/header-footer/header-footer-snapshot
 */

import type { Fragment, ResolvedHeaderFooterLayout, ResolvedPaintItem } from '@superdoc/contracts';
import { buildSectionAwareHeaderFooterLayoutKey, type HeaderFooterLayoutResult } from '@superdoc/layout-bridge';

import type {
  HeaderFooterFragmentSummary,
  HeaderFooterLayoutSnapshot,
  HeaderFooterPageBinding,
  HeaderFooterRawLayoutSummary,
  HeaderFooterRegion,
  HeaderFooterRegionSnapshot,
  HeaderFooterResolvedItemSummary,
  HeaderFooterResolvedLayoutSummary,
  HeaderFooterStoryBinding,
  HeaderFooterStoryKind,
  HeaderFooterStoryLayoutSnapshot,
} from '../../header-footer/types.js';

/** Inputs the builder needs — all already owned by the session manager. */
export type HeaderFooterSnapshotSource = {
  headerRegions: Map<number, HeaderFooterRegion>;
  footerRegions: Map<number, HeaderFooterRegion>;
  headerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
  footerLayoutsByRId: Map<string, HeaderFooterLayoutResult>;
  headerLayoutResults: HeaderFooterLayoutResult[] | null;
  footerLayoutResults: HeaderFooterLayoutResult[] | null;
  resolvedHeaderByRId: Map<string, ResolvedHeaderFooterLayout>;
  resolvedFooterByRId: Map<string, ResolvedHeaderFooterLayout>;
  resolvedHeaderLayouts: ResolvedHeaderFooterLayout[] | null;
  resolvedFooterLayouts: ResolvedHeaderFooterLayout[] | null;
};

const COMPOSITE_KEY_SUFFIX = /::s(\d+)$/;

/** Round geometry to 3 decimals; non-finite values become null. */
function roundNullable(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  // Normalize -0 to 0 so serialized output is stable.
  return Math.round(value * 1000) / 1000 + 0;
}

/** Round a required numeric field; non-finite values fall back to 0. */
function roundNumber(value: number | null | undefined): number {
  return roundNullable(value) ?? 0;
}

/**
 * Natural compare so `rId2` sorts before `rId10`. Keeps story ordering stable
 * and human-meaningful across repeated reads.
 */
function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) ?? [];
  const bParts = b.match(re) ?? [];
  const len = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const an = Number(aParts[i]);
    const bn = Number(bParts[i]);
    const bothNumeric = !Number.isNaN(an) && !Number.isNaN(bn);
    if (bothNumeric) {
      if (an !== bn) return an - bn;
    } else if (aParts[i] !== bParts[i]) {
      return aParts[i] < bParts[i] ? -1 : 1;
    }
  }
  return aParts.length - bParts.length;
}

/**
 * Section-aware story key. Reuses the manager's per-rId layout key (which already
 * encodes section context as `::s<index>` when margins differ) and prefixes the
 * family so headers and footers never collide and later story families fit the
 * same key space.
 */
function makeStoryKey(kind: HeaderFooterStoryKind, layoutKey: string): string {
  return `${kind}::${layoutKey}`;
}

/** The relationship id behind a per-rId layout key (strips any `::s<index>` suffix). */
function refIdFromLayoutKey(layoutKey: string): string {
  return layoutKey.replace(COMPOSITE_KEY_SUFFIX, '');
}

/**
 * Resolve the section-aware story key for a page binding the same way the
 * decoration provider resolves the active layout: composite key first (per-section
 * margins), then the plain rId, falling back to the composite key so the binding
 * stays section-aware even when no raw layout entry exists yet.
 */
function resolveBindingStoryKey(
  kind: HeaderFooterStoryKind,
  refId: string | null,
  sectionIndex: number,
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
): string | null {
  if (!refId) return null;
  const composite = buildSectionAwareHeaderFooterLayoutKey(refId, sectionIndex);
  if (layoutsByRId.has(composite)) return makeStoryKey(kind, composite);
  if (layoutsByRId.has(refId)) return makeStoryKey(kind, refId);
  return makeStoryKey(kind, composite);
}

function summarizeRegion(region: HeaderFooterRegion): HeaderFooterRegionSnapshot {
  return {
    localX: roundNumber(region.localX),
    localY: roundNumber(region.localY),
    width: roundNumber(region.width),
    height: roundNumber(region.height),
    contentHeight: roundNullable(region.contentHeight),
  };
}

function summarizeBinding(
  kind: HeaderFooterStoryKind,
  region: HeaderFooterRegion,
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
): HeaderFooterStoryBinding {
  const refId = region.headerFooterRefId ?? null;
  return {
    storyKey: resolveBindingStoryKey(kind, refId, region.sectionIndex ?? 0, layoutsByRId),
    refId,
    variant: region.matchedVariant ?? region.sectionType ?? null,
    region: summarizeRegion(region),
  };
}

function hasBoundStoryRegion(region: HeaderFooterRegion | null): region is HeaderFooterRegion {
  return typeof region?.headerFooterRefId === 'string' && region.headerFooterRefId.length > 0;
}

function summarizeFragment(fragment: Fragment): HeaderFooterFragmentSummary {
  const withSize = fragment as Fragment & { width?: number; height?: number };
  return {
    kind: fragment.kind,
    blockId: typeof fragment.blockId === 'string' ? fragment.blockId : null,
    x: roundNumber(fragment.x),
    y: roundNumber(fragment.y),
    width: roundNullable(withSize.width),
    height: roundNullable(withSize.height),
  };
}

function summarizeRawLayout(result: HeaderFooterLayoutResult): HeaderFooterRawLayoutSummary {
  const { layout } = result;
  return {
    height: roundNumber(layout.height),
    minY: roundNullable(layout.minY),
    maxY: roundNullable(layout.maxY),
    renderHeight: roundNullable(layout.renderHeight),
    pages: [...layout.pages]
      .sort((a, b) => a.number - b.number)
      .map((page) => ({
        number: page.number,
        displayNumber: page.displayNumber ?? null,
        numberText: page.numberText ?? null,
        fragments: page.fragments.map(summarizeFragment),
      })),
  };
}

function summarizeResolvedItem(item: ResolvedPaintItem): HeaderFooterResolvedItemSummary {
  const withMeta = item as ResolvedPaintItem & {
    blockId?: string;
    fragmentKind?: string;
    children?: ResolvedPaintItem[];
  };
  return {
    kind: item.kind,
    blockId: typeof withMeta.blockId === 'string' ? withMeta.blockId : null,
    fragmentKind: typeof withMeta.fragmentKind === 'string' ? withMeta.fragmentKind : null,
    x: roundNumber(item.x),
    y: roundNumber(item.y),
    width: roundNullable(item.width),
    height: roundNullable(item.height),
    childCount: Array.isArray(withMeta.children) ? withMeta.children.length : null,
  };
}

function summarizeResolvedLayout(resolved: ResolvedHeaderFooterLayout): HeaderFooterResolvedLayoutSummary {
  return {
    height: roundNumber(resolved.height),
    minY: roundNullable(resolved.minY),
    maxY: roundNullable(resolved.maxY),
    renderHeight: roundNullable(resolved.renderHeight),
    pages: [...resolved.pages]
      .sort((a, b) => a.number - b.number)
      .map((page) => ({
        number: page.number,
        displayNumber: page.displayNumber ?? null,
        numberText: page.numberText ?? null,
        items: page.items.map(summarizeResolvedItem),
      })),
  };
}

function buildPageBindings(source: HeaderFooterSnapshotSource): {
  pageBindings: HeaderFooterPageBinding[];
  /** storyKey → section indices observed in bindings, for `sectionIndices`. */
  sectionsByStoryKey: Map<string, Set<number>>;
} {
  const sectionsByStoryKey = new Map<string, Set<number>>();
  const recordSection = (storyKey: string | null, sectionIndex: number): void => {
    if (!storyKey) return;
    let sections = sectionsByStoryKey.get(storyKey);
    if (!sections) {
      sections = new Set<number>();
      sectionsByStoryKey.set(storyKey, sections);
    }
    sections.add(sectionIndex);
  };

  const pageIndices = new Set<number>([...source.headerRegions.keys(), ...source.footerRegions.keys()]);
  const pageBindings: HeaderFooterPageBinding[] = [];

  for (const pageIndex of [...pageIndices].sort((a, b) => a - b)) {
    const headerRegion = source.headerRegions.get(pageIndex) ?? null;
    const footerRegion = source.footerRegions.get(pageIndex) ?? null;
    const boundHeaderRegion = hasBoundStoryRegion(headerRegion) ? headerRegion : null;
    const boundFooterRegion = hasBoundStoryRegion(footerRegion) ? footerRegion : null;
    const anchor = boundHeaderRegion ?? boundFooterRegion;
    if (!anchor) continue;

    const header = boundHeaderRegion ? summarizeBinding('header', boundHeaderRegion, source.headerLayoutsByRId) : null;
    const footer = boundFooterRegion ? summarizeBinding('footer', boundFooterRegion, source.footerLayoutsByRId) : null;

    if (header) recordSection(header.storyKey, boundHeaderRegion.sectionIndex ?? 0);
    if (footer) recordSection(footer.storyKey, boundFooterRegion.sectionIndex ?? 0);

    pageBindings.push({
      pageIndex,
      pageNumber: anchor.pageNumber,
      sectionIndex: anchor.sectionIndex ?? 0,
      header,
      footer,
    });
  }

  return { pageBindings, sectionsByStoryKey };
}

function makeStorySnapshot(
  kind: HeaderFooterStoryKind,
  storyKey: string,
  refId: string | null,
  sectionIndices: Iterable<number>,
  rawLayout: HeaderFooterLayoutResult,
  resolvedLayout: ResolvedHeaderFooterLayout | null,
): HeaderFooterStoryLayoutSnapshot {
  return {
    storyKey,
    kind,
    refId,
    sectionIndices: [...new Set(sectionIndices)].sort((a, b) => a - b),
    rawLayout: summarizeRawLayout(rawLayout),
    resolvedLayout: resolvedLayout ? summarizeResolvedLayout(resolvedLayout) : null,
  };
}

function buildVariantResultMaps(
  results: HeaderFooterLayoutResult[] | null,
  resolvedLayouts: ResolvedHeaderFooterLayout[] | null,
): {
  rawByVariant: Map<string, HeaderFooterLayoutResult>;
  resolvedByVariant: Map<string, ResolvedHeaderFooterLayout>;
} {
  const rawByVariant = new Map<string, HeaderFooterLayoutResult>();
  const resolvedByVariant = new Map<string, ResolvedHeaderFooterLayout>();

  if (!results) {
    return { rawByVariant, resolvedByVariant };
  }

  for (const [index, result] of results.entries()) {
    if (!rawByVariant.has(result.type)) {
      rawByVariant.set(result.type, result);
      const resolved = resolvedLayouts?.[index];
      if (resolved) {
        resolvedByVariant.set(result.type, resolved);
      }
    }
  }

  return { rawByVariant, resolvedByVariant };
}

function buildStoryLayouts(
  kind: HeaderFooterStoryKind,
  pageBindings: HeaderFooterPageBinding[],
  layoutsByRId: Map<string, HeaderFooterLayoutResult>,
  layoutResults: HeaderFooterLayoutResult[] | null,
  resolvedByRId: Map<string, ResolvedHeaderFooterLayout>,
  resolvedLayouts: ResolvedHeaderFooterLayout[] | null,
  sectionsByStoryKey: Map<string, Set<number>>,
): HeaderFooterStoryLayoutSnapshot[] {
  const entries = new Map<string, HeaderFooterStoryLayoutSnapshot>();

  for (const [layoutKey, result] of layoutsByRId) {
    const storyKey = makeStoryKey(kind, layoutKey);
    const sections = new Set<number>(sectionsByStoryKey.get(storyKey) ?? []);
    const compositeMatch = COMPOSITE_KEY_SUFFIX.exec(layoutKey);
    if (compositeMatch) {
      sections.add(Number(compositeMatch[1]));
    }

    const resolved = resolvedByRId.get(layoutKey) ?? null;
    entries.set(storyKey, makeStorySnapshot(kind, storyKey, refIdFromLayoutKey(layoutKey), sections, result, resolved));
  }

  const { rawByVariant, resolvedByVariant } = buildVariantResultMaps(layoutResults, resolvedLayouts);
  for (const pageBinding of pageBindings) {
    const binding = kind === 'header' ? pageBinding.header : pageBinding.footer;
    if (!binding?.storyKey || !binding.refId || !binding.variant || entries.has(binding.storyKey)) {
      continue;
    }

    const fallbackRawLayout = rawByVariant.get(binding.variant);
    if (!fallbackRawLayout) {
      continue;
    }

    entries.set(
      binding.storyKey,
      makeStorySnapshot(
        kind,
        binding.storyKey,
        binding.refId,
        sectionsByStoryKey.get(binding.storyKey) ?? [pageBinding.sectionIndex],
        fallbackRawLayout,
        resolvedByVariant.get(binding.variant) ?? null,
      ),
    );
  }

  return [...entries.values()].sort((a, b) => naturalCompare(a.storyKey, b.storyKey));
}

/**
 * Build the read-only header/footer story-part layout snapshot from current
 * manager state. Pure and side-effect free.
 */
export function buildHeaderFooterLayoutSnapshot(source: HeaderFooterSnapshotSource): HeaderFooterLayoutSnapshot {
  const { pageBindings, sectionsByStoryKey } = buildPageBindings(source);

  return {
    pageBindings,
    storyLayouts: {
      headers: buildStoryLayouts(
        'header',
        pageBindings,
        source.headerLayoutsByRId,
        source.headerLayoutResults,
        source.resolvedHeaderByRId,
        source.resolvedHeaderLayouts,
        sectionsByStoryKey,
      ),
      footers: buildStoryLayouts(
        'footer',
        pageBindings,
        source.footerLayoutsByRId,
        source.footerLayoutResults,
        source.resolvedFooterByRId,
        source.resolvedFooterLayouts,
        sectionsByStoryKey,
      ),
    },
  };
}
