import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSuperDocUI } from './create-super-doc-ui.js';
import type { SuperDocLike } from './types.js';

/**
 * Verifies the value-shaped `observe(snapshot => ...)` aliases on
 * every domain handle (SD-2919). The aliases sit alongside the
 * existing `subscribe(({ snapshot }) => ...)` form and emit the same
 * sequence with the snapshot unwrapped, matching the per-command
 * `observe(state => ...)` shape on `ui.commands.<id>.observe`.
 *
 * What the tests pin:
 * - Every domain handle exposes `observe`.
 * - The first emit is synchronous with the current snapshot.
 * - The unsubscribe returned by `observe` actually detaches the
 *   listener.
 * - The legacy `subscribe` keeps emitting with the event-wrapped
 *   shape so existing consumers don't churn.
 */
function makeSuperdocStub(): SuperDocLike {
  return {
    activeEditor: {
      on: vi.fn(),
      off: vi.fn(),
      doc: {
        selection: {
          current: vi.fn(() => ({ empty: true, text: undefined, target: null })),
        },
      },
    },
    config: { documentMode: 'editing' },
    fonts: {
      getDocumentFontOptions: vi.fn(() => []),
    },
    on: vi.fn(),
    off: vi.fn(),
  };
}

describe('domain handle observe() aliases (SD-2919)', () => {
  let teardown: Array<() => void> = [];

  afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
  });

  it('ui.document.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.document.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toEqual(ui.document.getSnapshot());
    off();
  });

  it('ui.selection.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.selection.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toEqual(ui.selection.getSnapshot());
    off();
  });

  it('ui.toolbar.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.toolbar.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    // `state.toolbar` is sourced from the headless-toolbar controller,
    // so identity equality with `getSnapshot()` is brittle. Pin the
    // shape instead.
    expect(fn.mock.calls[0]![0]).toMatchObject({
      context: expect.anything(),
      commands: expect.any(Object),
    });
    off();
  });

  it('ui.comments.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.comments.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toEqual(ui.comments.getSnapshot());
    off();
  });

  it('ui.trackChanges.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.trackChanges.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toEqual(ui.trackChanges.getSnapshot());
    off();
  });

  it('ui.fonts.observe fires synchronously with the snapshot', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.fonts.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toEqual(ui.fonts.getSnapshot());
    off();
  });

  it('the unsubscribe returned by observe stops further emissions', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.document.observe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    // No remaining listeners — destroy should not re-fire the listener.
    ui.destroy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('subscribe still emits the event-wrapped shape (no churn for existing consumers)', () => {
    const ui = createSuperDocUI({ superdoc: makeSuperdocStub() });
    teardown.push(() => ui.destroy());

    const fn = vi.fn();
    const off = ui.document.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toHaveProperty('snapshot');
    expect(fn.mock.calls[0]![0]!.snapshot).toEqual(ui.document.getSnapshot());
    off();
  });
});
