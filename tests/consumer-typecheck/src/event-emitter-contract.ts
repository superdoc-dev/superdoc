/**
 * Consumer typecheck: EventEmitter typed payloads vs unknown fallback
 * (SD-3213 EventEmitter drain).
 *
 * The local `EventEmitter` (used by `Editor`, `PresentationEditor`,
 * `Whiteboard`, etc.) had `DefaultEventMap = Record<string, any[]>`,
 * which leaked `any[]` through every untyped event subscription on the
 * public surface. SD-3213 tightened the default to
 * `Record<string, unknown[]>`.
 *
 * This fixture pins both sides of the intended contract:
 *
 * - **Known typed events keep precise payloads.** `EditorEventMap`
 *   declares `commentsLoaded: [{ editor: Editor; comments: Comment[]; ... }]`.
 *   After the drain, `editor.on('commentsLoaded', cb)` still types `cb`'s
 *   payload as the precise tuple; `comments` is still `Comment[]`.
 * - **Untyped events fall through to `unknown[]`, not `any[]`.** Calling
 *   `editor.on('arbitraryEventName', cb)` (not in `EditorEventMap`)
 *   now gives `cb: (...args: unknown[]) => void`. Accessing `.foo` on
 *   an `unknown` argument is a TS error, proven by `@ts-expect-error`.
 *
 * If a future PR widens the default back to `any[]` (or narrows a typed
 * event), one of these assertions stops erroring (TS2578) and tsc fails.
 */

import type { Comment, Editor } from 'superdoc';

declare const editor: Editor;

// --- Negative assertion: untyped event payloads are unknown, not any --------

editor.on('arbitraryEventName', (...args) => {
  // `args` is `unknown[]` after SD-3213. Accessing a property without
  // narrowing must error. If args slips back to `any[]`, the
  // directive on the line below becomes unused and tsc fails (TS2578).
  // @ts-expect-error SD-3213: arbitrary event args are unknown[], not any[]
  args[0].toUpperCase();

  // Narrowing first works fine (proves the type is `unknown`, not `never`).
  const first = args[0];
  if (typeof first === 'string') {
    void first.toUpperCase();
  }
});

// --- Positive assertion: known typed event payload retains shape -----------

editor.on('commentsLoaded', (payload) => {
  // `EditorEventMap.commentsLoaded` is typed as
  // `[{ editor: Editor; replacedFile?: boolean; comments: Comment[] }]`.
  // The drain must not regress this.
  const editorRef: Editor = payload.editor;
  const comments: Comment[] = payload.comments;
  const replacedFile: boolean | undefined = payload.replacedFile;
  void editorRef;
  void comments;
  void replacedFile;
});
