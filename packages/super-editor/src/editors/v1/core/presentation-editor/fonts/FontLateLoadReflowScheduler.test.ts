import { describe, it, expect } from 'vitest';
import { FontLateLoadReflowScheduler, type FontReflowFlushDetails } from './FontLateLoadReflowScheduler';

/** Virtual clock: fires injected timers in due order as the test advances time. */
function makeClock() {
  let nowMs = 0;
  let seq = 0;
  const timers = new Map<number, { due: number; cb: () => void }>();
  return {
    scheduleTimeout: (cb: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { due: nowMs + ms, cb });
      return id;
    },
    cancelTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance: (ms: number) => {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due);
        if (due.length === 0) break;
        const [id, t] = due[0];
        timers.delete(id);
        nowMs = t.due;
        t.cb();
      }
      nowMs = target;
    },
  };
}

function makeScheduler(overrides: { quietMs?: number; cooldownMs?: number } = {}) {
  const clock = makeClock();
  const flushes: FontReflowFlushDetails[] = [];
  const scheduler = new FontLateLoadReflowScheduler({
    quietMs: overrides.quietMs ?? 250,
    cooldownMs: overrides.cooldownMs ?? 2000,
    flush: (d) => flushes.push(d),
    scheduleTimeout: clock.scheduleTimeout,
    cancelTimeout: clock.cancelTimeout,
  });
  return { scheduler, clock, flushes };
}

describe('FontLateLoadReflowScheduler', () => {
  it('coalesces a burst into a single leading flush', () => {
    const { scheduler, clock, flushes } = makeScheduler();
    scheduler.schedule(['a']);
    scheduler.schedule(['b']);
    scheduler.schedule(['c']);
    expect(flushes).toHaveLength(0);
    clock.advance(250);
    expect(flushes).toHaveLength(1);
    expect(flushes[0].reason).toBe('quiet');
    expect(new Set(flushes[0].faceKeys)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('bounds SPACED-OUT waves: 40 arrivals 500ms apart produce far fewer than 40 flushes', () => {
    // The slow-network case: waves farther apart than the quiet window. A plain debounce
    // would flush once per wave (40); the cooldown throttle bounds it to ~total/cooldown.
    const { scheduler, clock, flushes } = makeScheduler({ quietMs: 250, cooldownMs: 2000 });
    for (let i = 0; i < 40; i++) {
      scheduler.schedule([`f${i}`]);
      clock.advance(500);
    }
    clock.advance(2500); // let the final cooldown drain
    expect(flushes.length).toBeGreaterThan(1);
    expect(flushes.length).toBeLessThan(15); // ~ 20s / 2s cooldown, NOT 40
  });

  it('defers arrivals during a cooldown into one trailing flush', () => {
    const { scheduler, clock, flushes } = makeScheduler({ quietMs: 250, cooldownMs: 2000 });
    scheduler.schedule(['a']);
    clock.advance(250); // leading flush of 'a'
    expect(flushes).toHaveLength(1);
    scheduler.schedule(['b']); // during cooldown -> deferred
    scheduler.schedule(['c']);
    clock.advance(100);
    expect(flushes).toHaveLength(1); // still deferred
    clock.advance(2000); // cooldown ends -> one trailing flush
    expect(flushes).toHaveLength(2);
    expect(flushes[1].reason).toBe('throttle');
    expect(new Set(flushes[1].faceKeys)).toEqual(new Set(['b', 'c']));
  });

  it('does not flush twice for a repeated same face key', () => {
    const { scheduler, clock, flushes } = makeScheduler();
    scheduler.schedule(['a']);
    scheduler.schedule(['a']);
    clock.advance(250);
    expect(flushes).toHaveLength(1);
    expect(flushes[0].faceKeys).toEqual(['a']);
  });

  it('cancel() drops pending work without flushing', () => {
    const { scheduler, clock, flushes } = makeScheduler();
    scheduler.schedule(['a', 'b']);
    scheduler.cancel();
    clock.advance(10000);
    expect(flushes).toHaveLength(0);
  });

  it('starts a fresh quiet window after the cooldown drains idle', () => {
    const { scheduler, clock, flushes } = makeScheduler({ quietMs: 250, cooldownMs: 2000 });
    scheduler.schedule(['a']);
    clock.advance(250); // flush 'a'
    clock.advance(2000); // cooldown elapses with nothing pending -> idle
    expect(flushes).toHaveLength(1);
    scheduler.schedule(['b']);
    clock.advance(250); // fresh leading flush
    expect(flushes).toHaveLength(2);
    expect(flushes[1].reason).toBe('quiet');
    expect(flushes[1].faceKeys).toEqual(['b']);
  });

  it('a throwing flush does not escape the timer callback and still arms the cooldown', () => {
    const clock = makeClock();
    let throwOnce = true;
    const reasons: string[] = [];
    const scheduler = new FontLateLoadReflowScheduler({
      quietMs: 250,
      cooldownMs: 2000,
      flush: (d) => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('flush blew up');
        }
        reasons.push(d.reason);
      },
      scheduleTimeout: clock.scheduleTimeout,
      cancelTimeout: clock.cancelTimeout,
    });

    scheduler.schedule(['a']);
    // The quiet flush throws; advancing the timers must NOT surface an uncaught exception.
    expect(() => clock.advance(300)).not.toThrow();

    // The cooldown was still armed despite the throw: an arrival now defers to its end and a
    // trailing flush drains it, proving the rate bound survived the throwing flush.
    scheduler.schedule(['b']);
    clock.advance(2100);
    expect(reasons).toEqual(['throttle']);
  });
});
