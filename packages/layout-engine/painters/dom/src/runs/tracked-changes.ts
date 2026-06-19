import type {
  ParagraphAttrs,
  ParagraphBlock,
  Run,
  TextRun,
  TrackedChangeKind,
  TrackedChangeMeta,
  TrackedChangesMode,
} from '@superdoc/contracts';
import type { TrackedChangesRenderConfig } from './types.js';

const TRACK_CHANGE_BASE_CLASS: Record<TrackedChangeKind, string> = {
  insert: 'track-insert-dec',
  delete: 'track-delete-dec',
  format: 'track-format-dec',
};
const TRACK_CHANGE_OVERLAP_INSERT_DELETE_CLASS = 'track-overlap-insert-delete-dec';

/** Alpha (0-255) applied to an author color to derive the focused background. */
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
 * Stamps the element-scoped CSS variable family for a single tracked-change
 * layer from its resolved `meta.color`. The painter reads only `meta.color`;
 * color resolution (overrides / resolver / fallback) happened upstream in
 * layout-adapter. Backgrounds are derived from the base color with alpha.
 */
const applyAuthorColorVariables = (elem: HTMLElement, layer: TrackedChangeMeta): void => {
  const color = layer.color;
  if (!color) return;
  const backgroundFocused = colorWithAlpha(color, TRACK_CHANGE_BACKGROUND_FOCUSED_ALPHA);
  switch (layer.kind) {
    case 'insert':
      setColorVar(elem, '--sd-tracked-changes-insert-border', color);
      if (backgroundFocused) {
        setColorVar(elem, '--sd-tracked-changes-insert-background-focused', backgroundFocused);
      }
      break;
    case 'delete':
      setColorVar(elem, '--sd-tracked-changes-delete-border', color);
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

const TRACK_CHANGE_MODIFIER_CLASS: Record<TrackedChangeKind, Record<TrackedChangesMode, string | undefined>> = {
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

type InsertDeleteOverlap = {
  parentInsert: TrackedChangeMeta;
  childDelete: TrackedChangeMeta;
};

export const getTrackedChangeLayers = (run: TextRun): TrackedChangeMeta[] => {
  if (Array.isArray(run.trackedChanges) && run.trackedChanges.length > 0) {
    return run.trackedChanges;
  }
  return run.trackedChange ? [run.trackedChange] : [];
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

export const resolveTrackedChangesConfig = (block: ParagraphBlock): TrackedChangesRenderConfig => {
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
 * Applies a structural row-level tracked change (inserted/deleted whole row) to
 * a single table cell element, reusing the exact same machinery as inline runs:
 * the shared {@link TrackedChangeMeta}, the `TRACK_CHANGE_BASE_CLASS`
 * (`track-insert-dec` / `track-delete-dec`), the `TRACK_CHANGE_MODIFIER_CLASS`
 * mode map (insert → review:highlighted / original:hidden / final:normal;
 * delete → review:highlighted / original:normal / final:hidden), and
 * `applyAuthorColorVariables` for the per-author color CSS variable family.
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

  applyAuthorColorVariables(elem, meta);

  elem.dataset.trackChangeId = meta.id;
  elem.dataset.trackChangeKind = meta.kind;
  elem.dataset.trackChangeStructural = 'row';
  elem.dataset.storyKey = meta.storyKey ?? 'body';
  if (meta.author) {
    elem.dataset.trackChangeAuthor = meta.author;
  }
  if (meta.authorEmail) {
    elem.dataset.trackChangeAuthorEmail = meta.authorEmail;
  }
  if (meta.date) {
    elem.dataset.trackChangeDate = meta.date;
  }
};

export const applyTrackedChangeDecorations = (
  elem: HTMLElement,
  run: Run,
  config: TrackedChangesRenderConfig,
): void => {
  if (!config.enabled || config.mode === 'off') {
    return;
  }

  const textRun = run as TextRun;
  const layers = getTrackedChangeLayers(textRun);
  if (layers.length === 0) {
    return;
  }
  const overlap = resolveInsertDeleteOverlap(layers);
  const meta = overlap?.parentInsert ?? textRun.trackedChange ?? layers[0]!;

  layers.forEach((layer) => {
    const baseClass = TRACK_CHANGE_BASE_CLASS[layer.kind];
    if (baseClass) {
      elem.classList.add(baseClass);
    }

    const modifier = TRACK_CHANGE_MODIFIER_CLASS[layer.kind]?.[config.mode];
    if (modifier) {
      elem.classList.add(modifier);
    }

    // Stamp the per-author CSS variable family for this layer's kind from the
    // resolved color. Overlapping layers each contribute their own kind family.
    applyAuthorColorVariables(elem, layer);
  });

  if (overlap) {
    elem.classList.add(TRACK_CHANGE_OVERLAP_INSERT_DELETE_CLASS);
    elem.dataset.trackChangePreferredTargetId = overlap.childDelete.id;
  }

  elem.dataset.trackChangeId = meta.id;
  elem.dataset.trackChangeKind = meta.kind;
  elem.dataset.trackChangeIds = layers.map((layer) => layer.id).join(',');
  elem.dataset.trackChangeKinds = layers.map((layer) => layer.kind).join(',');
  elem.dataset.storyKey = meta.storyKey ?? 'body';
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
  // track-change-focused class is applied post-paint by CommentHighlightDecorator (super-editor).
};
