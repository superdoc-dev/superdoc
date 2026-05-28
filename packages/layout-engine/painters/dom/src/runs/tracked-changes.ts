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
  if (meta.date) {
    elem.dataset.trackChangeDate = meta.date;
  }
  // track-change-focused class is applied post-paint by CommentHighlightDecorator (super-editor).
};
