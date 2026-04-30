/**
 * Human-readable story labels for sidebar cards and review UI.
 *
 * Produces strings like:
 *   - Body tracked changes    → `""` (empty — sidebar renders no extra badge)
 *   - Headers / footers       → `"Header"`, `"Footer"`, `"Header · Section 3"`, `"Footer · First page"`
 *   - Footnotes / endnotes    → `"Footnote 12"`, `"Endnote 4"`
 *
 * Labels are strictly informational — they never drive behavior. Identity
 * continues to flow through `storyKey` / `StoryLocator`.
 */

import type { StoryLocator } from '@superdoc/document-api';

export type StoryKind = 'body' | 'headerFooter' | 'footnote' | 'endnote';

/** Coarse classifier for UI decisions (icons, labels, sort groups). */
export function classifyStoryKind(locator: StoryLocator): StoryKind {
  switch (locator.storyType) {
    case 'body':
      return 'body';
    case 'headerFooterSlot':
    case 'headerFooterPart':
      return 'headerFooter';
    case 'footnote':
      return 'footnote';
    case 'endnote':
      return 'endnote';
  }
}

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function variantLabel(variant: 'default' | 'first' | 'even'): string {
  switch (variant) {
    case 'first':
      return 'First page';
    case 'even':
      return 'Even pages';
    case 'default':
      return 'Default';
  }
}

/**
 * Returns a human-readable label describing where the tracked change lives.
 *
 * Body tracked changes return an empty string so the sidebar can render
 * them without an extra location badge.
 */
export function describeStoryLocation(locator: StoryLocator): string {
  switch (locator.storyType) {
    case 'body':
      return '';

    case 'headerFooterSlot': {
      const kind = capitalize(locator.headerFooterKind);
      const variant = variantLabel(locator.variant);
      const section = locator.section.sectionId;
      if (variant === 'Default') return `${kind} · Section ${section}`;
      return `${kind} · Section ${section} · ${variant}`;
    }

    case 'headerFooterPart':
      return `Header/Footer · ${locator.refId}`;

    case 'footnote':
      return `Footnote ${locator.noteId}`;

    case 'endnote':
      return `Endnote ${locator.noteId}`;
  }
}
