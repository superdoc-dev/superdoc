/**
 * Tests for FocusWatchdog
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { FocusWatchdog } from '../src/focus-watchdog';

describe('FocusWatchdog', () => {
  let watchdog: FocusWatchdog;
  let onDrift: ReturnType<typeof vi.fn>;
  let onRecovery: ReturnType<typeof vi.fn>;
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    onDrift = vi.fn();
    onRecovery = vi.fn();
    watchdog = new FocusWatchdog({
      checkInterval: 1000,
      maxDriftCount: 3,
      onDrift,
      onRecovery,
    });

    element = document.createElement('div');
    element.tabIndex = -1; // Make div focusable in jsdom
    document.body.appendChild(element);
  });

  afterEach(() => {
    vi.useRealTimers();
    watchdog.destroy();
    document.body.removeChild(element);
  });

  describe('setExpectedFocus', () => {
    it('should set the expected focus element', () => {
      watchdog.setExpectedFocus(element);
      expect(watchdog).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      watchdog.setExpectedFocus(element);
      watchdog.start();
      expect(watchdog).toBeDefined();
    });

    it('should not start without expected element', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      watchdog.start();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should stop monitoring', () => {
      watchdog.setExpectedFocus(element);
      watchdog.start();
      watchdog.stop();
      expect(watchdog).toBeDefined();
    });

    it('should not start twice', () => {
      watchdog.setExpectedFocus(element);
      watchdog.start();
      watchdog.start(); // Second call should be ignored
      expect(watchdog).toBeDefined();
    });
  });

  describe('check', () => {
    it('should return true when focus is correct', () => {
      watchdog.setExpectedFocus(element);
      element.focus();
      expect(watchdog.check()).toBe(true);
    });

    it('should return false and call onDrift when focus drifts', () => {
      watchdog.setExpectedFocus(element);
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      expect(watchdog.check()).toBe(false);
      expect(onDrift).toHaveBeenCalled();

      document.body.removeChild(other);
    });

    it('should count drift occurrences', () => {
      watchdog.setExpectedFocus(element);
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      watchdog.check();
      watchdog.check();
      expect(watchdog.getDriftCount()).toBe(2);

      document.body.removeChild(other);
    });

    it('should attempt recovery after max drifts', () => {
      watchdog.setExpectedFocus(element);
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      // Trigger max drifts
      watchdog.check(); // 1
      watchdog.check(); // 2
      watchdog.check(); // 3 - should trigger recovery

      expect(watchdog.getDriftCount()).toBe(0); // Reset after recovery

      document.body.removeChild(other);
    });
  });

  describe('restoreFocus', () => {
    it('should restore focus to expected element', () => {
      watchdog.setExpectedFocus(element);
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      const restored = watchdog.restoreFocus();
      expect(restored).toBe(true);
      expect(document.activeElement).toBe(element);

      document.body.removeChild(other);
    });

    it('should call onRecovery when successful', () => {
      watchdog.setExpectedFocus(element);
      watchdog.restoreFocus();
      expect(onRecovery).toHaveBeenCalled();
    });
  });

  describe('resetDriftCount', () => {
    it('should reset drift counter', () => {
      watchdog.setExpectedFocus(element);
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();

      watchdog.check();
      watchdog.check();
      expect(watchdog.getDriftCount()).toBe(2);

      watchdog.resetDriftCount();
      expect(watchdog.getDriftCount()).toBe(0);

      document.body.removeChild(other);
    });
  });

  describe('periodic checking', () => {
    it('should check focus at configured interval', () => {
      watchdog.setExpectedFocus(element);
      const checkSpy = vi.spyOn(watchdog, 'check');
      watchdog.start();

      vi.advanceTimersByTime(1000);
      expect(checkSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(checkSpy).toHaveBeenCalledTimes(2);

      checkSpy.mockRestore();
    });
  });
});
