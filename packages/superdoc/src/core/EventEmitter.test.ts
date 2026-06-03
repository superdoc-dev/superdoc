import { describe, expect, it, vi } from 'vitest';

import { EventEmitter, type DefaultEventMap } from './EventEmitter';

/**
 * Focused tests for the SD-3213 EventEmitter drain. Both `on()` branches
 * need coverage because the SD-3213 internal cast `as EventCallback` was
 * added there (the storage `Map<keyof EventMap, EventCallback[]>`
 * default-erases the per-event tuple). Whiteboard only subscribes one
 * listener per event in practice, so the multi-listener path was
 * previously uncovered.
 */
interface TestEventMap extends DefaultEventMap {
  ping: [{ id: string }];
  empty: [];
}

describe('EventEmitter (SD-3213 drain)', () => {
  describe('on()', () => {
    it('registers the first listener via the "set" branch', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const listener = vi.fn();

      emitter.on('ping', listener);
      emitter.emit('ping', { id: '1' });

      expect(listener).toHaveBeenCalledWith({ id: '1' });
    });

    it('appends the Nth listener via the "push" branch', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const first = vi.fn();
      const second = vi.fn();
      const third = vi.fn();

      // Same event name three times — first goes through the `set` branch,
      // second and third go through the `if (callbacks) callbacks.push(...)`
      // branch where the SD-3213 internal cast lives.
      emitter.on('ping', first);
      emitter.on('ping', second);
      emitter.on('ping', third);

      emitter.emit('ping', { id: '42' });

      expect(first).toHaveBeenCalledWith({ id: '42' });
      expect(second).toHaveBeenCalledWith({ id: '42' });
      expect(third).toHaveBeenCalledWith({ id: '42' });
    });
  });

  describe('emit / off / once', () => {
    it('is a no-op when emitting an event with no subscribers', () => {
      const emitter = new EventEmitter<TestEventMap>();
      expect(() => emitter.emit('ping', { id: 'x' })).not.toThrow();
    });

    it('removes a specific listener with off(name, fn)', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const keep = vi.fn();
      const drop = vi.fn();
      emitter.on('ping', keep);
      emitter.on('ping', drop);

      emitter.off('ping', drop);
      emitter.emit('ping', { id: '7' });

      expect(keep).toHaveBeenCalledWith({ id: '7' });
      expect(drop).not.toHaveBeenCalled();
    });

    it('removes all listeners for an event with off(name)', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('ping', a);
      emitter.on('ping', b);

      emitter.off('ping');
      emitter.emit('ping', { id: '7' });

      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it('once() fires exactly one time', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const listener = vi.fn();

      emitter.once('ping', listener);
      emitter.emit('ping', { id: '1' });
      emitter.emit('ping', { id: '2' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ id: '1' });
    });

    it('removeAllListeners() clears every subscription', () => {
      const emitter = new EventEmitter<TestEventMap>();
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('ping', a);
      emitter.on('empty', b);

      emitter.removeAllListeners();
      emitter.emit('ping', { id: '1' });
      emitter.emit('empty');

      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });
  });
});
