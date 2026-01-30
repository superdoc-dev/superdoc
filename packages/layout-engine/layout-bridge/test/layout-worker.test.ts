/**
 * Tests for LayoutWorkerManager
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LayoutWorkerManager } from '../src/layout-worker';
import { Priority } from '../src/layout-scheduler';

describe('LayoutWorkerManager', () => {
  let manager: LayoutWorkerManager;

  beforeEach(() => {
    manager = new LayoutWorkerManager();
  });

  describe('initialize', () => {
    it('should initialize the worker', () => {
      manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', () => {
      manager.initialize();
      manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('execute', () => {
    it('should throw if not initialized', async () => {
      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      await expect(manager.execute(request)).rejects.toThrow('Worker not initialized');
    });

    it('should execute a layout request', async () => {
      manager.initialize();

      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      const result = await manager.execute(request);

      expect(result).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.aborted).toBe(false);
    });

    it('should handle abort signals', async () => {
      manager.initialize();

      const controller = new AbortController();
      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
        abortSignal: controller.signal,
      };

      // Abort immediately
      controller.abort();

      await expect(manager.execute(request)).rejects.toThrow();
    });

    it('should track pending requests', async () => {
      manager.initialize();

      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      const promise = manager.execute(request);

      // Pending count should increase
      expect(manager.getPendingCount()).toBeGreaterThan(0);

      await promise;

      // Pending count should decrease after completion
      expect(manager.getPendingCount()).toBe(0);
    });
  });

  describe('abort', () => {
    it('should abort a pending request', async () => {
      manager.initialize();

      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      const promise = manager.execute(request);

      // Abort using the internal abort method
      // Note: In real usage, abort would be via AbortController
      manager.abort(1);

      await expect(promise).rejects.toThrow();
    });
  });

  describe('terminate', () => {
    it('should terminate the worker', () => {
      manager.initialize();
      manager.terminate();

      expect(manager.isInitialized()).toBe(false);
    });

    it('should reject pending requests on termination', async () => {
      manager.initialize();

      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      const promise = manager.execute(request);

      manager.terminate();

      await expect(promise).rejects.toThrow('Worker terminated');
    });

    it('should handle termination when not initialized', () => {
      expect(() => manager.terminate()).not.toThrow();
    });
  });

  describe('getPendingCount', () => {
    it('should return 0 initially', () => {
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should track pending request count', async () => {
      manager.initialize();

      const request = {
        version: 1,
        priority: Priority.P2,
        scope: 'adjacent' as const,
      };

      const promise = manager.execute(request);

      expect(manager.getPendingCount()).toBeGreaterThan(0);

      await promise;

      expect(manager.getPendingCount()).toBe(0);
    });
  });
});
