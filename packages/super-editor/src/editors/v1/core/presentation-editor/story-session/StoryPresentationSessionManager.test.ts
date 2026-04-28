import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StoryPresentationSessionManager } from './StoryPresentationSessionManager.js';
import type { StoryRuntime } from '../../../document-api-adapters/story-runtime/story-types.js';
import type { Editor } from '../../Editor.js';
import type { StoryLocator } from '@superdoc/document-api';
import {
  getLiveStorySessionCount,
  resolveLiveStorySessionRuntime,
} from '../../../document-api-adapters/story-runtime/live-story-session-runtime-registry.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------
//
// The session manager only interacts with the runtime's commit / dispose
// hooks and with `editor.view.dom` when a DOM target is needed. Everything
// else is delegated to caller-supplied callbacks, so a bare-minimum
// Editor-shaped stub is sufficient.

type StubEditor = Pick<Editor, 'view' | 'on' | 'off'> & {
  options?: { parentEditor?: StubEditor };
  emitTransaction?: (docChanged?: boolean) => void;
};

function makeStubEditor(dom: HTMLElement | null): StubEditor {
  const transactionListeners = new Set<(payload: { transaction: { docChanged: boolean } }) => void>();
  return {
    view: dom ? ({ dom } as unknown as Editor['view']) : undefined,
    on(event, handler) {
      if (event === 'transaction') {
        transactionListeners.add(handler as (payload: { transaction: { docChanged: boolean } }) => void);
      }
    },
    off(event, handler) {
      if (event === 'transaction' && handler) {
        transactionListeners.delete(handler as (payload: { transaction: { docChanged: boolean } }) => void);
      }
    },
    emitTransaction(docChanged = true) {
      transactionListeners.forEach((listener) => listener({ transaction: { docChanged } }));
    },
  } as StubEditor;
}

function makeStubLocator(): StoryLocator {
  return { kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' };
}

function makeStubRuntime(editor: StubEditor, overrides: Partial<StoryRuntime> = {}): StoryRuntime {
  return {
    locator: makeStubLocator(),
    storyKey: 'story:headerFooterPart:rId7',
    editor: editor as unknown as Editor,
    kind: 'headerFooter',
    ...overrides,
  };
}

function makeHostEditor(): Editor {
  return { state: { doc: { content: { size: 10 } } } } as unknown as Editor;
}

describe('StoryPresentationSessionManager', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('refuses to host a body runtime', () => {
    const editor = makeStubEditor(document.createElement('div'));
    const runtime: StoryRuntime = {
      locator: { kind: 'story', storyType: 'body' },
      storyKey: 'story:body',
      editor: editor as unknown as Editor,
      kind: 'body',
    };

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    expect(() => manager.activate({ kind: 'story', storyType: 'body' })).toThrow(/cannot host a body runtime/);
  });

  it('activates a session, tracks its editor DOM, and exits cleanly', () => {
    const dom = document.createElement('div');
    const editor = makeStubEditor(dom);
    const runtime = makeStubRuntime(editor);

    const onChange = vi.fn();

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
      onActiveSessionChanged: onChange,
    });

    expect(manager.getActiveSession()).toBeNull();
    expect(manager.getActiveEditorDomTarget()).toBeNull();

    const session = manager.activate(makeStubLocator());
    expect(session.kind).toBe('headerFooter');
    expect(session.locator.storyType).toBe('headerFooterPart');
    expect(manager.getActiveSession()).toBe(session);
    expect(manager.getActiveEditorDomTarget()).toBe(dom);
    expect(onChange).toHaveBeenLastCalledWith(session);

    manager.exit();
    expect(manager.getActiveSession()).toBeNull();
    expect(manager.getActiveEditorDomTarget()).toBeNull();
    expect(session.isDisposed).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('disposes the previous session when a new session activates over it', () => {
    const first = makeStubRuntime(makeStubEditor(document.createElement('div')), {
      dispose: vi.fn(),
      cacheable: false,
    });
    const second = makeStubRuntime(makeStubEditor(document.createElement('div')), {
      dispose: vi.fn(),
      cacheable: false,
    });

    const runtimes = [first, second];
    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtimes.shift()!,
      getMountContainer: () => container,
    });

    const s1 = manager.activate(makeStubLocator());
    expect(s1.isDisposed).toBe(false);

    manager.activate(makeStubLocator());
    expect(s1.isDisposed).toBe(true);
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('commits on exit when commitPolicy is onExit (default)', () => {
    const commit = vi.fn();
    const editor = makeStubEditor(document.createElement('div'));
    const runtime = makeStubRuntime(editor, { commit });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    manager.activate(makeStubLocator());
    expect(commit).not.toHaveBeenCalled();

    manager.exit();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('does not commit on exit when commitPolicy is manual', () => {
    const commit = vi.fn();
    const editor = makeStubEditor(document.createElement('div'));
    const runtime = makeStubRuntime(editor, { commit });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    manager.activate(makeStubLocator(), { commitPolicy: 'manual' });
    manager.exit();
    expect(commit).not.toHaveBeenCalled();
  });

  it('manual commit() invokes the runtime.commit callback', () => {
    const commit = vi.fn();
    const editor = makeStubEditor(document.createElement('div'));
    const runtime = makeStubRuntime(editor, { commit });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    const session = manager.activate(makeStubLocator(), { commitPolicy: 'manual' });
    session.commit();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('manual commit() prefers runtime.commitEditor with the session editor', () => {
    const runtimeEditor = makeStubEditor(document.createElement('div'));
    const sessionEditor = makeStubEditor(document.createElement('div'));
    const commitEditor = vi.fn();
    const runtime = makeStubRuntime(runtimeEditor, { commitEditor });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
      editorFactory: () => ({ editor: sessionEditor as unknown as Editor }),
    });

    const session = manager.activate(makeStubLocator(), { commitPolicy: 'manual' });
    session.commit();
    expect(commitEditor).toHaveBeenCalledWith(expect.anything(), sessionEditor);
  });

  it('does not dispose cacheable runtimes on exit', () => {
    const editor = makeStubEditor(document.createElement('div'));
    const dispose = vi.fn();
    const runtime = makeStubRuntime(editor, { dispose, cacheable: true });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    manager.activate(makeStubLocator());
    manager.exit();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes non-cacheable runtimes on exit', () => {
    const editor = makeStubEditor(document.createElement('div'));
    const dispose = vi.fn();
    const runtime = makeStubRuntime(editor, { dispose, cacheable: false });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    manager.activate(makeStubLocator());
    manager.exit();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('commits on doc-changing transactions when commitPolicy is continuous', () => {
    const commit = vi.fn();
    const editor = makeStubEditor(document.createElement('div'));
    const runtime = makeStubRuntime(editor, { commit });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    const session = manager.activate(makeStubLocator(), { commitPolicy: 'continuous' });
    editor.emitTransaction?.(true);
    editor.emitTransaction?.(false);

    expect(commit).toHaveBeenCalledTimes(1);
    manager.exit();
    expect(session.isDisposed).toBe(true);
  });

  it('appends a hidden-host wrapper and tears it down on exit when an editorFactory is supplied', () => {
    const dom = document.createElement('div');
    const freshEditor = makeStubEditor(dom);
    const runtime = makeStubRuntime(makeStubEditor(null));

    const factory = vi.fn((input) => {
      // The factory should be handed a hidden host element to mount into.
      expect(input.hostElement).toBeInstanceOf(HTMLElement);
      expect(input.hostElement.classList.contains('presentation-editor__story-hidden-host')).toBe(true);
      return { editor: freshEditor as unknown as Editor };
    });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
      editorFactory: factory,
    });

    const session = manager.activate(makeStubLocator());
    expect(factory).toHaveBeenCalledTimes(1);
    expect(session.hostWrapper).not.toBeNull();
    expect(session.hostWrapper?.parentNode).toBe(container);
    expect(session.domTarget).toBe(dom);

    manager.exit();
    expect(session.hostWrapper?.parentNode).toBeNull();
  });

  it('destroy() deactivates any active session', () => {
    const editor = makeStubEditor(document.createElement('div'));
    const runtime = makeStubRuntime(editor);

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
    });

    const session = manager.activate(makeStubLocator());
    manager.destroy();
    expect(session.isDisposed).toBe(true);
    expect(manager.getActiveSession()).toBeNull();
  });

  it('throws a clear error when hidden-host activation has no mount container', () => {
    const runtime = makeStubRuntime(makeStubEditor(document.createElement('div')));
    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => null,
      editorFactory: () => ({ editor: makeStubEditor(document.createElement('div')) as unknown as Editor }),
    });
    expect(() => manager.activate(makeStubLocator())).toThrow(/no mount container/);
  });

  it('allows runtime reuse without a mount container when preferHiddenHost is false', () => {
    const dom = document.createElement('div');
    const runtime = makeStubRuntime(makeStubEditor(dom));
    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => null,
    });

    const session = manager.activate(makeStubLocator(), { preferHiddenHost: false });
    expect(session.editor).toBe(runtime.editor);
    expect(session.hostWrapper).toBeNull();
    expect(session.domTarget).toBe(dom);
  });

  it('registers the active session editor as the live story runtime and unregisters it on exit', () => {
    const hostEditor = makeHostEditor();
    const runtimeEditor = makeStubEditor(document.createElement('div'));
    runtimeEditor.options = { parentEditor: hostEditor as unknown as StubEditor };

    const sessionEditor = makeStubEditor(document.createElement('div'));
    sessionEditor.options = { parentEditor: hostEditor as unknown as StubEditor };

    const runtime = makeStubRuntime(runtimeEditor, {
      locator: { kind: 'story', storyType: 'footnote', noteId: '8' },
      storyKey: 'fn:8',
      kind: 'note',
    });

    const manager = new StoryPresentationSessionManager({
      resolveRuntime: () => runtime,
      getMountContainer: () => container,
      editorFactory: () => ({ editor: sessionEditor as unknown as Editor }),
    });

    manager.activate(runtime.locator);

    const liveRuntime = resolveLiveStorySessionRuntime(hostEditor, 'fn:8');
    expect(liveRuntime?.editor).toBe(sessionEditor);
    expect(getLiveStorySessionCount(hostEditor)).toBe(1);

    manager.exit();

    expect(resolveLiveStorySessionRuntime(hostEditor, 'fn:8')).toBeNull();
    expect(getLiveStorySessionCount(hostEditor)).toBe(0);
  });
});
