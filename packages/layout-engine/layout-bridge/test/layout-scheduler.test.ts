/**
 * Tests for LayoutScheduler
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LayoutScheduler, Priority, type LayoutRequest } from '../src/layout-scheduler';

describe('LayoutScheduler', () => {
  let scheduler: LayoutScheduler;

  beforeEach(() => {
    scheduler = new LayoutScheduler();
  });

  describe('enqueue', () => {
    it('should enqueue a task and return a task ID', () => {
      const request: LayoutRequest = {
        version: 1,
        priority: Priority.P0,
        scope: 'paragraph',
      };

      const taskId = scheduler.enqueue(request);

      expect(taskId).toBe(1);
      expect(scheduler.hasPending()).toBe(true);
    });

    it('should auto-increment task IDs', () => {
      const request1: LayoutRequest = {
        version: 1,
        priority: Priority.P0,
        scope: 'paragraph',
      };
      const request2: LayoutRequest = {
        version: 2,
        priority: Priority.P1,
        scope: 'viewport',
      };

      const id1 = scheduler.enqueue(request1);
      const id2 = scheduler.enqueue(request2);

      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it('should maintain priority order (P0 before P1)', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 2, priority: Priority.P0, scope: 'paragraph' });

      const task1 = scheduler.dequeue();
      const task2 = scheduler.dequeue();

      expect(task1?.priority).toBe(Priority.P0);
      expect(task2?.priority).toBe(Priority.P1);
    });

    it('should maintain priority order (mixed priorities)', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P3, scope: 'full' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 3, priority: Priority.P2, scope: 'adjacent' });
      scheduler.enqueue({ version: 4, priority: Priority.P0, scope: 'paragraph' });

      const task1 = scheduler.dequeue();
      const task2 = scheduler.dequeue();
      const task3 = scheduler.dequeue();
      const task4 = scheduler.dequeue();

      expect(task1?.priority).toBe(Priority.P0);
      expect(task2?.priority).toBe(Priority.P1);
      expect(task3?.priority).toBe(Priority.P2);
      expect(task4?.priority).toBe(Priority.P3);
    });
  });

  describe('dequeue', () => {
    it('should return null for empty queue', () => {
      const task = scheduler.dequeue();
      expect(task).toBeNull();
    });

    it('should dequeue the highest priority task', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 2, priority: Priority.P0, scope: 'paragraph' });

      const task = scheduler.dequeue();

      expect(task).not.toBeNull();
      expect(task?.priority).toBe(Priority.P0);
      expect(task?.status).toBe('running');
    });

    it('should remove the task from pending queue', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });

      expect(scheduler.getPendingCount()).toBe(1);

      scheduler.dequeue();

      expect(scheduler.getPendingCount()).toBe(0);
    });

    it('should set task status to running', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });

      const task = scheduler.dequeue();

      expect(task?.status).toBe('running');
    });
  });

  describe('abortBelow', () => {
    it('should abort tasks at or below the specified priority', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 3, priority: Priority.P2, scope: 'adjacent' });
      scheduler.enqueue({ version: 4, priority: Priority.P3, scope: 'full' });

      scheduler.abortBelow(Priority.P1);

      const stats = scheduler.getQueueStats();
      expect(stats[Priority.P0]).toBe(1);
      expect(stats[Priority.P1]).toBe(0);
      expect(stats[Priority.P2]).toBe(0);
      expect(stats[Priority.P3]).toBe(0);
    });

    it('should abort only P3 when abortBelow(P3)', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 3, priority: Priority.P2, scope: 'adjacent' });
      scheduler.enqueue({ version: 4, priority: Priority.P3, scope: 'full' });

      scheduler.abortBelow(Priority.P3);

      const stats = scheduler.getQueueStats();
      expect(stats[Priority.P0]).toBe(1);
      expect(stats[Priority.P1]).toBe(1);
      expect(stats[Priority.P2]).toBe(1);
      expect(stats[Priority.P3]).toBe(0);
    });

    it('should abort the current task if it matches', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P1, scope: 'viewport' });

      const task = scheduler.dequeue();
      expect(task?.status).toBe('running');

      scheduler.abortBelow(Priority.P1);

      expect(scheduler.getCurrentTask()).toBeNull();
    });

    it('should not abort tasks above the threshold', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });

      scheduler.abortBelow(Priority.P1);

      const stats = scheduler.getQueueStats();
      expect(stats[Priority.P0]).toBe(1);
    });
  });

  describe('hasPending', () => {
    it('should return false for empty queue', () => {
      expect(scheduler.hasPending()).toBe(false);
    });

    it('should return true when tasks are pending', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });

      expect(scheduler.hasPending()).toBe(true);
    });

    it('should return false after all tasks are dequeued', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.dequeue();

      expect(scheduler.hasPending()).toBe(false);
    });
  });

  describe('getQueueStats', () => {
    it('should return zero counts for empty queue', () => {
      const stats = scheduler.getQueueStats();

      expect(stats[Priority.P0]).toBe(0);
      expect(stats[Priority.P1]).toBe(0);
      expect(stats[Priority.P2]).toBe(0);
      expect(stats[Priority.P3]).toBe(0);
    });

    it('should count tasks by priority', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 3, priority: Priority.P1, scope: 'viewport' });
      scheduler.enqueue({ version: 4, priority: Priority.P2, scope: 'adjacent' });

      const stats = scheduler.getQueueStats();

      expect(stats[Priority.P0]).toBe(2);
      expect(stats[Priority.P1]).toBe(1);
      expect(stats[Priority.P2]).toBe(1);
      expect(stats[Priority.P3]).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all pending tasks', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });

      scheduler.clear();

      expect(scheduler.hasPending()).toBe(false);
      expect(scheduler.getPendingCount()).toBe(0);
    });

    it('should clear the current task', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.dequeue();

      scheduler.clear();

      expect(scheduler.getCurrentTask()).toBeNull();
    });
  });

  describe('completeCurrentTask', () => {
    it('should mark current task as completed', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });

      const task = scheduler.dequeue();
      expect(task?.status).toBe('running');

      scheduler.completeCurrentTask();

      expect(scheduler.getCurrentTask()).toBeNull();
    });

    it('should handle completion when no current task', () => {
      expect(() => scheduler.completeCurrentTask()).not.toThrow();
    });
  });

  describe('getPendingCount', () => {
    it('should return 0 for empty queue', () => {
      expect(scheduler.getPendingCount()).toBe(0);
    });

    it('should return the number of pending tasks', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });

      expect(scheduler.getPendingCount()).toBe(2);
    });

    it('should decrease after dequeue', () => {
      scheduler.enqueue({ version: 1, priority: Priority.P0, scope: 'paragraph' });
      scheduler.enqueue({ version: 2, priority: Priority.P1, scope: 'viewport' });

      scheduler.dequeue();

      expect(scheduler.getPendingCount()).toBe(1);
    });
  });
});
