/**
 * Tests for the PresentationEditor selection bridge methods.
 *
 * Verifies:
 * - local-only (Editor) vs active-context-aware (PresentationEditor) contract
 * - tracked selection handle ownership — handles are bound to their capturing
 *   editor, not the surface label, so switching HF sessions doesn't break them
 * - SelectionCommandContext bundling prevents surface mismatches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolveRangeOutput, DocumentApi } from '@superdoc/document-api';
import type { Editor } from '../../Editor.js';
import type { SelectionCommandContext } from '../PresentationEditor.js';
import type { SelectionHandle, SelectionHandleOwner } from '../../selection-state.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockRange(label: string): ResolveRangeOutput {
  return {
    evaluatedRevision: `rev-${label}`,
    handle: { ref: `text:${label}`, refStability: 'ephemeral', coversFullTarget: true },
    target: {
      kind: 'selection',
      start: { kind: 'text', blockId: `block-${label}`, offset: 0 },
      end: { kind: 'text', blockId: `block-${label}`, offset: 5 },
    },
    preview: { text: label, truncated: false, blocks: [] },
  };
}

let nextMockHandleId = 1;

function makeMockEditor(label: string): Editor {
  const currentRange = makeMockRange(`${label}-current`);
  const effectiveRange = makeMockRange(`${label}-effective`);
  const resolvedRange = makeMockRange(`${label}-resolved`);
  const doc = { _label: `doc-${label}` } as unknown as DocumentApi;

  // Build the editor object first, then wire up capture to reference it
  // as `_owner` — this mirrors the real code where `_owner` is `this`.
  const editor: Record<string, unknown> = {
    getCurrentSelectionRange: vi.fn(() => currentRange),
    getEffectiveSelectionRange: vi.fn(() => effectiveRange),
    resolveSelectionHandle: vi.fn(() => resolvedRange),
    releaseSelectionHandle: vi.fn(),
    doc,
    _label: label,
    _currentRange: currentRange,
    _effectiveRange: effectiveRange,
    _resolvedRange: resolvedRange,
  };

  // Capture methods return handles whose _owner is this editor instance
  editor.captureCurrentSelectionHandle = vi.fn(
    (surface: string): SelectionHandle => ({
      id: nextMockHandleId++,
      surface: surface as 'body' | 'header' | 'footer',
      wasNonEmpty: true,
      _owner: editor as unknown as SelectionHandleOwner,
    }),
  );
  editor.captureEffectiveSelectionHandle = vi.fn(
    (surface: string): SelectionHandle => ({
      id: nextMockHandleId++,
      surface: surface as 'body' | 'header' | 'footer',
      wasNonEmpty: true,
      _owner: editor as unknown as SelectionHandleOwner,
    }),
  );

  return editor as unknown as Editor & {
    _label: string;
    _currentRange: ResolveRangeOutput;
    _effectiveRange: ResolveRangeOutput;
    _resolvedRange: ResolveRangeOutput;
  };
}

/**
 * Minimal PresentationEditor stub that replicates the owner-bound handle
 * routing from the production code. The key change from the old design:
 * resolve/release use handle._owner (cast to Editor), not surface routing.
 */
function makePresentationEditorStub(
  bodyEditor: ReturnType<typeof makeMockEditor>,
  activeEditor: ReturnType<typeof makeMockEditor>,
  surface: 'body' | 'header' | 'footer',
) {
  return {
    getActiveEditor: () => activeEditor,

    // Handle API — mirrors production code
    captureCurrentSelectionHandle: (): SelectionHandle => activeEditor.captureCurrentSelectionHandle(surface),
    captureEffectiveSelectionHandle: (): SelectionHandle => activeEditor.captureEffectiveSelectionHandle(surface),
    resolveSelectionHandle: (handle: SelectionHandle): SelectionCommandContext | null => {
      // Production code: const ownerEditor = handle._owner as Editor;
      const ownerEditor = handle._owner as unknown as Editor;
      const range = ownerEditor.resolveSelectionHandle(handle);
      if (!range) return null;
      return { editor: ownerEditor, doc: ownerEditor.doc, surface: handle.surface, range };
    },
    releaseSelectionHandle: (handle: SelectionHandle): void => {
      (handle._owner as unknown as Editor).releaseSelectionHandle(handle);
    },

    // Snapshot API
    getCurrentSelectionRange: () => activeEditor.getCurrentSelectionRange(),
    getEffectiveSelectionRange: () => activeEditor.getEffectiveSelectionRange(),
    getCurrentSelectionContext: (): SelectionCommandContext => ({
      editor: activeEditor,
      doc: activeEditor.doc,
      surface,
      range: activeEditor.getCurrentSelectionRange(),
    }),
    getEffectiveSelectionContext: (): SelectionCommandContext => ({
      editor: activeEditor,
      doc: activeEditor.doc,
      surface,
      range: activeEditor.getEffectiveSelectionRange(),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PresentationEditor selection bridge — snapshot routing', () => {
  let bodyEditor: ReturnType<typeof makeMockEditor>;
  let headerEditor: ReturnType<typeof makeMockEditor>;

  beforeEach(() => {
    nextMockHandleId = 1;
    bodyEditor = makeMockEditor('body');
    headerEditor = makeMockEditor('header');
  });

  describe('when body is active', () => {
    it('getCurrentSelectionRange delegates to body editor', () => {
      const pe = makePresentationEditorStub(bodyEditor, bodyEditor, 'body');
      const result = pe.getCurrentSelectionRange();
      expect(result.evaluatedRevision).toBe('rev-body-current');
    });

    it('getEffectiveSelectionContext surface is "body"', () => {
      const pe = makePresentationEditorStub(bodyEditor, bodyEditor, 'body');
      const ctx = pe.getEffectiveSelectionContext();
      expect(ctx.surface).toBe('body');
      expect(ctx.editor).toBe(bodyEditor);
      expect(ctx.doc).toBe(bodyEditor.doc);
    });
  });

  describe('when header is active', () => {
    it('getCurrentSelectionRange delegates to header editor', () => {
      const pe = makePresentationEditorStub(bodyEditor, headerEditor, 'header');
      const result = pe.getCurrentSelectionRange();
      expect(result.evaluatedRevision).toBe('rev-header-current');
      expect(bodyEditor.getCurrentSelectionRange).not.toHaveBeenCalled();
    });

    it('context doc and range come from the same editor (no mismatch)', () => {
      const pe = makePresentationEditorStub(bodyEditor, headerEditor, 'header');
      const ctx = pe.getEffectiveSelectionContext();
      expect(ctx.doc).toBe(headerEditor.doc);
      expect(ctx.doc).not.toBe(bodyEditor.doc);
    });
  });

  describe('local-only vs active-context-aware boundary', () => {
    it('body Editor stays local when header is active in PE', () => {
      const pe = makePresentationEditorStub(bodyEditor, headerEditor, 'header');
      const bodyRange = bodyEditor.getCurrentSelectionRange();
      const peRange = pe.getCurrentSelectionRange();
      expect(bodyRange.evaluatedRevision).not.toBe(peRange.evaluatedRevision);
    });
  });
});

describe('PresentationEditor selection bridge — tracked handle ownership', () => {
  let bodyEditor: ReturnType<typeof makeMockEditor>;
  let headerEditorA: ReturnType<typeof makeMockEditor>;
  let headerEditorB: ReturnType<typeof makeMockEditor>;

  beforeEach(() => {
    nextMockHandleId = 1;
    bodyEditor = makeMockEditor('body');
    headerEditorA = makeMockEditor('headerA');
    headerEditorB = makeMockEditor('headerB');
  });

  it('capture routes to the currently active editor', () => {
    const pe = makePresentationEditorStub(bodyEditor, headerEditorA, 'header');
    const handle = pe.captureCurrentSelectionHandle();
    expect(handle.surface).toBe('header');
    expect(headerEditorA.captureCurrentSelectionHandle).toHaveBeenCalledWith('header');
  });

  it('resolve uses handle._owner, not the currently active editor', () => {
    // Capture while header A is active
    const pe = makePresentationEditorStub(bodyEditor, headerEditorA, 'header');
    const handle = pe.captureEffectiveSelectionHandle();

    // Now "switch" to header B — rebuild the stub with a new active editor
    const pe2 = makePresentationEditorStub(bodyEditor, headerEditorB, 'header');

    // Resolve should go to header A (the owner), not header B (the new active)
    const ctx = pe2.resolveSelectionHandle(handle);
    expect(ctx).not.toBeNull();
    // The owner is headerEditorA's internal ref, so resolveSelectionHandle was called on it
    expect(headerEditorA.resolveSelectionHandle).toHaveBeenCalledWith(handle);
    expect(headerEditorB.resolveSelectionHandle).not.toHaveBeenCalled();
  });

  it('release uses handle._owner, not the currently active editor', () => {
    const pe = makePresentationEditorStub(bodyEditor, headerEditorA, 'header');
    const handle = pe.captureCurrentSelectionHandle();

    // Switch to header B
    const pe2 = makePresentationEditorStub(bodyEditor, headerEditorB, 'header');
    pe2.releaseSelectionHandle(handle);

    expect(headerEditorA.releaseSelectionHandle).toHaveBeenCalledWith(handle);
    expect(headerEditorB.releaseSelectionHandle).not.toHaveBeenCalled();
  });

  it('body handle resolves against body editor when header is active', () => {
    // Capture on body
    const peBody = makePresentationEditorStub(bodyEditor, bodyEditor, 'body');
    const bodyHandle = peBody.captureCurrentSelectionHandle();

    // Switch to header mode
    const peHeader = makePresentationEditorStub(bodyEditor, headerEditorA, 'header');
    const ctx = peHeader.resolveSelectionHandle(bodyHandle);

    expect(ctx).not.toBeNull();
    expect(ctx!.surface).toBe('body');
    expect(bodyEditor.resolveSelectionHandle).toHaveBeenCalledWith(bodyHandle);
  });

  it('resolveSelectionHandle returns null when underlying resolve returns null', () => {
    const pe = makePresentationEditorStub(bodyEditor, headerEditorA, 'header');
    (headerEditorA.resolveSelectionHandle as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const handle = pe.captureCurrentSelectionHandle();
    const ctx = pe.resolveSelectionHandle(handle);
    expect(ctx).toBeNull();
  });
});
