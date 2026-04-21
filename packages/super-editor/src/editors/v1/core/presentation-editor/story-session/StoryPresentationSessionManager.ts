/**
 * StoryPresentationSessionManager
 *
 * Owns the active interactive editing session for a story-backed part
 * (header, footer, or future note/endnote). This is the generalization of
 * `HeaderFooterSessionManager`'s session-lifecycle responsibilities, split
 * out from the header/footer region/layout code so future story kinds can
 * reuse it.
 *
 * Responsibilities:
 * - Resolve a {@link StoryLocator} to a {@link StoryRuntime} through the
 *   caller-supplied resolver (so the manager doesn't reach across the
 *   document-api-adapters package boundary directly).
 * - Create a hidden off-screen host and mount a story editor into it when
 *   the runtime does not already have a visible editor we can reuse.
 * - Expose the active editor's DOM as the target for
 *   `PresentationInputBridge`.
 * - Commit and dispose on exit.
 *
 * What it deliberately does NOT do (left to callers / future phases):
 * - Region discovery or section-aware slot materialization (lives in the
 *   header/footer-specific adapter).
 * - Caret/selection rendering (Phase 3 of the plan).
 * - Pointer hit-testing (lives in EditorInputManager / region providers).
 *
 * See `plans/story-backed-parts-presentation-editing.md`.
 */

import type { StoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../Editor.js';
import type { StoryRuntime } from '../../../document-api-adapters/story-runtime/story-types.js';
import type { StoryPresentationSession, ActivateStorySessionOptions, StoryCommitPolicy } from './types.js';
import { createStoryHiddenHost } from './createStoryHiddenHost.js';
import { registerLiveStorySessionRuntime } from '../../../document-api-adapters/story-runtime/live-story-session-runtime-registry.js';

/**
 * Creates (or returns) the ProseMirror editor that should back an active
 * session for a given runtime. May return a fresh editor mounted into a
 * freshly-created hidden host, or the runtime's existing editor.
 */
export interface StorySessionEditorFactoryInput {
  /** The resolved story runtime. */
  runtime: StoryRuntime;
  /** The element the story editor should be mounted into, if headless. */
  hostElement: HTMLElement;
  /** Activation-time options for the session being created. */
  activationOptions: ActivateStorySessionOptions;
}

export interface StorySessionEditorFactoryResult {
  /** The editor that should be used for the session. */
  editor: Editor;
  /**
   * Optional teardown to run when the session is disposed. Only set when
   * the factory created a fresh editor; reused editors are owned elsewhere.
   */
  dispose?: () => void;
}

/** Factory used by the manager to obtain a mountable story editor. */
export type StorySessionEditorFactory = (input: StorySessionEditorFactoryInput) => StorySessionEditorFactoryResult;

/**
 * Constructor options for {@link StoryPresentationSessionManager}.
 */
export interface StoryPresentationSessionManagerOptions {
  /**
   * Resolve a locator to a {@link StoryRuntime}. In production this wraps
   * `resolveStoryRuntime(hostEditor, locator, { intent: 'write' })`; in
   * tests it can be any mock.
   */
  resolveRuntime: (locator: StoryLocator) => StoryRuntime;

  /**
   * Returns the host element the session will mount into. Defaults to the
   * container the session manager was given on construction, but may be
   * overridden per session (e.g., a page-local overlay).
   */
  getMountContainer: () => HTMLElement | null;

  /**
   * Optional factory for creating the session editor. When omitted the
   * manager uses the runtime's existing editor (appending the hidden host
   * is still performed, but ProseMirror's DOM lives wherever the runtime
   * originally placed it). Most callers will pass a factory that invokes
   * `createStoryEditor` to mount a fresh editor into the hidden host.
   */
  editorFactory?: StorySessionEditorFactory;

  /**
   * Called after the active session changes (activate, exit, dispose).
   * Consumers use this to notify `PresentationInputBridge`.
   */
  onActiveSessionChanged?: (session: StoryPresentationSession | null) => void;
}

/**
 * Manages the lifecycle of a single active story-backed editing session.
 *
 * The first rollout assumes only one session is active at a time; if two
 * activations overlap, the current session is disposed before the new one
 * is activated.
 */
export class StoryPresentationSessionManager {
  #options: StoryPresentationSessionManagerOptions;
  #active: MutableStorySession | null = null;

  constructor(options: StoryPresentationSessionManagerOptions) {
    this.#options = options;
  }

  /** Returns the active session, or `null` if none is active. */
  getActiveSession(): StoryPresentationSession | null {
    return this.#active;
  }

  /**
   * Returns the DOM element that should receive forwarded input events
   * while a session is active, or `null` if there is no active session.
   */
  getActiveEditorDomTarget(): HTMLElement | null {
    return this.#active?.domTarget ?? null;
  }

  /**
   * Activate a session for the given locator. If a session is already
   * active, it is disposed first.
   */
  activate(locator: StoryLocator, options: ActivateStorySessionOptions = {}): StoryPresentationSession {
    if (this.#active) this.exit();

    const runtime = this.#options.resolveRuntime(locator);
    if (runtime.kind === 'body') {
      throw new Error('StoryPresentationSessionManager cannot host a body runtime.');
    }

    const preferHiddenHost = options.preferHiddenHost !== false;
    const commitPolicy: StoryCommitPolicy = options.commitPolicy ?? 'onExit';

    let hostWrapper: HTMLElement | null = null;
    let editor = runtime.editor;
    let factoryDispose: (() => void) | undefined;
    let sessionBeforeDispose: (() => void) | undefined;

    if (preferHiddenHost && this.#options.editorFactory) {
      const mountContainer = this.#options.getMountContainer();
      if (!mountContainer) {
        throw new Error('StoryPresentationSessionManager: no mount container available for hidden host.');
      }
      const doc = mountContainer.ownerDocument ?? document;
      const width = options.hostWidthPx ?? mountContainer.clientWidth ?? 1;
      const hidden = createStoryHiddenHost(doc, width, {
        storyKey: runtime.storyKey,
        storyKind: runtime.kind,
      });
      mountContainer.appendChild(hidden.wrapper);
      const factoryResult = this.#options.editorFactory({
        runtime,
        hostElement: hidden.host,
        activationOptions: options,
      });
      editor = factoryResult.editor;
      factoryDispose = factoryResult.dispose;
      hostWrapper = hidden.wrapper;
    }

    if (commitPolicy === 'continuous' && typeof editor.on === 'function') {
      const handleTransaction = ({ transaction }: { transaction?: { docChanged?: boolean } }) => {
        if (transaction?.docChanged) {
          session.commit();
        }
      };
      editor.on('transaction', handleTransaction);
      sessionBeforeDispose = () => {
        editor.off?.('transaction', handleTransaction);
      };
    }

    const domTarget = (editor.view?.dom as HTMLElement | undefined) ?? hostWrapper ?? null;
    const hostEditor = resolveSessionHostEditor(editor, runtime);
    const unregisterRuntime = registerLiveStorySessionRuntime(hostEditor, runtime, editor);

    const session = new MutableStorySession({
      locator,
      runtime,
      editor,
      kind: runtime.kind as Exclude<typeof runtime.kind, 'body'>,
      hostWrapper,
      domTarget,
      commitPolicy,
      shouldDisposeRuntime: runtime.cacheable === false,
      beforeDispose: sessionBeforeDispose,
      unregisterRuntime,
      teardown: () => {
        try {
          factoryDispose?.();
        } finally {
          if (hostWrapper && hostWrapper.parentNode) {
            hostWrapper.parentNode.removeChild(hostWrapper);
          }
        }
      },
    });

    this.#active = session;
    this.#options.onActiveSessionChanged?.(session);
    return session;
  }

  /**
   * Deactivate the current session. Safe to call when no session is active.
   * Commits (if policy says so) and disposes the hidden host.
   */
  exit(): void {
    const active = this.#active;
    if (!active) return;
    this.#active = null;
    try {
      active.dispose();
    } finally {
      this.#options.onActiveSessionChanged?.(null);
    }
  }

  /**
   * Dispose the manager and any active session.
   */
  destroy(): void {
    this.exit();
  }
}

// ---------------------------------------------------------------------------
// Mutable session record — the concrete object that implements the
// StoryPresentationSession contract exposed to callers.
// ---------------------------------------------------------------------------

interface MutableStorySessionInit {
  locator: StoryLocator;
  runtime: StoryRuntime;
  editor: Editor;
  kind: Exclude<StoryRuntime['kind'], 'body'>;
  hostWrapper: HTMLElement | null;
  domTarget: HTMLElement | null;
  commitPolicy: StoryCommitPolicy;
  shouldDisposeRuntime: boolean;
  afterActivate?: () => void;
  beforeDispose?: () => void;
  unregisterRuntime: () => void;
  teardown: () => void;
}

class MutableStorySession implements StoryPresentationSession {
  readonly locator: StoryLocator;
  readonly runtime: StoryRuntime;
  readonly editor: Editor;
  readonly kind: Exclude<StoryRuntime['kind'], 'body'>;
  readonly hostWrapper: HTMLElement | null;
  readonly domTarget: HTMLElement | null;
  readonly commitPolicy: StoryCommitPolicy;

  #disposed = false;
  #shouldDisposeRuntime: boolean;
  #beforeDispose?: () => void;
  #unregisterRuntime: () => void;
  #teardown: () => void;

  constructor(init: MutableStorySessionInit) {
    this.locator = init.locator;
    this.runtime = init.runtime;
    this.editor = init.editor;
    this.kind = init.kind;
    this.hostWrapper = init.hostWrapper;
    this.domTarget = init.domTarget;
    this.commitPolicy = init.commitPolicy;
    this.#shouldDisposeRuntime = init.shouldDisposeRuntime;
    this.#beforeDispose = init.beforeDispose;
    this.#unregisterRuntime = init.unregisterRuntime;
    this.#teardown = init.teardown;
    init.afterActivate?.();
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  commit(): void {
    if (this.#disposed) return;
    const hostEditor = getHostEditor(this.editor) ?? getHostEditor(this.runtime.editor) ?? this.runtime.editor;
    if (this.runtime.commitEditor) {
      this.runtime.commitEditor(hostEditor, this.editor);
      return;
    }
    this.runtime.commit?.(hostEditor);
  }

  dispose(): void {
    if (this.#disposed) return;
    try {
      if (this.commitPolicy === 'onExit') this.commit();
    } finally {
      this.#disposed = true;
      try {
        this.#beforeDispose?.();
      } finally {
        try {
          this.#unregisterRuntime();
        } finally {
          try {
            if (this.#shouldDisposeRuntime) {
              this.runtime.dispose?.();
            }
          } finally {
            this.#teardown();
          }
        }
      }
    }
  }
}

/**
 * Retrieve the parent/host editor from a story editor when present.
 *
 * `createStoryEditor` stores the parent editor as a non-enumerable
 * `parentEditor` getter on `options`. When present we prefer it so the
 * commit callback runs against the body editor the runtime was resolved
 * for.
 */
function getHostEditor(editor: Editor): Editor | null {
  const options = editor.options as Partial<{ parentEditor: Editor }>;
  return options?.parentEditor ?? null;
}

function resolveSessionHostEditor(editor: Editor, runtime: StoryRuntime): Editor {
  return getHostEditor(editor) ?? getHostEditor(runtime.editor) ?? runtime.editor;
}
