/**
 * Stable dependency classes that an incremental page checkpoint may fence.
 *
 * This list is proof metadata, never a feature switch. Producers must name
 * every retained dependency that required the checkpoint; consumers reject
 * empty, duplicate, or unknown lists instead of trusting a generic boolean.
 */
export type PageCheckpointDependencyClass =
  | 'multiple-sections'
  | 'furniture-page-tokens'
  | 'non-balanceable-multi-column-sections'
  | 'body-anchored-objects'
  | 'non-flowing-page-relative-body-anchors'
  | 'footnotes'
  | 'page-references'
  | 'keep-constraints'
  | 'tables'
  | 'furniture-anchored-objects';

export const PAGE_CHECKPOINT_DEPENDENCY_CLASSES = Object.freeze([
  'multiple-sections',
  'furniture-page-tokens',
  'non-balanceable-multi-column-sections',
  'body-anchored-objects',
  'non-flowing-page-relative-body-anchors',
  'footnotes',
  'page-references',
  'keep-constraints',
  'tables',
  'furniture-anchored-objects',
] as const satisfies readonly PageCheckpointDependencyClass[]);

/**
 * Exact retained-generation proof for page/margin-relative body anchors that
 * cannot influence paragraph flow (`wrap=None`). The host builds this once
 * from a canonical layout generation; warm consumers validate the epoch,
 * inventory, identities, and page ownership before admitting bounded layout.
 */
export type NonFlowingPageRelativeAnchorDependencyProof = {
  version: 1;
  sourceLayoutEpoch: number;
  inventoryFingerprint: string;
  entries: readonly {
    blockId: string;
    carrierParagraphId: string;
    sourcePageIndex: number;
    sectionIndex: number;
    geometryFingerprint: string;
    measureFingerprint: string;
    pageGeometryFingerprint: string;
  }[];
};

export function areValidPageCheckpointDependencyClasses(
  value: unknown,
): value is readonly PageCheckpointDependencyClass[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const allowed = new Set<string>(PAGE_CHECKPOINT_DEPENDENCY_CLASSES);
  const observed = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || observed.has(item)) return false;
    observed.add(item);
  }
  return true;
}
