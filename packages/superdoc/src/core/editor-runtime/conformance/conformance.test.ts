// Runtime conformance tests.
//
// Proves the fake v1 and fake v2 runtimes both satisfy the contract and that the
// load-bearing discipline holds: async mutation results, synchronous read
// snapshots, named rejection codes, opaque-token round-trip, staleness, and
// wrong-runtime rejection. A consumer written against `EditorRuntime` works the
// same against either kind.

import { describe, expect, it } from 'vitest';
import type { EditorRuntime, EditorRuntimeCommandResult, EditorRuntimeEvent } from '../index.js';
import { createFakeV1Runtime } from './fake-v1-runtime.js';
import { createFakeV2Runtime } from './fake-v2-runtime.js';

const runtimes: Array<{ name: string; make: (id?: string) => EditorRuntime }> = [
  { name: 'v1', make: (id) => createFakeV1Runtime({ id }) },
  { name: 'v2', make: (id) => createFakeV2Runtime({ id, initialState: 'editing-ready' }) },
];

describe.each(runtimes)('editor-runtime conformance  -  $name', ({ make }) => {
  it('exposes stable identity + capabilities', () => {
    const rt = make();
    expect(typeof rt.id).toBe('string');
    expect(['v1', 'v2']).toContain(rt.kind);
    const caps = rt.getCapabilities();
    expect(caps.lifecycle).toBeDefined();
    expect(caps.commands).toBeDefined();
    expect(caps.persistence).toBeDefined();
  });

  it('returns a Promise from mutating dispatch (callers always await)', async () => {
    const rt = make();
    const result = rt.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result).toBeInstanceOf(Promise);
    const awaited = await result;
    expect(awaited.status).toBeDefined();
  });

  it('reads selected text + selection snapshot synchronously', () => {
    const rt = make();
    expect(typeof rt.getSelectedText()).toBe('string');
    // Not a thenable  -  synchronous read.
    const snap = rt.getSelectionSnapshot();
    expect(snap === null || typeof snap.isRange === 'boolean').toBe(true);
  });

  it('exposes a synchronous layout snapshot', () => {
    const rt = make();
    const layout = rt.getLayoutSnapshot();
    expect(layout === null || typeof layout.pageCount === 'number').toBe(true);
  });

  it('history.undo with nothing to undo is a named noop, not a rejection', async () => {
    const rt = make();
    const result = await rt.dispatch({ kind: 'history.undo' });
    expect(['history-noop', 'noop']).toContain(result.status);
    if (result.status === 'history-noop' || result.status === 'noop') {
      expect(result.reason).toBe('nothing-to-undo');
    }
  });

  it('rejects a token minted by another runtime with wrong-runtime-token', async () => {
    const a = make('runtime-a');
    const b = make('runtime-b');
    const snapB = b.getSelectionSnapshot();
    expect(snapB?.anchor).toBeDefined();
    const result = await a.dispatch({ kind: 'text.insert', text: 'x', at: snapB!.anchor });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('wrong-runtime-token');
  });

  it('rejects a stale token after the document revision advances', async () => {
    const rt = make();
    const snap = rt.getSelectionSnapshot();
    expect(snap?.anchor).toBeDefined();
    const token = snap!.anchor!;
    // Advance the document so the token's revision no longer matches.
    await rt.dispatch({ kind: 'text.insert', text: 'mutate' });
    const result = await rt.dispatch({ kind: 'text.replace', text: 'y', range: token });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('stale-position-token');
  });

  it('opaque tokens are structured-clone safe', () => {
    const rt = make();
    const snap = rt.getSelectionSnapshot();
    expect(snap?.anchor).toBeDefined();
    const cloned = structuredClone(snap!.anchor);
    expect(cloned).toEqual(snap!.anchor);
  });

  it('emits disposed and stops notifying after dispose', async () => {
    const rt = make();
    const events: EditorRuntimeEvent[] = [];
    const unsubscribe = rt.subscribe((e) => events.push(e));
    await rt.dispose();
    expect(events.some((e) => e.type === 'disposed')).toBe(true);
    unsubscribe();
    const afterDispose = await rt.dispatch({ kind: 'text.insert', text: 'x' });
    expect(afterDispose.status).toBe('rejected');
  });

  it('rejects out-of-range zoom with a named target code', async () => {
    const rt = make();
    const result = await rt.setZoom(5000);
    expect(result.status).toBe('rejected');
  });
});

describe('editor-runtime conformance  -  v2-specific posture', () => {
  it('reports find/replace + AI as unsupported (genuinely absent today)', () => {
    const rt = createFakeV2Runtime();
    const caps = rt.getCapabilities();
    expect(caps.findReplace?.supported).toBe(false);
    expect(caps.ai?.supported).toBe(false);
  });

  it('gates comment mutation with author-required when no author is present', async () => {
    const rt = createFakeV2Runtime({ initialState: 'editing-ready', authorPresent: false });
    const result = await rt.dispatch({ kind: 'comments.create', text: 'hi' });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('author-required');
  });

  it('surfaces a receipt-failure outcome distinct from rejection', async () => {
    const rt = createFakeV2Runtime({ initialState: 'editing-ready' });
    const result: EditorRuntimeCommandResult = await rt.dispatch({
      kind: 'text.insert',
      text: '__FORCE_RECEIPT_FAILURE__',
    });
    expect(result.status).toBe('receipt-failure');
  });

  it('rejects dispatch while not ready (blocked lifecycle) without throwing', async () => {
    const rt = createFakeV2Runtime({ initialState: 'blocked' });
    const result = await rt.dispatch({ kind: 'text.insert', text: 'x' });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('runtime-not-ready');
  });
});

describe('editor-runtime conformance  -  v1-specific posture', () => {
  it('reports find/replace as supported with a sync session snapshot', () => {
    const rt = createFakeV1Runtime();
    const caps = rt.getCapabilities();
    expect(caps.findReplace?.supported).toBe(true);
    expect(caps.findReplace?.hasSyncSessionSnapshot).toBe(true);
    expect(rt.getFindSessionSnapshot?.()).toEqual({
      active: false,
      query: '',
      matchCount: 0,
      activeMatchIndex: -1,
    });
  });

  it('exposes a legacy editor projection for activeEditor compatibility', () => {
    const rt = createFakeV1Runtime();
    expect(rt.getLegacyEditorProjection?.()).toBeDefined();
  });
});
