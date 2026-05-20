/**
 * Editor-neutral layout identity primitives.
 *
 * These types describe rendered fragments and supported objects in terms that
 * do not require ProseMirror. Legacy PM-shaped fields on `Fragment`, `Run`, and
 * `Resolved*Item` (`pmStart`, `pmEnd`, `blockId`) remain available; this
 * module is strictly additive and exists so future editor surfaces can map
 * rendered output back to source state without re-deriving identity through
 * `pmStart`/`pmEnd`.
 *
 * Versioned via `LAYOUT_BOUNDARY_SCHEMA` so downstream consumers (DOM datasets,
 * adapters, paint snapshots) can negotiate a single shape over time.
 */
import type { SourceAnchor } from './index.js';

/**
 * Schema version for the editor-neutral layout boundary substrate.
 *
 * Bump when an additive field becomes load-bearing or a field changes
 * semantics. Pure additive growth (adding optional fields) does not require a
 * bump, but a renamed/typed-change field does.
 */
export const LAYOUT_BOUNDARY_SCHEMA = 'layout-identity/1';

/**
 * Stable opaque identifier for a rendered fragment.
 *
 * The painter writes this as `data-layout-fragment-id` and the layout-bridge
 * neutral hit-test entry points return it. Format is an opaque string; callers
 * MUST NOT parse it. Today it is derived from `blockId` plus the fragment's
 * local position (`fromLine`/`fromRow` / atomic anchor) so it stays stable
 * across re-layouts that preserve a fragment's identity. Future producers may
 * mint stronger ids without invalidating this contract.
 */
export type LayoutFragmentId = string;

/**
 * Story kind for the surface a rendered fragment belongs to.
 *
 * The set mirrors the surfaces SuperDoc currently renders. `'unknown'` is
 * used when the producer cannot classify a fragment yet (for example
 * standalone footnote/endnote stories that have not been wired up to the
 * neutral boundary). Consumers MUST treat `'unknown'` as a diagnostic
 * fallback, not as a default value.
 */
export type LayoutStoryKind = 'body' | 'header' | 'footer' | 'footnote' | 'endnote' | 'unknown';

/**
 * Story locator carried alongside every neutral identity.
 *
 * `id` is set when the producer can name the story (a header/footer part
 * relationship id, a footnote/endnote story id). For body content it is
 * omitted.
 */
export type LayoutStoryLocator = {
  kind: LayoutStoryKind;
  id?: string;
};

/**
 * Reference to the source block a fragment belongs to.
 *
 * Today this is the producer's existing `blockId`. The type is intentionally
 * opaque so a future v2 source provider can substitute a richer reference
 * (e.g. a part-uri / xpath tuple) without reopening the layout boundary
 * contract.
 */
export type LayoutBlockRef = string;

/**
 * Composite editor-neutral identity for a rendered fragment.
 *
 * Carries the minimum information needed to address a rendered fragment
 * without consulting ProseMirror: the story, the source block, the stable
 * fragment id, and (when available) a layout-side cross-reference to the
 * DOCX source anchor that produced the fragment.
 */
export type LayoutSourceIdentity = {
  schema: typeof LAYOUT_BOUNDARY_SCHEMA;
  story: LayoutStoryLocator;
  blockRef: LayoutBlockRef;
  fragmentId: LayoutFragmentId;
  sourceAnchor?: SourceAnchor;
};

export type LayoutPartialRowIdentity = {
  rowIndex?: number;
  fromLineByCell?: readonly number[];
  toLineByCell?: readonly number[];
};

/**
 * Build a `LayoutStoryLocator` for body content.
 */
export const bodyStoryLocator = (): LayoutStoryLocator => ({ kind: 'body' });

/**
 * Build a `LayoutStoryLocator` for an HF / footnote / endnote story.
 */
export const namedStoryLocator = (
  kind: Exclude<LayoutStoryKind, 'body' | 'unknown'>,
  id: string,
): LayoutStoryLocator => (id ? { kind, id } : { kind: 'unknown' });

/**
 * Compute a stable `LayoutFragmentId` for a fragment.
 *
 * Inputs are the values the producer already has on hand. The shape of the
 * output is intentionally opaque; consumers compare ids for equality and
 * round-trip them through DOM datasets, but never parse them.
 */
export const computeLayoutFragmentId = (input: {
  blockId: string;
  story?: LayoutStoryLocator;
  kind: string;
  fromLine?: number;
  toLine?: number;
  fromRow?: number;
  toRow?: number;
  itemId?: string;
  x?: number;
  y?: number;
  partialRow?: LayoutPartialRowIdentity;
}): LayoutFragmentId => {
  const story = input.story ?? bodyStoryLocator();
  const storySegment = story.kind === 'body' ? 'body' : `${story.kind}:${story.id ?? ''}`;
  let variant: string;
  if (input.kind === 'para') {
    variant = `para:${input.fromLine ?? 0}:${input.toLine ?? ''}`;
  } else if (input.kind === 'list-item') {
    variant = `list-item:${input.itemId ?? ''}:${input.fromLine ?? 0}:${input.toLine ?? ''}`;
  } else if (input.kind === 'table') {
    const partialKey = input.partialRow
      ? `:${input.partialRow.rowIndex ?? ''}:${input.partialRow.fromLineByCell?.join(',') ?? ''}-${input.partialRow.toLineByCell?.join(',') ?? ''}`
      : '';
    variant = `table:${input.fromRow ?? 0}:${input.toRow ?? ''}${partialKey}`;
  } else if (input.kind === 'image' || input.kind === 'drawing') {
    variant = `${input.kind}:${input.x ?? ''}:${input.y ?? ''}`;
  } else {
    variant = input.kind;
  }
  return `${storySegment}|${input.blockId}|${variant}`;
};

/**
 * Build a `LayoutSourceIdentity` from producer-known fields.
 */
export const buildLayoutSourceIdentity = (input: {
  blockId: string;
  story?: LayoutStoryLocator;
  kind: string;
  fromLine?: number;
  toLine?: number;
  fromRow?: number;
  toRow?: number;
  itemId?: string;
  x?: number;
  y?: number;
  partialRow?: LayoutPartialRowIdentity;
  sourceAnchor?: SourceAnchor;
}): LayoutSourceIdentity => ({
  schema: LAYOUT_BOUNDARY_SCHEMA,
  story: input.story ?? bodyStoryLocator(),
  blockRef: input.blockId,
  fragmentId: computeLayoutFragmentId(input),
  sourceAnchor: input.sourceAnchor,
});

type LayoutIdentityFragmentLike = {
  kind: string;
  blockId: string;
  layoutSourceIdentity?: LayoutSourceIdentity;
  sourceAnchor?: SourceAnchor;
  fromLine?: number;
  toLine?: number;
  fromRow?: number;
  toRow?: number;
  itemId?: string;
  x?: number;
  y?: number;
  partialRow?: LayoutPartialRowIdentity;
};

const sameStoryLocator = (left: LayoutStoryLocator, right: LayoutStoryLocator): boolean =>
  left.kind === right.kind && (left.id ?? '') === (right.id ?? '');

const shouldKeepExistingIdentity = (existing: LayoutSourceIdentity, story: LayoutStoryLocator | undefined): boolean => {
  if (!story) return true;
  if (sameStoryLocator(existing.story, story)) return true;
  // A body default is not authoritative enough to downgrade an identity that
  // was already produced for a named non-body story.
  return story.kind === 'body' && existing.story.kind !== 'body';
};

/**
 * Build neutral identity from the fragment fields already used by renderer and
 * resolved-layout fragment keys. Keeping this in the contract package prevents
 * drift between DOM datasets, neutral hit tests, and resolved paint items.
 */
export const buildLayoutSourceIdentityForFragment = (
  fragment: LayoutIdentityFragmentLike,
  story?: LayoutStoryLocator,
): LayoutSourceIdentity => {
  const existing = fragment.layoutSourceIdentity;
  if (existing && shouldKeepExistingIdentity(existing, story)) return existing;

  return buildLayoutSourceIdentity({
    blockId: fragment.blockId,
    story: story ?? existing?.story,
    kind: fragment.kind,
    fromLine: fragment.kind === 'para' || fragment.kind === 'list-item' ? fragment.fromLine : undefined,
    toLine: fragment.kind === 'para' || fragment.kind === 'list-item' ? fragment.toLine : undefined,
    fromRow: fragment.kind === 'table' ? fragment.fromRow : undefined,
    toRow: fragment.kind === 'table' ? fragment.toRow : undefined,
    itemId: fragment.kind === 'list-item' ? fragment.itemId : undefined,
    x: fragment.kind === 'image' || fragment.kind === 'drawing' ? fragment.x : undefined,
    y: fragment.kind === 'image' || fragment.kind === 'drawing' ? fragment.y : undefined,
    partialRow: fragment.kind === 'table' ? fragment.partialRow : undefined,
    sourceAnchor: fragment.sourceAnchor ?? existing?.sourceAnchor,
  });
};
