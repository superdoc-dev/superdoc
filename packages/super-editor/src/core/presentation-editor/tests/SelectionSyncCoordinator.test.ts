import { describe, expect, it } from 'vitest';

import { SelectionSyncCoordinator, type SelectionSyncScheduler } from '../SelectionSyncCoordinator.js';

function createManualScheduler(): {
  scheduler: SelectionSyncScheduler;
  flush: () => void;
  hasPending: () => boolean;
} {
  let cb: FrameRequestCallback | null = null;
  return {
    scheduler: {
      requestAnimationFrame: (next) => {
        cb = next;
        return 1;
      },
      cancelAnimationFrame: () => {
        cb = null;
      },
    },
    flush: () => {
      const fn = cb;
      cb = null;
      fn?.(0);
    },
    hasPending: () => cb != null,
  };
}

describe('SelectionSyncCoordinator', () => {
  it('does not render until explicitly requested', () => {
    const { scheduler, hasPending } = createManualScheduler();
    const coordinator = new SelectionSyncCoordinator({ scheduler });
    coordinator.setDocEpoch(0);
    coordinator.onLayoutComplete(0);
    expect(hasPending()).toBe(false);
  });

  it('renders when epochs match and not updating', () => {
    const { scheduler, flush, hasPending } = createManualScheduler();
    const coordinator = new SelectionSyncCoordinator({ scheduler });
    coordinator.setDocEpoch(2);
    coordinator.onLayoutComplete(2);

    const calls: Array<{ docEpoch: number; layoutEpoch: number }> = [];
    coordinator.on('render', (payload) => calls.push(payload));

    coordinator.requestRender();
    expect(hasPending()).toBe(true);
    flush();
    expect(calls).toEqual([{ docEpoch: 2, layoutEpoch: 2 }]);
  });

  it('defers render when layout is behind doc', () => {
    const { scheduler, flush, hasPending } = createManualScheduler();
    const coordinator = new SelectionSyncCoordinator({ scheduler });
    coordinator.setDocEpoch(5);
    coordinator.onLayoutComplete(4);

    const calls: Array<{ docEpoch: number; layoutEpoch: number }> = [];
    coordinator.on('render', (payload) => calls.push(payload));

    coordinator.requestRender();
    expect(hasPending()).toBe(false);
    flush();
    expect(calls).toEqual([]);

    coordinator.onLayoutComplete(5);
    expect(hasPending()).toBe(true);
    flush();
    expect(calls).toEqual([{ docEpoch: 5, layoutEpoch: 5 }]);
  });

  it('defers render while layout updating even if epochs match', () => {
    const { scheduler, flush, hasPending } = createManualScheduler();
    const coordinator = new SelectionSyncCoordinator({ scheduler });
    coordinator.setDocEpoch(1);
    coordinator.onLayoutComplete(1);

    const calls: Array<{ docEpoch: number; layoutEpoch: number }> = [];
    coordinator.on('render', (payload) => calls.push(payload));

    coordinator.onLayoutStart();
    coordinator.requestRender();
    expect(hasPending()).toBe(false);
    flush();
    expect(calls).toEqual([]);

    coordinator.onLayoutComplete(1);
    expect(hasPending()).toBe(true);
    flush();
    expect(calls).toEqual([{ docEpoch: 1, layoutEpoch: 1 }]);
  });

  it('flushNow renders immediately when safe', () => {
    const { scheduler, hasPending } = createManualScheduler();
    const coordinator = new SelectionSyncCoordinator({ scheduler });
    coordinator.setDocEpoch(3);
    coordinator.onLayoutComplete(3);

    const calls: Array<{ docEpoch: number; layoutEpoch: number }> = [];
    coordinator.on('render', (payload) => calls.push(payload));

    coordinator.requestRender({ immediate: true });
    expect(calls).toEqual([{ docEpoch: 3, layoutEpoch: 3 }]);
    expect(hasPending()).toBe(false);
  });
});
