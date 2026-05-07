import { describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

// Pin the resolver so tests can exercise the post-resolve code paths
// (text-equivalence check, dispatch to setTextSelection) without
// constructing a real PM document.
vi.mock('../editors/v1/document-api-adapters/helpers/adapter-utils.js', () => ({
  resolveTextTarget: (editor: unknown, target: { blockId: string }) => {
    if ((editor as { __resolverMode?: string })?.__resolverMode === 'null') return null;
    if (target.blockId === 'b1') return { from: 1, to: 5 };
    return null;
  },
}));

/**
 * Stub for `ui.selection.restore` tests. The helper accesses
 * `editor.isEditable` and `editor.commands.setTextSelection({ from, to })`
 * directly; the rest of the editor surface is unused so the stub is
 * minimal.
 */
function makeStubs(
  opts: {
    isEditable?: boolean;
    resolves?: boolean;
    liveText?: string;
    activeStoryLocator?: unknown;
  } = {},
) {
  const isEditable = opts.isEditable ?? true;
  const resolves = opts.resolves ?? true;
  const liveText = opts.liveText ?? 'test';

  const setTextSelection = vi.fn(() => true);
  const getActiveStoryLocator = vi.fn(() => opts.activeStoryLocator ?? null);

  // Self-reference threaded into presentationEditor below so that
  // resolveToolbarSources (called from createHeadlessToolbar during
  // setup) can route through `presentationEditor.getActiveEditor()`.
  const editor: Record<string, unknown> = {
    on: vi.fn(),
    off: vi.fn(),
    isEditable,
    // Switches the mocked `resolveTextTarget` between "succeeds" and
    // "returns null" without rebuilding a real PM document for unit
    // boundary testing.
    __resolverMode: resolves ? 'ok' : 'null',
    state: {
      doc: {
        textBetween: () => liveText,
      },
      selection: { empty: true },
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
  editor.presentationEditor = {
    getActiveEditor: () => editor,
    getActiveStoryLocator,
    isEditable,
    state: { selection: { empty: true } },
    commands: {},
    on: vi.fn(),
    off: vi.fn(),
  };

  const superdoc: SuperDocLike = {
    activeEditor: editor as never,
    config: { documentMode: 'editing' },
    on: vi.fn(),
    off: vi.fn(),
  };

  return { superdoc, editor, mocks: { setTextSelection, getActiveStoryLocator } };
}

const headerStory = Object.freeze({ kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' }) as never;
const headerCapture = Object.freeze({
  empty: false,
  target: {
    kind: 'text',
    segments: [{ blockId: 'b1', range: { start: 0, end: 4 } }],
    story: headerStory,
  },
  selectionTarget: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
  quotedText: 'test',
}) as never;

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

  it('returns { success: false, reason: "stale" } when the live text at the resolved range no longer matches the capture', () => {
    // The block id still resolves and offsets stay in bounds, but the
    // text at those offsets has shifted (e.g. a collaborator inserted
    // text earlier in the same paragraph). The text-equivalence check
    // catches this and refuses to silently report success.
    const { superdoc } = makeStubs({ liveText: 'shifted contents at same offset' });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'stale' });
    ui.destroy();
  });

  it('skips the text-equivalence check for collapsed captures (no range to misplace)', () => {
    // A collapsed capture has quotedText === ''. textBetween at equal
    // positions is also '', so the check is a trivial pass — but the
    // stub returns 'mismatch' to prove we don't run the comparison
    // for collapsed captures.
    const { superdoc, mocks } = makeStubs({ liveText: 'should not be compared' });
    const ui = createSuperDocUI({ superdoc });

    const collapsed = Object.freeze({
      empty: true,
      target: { kind: 'text', segments: [{ blockId: 'b1', range: { start: 0, end: 0 } }] },
      selectionTarget: null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
      quotedText: '',
    }) as never;

    expect(ui.selection.restore(collapsed)).toEqual({ success: true });
    expect(mocks.setTextSelection).toHaveBeenCalledTimes(1);
    ui.destroy();
  });

  it('returns { success: false, reason: "not-ready" } when editor.commands.setTextSelection is missing', () => {
    const { superdoc, editor } = makeStubs();
    (editor as unknown as { commands: unknown }).commands = {};
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(bodyCapture)).toEqual({ success: false, reason: 'not-ready' });
    ui.destroy();
  });

  // SD-2954: a capture taken while editing a header carries
  // `target.story`. Restore must verify the active surface still
  // matches the captured story before resolving block ids. Body's
  // PM doc usually doesn't contain the header's blockId, so the
  // implicit failure path would surface as `'stale'` anyway, but
  // the explicit check makes the intent unambiguous and lets the
  // helper short-circuit before touching the resolver.
  it('succeeds when the captured story matches the active story (header round-trip)', () => {
    const { superdoc, mocks } = makeStubs({ activeStoryLocator: headerStory });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(headerCapture)).toEqual({ success: true });
    expect(mocks.setTextSelection).toHaveBeenCalledTimes(1);
    ui.destroy();
  });

  it('returns "stale" when the captured story is no longer active (focus moved back to body)', () => {
    const { superdoc, mocks } = makeStubs({ activeStoryLocator: null });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(headerCapture)).toEqual({ success: false, reason: 'stale' });
    // Short-circuited before any resolver / dispatch work.
    expect(mocks.setTextSelection).not.toHaveBeenCalled();
    ui.destroy();
  });

  it('returns "stale" when the active story differs from the captured story (different header refId)', () => {
    const otherHeader = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId-OTHER' };
    const { superdoc, mocks } = makeStubs({ activeStoryLocator: otherHeader });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(headerCapture)).toEqual({ success: false, reason: 'stale' });
    expect(mocks.setTextSelection).not.toHaveBeenCalled();
    ui.destroy();
  });

  // The story-mismatch short-circuit must not pre-empt the
  // `read-only` guard. A consumer storing a header capture and
  // restoring against an editor that has been switched to viewing
  // mode should still see `read-only`. Losing that typed reason
  // would push consumers into branching on `'stale'` to detect
  // viewing mode, which is what `read-only` exists to avoid.
  it('returns "read-only" (not "stale") when a story capture meets a non-editable editor', () => {
    const { superdoc } = makeStubs({ isEditable: false, activeStoryLocator: null });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(headerCapture)).toEqual({ success: false, reason: 'read-only' });
    ui.destroy();
  });

  it('matches the captured story by value, not by object identity', () => {
    // The host emits a fresh locator object on every call to
    // `getActiveStoryLocator()`. The match must hold even though the
    // capture's story object and the active story object are not the
    // same JS reference, so long as their discriminating fields agree.
    const equivalentHeader = { kind: 'story', storyType: 'headerFooterPart', refId: 'rId7' };
    const { superdoc, mocks } = makeStubs({ activeStoryLocator: equivalentHeader });
    const ui = createSuperDocUI({ superdoc });

    expect(ui.selection.restore(headerCapture)).toEqual({ success: true });
    expect(mocks.setTextSelection).toHaveBeenCalledTimes(1);
    ui.destroy();
  });
});
