/**
 * NoteSessionCoordinator — UX for an open footnote/endnote session (SD-3400).
 *
 * Owns the three paint-level behaviors that make a note session feel focused:
 *
 * 1. Highlight: the active note's painted fragments get the
 *    `sd-note-session-active` class (tint + accent bar via painter CSS).
 *    Fragments are rebuilt on every paint, so the class is re-applied from
 *    {@link onPaint} and self-heals when the session ends through any path.
 * 2. Smart scroll: bring the note into view on activation. No-op when the
 *    fragment is already fully visible; freshly inserted notes only paint
 *    after the next relayout, so the request stays pending until the fragment
 *    exists.
 * 3. Emptied-note commit: when the user clears ALL content of a note that
 *    previously had content, exit the session immediately so the commit
 *    (which removes the footnote on both sides) runs without an extra click.
 *    Freshly inserted notes open empty and are exempt until they have held
 *    content, so insert-and-type is unaffected.
 *
 * Everything here is paint-only (classList + scroll) — no layout impact.
 * PresentationEditor delegates via three calls: onActivated / onPaint / onExit.
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { renderedNoteBlockIdPrefixes, type RenderedNoteTarget } from './note-target.js';

const ACTIVE_NOTE_CLASS = 'sd-note-session-active';

type NoteSessionEditorLike = {
  state: { doc: ProseMirrorNode };
  on?: (event: string, callback: () => void) => void;
  off?: (event: string, callback: () => void) => void;
};

export type NoteSessionLike = {
  editor: NoteSessionEditorLike;
};

export interface NoteSessionCoordinatorDeps {
  /** Painted-pages host to query for note fragments. */
  getHost: () => HTMLElement | null;
  /** The element (or window) that actually scrolls the document. */
  getScrollContainer: () => Element | Window | null;
  /** Whether a story session is currently open (self-healing guard). */
  hasActiveSession: () => boolean;
  /** Exits the active story session, committing its content. */
  exitActiveSession: () => void;
}

export class NoteSessionCoordinator {
  #deps: NoteSessionCoordinatorDeps;
  #activeTarget: RenderedNoteTarget | null = null;
  #pendingScrollIntoView = false;

  constructor(deps: NoteSessionCoordinatorDeps) {
    this.#deps = deps;
  }

  /** A note session opened: highlight it and scroll to it. */
  onActivated(target: RenderedNoteTarget, _session: NoteSessionLike): void {
    this.#activeTarget = target;
    this.#refreshHighlight();
    this.#pendingScrollIntoView = true;
    this.#scrollIntoView();
  }

  /** A paint completed: re-apply the highlight, complete any pending scroll. */
  onPaint(): void {
    this.#refreshHighlight();
    this.#scrollIntoView();
  }

  /** The session is exiting: clear all visual state. */
  onExit(): void {
    this.#activeTarget = null;
    this.#pendingScrollIntoView = false;
    this.#refreshHighlight();
  }

  #findActiveFragments(host: HTMLElement): Element[] {
    const target = this.#activeTarget;
    if (!target) return [];
    const prefixes = renderedNoteBlockIdPrefixes(target);
    return Array.from(host.querySelectorAll('[data-block-id]')).filter((el) => {
      const id = el.getAttribute('data-block-id') ?? '';
      return prefixes.some((prefix) => id.startsWith(prefix));
    });
  }

  #refreshHighlight(): void {
    const host = this.#deps.getHost();
    if (!host) return;
    if (this.#activeTarget && !this.#deps.hasActiveSession()) {
      this.#activeTarget = null;
    }
    host.querySelectorAll(`.${ACTIVE_NOTE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_NOTE_CLASS));
    this.#findActiveFragments(host).forEach((el) => el.classList.add(ACTIVE_NOTE_CLASS));
  }

  #scrollIntoView(): void {
    if (!this.#pendingScrollIntoView) return;
    if (!this.#activeTarget) {
      this.#pendingScrollIntoView = false;
      return;
    }
    const host = this.#deps.getHost();
    if (!host) return;
    const fragment = this.#findActiveFragments(host)[0];
    if (!fragment) return; // not painted yet — retried from the next onPaint

    this.#pendingScrollIntoView = false;
    const rect = fragment.getBoundingClientRect();
    const scroller = this.#deps.getScrollContainer();
    const viewport =
      scroller instanceof Window
        ? { top: 0, bottom: scroller.innerHeight }
        : scroller instanceof Element
          ? (() => {
              const r = scroller.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom };
            })()
          : { top: 0, bottom: window.innerHeight };
    const fullyVisible = rect.top >= viewport.top + 8 && rect.bottom <= viewport.bottom - 8;
    if (fullyVisible) return;
    fragment.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
