import type { Editor } from '../../core/Editor.js';
import type { StoryRuntime } from './story-types.js';

/**
 * A registered interactive story session.
 *
 * While a story session is active, tracked-change resolution and other
 * document-api calls must target the session editor the user is typing in,
 * not an older cached runtime editor.
 */
interface LiveStorySessionRegistration {
  storyKey: string;
  editor: Editor;
  runtime: StoryRuntime;
}

const liveSessionsByHost = new WeakMap<Editor, Map<string, LiveStorySessionRegistration>>();

function getOrCreateLiveSessionMap(hostEditor: Editor): Map<string, LiveStorySessionRegistration> {
  let sessions = liveSessionsByHost.get(hostEditor);
  if (!sessions) {
    sessions = new Map();
    liveSessionsByHost.set(hostEditor, sessions);
  }
  return sessions;
}

function buildLiveSessionRuntime(registration: LiveStorySessionRegistration): StoryRuntime {
  const { runtime, editor } = registration;

  return {
    ...runtime,
    editor,
    cacheable: false,
    commit:
      runtime.commitEditor == null
        ? runtime.commit
        : (hostEditor: Editor) => {
            runtime.commitEditor?.(hostEditor, editor);
          },
  };
}

/**
 * Register the currently active editor for a story session.
 *
 * Returns a cleanup callback that only unregisters the session if the same
 * editor is still registered for that story key.
 */
export function registerLiveStorySessionRuntime(hostEditor: Editor, runtime: StoryRuntime, editor: Editor): () => void {
  const sessions = getOrCreateLiveSessionMap(hostEditor);
  const storyKey = runtime.storyKey;

  sessions.set(storyKey, {
    storyKey,
    editor,
    runtime,
  });

  return () => {
    unregisterLiveStorySessionRuntime(hostEditor, storyKey, editor);
  };
}

/**
 * Resolve the interactive runtime for a story session, if one is active.
 */
export function resolveLiveStorySessionRuntime(hostEditor: Editor, storyKey: string): StoryRuntime | null {
  const registration = liveSessionsByHost.get(hostEditor)?.get(storyKey);
  if (!registration) return null;
  return buildLiveSessionRuntime(registration);
}

/**
 * Commits all currently active live story sessions for a host editor.
 *
 * Export paths operate on the host editor's canonical converter / OOXML
 * state. When a user is mid-edit in a hidden-host story session, that live
 * editor may contain newer content than the converter cache. Flush the
 * registered session editors first so host-level exports include those edits
 * without requiring the UI session to exit.
 *
 * @returns The number of live sessions that were committed.
 */
export function commitLiveStorySessionRuntimes(hostEditor: Editor): number {
  const sessions = liveSessionsByHost.get(hostEditor);
  if (!sessions || sessions.size === 0) {
    return 0;
  }

  let committedCount = 0;
  for (const registration of [...sessions.values()]) {
    buildLiveSessionRuntime(registration).commit?.(hostEditor);
    committedCount += 1;
  }

  return committedCount;
}

/**
 * Remove a registered interactive runtime.
 *
 * When `editor` is provided, the registration is removed only if it still
 * points to that editor. This prevents a stale disposer from clearing a
 * newer activation for the same story.
 */
export function unregisterLiveStorySessionRuntime(hostEditor: Editor, storyKey: string, editor?: Editor): void {
  const sessions = liveSessionsByHost.get(hostEditor);
  if (!sessions) return;

  const registration = sessions.get(storyKey);
  if (!registration) return;
  if (editor && registration.editor !== editor) return;

  sessions.delete(storyKey);

  if (sessions.size === 0) {
    liveSessionsByHost.delete(hostEditor);
  }
}

/**
 * Visible for tests.
 */
export function getLiveStorySessionCount(hostEditor: Editor): number {
  return liveSessionsByHost.get(hostEditor)?.size ?? 0;
}
