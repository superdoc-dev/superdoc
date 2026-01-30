/**
 * Tests for LayoutCoordinator
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { LayoutCoordinator, type LayoutResult } from '../src/layout-coordinator';
import { Priority } from '../src/layout-scheduler';
import { LayoutVersionManager } from '../src/layout-version-manager';

describe('LayoutCoordinator', () => {
  let coordinator: LayoutCoordinator;
  let versionManager: LayoutVersionManager;
  let executeP0: ReturnType<typeof mock>;
  let executeP1: ReturnType<typeof mock>;
  let executeWorker: ReturnType<typeof mock>;

  const mockLayout = { pages: [], pageSize: { w: 612, h: 792 } };

  beforeEach(() => {
    versionManager = new LayoutVersionManager();

    const mockResult: LayoutResult = {
      version: 1,
      layout: mockLayout,
      blocks: [],
      measures: [],
      completed: true,
      aborted: false,
    };

    executeP0 = mock(() => mockResult);
    executeP1 = mock(() => Promise.resolve(mockResult));
    executeWorker = mock(() => Promise.resolve(mockResult));

    coordinator = new LayoutCoordinator({
      layoutVersionManager: versionManager,
      executeP0,
      executeP1,
      executeWorker,
    });
  });

  describe('scheduleLayout', () => {
    it('should execute P0 immediately (sync)', () => {
      coordinator.scheduleLayout(1, Priority.P0, { scope: 'paragraph', paragraphIndex: 0 });

      expect(executeP0).toHaveBeenCalledTimes(1);
      expect(executeP0).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          priority: Priority.P0,
          scope: 'paragraph',
          paragraphIndex: 0,
        }),
      );
    });

    it('should debounce P1+ requests', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });

      // Should not execute immediately
      expect(executeP1).not.toHaveBeenCalled();

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(executeP1).toHaveBeenCalledTimes(1);
    });

    it('should update pending version', () => {
      coordinator.scheduleLayout(5, Priority.P0, { scope: 'paragraph' });

      expect(coordinator.getPendingVersion()).toBe(5);
    });
  });

  describe('interruptBelow', () => {
    it('should clear debounce timers for affected priorities', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(2, Priority.P2, { scope: 'adjacent' });

      coordinator.interruptBelow(Priority.P1);

      // Wait to ensure no execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(executeP1).not.toHaveBeenCalled();
      expect(executeWorker).not.toHaveBeenCalled();
    });

    it('should not affect higher priority tasks', async () => {
      coordinator.scheduleLayout(1, Priority.P0, { scope: 'paragraph' });
      coordinator.scheduleLayout(2, Priority.P1, { scope: 'viewport' });

      coordinator.interruptBelow(Priority.P1);

      expect(executeP0).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasPendingLayouts', () => {
    it('should return false when no layouts pending', () => {
      expect(coordinator.hasPendingLayouts()).toBe(false);
    });

    it('should return true when debounce timers active', () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });

      expect(coordinator.hasPendingLayouts()).toBe(true);
    });

    it('should return false after debounce completes', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });

      // Wait longer for debounce and async execution to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // After execution completes, no pending layouts
      expect(coordinator.hasPendingLayouts()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should cancel all pending operations', () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(2, Priority.P2, { scope: 'adjacent' });

      coordinator.destroy();

      expect(coordinator.hasPendingLayouts()).toBe(false);
    });

    it('should clear debounce timers', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });

      coordinator.destroy();

      // Wait to ensure no execution after destroy
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executeP1).not.toHaveBeenCalled();
    });
  });

  describe('version management integration', () => {
    it('should notify version manager on P0 completion', () => {
      const spy = spyOn(versionManager, 'onLayoutComplete');

      coordinator.scheduleLayout(1, Priority.P0, { scope: 'paragraph' });

      expect(spy).toHaveBeenCalledWith(1);
    });

    it('should notify version manager on async completion', async () => {
      const spy = spyOn(versionManager, 'onLayoutComplete');

      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(spy).toHaveBeenCalledWith(1);
    });
  });

  describe('debounce coalescing', () => {
    it('should coalesce multiple P1 requests', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(2, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(3, Priority.P1, { scope: 'viewport' });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should only execute once with latest version
      expect(executeP1).toHaveBeenCalledTimes(1);
      expect(executeP1).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 3,
        }),
      );
    });

    it('should coalesce requests at each priority independently', async () => {
      coordinator.scheduleLayout(1, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(2, Priority.P2, { scope: 'adjacent' });
      coordinator.scheduleLayout(3, Priority.P1, { scope: 'viewport' });
      coordinator.scheduleLayout(4, Priority.P2, { scope: 'adjacent' });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // P1 should execute once, P2 should execute once
      expect(executeP1).toHaveBeenCalledTimes(1);
      expect(executeWorker).toHaveBeenCalledTimes(1);
    });
  });
});
