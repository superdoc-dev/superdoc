import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Stub for `ui.selection.restore` tests. The helper accesses
 * `editor.isEditable` and `editor.commands.setTextSelection({ from, to })`
 * directly; the rest of the editor surface is unused so the stub is
 * minimal.
 */
function makeStubs(opts: { isEditable?: boolean; resolves?: boolean } = {}) {
  const isEditable = opts.isEditable ?? true;
  const resolves = opts.resolves ?? true;

  const setTextSelection = vi.fn(() => true);

  // Model a doc with one matching block id so `resolveTextTarget`
  // succeeds. Without `resolves`, a stub doc with no blocks returns
  // null from the resolver and surfaces 'stale'.
  const docContent = resolves
    ? [{ type: { name: 'paragraph' }, attrs: { id: 'b1' }, content: { size: 10 }, nodeSize: 12 }]
    : [];

  const editor = {
    on: vi.fn(),
    off: vi.fn(),
    isEditable,
    state: {
      doc: {
        descendants: (visitor: (node: unknown, pos: number) => boolean | void) => {
          for (let i = 0; i < docContent.length; i += 1) visitor(docContent[i], i + 1);
        },
        nodeAt: () => null,
        content: { size: 100 },
      },
    },
    commands: { setTextSelection },
    doc: {
      selection: { current: vi.fn(() => ({ empty: true })) },
      comments: {
        list: vi.fn(() => ({
          evaluatedRevision: 'r1',
          total: 0,
          items: [],
          page: { limit: 0, offset: 0, returned: 0 },
        })),
      },
      trackChanges: {
        list: vi.fn(() => ({
          evaluatedRevision: 'r1',
          total: 0,
          items: [],
          page: { limit: 0, offset: 0, returned: 0 },
        })),
      },
    },
  };

  const superdoc: SuperDocLike = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };

  return { superdoc, editor, mocks: { setTextSelection } };
}

const bodyCapture = Object.freeze({
  empty: false,
  target: { kind: 'text', segments: [{ blockId: 'b1', range: { start: 0, end: 4 } }] },
  selectionTarget: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
  quotedText: 'test',
}) as never;

describe('ui.selection.restore', () => {
  it('returns { success: false, reason: "not-ready" } when no editor is mounted', () => {
    const { superdoc } = makeStubs();
    (superdoc as unknown as { activeEditor: unknown }).activeEditor = null;
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'not-ready' });
    ui.destroy();
  });

  it('returns { success: false, reason: "read-only" } when editor.isEditable is false', () => {
    const { superdoc } = makeStubs({ isEditable: false });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'read-only' });
    ui.destroy();
  });

  it('returns { success: false, reason: "missing-target" } for a capture with null target', () => {
    const { superdoc } = makeStubs();
    const ui = createSuperDocUI({ superdoc });

    const empty = Object.freeze({
      empty: false,
      target: null,
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: '',
    }) as never;

    expect(ui.selection.restore(empty)).toEqual({ success: false, reason: 'missing-target' });
    ui.destroy();
  });

  it('returns { success: false, reason: "stale" } when the captured block id no longer resolves', () => {
    const { superdoc } = makeStubs({ resolves: false });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'stale' });
    ui.destroy();
  });

  it('returns { success: false, reason: "not-ready" } when editor.commands.setTextSelection is missing', () => {
    const { superdoc, editor } = makeStubs();
    (editor as unknown as { commands: unknown }).commands = {};
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'not-ready' });
    ui.destroy();
  });
});
