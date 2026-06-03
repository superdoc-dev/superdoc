// Side-by-side two-root v1 proof (registry level).
//
// Proves the new runtime architecture can host TWO mounted v1 editor roots in
// one shell registry and route activation, selection reads, and cleanup to the
// correct runtime WITHOUT command/selection/focus leakage between them.
//
// This file exercises the REAL `createV1EditorRuntimeAdapter` (the editor runtime boundary) against
// the REAL `EditorRuntimeRegistry` + `markRuntimeRoot` (the editor runtime boundary), with two
// structurally-typed fake v1 editors standing in for the concrete v1 `Editor`
// (the boundary the adapter delegates to). The SuperDoc-shell integration of the
// same proof (projection + toolbar rebind + `SuperDoc.search` routing + toolbar
// listener non-leakage) lives in `core/SuperDoc.test.js`
// (`side-by-side two-root v1 proof`).
//
// Assertions deliberately observe the REGISTRY + root-marker path
// (`resolveFromEventTarget` → `setActive` → `getActive`), not the legacy
// `onEditorFocus -> setActiveEditor(...)` shortcut, so a green run proves the new
// boundary rather than the pre-existing v1 focus convenience (the runtime contract §6).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorRuntimeRegistry } from './editor-runtime-registry.js';
import type { EditorRuntimeRegistryActiveChange } from './editor-runtime-registry.js';
import { markRuntimeRoot, unmarkRuntimeRoot } from './root-marker.js';
import { createV1EditorRuntimeAdapter } from './v1/v1-editor-runtime-adapter.js';

/** Minimal event emitter for the structural v1 editor (`on`/`off`/`emit`). */
function makeEmitter() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      for (const handler of Array.from(handlers.get(event) ?? [])) handler(...args);
    },
  };
}

/**
 * Structural stand-in for a live v1 `Editor`. Each instance carries its OWN
 * selection text and command spies so cross-root leakage is observable: if a
 * command lands on the wrong editor, the wrong spy fires.
 */
function makeFakeV1Editor(documentId: string, selectionText: string) {
  const emitter = makeEmitter();
  return {
    options: { documentId },
    editorVersion: 1 as const,
    state: {
      doc: { textBetween: (_from: number, _to: number, _sep?: string) => selectionText },
      selection: { from: 0, to: selectionText.length, empty: selectionText.length === 0 },
    },
    commands: {
      search: vi.fn(() => [{ documentId }]),
      goToSearchResult: vi.fn(() => true),
      insertContent: vi.fn(() => true),
    },
    view: { focus: vi.fn() },
    focus: vi.fn(),
    on: emitter.on,
    off: emitter.off,
    emit: emitter.emit,
    async exportDocx() {
      return new ArrayBuffer(0);
    },
  };
}

interface TwoRootSetup {
  registry: EditorRuntimeRegistry;
  rootA: HTMLElement;
  rootB: HTMLElement;
  innerA: HTMLElement;
  innerB: HTMLElement;
  editorA: ReturnType<typeof makeFakeV1Editor>;
  editorB: ReturnType<typeof makeFakeV1Editor>;
  rtA: ReturnType<typeof createV1EditorRuntimeAdapter>['runtime'];
  rtB: ReturnType<typeof createV1EditorRuntimeAdapter>['runtime'];
  attachA: ReturnType<typeof createV1EditorRuntimeAdapter>['attachPresentationEditor'];
  attachB: ReturnType<typeof createV1EditorRuntimeAdapter>['attachPresentationEditor'];
  teardown: () => void;
}

/**
 * Mount two real v1 runtimes in one registry: two shell-owned host roots, each
 * marked with its runtime id, each wrapping its own fake v1 editor.
 */
function setupTwoRoots(): TwoRootSetup {
  const registry = new EditorRuntimeRegistry();

  const rootA = document.createElement('div');
  const rootB = document.createElement('div');
  const innerA = document.createElement('span');
  const innerB = document.createElement('span');
  rootA.appendChild(innerA);
  rootB.appendChild(innerB);
  document.body.append(rootA, rootB);

  const editorA = makeFakeV1Editor('doc-a', 'alpha selection');
  const editorB = makeFakeV1Editor('doc-b', 'beta selection');

  const idA = 'v1:doc-a:1';
  const idB = 'v1:doc-b:1';

  const a = createV1EditorRuntimeAdapter({
    id: idA,
    documentId: 'doc-a',
    root: rootA,
    editor: editorA,
    onUnregister: (id) => registry.unregister(id),
  });
  const b = createV1EditorRuntimeAdapter({
    id: idB,
    documentId: 'doc-b',
    root: rootB,
    editor: editorB,
    onUnregister: (id) => registry.unregister(id),
  });

  // the editor runtime boundary owns the marker; the editor runtime boundary stamps it on the shell host root. Here we
  // verify both roots carry the shell-owned marker (the runtime contract, §5.2).
  markRuntimeRoot(rootA, a.runtime.id);
  markRuntimeRoot(rootB, b.runtime.id);
  registry.register(a.runtime);
  registry.register(b.runtime);

  const teardown = () => {
    rootA.remove();
    rootB.remove();
    registry.clear();
  };

  return {
    registry,
    rootA,
    rootB,
    innerA,
    innerB,
    editorA,
    editorB,
    rtA: a.runtime,
    rtB: b.runtime,
    attachA: a.attachPresentationEditor,
    attachB: b.attachPresentationEditor,
    teardown,
  };
}

let active: TwoRootSetup | null = null;
afterEach(() => {
  active?.teardown();
  active = null;
});

describe('two v1 roots register through the shell registry', () => {
  it('mounts two real v1 runtimes, each with its own shell-owned root marker', () => {
    active = setupTwoRoots();
    const { registry, rootA, rootB, rtA, rtB } = active;

    expect(registry.getAll()).toEqual([rtA, rtB]);
    // Two distinct documents, two distinct roots, two distinct markers.
    expect(rtA.documentId).toBe('doc-a');
    expect(rtB.documentId).toBe('doc-b');
    expect(rootA.getAttribute('data-superdoc-runtime-id')).toBe(rtA.id);
    expect(rootB.getAttribute('data-superdoc-runtime-id')).toBe(rtB.id);
    // No active runtime until an explicit activation (no mount-order flakiness).
    expect(registry.getActive()).toBeNull();
  });
});

describe('registry-observed activation via concrete events', () => {
  it('resolveFromEventTarget + focusin inside a marked root activates the right runtime', () => {
    active = setupTwoRoots();
    const { registry, innerA, innerB, rtA, rtB } = active;

    // Shell root-level focus capture may set the active runtime : a
    // single listener routes focusin → resolveFromEventTarget → setActive. This
    // is the registry path, NOT the legacy onEditorFocus shortcut.
    const route = (event: Event) => {
      const runtime = registry.resolveFromEventTarget(event.target);
      if (runtime) registry.setActive(runtime.id, 'focusin');
    };
    document.addEventListener('focusin', route);

    // Explicitly activate A, then B (the runtime contract -  avoid mount-order assumptions).
    expect(registry.resolveFromEventTarget(innerA)).toBe(rtA);
    innerA.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(registry.getActive()).toBe(rtA);

    expect(registry.resolveFromEventTarget(innerB)).toBe(rtB);
    innerB.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(registry.getActive()).toBe(rtB);

    document.removeEventListener('focusin', route);
  });

  it('pointerdown inside a marked root activates the right runtime (no hover)', () => {
    active = setupTwoRoots();
    const { registry, innerA, innerB, rtA, rtB } = active;

    const route = (event: Event) => {
      const runtime = registry.resolveFromEventTarget(event.target);
      if (runtime) registry.setActive(runtime.id, 'pointerdown');
    };
    document.addEventListener('pointerdown', route);

    innerB.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(registry.getActive()).toBe(rtB);
    innerA.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(registry.getActive()).toBe(rtA);

    document.removeEventListener('pointerdown', route);
  });

  it('a pointerdown outside any marked root does not change the active runtime', () => {
    active = setupTwoRoots();
    const { registry, rtA } = active;
    registry.setActive(rtA.id, 'focus');

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const route = (event: Event) => {
      const runtime = registry.resolveFromEventTarget(event.target);
      if (runtime) registry.setActive(runtime.id, 'pointerdown');
    };
    document.addEventListener('pointerdown', route);

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // Active runtime is unchanged: routing is a no-op outside a marked root.
    expect(registry.getActive()).toBe(rtA);

    document.removeEventListener('pointerdown', route);
    outside.remove();
  });
});

describe('selection reads target the active root', () => {
  it('selected text + selection snapshot come from the active runtime, not the other root', () => {
    active = setupTwoRoots();
    const { registry, rtA, rtB } = active;

    registry.setActive(rtA.id, 'focus');
    expect(registry.getActive()!.getSelectedText()).toBe('alpha selection');
    const snapA = registry.getActive()!.getSelectionSnapshot();
    expect(snapA?.text).toBe('alpha selection');
    // Opaque endpoint tokens are minted by the ACTIVE runtime (round-trip safe).
    expect(snapA?.anchor?.runtimeId).toBe(rtA.id);

    // Switch active root: reads follow the active runtime with no bleed-through.
    registry.setActive(rtB.id, 'focus');
    expect(registry.getActive()!.getSelectedText()).toBe('beta selection');
    const snapB = registry.getActive()!.getSelectionSnapshot();
    expect(snapB?.text).toBe('beta selection');
    expect(snapB?.anchor?.runtimeId).toBe(rtB.id);
  });
});

describe('deferred the editor runtime boundary capability allowlist', () => {
  // Find/replace, AI, comments, tracked changes, and toolbar state events are
  // intentionally not offered by the v1 adapter yet. This proof records that
  // allowlist explicitly: search/find command routing is still proven through
  // the legacy `activeEditor` projection that follows the active runtime.
  it('the v1 adapter reports find/replace, comments, tracked-changes, AI, toolbar-state as not offered', () => {
    active = setupTwoRoots();
    const caps = active.rtA.getCapabilities();
    expect(caps.findReplace).toBeUndefined();
    expect(caps.comments).toBeUndefined();
    expect(caps.trackedChanges).toBeUndefined();
    expect(caps.ai).toBeUndefined();
    expect(caps.toolbar).toBeUndefined();
    // The find-session snapshot reader is likewise absent (not faked).
    expect(active.rtA.getFindSessionSnapshot).toBeUndefined();
  });

  it('comment navigation is deferred: reveal({kind:"comment"}) rejects target-unsupported', async () => {
    active = setupTwoRoots();
    active.attachA({ focus: vi.fn(), scrollToPosition: vi.fn(() => true), on: vi.fn(), off: vi.fn() });
    const result = await active.rtA.reveal({ kind: 'comment', commentId: 'c1' });
    expect(result.status).toBe('rejected');
    expect(result.status === 'rejected' && result.reason).toBe('target-unsupported');
  });
});

describe('unmount cleanup + stability', () => {
  it('unmounting the ACTIVE root clears active state, emits next=null, and does NOT auto-promote', () => {
    active = setupTwoRoots();
    const { registry, rootA, rtA, rtB } = active;

    registry.setActive(rtA.id, 'focus');
    expect(registry.getActive()).toBe(rtA);

    const changes: EditorRuntimeRegistryActiveChange[] = [];
    registry.subscribe((c) => changes.push(c));

    // Active root unmounts (its v1 editor emits destroy → adapter dispose →
    // onUnregister → registry.unregister). Disposing the adapter is the realistic
    // teardown signal.
    rtA.dispose();

    expect(registry.getActive()).toBeNull();
    expect(registry.getActiveId()).toBeNull();
    expect(changes).toHaveLength(1);
    expect(changes[0].previousRuntimeId).toBe(rtA.id);
    expect(changes[0].nextRuntimeId).toBeNull();
    expect(changes[0].legacyEditorProjection).toBeNull();
    // The surviving root B is still registered but NOT silently promoted.
    expect(registry.get(rtB.id)).toBe(rtB);
    expect(registry.getActive()).not.toBe(rtB);
    // The marker is cleared from the unmounted host root.
    unmarkRuntimeRoot(rootA);
    expect(rootA.getAttribute('data-superdoc-runtime-id')).toBeNull();
  });

  it('unmounting an INACTIVE root leaves the active runtime and selection reads untouched', () => {
    active = setupTwoRoots();
    const { registry, rtA, rtB } = active;

    registry.setActive(rtA.id, 'focus');
    const listener = vi.fn();
    registry.subscribe(listener);

    // Inactive root B unmounts.
    rtB.dispose();

    expect(registry.getActive()).toBe(rtA);
    expect(registry.getActiveId()).toBe(rtA.id);
    // No active-change event fired (B was not active).
    expect(listener).not.toHaveBeenCalled();
    // Active root reads still resolve to A.
    expect(registry.getActive()!.getSelectedText()).toBe('alpha selection');
    expect(registry.get(rtB.id)).toBeNull();
  });
});
