/**
 * Tests for the tracked selection handle system in selection-state.ts.
 *
 * These tests verify that SelectionBookmark-backed handles correctly map
 * through document changes, degrade gracefully when content is deleted,
 * and stay bound to their owning editor instance.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Schema } from 'prosemirror-model';

import {
  createSelectionHandlePlugin,
  captureSelectionHandle,
  resolveHandleToSelection,
  releaseSelectionHandle,
  _resetHandleIdCounter,
} from './selection-state.js';
import type { SelectionHandleOwner } from './selection-state.js';

// ---------------------------------------------------------------------------
// Minimal schema + helpers
// ---------------------------------------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: { inline: true },
  },
});

/**
 * A minimal owner that holds mutable state — mirrors how Editor works.
 * Dispatching a transaction updates the owner's state in place.
 */
function createOwner(initialState: EditorState): SelectionHandleOwner & { state: EditorState } {
  const owner: SelectionHandleOwner & { state: EditorState } = {
    state: initialState,
    dispatch(tr) {
      owner.state = owner.state.apply(tr);
    },
  };
  return owner;
}

function createState(text: string): EditorState {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])]);
  return EditorState.create({ doc, plugins: [createSelectionHandlePlugin()] });
}

function createMultiParaState(texts: string[]): EditorState {
  const paras = texts.map((t) => schema.node('paragraph', null, t ? [schema.text(t)] : []));
  const doc = schema.node('doc', null, paras);
  return EditorState.create({ doc, plugins: [createSelectionHandlePlugin()] });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetHandleIdCounter();
});

// ---------------------------------------------------------------------------
// Capture + resolve round-trip
// ---------------------------------------------------------------------------

describe('captureSelectionHandle + resolveHandleToSelection', () => {
  it('round-trips a text selection without document changes', () => {
    const owner = createOwner(createState('Hello world'));
    const sel = TextSelection.create(owner.state.doc, 7, 12);

    const handle = captureSelectionHandle(owner, sel, 'body');

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(7);
    expect(resolved!.to).toBe(12);
  });

  it('maps handle positions forward through an insertion before the range', () => {
    const owner = createOwner(createState('Hello world'));
    const sel = TextSelection.create(owner.state.doc, 7, 12);
    const handle = captureSelectionHandle(owner, sel, 'body');

    // Insert "XX" at position 1 (before "Hello")
    owner.dispatch(owner.state.tr.insertText('XX', 1));

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(9);
    expect(resolved!.to).toBe(14);
  });

  it('maps handle positions through an insertion inside the range', () => {
    const owner = createOwner(createState('Hello world'));
    const sel = TextSelection.create(owner.state.doc, 4, 10);
    const handle = captureSelectionHandle(owner, sel, 'body');

    owner.dispatch(owner.state.tr.insertText('X', 6));

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(4);
    expect(resolved!.to).toBe(11);
  });

  it('keeps text selections inclusive when content is inserted exactly at the left edge', () => {
    const owner = createOwner(createState('Hello world'));
    // Select "world" (positions 7..12)
    const sel = TextSelection.create(owner.state.doc, 7, 12);
    const handle = captureSelectionHandle(owner, sel, 'body');

    owner.dispatch(owner.state.tr.insertText('big ', 7));

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    // The inserted text should remain inside the tracked selection.
    expect(resolved!.from).toBe(7);
    expect(resolved!.to).toBe(16);
    expect(owner.state.doc.textBetween(resolved!.from, resolved!.to)).toBe('big world');
  });

  it('tracks through multiple successive transactions', () => {
    const owner = createOwner(createState('ABCDE'));
    const sel = TextSelection.create(owner.state.doc, 2, 5);
    const handle = captureSelectionHandle(owner, sel, 'body');

    owner.dispatch(owner.state.tr.insertText('X', 1));
    owner.dispatch(owner.state.tr.insertText('Y', 1));

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(4);
    expect(resolved!.to).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Collapsed selection degradation
// ---------------------------------------------------------------------------

describe('handle degradation when content is deleted', () => {
  it('returns null when a non-empty selection is fully deleted', () => {
    const owner = createOwner(createMultiParaState(['Hello', 'World']));
    const sel = TextSelection.create(owner.state.doc, 1, 6);
    const handle = captureSelectionHandle(owner, sel, 'body');
    expect(handle.wasNonEmpty).toBe(true);

    owner.dispatch(owner.state.tr.delete(1, 6));

    expect(resolveHandleToSelection(handle)).toBeNull();
  });

  it('preserves a collapsed selection handle (caret) even after edits', () => {
    const owner = createOwner(createState('Hello'));
    const sel = TextSelection.create(owner.state.doc, 3, 3);
    const handle = captureSelectionHandle(owner, sel, 'body');
    expect(handle.wasNonEmpty).toBe(false);

    owner.dispatch(owner.state.tr.insertText('X', 1));

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(4);
    expect(resolved!.to).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

describe('releaseSelectionHandle', () => {
  it('makes subsequent resolve return null', () => {
    const owner = createOwner(createState('Hello'));
    const sel = TextSelection.create(owner.state.doc, 1, 6);
    const handle = captureSelectionHandle(owner, sel, 'body');

    releaseSelectionHandle(handle);

    expect(resolveHandleToSelection(handle)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple handles
// ---------------------------------------------------------------------------

describe('multiple concurrent handles', () => {
  it('tracks multiple handles independently', () => {
    const owner = createOwner(createMultiParaState(['Hello', 'World']));
    const sel1 = TextSelection.create(owner.state.doc, 1, 6);
    const handle1 = captureSelectionHandle(owner, sel1, 'body');

    const sel2 = TextSelection.create(owner.state.doc, 8, 13);
    const handle2 = captureSelectionHandle(owner, sel2, 'body');

    owner.dispatch(owner.state.tr.insertText('XX', 1));

    const resolved1 = resolveHandleToSelection(handle1);
    const resolved2 = resolveHandleToSelection(handle2);
    expect(resolved1).not.toBeNull();
    expect(resolved2).not.toBeNull();
    // Handle 1 starts exactly at the insertion point, so the inserted text
    // stays inside the tracked selection.
    expect(resolved1!.from).toBe(1);
    expect(resolved1!.to).toBe(8);
    expect(resolved2!.from).toBe(10);
    expect(resolved2!.to).toBe(15);
  });

  it('releasing one handle does not affect another', () => {
    const owner = createOwner(createState('Hello'));
    const handle1 = captureSelectionHandle(owner, TextSelection.create(owner.state.doc, 1, 3), 'body');
    const handle2 = captureSelectionHandle(owner, TextSelection.create(owner.state.doc, 3, 6), 'body');

    releaseSelectionHandle(handle1);

    expect(resolveHandleToSelection(handle1)).toBeNull();
    expect(resolveHandleToSelection(handle2)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Owner binding
// ---------------------------------------------------------------------------

describe('handle is bound to its owning editor', () => {
  it('resolves against the capturing owner, not a different one', () => {
    const ownerA = createOwner(createState('Hello'));
    const ownerB = createOwner(createState('World'));

    const sel = TextSelection.create(ownerA.state.doc, 1, 6);
    const handle = captureSelectionHandle(ownerA, sel, 'header');

    // handle._owner is ownerA, so resolve reads ownerA's plugin state
    expect(handle._owner).toBe(ownerA);

    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    expect(resolved!.from).toBe(1);
    expect(resolved!.to).toBe(6);
  });

  it('survives the active editor changing (simulates HF session switch)', () => {
    // Simulate: capture in header editor A, then "switch" to header editor B
    const headerEditorA = createOwner(createState('Header A content'));
    const headerEditorB = createOwner(createState('Header B content'));

    const sel = TextSelection.create(headerEditorA.state.doc, 1, 8);
    const handle = captureSelectionHandle(headerEditorA, sel, 'header');

    // Edits happen in header editor A
    headerEditorA.dispatch(headerEditorA.state.tr.insertText('XX', 1));

    // Even though we could "switch" to header editor B, resolve still
    // reads from header editor A because the handle is bound to it.
    const resolved = resolveHandleToSelection(handle);
    expect(resolved).not.toBeNull();
    // The selection started at the insertion point, so the inserted text
    // remains part of the tracked selection.
    expect(resolved!.from).toBe(1);
    expect(resolved!.to).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Surface encoding
// ---------------------------------------------------------------------------

describe('handle surface encoding', () => {
  it('preserves the surface label from capture', () => {
    const owner = createOwner(createState('Hello'));
    const sel = TextSelection.create(owner.state.doc, 1, 6);

    const bodyHandle = captureSelectionHandle(owner, sel, 'body');
    const headerHandle = captureSelectionHandle(owner, sel, 'header');
    const footerHandle = captureSelectionHandle(owner, sel, 'footer');

    expect(bodyHandle.surface).toBe('body');
    expect(headerHandle.surface).toBe('header');
    expect(footerHandle.surface).toBe('footer');
  });
});

// ---------------------------------------------------------------------------
// Plugin absent
// ---------------------------------------------------------------------------

describe('graceful behavior without plugin', () => {
  it('returns null when the plugin is not registered', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello')])]);
    const stateNoPlugin = EditorState.create({ doc });
    const ownerNoPlugin = { state: stateNoPlugin, dispatch() {} };

    const fakeHandle = { id: 999, surface: 'body' as const, wasNonEmpty: true, _owner: ownerNoPlugin };
    expect(resolveHandleToSelection(fakeHandle)).toBeNull();
  });
});
