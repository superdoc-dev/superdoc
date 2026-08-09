/**
 * Tests for DebouncedPassManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vite-plus/test';
import { DebouncedPassManager, type DebouncedPass } from '../src/debounced-passes';

describe('DebouncedPassManager', () => {
  let manager: DebouncedPassManager;

  beforeEach(() => {
    manager = new DebouncedPassManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register', () => {
    it('should register a pass', () => {
      const pass: DebouncedPass = {
        id: 'test-pass',
        delay: 100,
        priority: 1,
        execute: vi.fn(),
      };

      manager.register(pass);

      expect(manager.getRegisteredPasses()).toContain('test-pass');
    });

    it('should allow registering multiple passes', () => {
      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: vi.fn() });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: vi.fn() });
      manager.register({ id: 'pass3', delay: 300, priority: 3, execute: vi.fn() });

      expect(manager.getRegisteredPasses()).toHaveLength(3);
    });

    it('should ignore pass with empty id', () => {
      manager.register({ id: '', delay: 100, priority: 1, execute: vi.fn() });

      expect(manager.getRegisteredPasses()).toHaveLength(0);
    });

    it('should ignore pass with negative delay', () => {
      manager.register({ id: 'test', delay: -1, priority: 1, execute: vi.fn() });

      expect(manager.getRegisteredPasses()).toHaveLength(0);
    });

    it('should replace existing pass with same id', () => {
      const execute1 = vi.fn();
      const execute2 = vi.fn();

      manager.register({ id: 'test', delay: 100, priority: 1, execute: execute1 });
      manager.register({ id: 'test', delay: 200, priority: 2, execute: execute2 });

      const pass = manager.getPass('test');
      expect(pass?.delay).toBe(200);
      expect(pass?.priority).toBe(2);
    });
  });

  describe('trigger', () => {
    it('should execute pass after delay', async () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');
      expect(execute).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on subsequent triggers', async () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');
      await vi.advanceTimersByTimeAsync(50);

      manager.trigger('test'); // Reset timer
      await vi.advanceTimersByTimeAsync(50);

      expect(execute).not.toHaveBeenCalled(); // Still 50ms to go

      await vi.advanceTimersByTimeAsync(50);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should mark pass as pending after trigger', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      expect(manager.isPending('test')).toBe(false);

      manager.trigger('test');
      expect(manager.isPending('test')).toBe(true);
    });

    it('should clear pending state after execution', async () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      manager.trigger('test');
      expect(manager.isPending('test')).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(manager.isPending('test')).toBe(false);
    });

    it('should ignore trigger for unregistered pass', async () => {
      manager.trigger('nonexistent');

      expect(manager.isPending('nonexistent')).toBe(false);
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should handle async execute functions', async () => {
      const execute = vi.fn().mockResolvedValue(undefined);
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');
      await vi.advanceTimersByTimeAsync(100);

      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle execute function errors gracefully', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('Test error'));
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');

      // Should not throw
      await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();
    });
  });

  describe('cancel', () => {
    it('should cancel a pending pass', async () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');
      manager.cancel('test');

      await vi.advanceTimersByTimeAsync(200);
      expect(execute).not.toHaveBeenCalled();
    });

    it('should clear pending state on cancel', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      manager.trigger('test');
      expect(manager.isPending('test')).toBe(true);

      manager.cancel('test');
      expect(manager.isPending('test')).toBe(false);
    });

    it('should handle canceling non-pending pass', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      expect(() => manager.cancel('test')).not.toThrow();
    });

    it('should handle canceling unregistered pass', () => {
      expect(() => manager.cancel('nonexistent')).not.toThrow();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all pending passes', async () => {
      const execute1 = vi.fn();
      const execute2 = vi.fn();
      const execute3 = vi.fn();

      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: execute1 });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: execute2 });
      manager.register({ id: 'pass3', delay: 300, priority: 3, execute: execute3 });

      manager.trigger('pass1');
      manager.trigger('pass2');
      manager.trigger('pass3');

      expect(manager.getPendingCount()).toBe(3);

      manager.cancelAll();

      expect(manager.getPendingCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(500);
      expect(execute1).not.toHaveBeenCalled();
      expect(execute2).not.toHaveBeenCalled();
      expect(execute3).not.toHaveBeenCalled();
    });

    it('should handle cancelAll when no passes pending', () => {
      expect(() => manager.cancelAll()).not.toThrow();
    });
  });

  describe('isPending', () => {
    it('should return false for non-pending pass', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      expect(manager.isPending('test')).toBe(false);
    });

    it('should return true for pending pass', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      manager.trigger('test');
      expect(manager.isPending('test')).toBe(true);
    });

    it('should return false for unregistered pass', () => {
      expect(manager.isPending('nonexistent')).toBe(false);
    });
  });

  describe('getPendingCount', () => {
    it('should return 0 when no passes pending', () => {
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should return correct count of pending passes', () => {
      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: vi.fn() });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: vi.fn() });
      manager.register({ id: 'pass3', delay: 300, priority: 3, execute: vi.fn() });

      manager.trigger('pass1');
      manager.trigger('pass2');

      expect(manager.getPendingCount()).toBe(2);
    });

    it('should decrement count after execution', async () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      manager.trigger('test');
      expect(manager.getPendingCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe('unregister', () => {
    it('should unregister a pass', () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      expect(manager.getRegisteredPasses()).toContain('test');

      manager.unregister('test');

      expect(manager.getRegisteredPasses()).not.toContain('test');
    });

    it('should cancel pending execution when unregistering', async () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 100, priority: 1, execute });

      manager.trigger('test');
      manager.unregister('test');

      await vi.advanceTimersByTimeAsync(200);
      expect(execute).not.toHaveBeenCalled();
    });

    it('should handle unregistering non-existent pass', () => {
      expect(() => manager.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('getRegisteredPasses', () => {
    it('should return empty array when no passes registered', () => {
      expect(manager.getRegisteredPasses()).toEqual([]);
    });

    it('should return all registered pass IDs', () => {
      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: vi.fn() });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: vi.fn() });

      const passes = manager.getRegisteredPasses();
      expect(passes).toHaveLength(2);
      expect(passes).toContain('pass1');
      expect(passes).toContain('pass2');
    });
  });

  describe('clear', () => {
    it('should clear all registrations and timers', async () => {
      const execute = vi.fn();

      manager.register({ id: 'pass1', delay: 100, priority: 1, execute });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute });

      manager.trigger('pass1');
      manager.trigger('pass2');

      manager.clear();

      expect(manager.getRegisteredPasses()).toEqual([]);
      expect(manager.getPendingCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(300);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('getPass', () => {
    it('should return pass configuration', () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 100, priority: 5, execute });

      const pass = manager.getPass('test');

      expect(pass).toBeDefined();
      expect(pass?.id).toBe('test');
      expect(pass?.delay).toBe(100);
      expect(pass?.priority).toBe(5);
    });

    it('should return undefined for unregistered pass', () => {
      expect(manager.getPass('nonexistent')).toBeUndefined();
    });
  });

  describe('flushAll', () => {
    it('should execute all pending passes immediately', async () => {
      const execute1 = vi.fn();
      const execute2 = vi.fn();
      const execute3 = vi.fn();

      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: execute1 });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: execute2 });
      manager.register({ id: 'pass3', delay: 300, priority: 3, execute: execute3 });

      manager.trigger('pass1');
      manager.trigger('pass2');
      manager.trigger('pass3');

      await manager.flushAll();

      expect(execute1).toHaveBeenCalledTimes(1);
      expect(execute2).toHaveBeenCalledTimes(1);
      expect(execute3).toHaveBeenCalledTimes(1);
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should execute passes in priority order', async () => {
      const executionOrder: string[] = [];

      manager.register({
        id: 'low',
        delay: 100,
        priority: 1,
        execute: () => executionOrder.push('low'),
      });
      manager.register({
        id: 'high',
        delay: 200,
        priority: 10,
        execute: () => executionOrder.push('high'),
      });
      manager.register({
        id: 'medium',
        delay: 300,
        priority: 5,
        execute: () => executionOrder.push('medium'),
      });

      manager.trigger('low');
      manager.trigger('high');
      manager.trigger('medium');

      await manager.flushAll();

      expect(executionOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should handle empty flush', async () => {
      await expect(manager.flushAll()).resolves.not.toThrow();
    });
  });

  describe('flush', () => {
    it('should execute specific pass immediately', async () => {
      const execute1 = vi.fn();
      const execute2 = vi.fn();

      manager.register({ id: 'pass1', delay: 100, priority: 1, execute: execute1 });
      manager.register({ id: 'pass2', delay: 200, priority: 2, execute: execute2 });

      manager.trigger('pass1');
      manager.trigger('pass2');

      await manager.flush('pass1');

      expect(execute1).toHaveBeenCalledTimes(1);
      expect(execute2).not.toHaveBeenCalled();
      expect(manager.isPending('pass1')).toBe(false);
      expect(manager.isPending('pass2')).toBe(true);
    });

    it('should handle flushing non-pending pass', async () => {
      manager.register({ id: 'test', delay: 100, priority: 1, execute: vi.fn() });

      await expect(manager.flush('test')).resolves.not.toThrow();
    });

    it('should handle flushing unregistered pass', async () => {
      await expect(manager.flush('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('common debounce scenarios', () => {
    it('should handle header/footer updates (500ms)', async () => {
      const execute = vi.fn();
      manager.register({ id: 'header-footer', delay: 500, priority: 5, execute });

      manager.trigger('header-footer');
      await vi.advanceTimersByTimeAsync(499);
      expect(execute).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle list renumbering (100ms)', async () => {
      const execute = vi.fn();
      manager.register({ id: 'list-renumber', delay: 100, priority: 8, execute });

      manager.trigger('list-renumber');
      await vi.advanceTimersByTimeAsync(100);

      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle cross-reference updates (2000ms)', async () => {
      const execute = vi.fn();
      manager.register({ id: 'cross-refs', delay: 2000, priority: 2, execute });

      manager.trigger('cross-refs');
      await vi.advanceTimersByTimeAsync(1999);
      expect(execute).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid typing with multiple triggers', async () => {
      const execute = vi.fn();
      manager.register({ id: 'typing-pass', delay: 100, priority: 1, execute });

      // Simulate rapid typing
      manager.trigger('typing-pass');
      await vi.advanceTimersByTimeAsync(50);

      manager.trigger('typing-pass');
      await vi.advanceTimersByTimeAsync(50);

      manager.trigger('typing-pass');
      await vi.advanceTimersByTimeAsync(50);

      expect(execute).not.toHaveBeenCalled(); // Still within debounce

      await vi.advanceTimersByTimeAsync(50);
      expect(execute).toHaveBeenCalledTimes(1); // Finally executed
    });
  });

  describe('edge cases', () => {
    it('should handle multiple managers independently', async () => {
      const manager2 = new DebouncedPassManager();

      const execute1 = vi.fn();
      const execute2 = vi.fn();

      manager.register({ id: 'test', delay: 100, priority: 1, execute: execute1 });
      manager2.register({ id: 'test', delay: 200, priority: 1, execute: execute2 });

      manager.trigger('test');
      manager2.trigger('test');

      await vi.advanceTimersByTimeAsync(100);
      expect(execute1).toHaveBeenCalledTimes(1);
      expect(execute2).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(execute2).toHaveBeenCalledTimes(1);
    });

    it('should handle zero delay', async () => {
      const execute = vi.fn();
      manager.register({ id: 'test', delay: 0, priority: 1, execute });

      manager.trigger('test');
      await vi.advanceTimersByTimeAsync(0);

      expect(execute).toHaveBeenCalledTimes(1);
    });
  });
});
