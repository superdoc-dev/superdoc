import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DecorationSet } from 'prosemirror-view';
import { PluginKey } from 'prosemirror-state';
import type { EditorState, Plugin } from 'prosemirror-state';

import { DecorationBridge } from './DecorationBridge.js';
import { DomPositionIndex } from './DomPositionIndex.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal decoration attrs for concise test authoring. */
type DecoAttrs = { from: number; to: number; class?: string; attrs?: Record<string, string> };

/** Creates a mock inline ProseMirror decoration. */
const mockDecoration = (from: number, to: number, attrs: Record<string, string>) => ({
  inline: true,
  from,
  to,
  type: { attrs },
});

/** Creates a DecorationSet-compatible object from a list of decoration descriptors. */
const mockDecorationSet = (items: DecoAttrs[]): DecorationSet => {
  const decorations = items.map(({ from, to, class: cls, attrs }) =>
    mockDecoration(from, to, { ...(cls ? { class: cls } : {}), ...attrs }),
  );
  const set = Object.create(DecorationSet.prototype);
  set.find = () => decorations;
  return set;
};

/** Creates a mock external plugin with a decoration set. */
const externalPlugin = (keyName: string, items: DecoAttrs[]): Plugin => {
  const set = mockDecorationSet(items);
  return {
    key: `${keyName}$1`,
    spec: { key: new PluginKey(keyName) },
    props: { decorations: () => set },
  } as unknown as Plugin;
};

/** Creates a mock external plugin whose decoration set can be swapped. */
const mutableExternalPlugin = (keyName: string) => {
  let currentSet: DecorationSet = DecorationSet.empty;
  const plugin = {
    key: `${keyName}$1`,
    spec: { key: new PluginKey(keyName) },
    props: { decorations: () => currentSet },
  } as unknown as Plugin;
  const setDecorations = (items: DecoAttrs[]) => {
    currentSet = items.length > 0 ? mockDecorationSet(items) : DecorationSet.empty;
  };
  return { plugin, setDecorations };
};

/**
 * Builds a minimal mock EditorState from a plugin list.
 * Only the fields used by DecorationBridge are populated.
 */
const mockState = (plugins: Plugin[]): EditorState =>
  ({
    plugins,
    doc: { content: { size: 1000 } },
  }) as unknown as EditorState;

/**
 * Creates a real DomPositionIndex backed by a container element.
 * Elements appended to the container with `data-pm-start`/`data-pm-end`
 * become queryable after calling `rebuild()`.
 */
const createIndex = () => {
  const container = document.createElement('div');
  const index = new DomPositionIndex();

  const addSpan = (start: number, end: number, text = 'x'): HTMLSpanElement => {
    const span = document.createElement('span');
    span.dataset.pmStart = String(start);
    span.dataset.pmEnd = String(end);
    span.textContent = text;
    container.appendChild(span);
    return span;
  };

  const rebuild = () => index.rebuild(container);

  return { container, index, addSpan, rebuild };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecorationBridge', () => {
  let bridge: DecorationBridge;

  beforeEach(() => {
    bridge = new DecorationBridge();
  });

  afterEach(() => {
    bridge.destroy();
  });

  // -----------------------------------------------------------------------
  // Apply — fresh elements
  // -----------------------------------------------------------------------

  describe('applying decorations to fresh elements', () => {
    it('applies a single class to an element within the decoration range', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.contains('hl')).toBe(true);
    });

    it('applies multiple classes from a space-separated class string', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl-a hl-b hl-c' }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.contains('hl-a')).toBe(true);
      expect(span.classList.contains('hl-b')).toBe(true);
      expect(span.classList.contains('hl-c')).toBe(true);
    });

    it('applies data-* attributes from decorations', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [
        { from: 5, to: 15, attrs: { 'data-id': '42', 'data-type': 'clause' } },
      ]);
      bridge.sync(mockState([plugin]), index);

      expect(span.getAttribute('data-id')).toBe('42');
      expect(span.getAttribute('data-type')).toBe('clause');
    });

    it('applies both classes and data attributes together', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl', attrs: { 'data-id': '1' } }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.contains('hl')).toBe(true);
      expect(span.getAttribute('data-id')).toBe('1');
    });

    it('applies decorations across multiple elements spanning the range', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span1 = addSpan(5, 12);
      const span2 = addSpan(12, 20);
      const span3 = addSpan(20, 25);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 25, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);

      expect(span1.classList.contains('hl')).toBe(true);
      expect(span2.classList.contains('hl')).toBe(true);
      expect(span3.classList.contains('hl')).toBe(true);
    });

    it('does not apply decorations to elements outside the range', () => {
      const { index, addSpan, rebuild } = createIndex();
      const before = addSpan(1, 4);
      const within = addSpan(5, 15);
      const after = addSpan(16, 25);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);

      expect(before.classList.contains('hl')).toBe(false);
      expect(within.classList.contains('hl')).toBe(true);
      expect(after.classList.contains('hl')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Removal — stale decorations cleaned up
  // -----------------------------------------------------------------------

  describe('removing stale decorations', () => {
    it('removes classes when decorations are cleared', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('hl')).toBe(true);

      // Clear decorations and re-sync.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('hl')).toBe(false);
    });

    it('removes data attributes when decorations are cleared', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { 'data-id': '42' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBe('42');

      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBeNull();
    });

    it('removes classes from elements that leave a shrinking range', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span1 = addSpan(5, 12);
      const span2 = addSpan(12, 20);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      // Initially covers both spans.
      setDecorations([{ from: 5, to: 20, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span1.classList.contains('hl')).toBe(true);
      expect(span2.classList.contains('hl')).toBe(true);

      // Shrink range to only cover span1.
      setDecorations([{ from: 5, to: 12, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span1.classList.contains('hl')).toBe(true);
      expect(span2.classList.contains('hl')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Update — range/attr changes
  // -----------------------------------------------------------------------

  describe('updating decorations on change', () => {
    it('updates classes when decoration class changes', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'old-class' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('old-class')).toBe(true);

      setDecorations([{ from: 5, to: 15, class: 'new-class' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('old-class')).toBe(false);
      expect(span.classList.contains('new-class')).toBe(true);
    });

    it('updates data attribute values', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { 'data-id': 'v1' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBe('v1');

      setDecorations([{ from: 5, to: 15, attrs: { 'data-id': 'v2' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBe('v2');
    });

    it('removes stale data attributes when key is no longer present', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { 'data-a': '1', 'data-b': '2' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-a')).toBe('1');
      expect(span.getAttribute('data-b')).toBe('2');

      // Only data-a remains.
      setDecorations([{ from: 5, to: 15, attrs: { 'data-a': '1' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-a')).toBe('1');
      expect(span.getAttribute('data-b')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Merge semantics
  // -----------------------------------------------------------------------

  describe('merge semantics for overlapping decorations', () => {
    it('unions classes from overlapping decorations', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [
        { from: 5, to: 20, class: 'outer' },
        { from: 3, to: 15, class: 'inner' },
      ]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.contains('outer')).toBe(true);
      expect(span.classList.contains('inner')).toBe(true);
    });

    it('last plugin wins for conflicting data-* keys', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const pluginA = externalPlugin('first', [{ from: 5, to: 15, attrs: { 'data-owner': 'plugin-a' } }]);
      const pluginB = externalPlugin('second', [{ from: 5, to: 15, attrs: { 'data-owner': 'plugin-b' } }]);
      // pluginB is later in the array, so it wins.
      bridge.sync(mockState([pluginA, pluginB]), index);

      expect(span.getAttribute('data-owner')).toBe('plugin-b');
    });
  });

  // -----------------------------------------------------------------------
  // Style property handling
  // -----------------------------------------------------------------------

  describe('style property handling', () => {
    it('applies individual style properties from decoration style attribute', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, attrs: { style: 'background-color: yellow;' } }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.style.getPropertyValue('background-color')).toBe('yellow');
    });

    it('applies multiple style properties from a single decoration', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [
        {
          from: 5,
          to: 15,
          attrs: { style: 'background-color: rgba(0, 178, 169, 0.3); border: 1.5px solid rgb(229, 57, 53);' },
        },
      ]);
      bridge.sync(mockState([plugin]), index);

      expect(span.style.getPropertyValue('background-color')).toBe('rgba(0, 178, 169, 0.3)');
    });

    it('applies style properties alongside class and data-* from the same decoration', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [
        { from: 5, to: 15, class: 'hl', attrs: { style: 'color: red;', 'data-id': '1' } },
      ]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.contains('hl')).toBe(true);
      expect(span.getAttribute('data-id')).toBe('1');
      expect(span.style.getPropertyValue('color')).toBe('red');
    });

    it('removes style properties when decorations are cleared', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { style: 'background-color: yellow;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('background-color')).toBe('yellow');

      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('background-color')).toBe('');
    });

    it('updates style properties when decoration style changes', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { style: 'color: red;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('color')).toBe('red');

      setDecorations([{ from: 5, to: 15, attrs: { style: 'color: blue;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('color')).toBe('blue');
    });

    it('removes stale style properties when they disappear from decorations', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { style: 'color: red; font-weight: bold;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('color')).toBe('red');
      expect(span.style.getPropertyValue('font-weight')).toBe('bold');

      // Only color remains.
      setDecorations([{ from: 5, to: 15, attrs: { style: 'color: red;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('color')).toBe('red');
      expect(span.style.getPropertyValue('font-weight')).toBe('');
    });

    it('does not clobber painter-owned style properties', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.style.setProperty('font-size', '14px');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { style: 'background-color: yellow;' } }]);
      bridge.sync(mockState([plugin]), index);

      // Bridge-owned property is applied.
      expect(span.style.getPropertyValue('background-color')).toBe('yellow');
      // Painter-owned property is untouched.
      expect(span.style.getPropertyValue('font-size')).toBe('14px');

      // Clear bridge decorations — painter-owned property must survive.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('background-color')).toBe('');
      expect(span.style.getPropertyValue('font-size')).toBe('14px');
    });

    it('ignores empty style strings', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, attrs: { style: '  ' } }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.getAttribute('style')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Security filtering
  // -----------------------------------------------------------------------

  describe('security filtering', () => {
    it('ignores non-data-* attributes like id, onclick, href', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [
        { from: 5, to: 15, attrs: { id: 'bad', onclick: 'alert(1)', href: 'http://evil.com', 'data-ok': 'yes' } },
      ]);
      bridge.sync(mockState([plugin]), index);

      expect(span.getAttribute('id')).toBeNull();
      expect(span.getAttribute('onclick')).toBeNull();
      expect(span.getAttribute('href')).toBeNull();
      expect(span.getAttribute('data-ok')).toBe('yes');
    });
  });

  // -----------------------------------------------------------------------
  // Repaint safety — fresh elements
  // -----------------------------------------------------------------------

  describe('repaint safety', () => {
    it('applies decorations to fresh elements that replace old ones', () => {
      const { container, index, addSpan, rebuild } = createIndex();
      const oldSpan = addSpan(5, 15);
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(oldSpan.classList.contains('hl')).toBe(true);

      // Simulate DomPainter repaint: remove old element, add new one.
      container.removeChild(oldSpan);
      const newSpan = addSpan(5, 15);
      rebuild();

      bridge.sync(mockState([plugin]), index);
      expect(newSpan.classList.contains('hl')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Internal plugin exclusion
  // -----------------------------------------------------------------------

  describe('internal plugin exclusion', () => {
    it('excludes plugins with known internal key prefixes', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      // Simulate an internal plugin with an unexported key prefix.
      const internalPlugin = {
        key: 'placeholder$1',
        spec: { key: new PluginKey('placeholder') },
        props: { decorations: () => mockDecorationSet([{ from: 5, to: 15, class: 'internal' }]) },
      } as unknown as Plugin;

      bridge.sync(mockState([internalPlugin]), index);

      expect(span.classList.contains('internal')).toBe(false);
    });

    it('excludes the built-in search plugin (unexported key)', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const searchPlugin = {
        key: 'search$1',
        spec: { key: new PluginKey('search') },
        props: { decorations: () => mockDecorationSet([{ from: 5, to: 15, class: 'search-match' }]) },
      } as unknown as Plugin;

      bridge.sync(mockState([searchPlugin]), index);

      expect(span.classList.contains('search-match')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // hasChanges — identity check
  // -----------------------------------------------------------------------

  describe('hasChanges identity check', () => {
    it('returns true when DecorationSet reference changes', () => {
      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'hl' }]);

      const { index, addSpan, rebuild } = createIndex();
      addSpan(5, 15);
      rebuild();

      const state = mockState([plugin]);
      // First sync captures the initial set.
      bridge.sync(state, index);

      // Same reference → no changes.
      expect(bridge.hasChanges(state)).toBe(false);

      // New reference → has changes.
      setDecorations([{ from: 5, to: 15, class: 'hl-new' }]);
      expect(bridge.hasChanges(state)).toBe(true);
    });

    it('returns false when no eligible plugins exist and none were synced before', () => {
      const state = mockState([]);
      expect(bridge.hasChanges(state)).toBe(false);
    });

    it('returns true when eligible plugins drop to zero but state was previously synced', () => {
      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'hl' }]);

      const { index, addSpan, rebuild } = createIndex();
      addSpan(5, 15);
      rebuild();

      // Sync once to populate prevDecorationSets.
      bridge.sync(mockState([plugin]), index);
      expect(bridge.hasChanges(mockState([plugin]))).toBe(false);

      // All plugins removed — bridge should detect stale state needs cleanup.
      expect(bridge.hasChanges(mockState([]))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty decoration set without errors', () => {
      const { index, addSpan, rebuild } = createIndex();
      addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', []);
      bridge.sync(mockState([plugin]), index);
      // No errors thrown, no classes applied.
    });

    it('handles decorations with no class or attributes', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15 }]);
      bridge.sync(mockState([plugin]), index);

      expect(span.classList.length).toBe(0);
    });

    it('does not touch painter-owned classes during removal', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.classList.add('painter-owned');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'bridge-class' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('painter-owned')).toBe(true);
      expect(span.classList.contains('bridge-class')).toBe(true);

      // Clear bridge decorations — painter-owned class must survive.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('painter-owned')).toBe(true);
      expect(span.classList.contains('bridge-class')).toBe(false);
    });

    it('restores painter-owned class when decoration uses the same class name', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.classList.add('shared-class');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, class: 'shared-class' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('shared-class')).toBe(true);

      // Clear — painter-owned class must still be present.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('shared-class')).toBe(true);
    });

    it('does not touch painter-owned data attributes during removal', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.setAttribute('data-painter', 'yes');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { 'data-bridge': 'yes' } }]);
      bridge.sync(mockState([plugin]), index);

      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-painter')).toBe('yes');
      expect(span.getAttribute('data-bridge')).toBeNull();
    });

    it('restores painter-owned data-attr value when decoration overwrites it', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.setAttribute('data-id', 'painter-value');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { 'data-id': 'bridge-value' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBe('bridge-value');

      // Clear — original painter value must be restored.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.getAttribute('data-id')).toBe('painter-value');
    });

    it('restores painter-owned style property when decoration overwrites it', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      span.style.setProperty('background-color', 'white');
      rebuild();

      const { plugin, setDecorations } = mutableExternalPlugin('highlight');
      setDecorations([{ from: 5, to: 15, attrs: { style: 'background-color: yellow;' } }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('background-color')).toBe('yellow');

      // Clear — original painter value must be restored.
      setDecorations([]);
      bridge.sync(mockState([plugin]), index);
      expect(span.style.getPropertyValue('background-color')).toBe('white');
    });
  });

  // -----------------------------------------------------------------------
  // Plugin cache invalidation
  // -----------------------------------------------------------------------

  describe('plugin cache invalidation', () => {
    it('picks up newly registered plugins', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      // Start with no plugins.
      bridge.sync(mockState([]), index);
      expect(span.classList.contains('hl')).toBe(false);

      // Register a new plugin (simulates Editor.registerPlugin).
      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('hl')).toBe(true);
    });

    it('stops syncing decorations from unregistered plugins', () => {
      const { index, addSpan, rebuild } = createIndex();
      const span = addSpan(5, 15);
      rebuild();

      const plugin = externalPlugin('highlight', [{ from: 5, to: 15, class: 'hl' }]);
      bridge.sync(mockState([plugin]), index);
      expect(span.classList.contains('hl')).toBe(true);

      // Unregister (new plugins array without the plugin).
      bridge.sync(mockState([]), index);
      expect(span.classList.contains('hl')).toBe(false);
    });
  });
});
