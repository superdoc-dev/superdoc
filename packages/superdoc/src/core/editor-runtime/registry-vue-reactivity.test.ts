// Vue computed projection reactivity proof.
//
// Vue reactivity contract requires proving the Vue computed path that reads
// `proxy.$superdoc.activeEditor` re-fires after a projection assignment. The
// `host` below stands in for the SuperDoc instance the Vue layer reads through
// `proxy.$superdoc`; a Vue computed observes field writes only when the host is
// reactive, so we wrap it in `shallowReactive` and install the SAME one-writer
// bridge SuperDoc installs (registry active-change → assign the legacy editor
// projection). This proves the registry → projection → activeEditor → computed
// chain is observable to Vue.

import { describe, expect, it, vi } from 'vitest';
import { computed, shallowReactive } from 'vue';
import { EditorRuntimeRegistry } from './editor-runtime-registry.js';
import { createFakeV1Runtime } from './conformance/fake-v1-runtime.js';

describe('EditorRuntimeRegistry  -  Vue computed projection reactivity', () => {
  it('a computed reading host.activeEditor re-fires after a registry-driven projection assignment', () => {
    const host = shallowReactive<{ activeEditor: unknown }>({ activeEditor: null });
    const registry = new EditorRuntimeRegistry();

    // The bridge SuperDoc installs in `#init`: the registry never writes the
    // field directly; the active-change projection is what gets assigned.
    registry.subscribe((change) => {
      if (change.legacyEditorProjection) host.activeEditor = change.legacyEditorProjection;
    });

    const evaluations = vi.fn();
    const activeEditorRef = computed(() => {
      evaluations();
      return host.activeEditor;
    });

    // First read: null, one evaluation, dependency tracked.
    expect(activeEditorRef.value).toBeNull();
    expect(evaluations).toHaveBeenCalledTimes(1);

    const v1 = createFakeV1Runtime({ id: 'v1-a' });
    registry.register(v1);
    registry.setActive('v1-a', 'focus');

    // The computed re-fires and returns the projected legacy editor.
    expect(activeEditorRef.value).toMatchObject({ legacy: 'v1-editor' });
    expect(evaluations).toHaveBeenCalledTimes(2);
  });

  it('the computed does NOT re-fire when active selection is idempotent (no redundant projection)', () => {
    const host = shallowReactive<{ activeEditor: unknown }>({ activeEditor: null });
    const registry = new EditorRuntimeRegistry();
    registry.subscribe((change) => {
      if (change.legacyEditorProjection) host.activeEditor = change.legacyEditorProjection;
    });

    const evaluations = vi.fn();
    const activeEditorRef = computed(() => {
      evaluations();
      return host.activeEditor;
    });
    registry.register(createFakeV1Runtime({ id: 'v1-a' }));

    registry.setActive('v1-a', 'focus');
    expect(activeEditorRef.value).toMatchObject({ legacy: 'v1-editor' });
    const callsAfterFirst = evaluations.mock.calls.length;

    // Re-selecting the same active runtime emits nothing → no reassignment.
    registry.setActive('v1-a', 'focus-again');
    expect(activeEditorRef.value).toMatchObject({ legacy: 'v1-editor' });
    expect(evaluations).toHaveBeenCalledTimes(callsAfterFirst);
  });
});
