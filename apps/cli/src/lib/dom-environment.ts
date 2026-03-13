/**
 * CLI DOM environment backed by happy-dom.
 *
 * Provides a minimal `Document` instance for headless Editor sessions that
 * need DOM APIs (HTML import/export, content override, structured insert).
 *
 * ## Lifecycle
 *
 * ```ts
 * const env = createCliDomEnvironment();
 * const editor = await Editor.open(source, { document: env.document });
 * // ... use editor ...
 * env.dispose();
 * ```
 *
 * ## DOM injection strategy
 *
 * Always pass `env.document` via `EditorOptions.document`. This bypasses the
 * memoized `canUseDOM()` check in super-editor — no globals are set on
 * `globalThis`, so the CLI stays free of side-effects.
 *
 * ## Known edge: `globalThis.Element` instanceof
 *
 * `createDocFromHTML` checks `parsedContent instanceof globalThis.Element`.
 * Because we inject DOM via `options.document` (not via globals), the happy-dom
 * `Element` class may differ from `globalThis.Element`. In current defaults
 * this only affects unsupported-content detection, not core HTML parsing.
 */

import { Window } from 'happy-dom';

export interface CliDomEnvironment {
  /** The happy-dom `Document` to pass as `EditorOptions.document`. */
  document: Document;
  /** Release the happy-dom window and all associated resources. */
  dispose(): void;
}

/**
 * Create an isolated DOM environment for a single CLI document session.
 *
 * Each call creates a fresh `Window` — callers must call `dispose()` when
 * the session is complete to avoid memory leaks in long-lived host processes.
 */
export function createCliDomEnvironment(): CliDomEnvironment {
  const window = new Window();

  return {
    document: window.document as unknown as Document,
    dispose() {
      window.happyDOM.abort();
      window.close();
    },
  };
}
