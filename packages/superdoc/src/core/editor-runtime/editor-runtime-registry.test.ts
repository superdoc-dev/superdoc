// Editor runtime registry + active routing unit tests.
//
// Uses the fake v1-like and v2-like runtimes from the editor runtime boundary conformance
// fixtures so the registry is exercised against real contract shapes WITHOUT
// importing any concrete v1/v2 editor. Real adapter wiring is owned by the editor runtime boundary.

import { describe, expect, it, vi } from 'vitest';
import { EditorRuntimeRegistry } from './editor-runtime-registry.js';
import type { EditorRuntimeRegistryActiveChange } from './editor-runtime-registry.js';
import { markRuntimeRoot } from './root-marker.js';
import { createFakeV1Runtime } from './conformance/fake-v1-runtime.js';
import { createFakeV2Runtime } from './conformance/fake-v2-runtime.js';

describe('EditorRuntimeRegistry  -  register / unregister', () => {
  it('registers and retrieves a runtime by id', () => {
    const registry = new EditorRuntimeRegistry();
    const rt = createFakeV1Runtime({ id: 'r1' });
    registry.register(rt);
    expect(registry.get('r1')).toBe(rt);
    expect(registry.getAll()).toEqual([rt]);
  });

  it('tracks more than one mounted runtime at the same time', () => {
    const registry = new EditorRuntimeRegistry();
    const a = createFakeV1Runtime({ id: 'a', root: document.createElement('div') });
    const b = createFakeV2Runtime({ id: 'b', root: document.createElement('div') });
    registry.register(a);
    registry.register(b);
    expect(registry.getAll()).toEqual([a, b]);
  });

  it('rejects a duplicate runtime id', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'dup', root: document.createElement('div') }));
    expect(() => registry.register(createFakeV1Runtime({ id: 'dup', root: document.createElement('div') }))).toThrow(
      /duplicate runtime id "dup"/,
    );
  });

  it('rejects two runtimes sharing the same root element', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    registry.register(createFakeV1Runtime({ id: 'a', root }));
    expect(() => registry.register(createFakeV2Runtime({ id: 'b', root }))).toThrow(/root element already registered/);
  });

  it('unregister returns false for an unknown runtime', () => {
    const registry = new EditorRuntimeRegistry();
    expect(registry.unregister('nope')).toBe(false);
  });

  it('unregister frees the id and root so they can be reused', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    registry.register(createFakeV1Runtime({ id: 'a', root }));
    expect(registry.unregister('a')).toBe(true);
    expect(registry.get('a')).toBeNull();
    // id + root are free again
    expect(() => registry.register(createFakeV1Runtime({ id: 'a', root }))).not.toThrow();
  });
});

describe('EditorRuntimeRegistry  -  document id lookup', () => {
  it('returns ALL runtimes for a document id, not just the first', () => {
    const registry = new EditorRuntimeRegistry();
    const a = createFakeV1Runtime({ id: 'a', documentId: 'doc-1', root: document.createElement('div') });
    const b = createFakeV1Runtime({ id: 'b', documentId: 'doc-1', root: document.createElement('div') });
    const c = createFakeV1Runtime({ id: 'c', documentId: 'doc-2', root: document.createElement('div') });
    registry.register(a);
    registry.register(b);
    registry.register(c);
    expect(registry.getAllByDocumentId('doc-1')).toEqual([a, b]);
    expect(registry.getAllByDocumentId('doc-2')).toEqual([c]);
    expect(registry.getAllByDocumentId('missing')).toEqual([]);
  });
});

describe('EditorRuntimeRegistry  -  active routing', () => {
  it('starts with no active runtime', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    expect(registry.getActive()).toBeNull();
    expect(registry.getActiveId()).toBeNull();
  });

  it('does NOT auto-activate on register', () => {
    const registry = new EditorRuntimeRegistry();
    const changes: EditorRuntimeRegistryActiveChange[] = [];
    registry.subscribe((c) => changes.push(c));
    registry.register(createFakeV1Runtime({ id: 'a' }));
    expect(changes).toEqual([]);
    expect(registry.getActive()).toBeNull();
  });

  it('setActive selects a runtime and emits a change with prev/next/reason', () => {
    const registry = new EditorRuntimeRegistry();
    const a = createFakeV1Runtime({ id: 'a' });
    const b = createFakeV1Runtime({ id: 'b' });
    registry.register(a);
    registry.register(b);
    const changes: EditorRuntimeRegistryActiveChange[] = [];
    registry.subscribe((c) => changes.push(c));

    registry.setActive('a', 'focus');
    expect(registry.getActive()).toBe(a);
    registry.setActive('b', 'focus');
    expect(registry.getActive()).toBe(b);

    expect(changes.map((c) => [c.previousRuntimeId, c.nextRuntimeId, c.reason])).toEqual([
      [null, 'a', 'focus'],
      ['a', 'b', 'focus'],
    ]);
  });

  it('active runtime changes when root routing selects a runtime', () => {
    const registry = new EditorRuntimeRegistry();
    const rootA = document.createElement('div');
    const rootB = document.createElement('div');
    document.body.append(rootA, rootB);
    markRuntimeRoot(rootA, 'a');
    markRuntimeRoot(rootB, 'b');
    const a = createFakeV1Runtime({ id: 'a', root: rootA });
    const b = createFakeV1Runtime({ id: 'b', root: rootB });
    registry.register(a);
    registry.register(b);

    // Simulate a focus landing inside root B (e.g. a descendant element).
    const innerB = document.createElement('span');
    rootB.appendChild(innerB);
    const resolved = registry.resolveFromEventTarget(innerB);
    expect(resolved).toBe(b);
    registry.setActive(resolved!.id, 'focus');
    expect(registry.getActive()).toBe(b);

    rootA.remove();
    rootB.remove();
  });

  it('setActive is idempotent  -  re-selecting the active runtime emits nothing', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.setActive('a', 'focus');
    registry.setActive('a', 'focus-again');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('throws when activating an unknown runtime', () => {
    const registry = new EditorRuntimeRegistry();
    expect(() => registry.setActive('ghost', 'focus')).toThrow(/cannot activate unknown runtime "ghost"/);
  });

  it('unregistering the active runtime clears active state, emits, and does NOT auto-promote', () => {
    const registry = new EditorRuntimeRegistry();
    const a = createFakeV1Runtime({ id: 'a' });
    const b = createFakeV1Runtime({ id: 'b' });
    registry.register(a);
    registry.register(b);
    registry.setActive('a', 'focus');

    const changes: EditorRuntimeRegistryActiveChange[] = [];
    registry.subscribe((c) => changes.push(c));

    registry.unregister('a');

    // Active is cleared, NOT promoted to the remaining runtime b.
    expect(registry.getActive()).toBeNull();
    expect(registry.getActiveId()).toBeNull();
    expect(changes).toEqual([
      {
        previousRuntimeId: 'a',
        nextRuntimeId: null,
        reason: 'active-runtime-unregistered',
        legacyEditorProjection: null,
      },
    ]);
  });

  it('unregistering a non-active runtime leaves active state untouched and emits nothing', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    registry.register(createFakeV1Runtime({ id: 'b' }));
    registry.setActive('a', 'focus');
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.unregister('b');
    expect(registry.getActiveId()).toBe('a');
    expect(listener).not.toHaveBeenCalled();
  });

  it('setActive(null) explicitly clears active state and emits', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    registry.setActive('a', 'focus');
    const changes: EditorRuntimeRegistryActiveChange[] = [];
    registry.subscribe((c) => changes.push(c));
    registry.setActive(null, 'blur');
    expect(registry.getActive()).toBeNull();
    expect(changes).toEqual([
      { previousRuntimeId: 'a', nextRuntimeId: null, reason: 'blur', legacyEditorProjection: null },
    ]);
  });
});

describe('EditorRuntimeRegistry  -  legacy editor projection on active change', () => {
  it('surfaces the v1-like runtime legacy editor projection on the change event', () => {
    const registry = new EditorRuntimeRegistry();
    const a = createFakeV1Runtime({ id: 'a' });
    registry.register(a);
    let change: EditorRuntimeRegistryActiveChange | null = null;
    registry.subscribe((c) => (change = c));
    registry.setActive('a', 'focus');
    expect(change).not.toBeNull();
    // The fake v1 runtime returns an inert legacy projection marker.
    expect(change!.legacyEditorProjection).toEqual(a.getLegacyEditorProjection!());
    expect(change!.legacyEditorProjection).not.toBeNull();
  });

  it('surfaces the v2-like facade projection (commands/state/view: null) on the change event', () => {
    const registry = new EditorRuntimeRegistry();
    const v2 = createFakeV2Runtime({ id: 'v2' });
    registry.register(v2);
    let change: EditorRuntimeRegistryActiveChange | null = null;
    registry.subscribe((c) => (change = c));
    registry.setActive('v2', 'focus');
    expect(change!.legacyEditorProjection).toEqual({ commands: null, state: null, view: null, editorVersion: 2 });
  });
});

describe('EditorRuntimeRegistry  -  event-target resolution', () => {
  it('resolves a runtime from a descendant of its marked root', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    markRuntimeRoot(root, 'a');
    const a = createFakeV1Runtime({ id: 'a', root });
    registry.register(a);
    const deep = document.createElement('em');
    const mid = document.createElement('p');
    mid.appendChild(deep);
    root.appendChild(mid);
    expect(registry.resolveFromEventTarget(deep)).toBe(a);
  });

  it('resolves a runtime from a text node inside its marked root', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    markRuntimeRoot(root, 'a');
    const a = createFakeV1Runtime({ id: 'a', root });
    registry.register(a);
    const text = document.createTextNode('inside editor');
    root.appendChild(text);
    expect(registry.resolveFromEventTarget(text)).toBe(a);
  });

  it('returns null when the target is outside any marked root', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    markRuntimeRoot(root, 'a');
    registry.register(createFakeV1Runtime({ id: 'a', root }));
    const orphan = document.createElement('div');
    expect(registry.resolveFromEventTarget(orphan)).toBeNull();
  });

  it('returns null when the marked id is not registered', () => {
    const registry = new EditorRuntimeRegistry();
    const root = document.createElement('div');
    markRuntimeRoot(root, 'unregistered');
    expect(registry.resolveFromEventTarget(root)).toBeNull();
  });

  it('returns null for a marker id collision on another registry root', () => {
    const registry = new EditorRuntimeRegistry();
    const runtimeId = 'v1:shared-doc:1';
    const rootA = document.createElement('div');
    const rootB = document.createElement('div');
    const childInsideB = document.createElement('span');
    rootB.appendChild(childInsideB);

    markRuntimeRoot(rootA, runtimeId);
    markRuntimeRoot(rootB, runtimeId);
    const runtimeA = createFakeV1Runtime({ id: runtimeId, root: rootA });
    registry.register(runtimeA);

    expect(registry.resolveFromEventTarget(rootA)).toBe(runtimeA);
    expect(registry.resolveFromEventTarget(childInsideB)).toBeNull();
  });

  it('returns null for a null target', () => {
    const registry = new EditorRuntimeRegistry();
    expect(registry.resolveFromEventTarget(null)).toBeNull();
  });
});

describe('EditorRuntimeRegistry  -  subscription lifecycle', () => {
  it('unsubscribe stops further notifications', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    registry.register(createFakeV1Runtime({ id: 'b' }));
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    registry.setActive('a', 'focus');
    unsubscribe();
    registry.setActive('b', 'focus');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not break active routing or other subscribers', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    const good = vi.fn();
    registry.subscribe(() => {
      throw new Error('boom');
    });
    registry.subscribe(good);
    expect(() => registry.setActive('a', 'focus')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(registry.getActive()?.id).toBe('a');
  });

  it('clear() drops runtimes, active state, and subscriptions', () => {
    const registry = new EditorRuntimeRegistry();
    registry.register(createFakeV1Runtime({ id: 'a' }));
    registry.setActive('a', 'focus');
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.clear();
    expect(registry.getAll()).toEqual([]);
    expect(registry.getActive()).toBeNull();
    // After clear, the old subscriber receives nothing because the set was cleared.
    registry.register(createFakeV1Runtime({ id: 'b' }));
    registry.setActive('b', 'focus');
    expect(listener).not.toHaveBeenCalled();
  });
});
