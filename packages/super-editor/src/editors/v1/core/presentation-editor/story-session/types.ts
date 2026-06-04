/**
 * Types for story-backed presentation editing sessions.
 *
 * A "story presentation session" is an interactive layout-mode editing
 * context for a non-body story (header, footer, footnote, endnote, or a
 * future content part). It holds:
 *
 * - the resolved {@link StoryLocator} + {@link StoryRuntime} for the story
 * - the hidden off-screen DOM host that backs the story's ProseMirror editor
 * - the presentation-editor side metadata needed to render caret/selection
 *   overlays and commit back through the parts system on exit
 *
 * This is the generalization of what `HeaderFooterSessionManager` does today
 * for headers/footers, but intentionally story-kind agnostic so future
 * callers (e.g. notes) can reuse the same lifecycle.
 *
 * See `plans/story-backed-parts-presentation-editing.md`.
 */

import type { Editor } from '../../Editor.js';
import type { StoryLocator } from '@superdoc/document-api';
import type { StoryRuntime, StoryKind } from '../../../document-api-adapters/story-runtime/story-types.js';

/**
 * How the session's edits should be persisted back to the canonical part.
 *
 * - `'onExit'` — commit once when the session ends (default).
 * - `'continuous'` — commit on every PM transaction. Reserved for future
 *   collaborative or autosave-style behaviors; not required for the initial
 *   header/footer rollout.
 * - `'manual'` — caller invokes {@link StoryPresentationSession.commit}.
 */
export type StoryCommitPolicy = 'onExit' | 'continuous' | 'manual';

/**
 * A single active interactive editing session for a story-backed part.
 *
 * Sessions are created by {@link StoryPresentationSessionManager.activate}
 * and disposed by {@link StoryPresentationSessionManager.exit}. While active,
 * the session's editor DOM is the target of `PresentationInputBridge` and
 * rendered content is still painted by the layout engine.
 */
export interface StoryPresentationSession {
  /** The locator that was resolved to produce this session. */
  readonly locator: StoryLocator;

  /** The resolved story runtime (owns the editor, commit callback, dispose). */
  readonly runtime: StoryRuntime;

  /**
   * The ProseMirror editor that backs this story while the session is
   * active. For most non-body stories this is a freshly-created headless
   * editor; for live PresentationEditor sub-editors it may be reused.
   */
  readonly editor: Editor;

  /** Broad category of the story (headerFooter, note, body is not valid here). */
  readonly kind: Exclude<StoryKind, 'body'>;

  /**
   * Off-screen wrapper element appended to the DOM. Removed on exit.
   * May be `null` if the session reuses a pre-existing mounted editor
   * whose DOM lifecycle is managed elsewhere.
   */
  readonly hostWrapper: HTMLElement | null;

  /**
   * The element that ProseMirror writes its visible DOM into — this is what
   * `PresentationInputBridge` forwards input events to. For sessions that
   * own a hidden host, this is the inner host element. For reused live
   * sub-editors, it is `editor.view.dom` at activation time.
   */
  readonly domTarget: HTMLElement | null;

  /** Commit policy — how changes persist back to the canonical part. */
  readonly commitPolicy: StoryCommitPolicy;

  /** Whether the session has been deactivated. Set to `true` by the manager on exit. */
  readonly isDisposed: boolean;

  /**
   * Commit the session's changes back through the story runtime's commit
   * callback. No-op if the runtime has no commit hook (e.g., body runtime).
   */
  commit(): void;

  /**
   * Tear down the session: commit if policy says so, dispose the hidden
   * host (if owned), and invoke {@link StoryRuntime.dispose} when present.
   * After calling this, the session's `isDisposed` is `true` and no further
   * commits are performed.
   */
  dispose(): void;
}

/**
 * Options passed when activating a session.
 */
export interface ActivateStorySessionOptions {
  /** Override commit policy. Defaults to `'onExit'`. */
  commitPolicy?: StoryCommitPolicy;

  /**
   * Explicit hidden-host width in layout pixels.
   *
   * When omitted, the session manager falls back to the mount container width.
   */
  hostWidthPx?: number;

  /**
   * Optional session-scoped editor context consumed by the editor factory.
   *
   * This is how visible story context such as page number, visible region size,
   * and surface kind flows into a hidden-host editor instance without baking it
   * into the runtime cache key.
   */
  editorContext?: {
    availableWidth?: number;
    availableHeight?: number;
    currentPageNumber?: number;
    currentPageNumberText?: string;
    currentPageDisplayNumber?: number;
    currentPageChapterNumberText?: string;
    currentPageChapterSeparator?: 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';
    totalPageCount?: number;
    sectionPageCount?: number;
    surfaceKind?: 'header' | 'footer' | 'note' | 'endnote';
  };

  /**
   * When `true`, the manager must create its own hidden host and story
   * editor instead of reusing any live sub-editor that the runtime might
   * already have mounted visibly. PresentationEditor uses this as the
   * canonical editing mode for all story-backed parts.
   *
   * When `false`, the manager may reuse whatever editor the runtime
   * resolves (legacy behavior).
   *
   * @default true
   */
  preferHiddenHost?: boolean;
}
