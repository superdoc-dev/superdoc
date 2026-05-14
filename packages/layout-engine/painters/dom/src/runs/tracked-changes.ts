import type {
  ParagraphAttrs,
  ParagraphBlock,
  Run,
  TextRun,
  TrackedChangeKind,
  TrackedChangesMode,
} from '@superdoc/contracts';
import type { TrackedChangesRenderConfig } from './types.js';

const TRACK_CHANGE_BASE_CLASS: Record<TrackedChangeKind, string> = {
  insert: 'track-insert-dec',
  delete: 'track-delete-dec',
  format: 'track-format-dec',
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
  const meta = textRun.trackedChange;
  if (!meta) {
    return;
  }

  const baseClass = TRACK_CHANGE_BASE_CLASS[meta.kind];
  if (baseClass) {
    elem.classList.add(baseClass);
  }

  const modifier = TRACK_CHANGE_MODIFIER_CLASS[meta.kind]?.[config.mode];
  if (modifier) {
    elem.classList.add(modifier);
  }

  elem.dataset.trackChangeId = meta.id;
  elem.dataset.trackChangeKind = meta.kind;
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
