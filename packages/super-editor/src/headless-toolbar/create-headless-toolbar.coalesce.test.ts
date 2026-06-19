/**
 * SD-3432: source events are coalesced per microtask. A single keystroke
 * fires both 'transaction' and 'selectionUpdate' synchronously; rebuilding
 * the toolbar snapshot twice per keystroke cost ~15ms on large documents.
 * One refresh per burst, same observable snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedOnChange: (() => void) | null = null;
const unsubscribeSpy = vi.fn();

vi.mock('./subscribe-toolbar-events.js', () => ({
  subscribeToolbarEvents: vi.fn((_options: unknown, onChange: () => void) => {
    capturedOnChange = onChange;
    return unsubscribeSpy;
  }),
}));

import { createHeadlessToolbar } from './create-headless-toolbar.js';

const flushMicrotasks = () => Promise.resolve();

const makeOptions = () =>
  ({
    superdoc: { activeEditor: null, config: {} },
  }) as unknown as Parameters<typeof createHeadlessToolbar>[0];

describe('headless toolbar refresh coalescing (SD-3432)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnChange = null;
  });

  it('coalesces a same-tick event burst into one refresh', async () => {
    const controller = createHeadlessToolbar(makeOptions());
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();

    // A keystroke: 'transaction' + 'selectionUpdate' fire synchronously.
    capturedOnChange!();
    capturedOnChange!();
    capturedOnChange!();
    expect(listener).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ snapshot: controller.getSnapshot() });
  });

  it('separate ticks refresh separately', async () => {
    const controller = createHeadlessToolbar(makeOptions());
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();

    capturedOnChange!();
    await flushMicrotasks();
    capturedOnChange!();
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a destroyed controller never refreshes from a queued burst', async () => {
    const controller = createHeadlessToolbar(makeOptions());
    const listener = vi.fn();
    controller.subscribe(listener);
    listener.mockClear();

    capturedOnChange!();
    controller.destroy();
    await flushMicrotasks();

    expect(listener).not.toHaveBeenCalled();
  });
});
