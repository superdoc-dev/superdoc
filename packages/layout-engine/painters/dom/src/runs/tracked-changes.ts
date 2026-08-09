import {
  isConfigurableSemanticColorKey,
  type ParagraphAttrs,
  type Run,
  type TextRun,
  type TrackedChangeKind,
  type TrackedChangeMeta,
  type TrackedChangeSemanticColorKey,
  type TrackedChangesMode,
} from '@superdoc/contracts';
import type { TrackedChangesRenderConfig } from './types.js';

export const TRACK_CHANGE_BASE_CLASS: Record<TrackedChangeKind, string> = {
  insert: 'track-insert-dec',
  delete: 'track-delete-dec',
  format: 'track-format-dec',
};
const TRACK_CHANGE_OVERLAP_INSERT_DELETE_CLASS = 'track-overlap-insert-delete-dec';

/** Alpha (0-255) applied to a resolved color to derive tracked-change backgrounds. */
const TRACK_CHANGE_BACKGROUND_ALPHA = 0x22;
const TRACK_CHANGE_BACKGROUND_FOCUSED_ALPHA = 0x44;

const expandHexColor = (hex: string): string | null => {
  const normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    return normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (normalized.length === 6 || normalized.length === 8) {
    return normalized.slice(0, 6);
  }
  return null;
};

/**
 * Derives a translucent background from a base color by appending an 8-digit
 * hex alpha. Returns null when it is not a hex string the painter can safely
 * extend (e.g. `rgb(...)`, named colors); the border/text still carry the
 * author color in that case.
 */
const colorWithAlpha = (color: string, alpha: number): string | null => {
  const expanded = color.trim().startsWith('#') ? expandHexColor(color.trim()) : null;
  if (!expanded) return null;
  const alphaHex = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return `#${expanded}${alphaHex}`;
};

const setColorVar = (elem: HTMLElement, name: string, value: string): void => {
  elem.style.setProperty(name, value);
};

/**
 * Resolve the color used for the kind-level tracked-change CSS variable family.
 *
 * Plain insertion/deletion semantic colors are the default change-kind palette.
 * When an author color is present it remains the visible insert/delete/format
 * highlight color. Side/structural semantic categories (`move-from`,
 * `table-insertion`, `table-cell-insertion`, `cell-merge`, etc.) are explicit
 * semantic paint roles and keep semantic precedence.
 */
export const resolveTrackedChangeVisualColor = (layer: TrackedChangeMeta): string | undefined => {
  const key = layer.semanticColorKey;
  const semanticOwnsVisual = Boolean(key && key !== 'insertion' && key !== 'deletion');
  if (semanticOwnsVisual) return layer.semanticColor ?? layer.color;
  return layer.color ?? layer.semanticColor;
};

/**
 * Stamps the element-scoped CSS variable family for a single tracked-change
 * layer from its resolved visual color. `meta.color` remains the per-author
 * color and is still surfaced separately as `data-track-change-author-color`.
 * The painter reads only paint-ready metadata; color resolution (overrides /
 * resolver / fallback) happened upstream in layout-adapter. Focused backgrounds
 * are derived from the visual color with alpha and only when it is a hex string
 * `colorWithAlpha` can safely extend (named/non-hex visual colors still set
 * border/text but never fabricate a derived background).
 */
export const applyTrackedChangeColorVariables = (elem: HTMLElement, layer: TrackedChangeMeta): void => {
  // CSS-only categories (table structure) are colored by the stylesheet rules
  // keyed on `data-track-change-semantic-color-key`, themed via the
  // `--sd-tracked-changes-table-*` variables. These layers never carry a
  // JS-resolved semanticColor; stamping inline element vars here (from the
  // author color) would beat any `:root` CSS override, so skip entirely.
  if (layer.semanticColorKey && !isConfigurableSemanticColorKey(layer.semanticColorKey)) return;
  const color = resolveTrackedChangeVisualColor(layer);
  if (!color) return;
  const background = colorWithAlpha(color, TRACK_CHANGE_BACKGROUND_ALPHA);
  const backgroundFocused = colorWithAlpha(color, TRACK_CHANGE_BACKGROUND_FOCUSED_ALPHA);
  const semanticColor = layer.semanticColor;
  const semanticBackground = semanticColor ? colorWithAlpha(semanticColor, TRACK_CHANGE_BACKGROUND_ALPHA) : null;
  const semanticBackgroundFocused = semanticColor
    ? colorWithAlpha(semanticColor, TRACK_CHANGE_BACKGROUND_FOCUSED_ALPHA)
    : null;
  const semanticOwnsVisual = Boolean(semanticColor && color === semanticColor);
  if (semanticColor) {
    setColorVar(elem, '--sd-tracked-changes-semantic-color', semanticColor);
    if (semanticBackground) {
      setColorVar(elem, '--sd-tracked-changes-semantic-background', semanticBackground);
    }
    if (semanticBackgroundFocused) {
      setColorVar(elem, '--sd-tracked-changes-semantic-background-focused', semanticBackgroundFocused);
    }
  }
  switch (layer.kind) {
    case 'insert':
      setColorVar(elem, '--sd-tracked-changes-insert-border', color);
      if (semanticOwnsVisual) {
        setColorVar(elem, '--sd-tracked-changes-insert-text', color);
        if (background) {
          setColorVar(elem, '--sd-tracked-changes-insert-background', background);
        }
      }
      if (backgroundFocused) {
        setColorVar(elem, '--sd-tracked-changes-insert-background-focused', backgroundFocused);
      }
      break;
    case 'delete':
      setColorVar(elem, '--sd-tracked-changes-delete-border', color);
      if (semanticOwnsVisual && background) {
        setColorVar(elem, '--sd-tracked-changes-delete-background', background);
      }
      if (backgroundFocused) {
        setColorVar(elem, '--sd-tracked-changes-delete-background-focused', backgroundFocused);
      }
      setColorVar(elem, '--sd-tracked-changes-delete-text', color);
      break;
    case 'format':
      setColorVar(elem, '--sd-tracked-changes-format-border', color);
      if (backgroundFocused) {
        setColorVar(elem, '--sd-tracked-changes-format-background-focused', backgroundFocused);
      }
      break;
    default:
      break;
  }
};

export const TRACK_CHANGE_MODIFIER_CLASS: Record<TrackedChangeKind, Record<TrackedChangesMode, string | undefined>> = {
  insert: {
    review: 'highlighted',
    original: 'hidden',
    final: 'normal',
    off: undefined,
  },
  delete: {
    review: 'highlighted',
    original: 'normal',
    final: 'hidden',
    off: undefined,
  },
  format: {
    review: 'highlighted',
    original: 'before',
    final: 'normal',
    off: undefined,
  },
};

/**
 * Stable DOM class per semantic tracked-change category. The class name
 * matches the canonical {@link TrackedChangeSemanticColorKey} so downstream
 * UI/tests can identify the rendered move side or cell-structural type without
 * reparsing comment metadata.
 */
const TRACK_CHANGE_SEMANTIC_CLASS: Record<TrackedChangeSemanticColorKey, string> = {
  insertion: 'insertion',
  deletion: 'deletion',
  move: 'move',
  'move-from': 'move-from',
  'move-to': 'move-to',
  'table-insertion': 'table-insertion',
  'table-deletion': 'table-deletion',
  'table-row-insertion': 'table-row-insertion',
  'table-row-deletion': 'table-row-deletion',
  'table-cell-insertion': 'table-cell-insertion',
  'table-cell-deletion': 'table-cell-deletion',
  'table-split': 'table-split',
  'cell-merge': 'cell-merge',
  'cell-split': 'cell-split',
  'image-insertion': 'image-insertion',
  'image-deletion': 'image-deletion',
  'image-property-change': 'image-property-change',
};

/**
 * Stamps the semantic class + datasets for a tracked-change layer. Shared by
 * inline, row-level, and cell-level paint paths so the dataset/class vocabulary
 * stays identical. Only fields that are present are stamped; this never reads
 * or writes the author `color` dataset. The semantic datasets are namespaced
 * (`data-track-change-semantic-*`, `-type`, `-subtype`, `-target-kind`,
 * `-semantic-anchor-scope`) so they never collide with the existing author/
 * structural datasets even when row + cell metadata coexist.
 */
export const applySemanticTrackedChangeMetadata = (elem: HTMLElement, meta: TrackedChangeMeta): void => {
  const key = meta.semanticColorKey;
  if (key) {
    const semanticClass = TRACK_CHANGE_SEMANTIC_CLASS[key];
    if (semanticClass) {
      elem.classList.add(semanticClass);
    }
    elem.dataset.trackChangeSemanticColorKey = key;
  }
  if (meta.semanticColor) {
    elem.dataset.trackChangeSemanticColor = meta.semanticColor;
  }
  if (meta.type) {
    elem.dataset.trackChangeType = meta.type;
  }
  if (meta.subtype) {
    elem.dataset.trackChangeSubtype = meta.subtype;
  }
  if (meta.targetKind) {
    elem.dataset.trackChangeTargetKind = meta.targetKind;
  }
  if (meta.semanticAnchorScope) {
    elem.dataset.trackChangeSemanticAnchorScope = meta.semanticAnchorScope;
  }
};

type InsertDeleteOverlap = {
  parentInsert: TrackedChangeMeta;
  childDelete: TrackedChangeMeta;
};

type TrackedChangeCarrier = Partial<Pick<TextRun, 'trackedChange' | 'trackedChanges'>>;
type TrackedChangeDecoratable = Run | TrackedChangeCarrier;

export const getTrackedChangeLayers = (carrier: TrackedChangeDecoratable): TrackedChangeMeta[] => {
  const trackedCarrier = carrier as TrackedChangeCarrier;
  if (Array.isArray(trackedCarrier.trackedChanges) && trackedCarrier.trackedChanges.length > 0) {
    return trackedCarrier.trackedChanges;
  }
  return trackedCarrier.trackedChange ? [trackedCarrier.trackedChange] : [];
};

const resolveInsertDeleteOverlap = (layers: TrackedChangeMeta[]): InsertDeleteOverlap | undefined => {
  for (const parentInsert of layers) {
    if (parentInsert.kind !== 'insert') {
      continue;
    }
    const childDelete = layers.find((layer) => layer.kind === 'delete' && layer.overlapParentId === parentInsert.id);
    if (childDelete) {
      return { parentInsert, childDelete };
    }
  }
  return undefined;
};

export const resolveTrackedChangesConfig = (block: { attrs?: unknown }): TrackedChangesRenderConfig => {
  const attrs = (block.attrs as ParagraphAttrs | undefined) ?? {};
  const mode = (attrs.trackedChangesMode as TrackedChangesMode | undefined) ?? 'review';
  const enabled = attrs.trackedChangesEnabled !== false;
  return { mode, enabled };
};

/**
 * Marks a row-level tracked-change cell so block-context CSS (cell tint /
 * strikethrough / collapse) can target it without colliding with the inline
 * `.track-insert-dec` / `.track-delete-dec` span rules.
 */
const TRACK_CHANGE_ROW_CELL_CLASS = 'track-row-cell-dec';

/**
 * Marks a cell-level tracked-change cell (SD-3481 `TableCellAttrs.trackedChange`)
 * so block-context CSS can target cell-structural decorations without colliding
 * with the inline `.track-insert-dec` span rules or the row-level
 * `.track-row-cell-dec` rules. Parallel to {@link TRACK_CHANGE_ROW_CELL_CLASS}.
 */
const TRACK_CHANGE_CELL_CLASS = 'track-cell-dec';

/**
 * Applies a structural row-level tracked change (inserted/deleted whole row) to
 * a single table cell element, reusing the exact same machinery as inline runs:
 * the shared {@link TrackedChangeMeta}, the `TRACK_CHANGE_BASE_CLASS`
 * (`track-insert-dec` / `track-delete-dec`), the `TRACK_CHANGE_MODIFIER_CLASS`
 * mode map (insert → review:highlighted / original:hidden / final:normal;
 * delete → review:highlighted / original:normal / final:hidden), and
 * `applyTrackedChangeColorVariables` for the tracked-change CSS variable family
 * (author colors own plain insert/delete highlights; semantic categories own
 * move/table/cell visuals).
 *
 * The painter renders a row as cells appended to a container (there is no
 * `<tr>` element), so the row's tracked-change visual is applied to each cell.
 * Boundary-safe: this lives in the painter and only reads paint-ready
 * `TrackedChangeMeta` from contracts.
 *
 * @param elem - The cell element to decorate.
 * @param meta - The row's resolved tracked-change metadata.
 * @param config - Tracked-changes mode/enabled (same source inline runs use).
 */
export const applyRowTrackedChangeToCell = (
  elem: HTMLElement,
  meta: TrackedChangeMeta,
  config: TrackedChangesRenderConfig,
): void => {
  if (!config.enabled || config.mode === 'off') {
    return;
  }
  if (meta.kind !== 'insert' && meta.kind !== 'delete') {
    return;
  }

  const baseClass = TRACK_CHANGE_BASE_CLASS[meta.kind];
  if (baseClass) {
    elem.classList.add(baseClass);
  }
  elem.classList.add(TRACK_CHANGE_ROW_CELL_CLASS);

  const modifier = TRACK_CHANGE_MODIFIER_CLASS[meta.kind]?.[config.mode];
  if (modifier) {
    elem.classList.add(modifier);
  }

  applyTrackedChangeColorVariables(elem, meta);

  elem.dataset.trackChangeId = meta.id;
  elem.dataset.trackChangeKind = meta.kind;
  elem.dataset.trackChangeStructural = 'row';
  // No 'body' default: the projector stamps 'body' for genuine body stories, so
  // a missing key means the owning story is UNKNOWN. Defaulting it to body
  // would let a header/footer carrier win body-scoped carrier searches
  // (IT-1250); carrier matching treats an absent key as body only outside
  // header/footer containers.
  if (meta.storyKey) {
    elem.dataset.storyKey = meta.storyKey;
  }
  if (meta.author) {
    elem.dataset.trackChangeAuthor = meta.author;
  }
  if (meta.authorEmail) {
    elem.dataset.trackChangeAuthorEmail = meta.authorEmail;
  }
  if (meta.color) {
    elem.dataset.trackChangeAuthorColor = meta.color;
  }
  if (meta.date) {
    elem.dataset.trackChangeDate = meta.date;
  }
  applySemanticTrackedChangeMetadata(elem, meta);
};

/**
 * Applies a cell-level structural tracked change (SD-3481
 * `TableCellAttrs.trackedChange`: cell insertion/deletion, merge, or split) to a
 * single table cell element. Mirrors {@link applyRowTrackedChangeToCell} but
 * carries its own marker class {@link TRACK_CHANGE_CELL_CLASS} so cell-level CSS
 * never affects inline spans or row-level decorations, and supports the
 * `format` kind (merge/split paint through the `--sd-tracked-changes-format-*`
 * family).
 *
 * Visual color uses {@link resolveTrackedChangeVisualColor} via
 * {@link applyTrackedChangeColorVariables}; semantic class/datasets come from
 * {@link applySemanticTrackedChangeMetadata}.
 *
 * Coexistence with a row-level tracked change: when this cell already carries a
 * row-level decoration (`track-row-cell-dec`), the row keeps ownership of the
 * shared single-value datasets and same-kind color variable family (row
 * precedence). Different-kind cell metadata still stamps its own independent
 * variable family (for example format vars for a cell merge inside an inserted
 * row), and the semantic datasets/classes are always added so neither
 * structural marker is dropped.
 *
 * @param elem - The cell element to decorate.
 * @param meta - The cell's resolved tracked-change metadata.
 * @param config - Tracked-changes mode/enabled (same source inline runs use).
 */
export const applyCellTrackedChangeToCell = (
  elem: HTMLElement,
  meta: TrackedChangeMeta,
  config: TrackedChangesRenderConfig,
): void => {
  if (!config.enabled || config.mode === 'off') {
    return;
  }

  const hasRowDecoration = elem.classList.contains(TRACK_CHANGE_ROW_CELL_CLASS);

  const baseClass = TRACK_CHANGE_BASE_CLASS[meta.kind];
  if (baseClass) {
    elem.classList.add(baseClass);
  }
  elem.classList.add(TRACK_CHANGE_CELL_CLASS);

  const modifier = TRACK_CHANGE_MODIFIER_CLASS[meta.kind]?.[config.mode];
  if (modifier) {
    elem.classList.add(modifier);
  }

  const rowOwnsSameColorFamily = hasRowDecoration && elem.dataset.trackChangeKind === meta.kind;

  // Row precedence: don't clobber the row-level same-kind color variable family
  // when both structural markers are present. Different tracked-change kinds use
  // independent variable families and can be stamped safely.
  if (!rowOwnsSameColorFamily) {
    applyTrackedChangeColorVariables(elem, meta);
  }
  applySemanticTrackedChangeMetadata(elem, meta);

  const existingStructural = elem.dataset.trackChangeStructural;
  elem.dataset.trackChangeStructural =
    existingStructural && existingStructural !== 'cell' ? `${existingStructural} cell` : 'cell';
  // Row-level metadata (when present) keeps ownership of these shared
  // single-value datasets; a cell-only change sets them itself.
  if (!elem.dataset.trackChangeId) {
    elem.dataset.trackChangeId = meta.id;
  }
  if (!elem.dataset.trackChangeKind) {
    elem.dataset.trackChangeKind = meta.kind;
  }
  // No 'body' default for a missing story key (see applyRowTrackedChangeToCell).
  if (!elem.dataset.storyKey && meta.storyKey) {
    elem.dataset.storyKey = meta.storyKey;
  }
  if (meta.author && !elem.dataset.trackChangeAuthor) {
    elem.dataset.trackChangeAuthor = meta.author;
  }
  if (meta.authorEmail && !elem.dataset.trackChangeAuthorEmail) {
    elem.dataset.trackChangeAuthorEmail = meta.authorEmail;
  }
  if (meta.color && !elem.dataset.trackChangeAuthorColor) {
    elem.dataset.trackChangeAuthorColor = meta.color;
  }
  if (meta.date && !elem.dataset.trackChangeDate) {
    elem.dataset.trackChangeDate = meta.date;
  }
};

export const applyTrackedChangeDecorations = (
  elem: HTMLElement,
  run: TrackedChangeDecoratable,
  config: TrackedChangesRenderConfig,
): void => {
  if (!config.enabled || config.mode === 'off') {
    return;
  }

  const layers = getTrackedChangeLayers(run);
  if (layers.length === 0) {
    return;
  }
  const overlap = resolveInsertDeleteOverlap(layers);
  const trackedCarrier = run as TrackedChangeCarrier;
  const meta = overlap?.parentInsert ?? trackedCarrier.trackedChange ?? layers[0]!;

  layers.forEach((layer) => {
    const baseClass = TRACK_CHANGE_BASE_CLASS[layer.kind];
    if (baseClass) {
      elem.classList.add(baseClass);
    }

    const modifier = TRACK_CHANGE_MODIFIER_CLASS[layer.kind]?.[config.mode];
    if (modifier) {
      elem.classList.add(modifier);
    }

    // Stamp the CSS variable family for this layer's kind from the resolved
    // visual color. Overlapping layers each contribute their own kind family.
    applyTrackedChangeColorVariables(elem, layer);
  });

  if (overlap) {
    elem.classList.add(TRACK_CHANGE_OVERLAP_INSERT_DELETE_CLASS);
    elem.dataset.trackChangePreferredTargetId = overlap.childDelete.id;
  }

  elem.dataset.trackChangeId = meta.id;
  elem.dataset.trackChangeKind = meta.kind;
  elem.dataset.trackChangeIds = layers.map((layer) => layer.id).join(',');
  elem.dataset.trackChangeKinds = layers.map((layer) => layer.kind).join(',');
  // No 'body' default for a missing story key (see applyRowTrackedChangeToCell).
  if (meta.storyKey) {
    elem.dataset.storyKey = meta.storyKey;
  }
  if (meta.author) {
    elem.dataset.trackChangeAuthor = meta.author;
  }
  if (meta.authorEmail) {
    elem.dataset.trackChangeAuthorEmail = meta.authorEmail;
  }
  if (meta.authorImage) {
    elem.dataset.trackChangeAuthorImage = meta.authorImage;
  }
  if (meta.color) {
    elem.dataset.trackChangeAuthorColor = meta.color;
  }
  if (meta.date) {
    elem.dataset.trackChangeDate = meta.date;
  }
  applySemanticTrackedChangeMetadata(elem, meta);
  // track-change-focused class is applied post-paint by CommentHighlightDecorator.
};
