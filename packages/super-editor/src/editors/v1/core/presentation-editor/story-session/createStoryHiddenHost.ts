/**
 * Hidden-host factory for story-backed presentation editing sessions.
 *
 * Story editors need the same scroll-isolated, off-screen, focusable host
 * as the body editor. Rather than re-implementing that contract, this helper
 * delegates to {@link createHiddenHost} and adds a story-specific className
 * so the two hosts are easy to tell apart in DevTools and in tests.
 *
 * The returned wrapper must be appended to the DOM before the story editor
 * is created, and removed (or left for disposal) when the session exits.
 */

import { createHiddenHost, type HiddenHostElements } from '../dom/HiddenHost.js';

/** Class name added to the story hidden host for introspection/testing. */
export const STORY_HIDDEN_HOST_CLASS = 'presentation-editor__story-hidden-host';

/** Class name added to the story wrapper for introspection/testing. */
export const STORY_HIDDEN_HOST_WRAPPER_CLASS = 'presentation-editor__story-hidden-host-wrapper';

/**
 * Options for creating a story hidden host.
 */
export interface CreateStoryHiddenHostOptions {
  /**
   * Identifier used as `data-story-key` on the host. Purely informational —
   * makes it trivial to see in DevTools which story a hidden host belongs to.
   */
  storyKey?: string;
  /**
   * Identifier used as `data-story-kind` on the host (e.g., `"headerFooter"`,
   * `"note"`).
   */
  storyKind?: string;
}

/**
 * Creates an off-screen hidden host for a story editor.
 *
 * The host preserves the same accessibility invariants as the body hidden
 * host (focusable, present in a11y tree, not `aria-hidden`,
 * not `visibility: hidden`).
 */
export function createStoryHiddenHost(
  doc: Document,
  widthPx: number,
  options: CreateStoryHiddenHostOptions = {},
): HiddenHostElements {
  const { wrapper, host } = createHiddenHost(doc, widthPx);
  wrapper.classList.add(STORY_HIDDEN_HOST_WRAPPER_CLASS);
  host.classList.add(STORY_HIDDEN_HOST_CLASS);
  if (options.storyKey) host.setAttribute('data-story-key', options.storyKey);
  if (options.storyKind) host.setAttribute('data-story-kind', options.storyKind);
  return { wrapper, host };
}
