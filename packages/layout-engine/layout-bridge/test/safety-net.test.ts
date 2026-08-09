/**
 * Tests for SafetyNet
 */

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { SafetyNet } from '../src/safety-net';

describe('SafetyNet', () => {
  let safety: SafetyNet;
  let fallbackHandler: ReturnType<typeof vi.fn>;
  let recoveryHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    safety = new SafetyNet({
      maxConsecutiveErrors: 3,
      maxLayoutDuration: 100,
      maxCursorLatency: 5,
      cooldownPeriod: 5000,
    });
    fallbackHandler = vi.fn();
    recoveryHandler = vi.fn();
    safety.setFallbackHandler(fallbackHandler);
    safety.setRecoveryHandler(recoveryHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
    safety.destroy();
  });

  describe('recordError', () => {
    it('should increment error count', () => {
      safety.recordError(new Error('test'));
      expect(safety.isFallbackActive()).toBe(false); // Not threshold yet
    });

    it('should trigger fallback after threshold', () => {
      safety.recordError(new Error('error 1'));
      safety.recordError(new Error('error 2'));
      safety.recordError(new Error('error 3'));
      expect(safety.isFallbackActive()).toBe(true);
      expect(fallbackHandler).toHaveBeenCalledWith('error');
    });

    it('should not trigger fallback if reset between errors', () => {
      safety.recordError(new Error('error 1'));
      safety.reset();
      safety.recordError(new Error('error 2'));
      safety.reset();
      safety.recordError(new Error('error 3'));
      expect(safety.isFallbackActive()).toBe(false);
    });
  });

  describe('recordLatency', () => {
    it('should trigger fallback for high layout latency', () => {
      safety.recordLatency('layout', 150); // Exceeds 100ms budget
      expect(safety.isFallbackActive()).toBe(true);
      expect(fallbackHandler).toHaveBeenCalledWith('latency');
    });

    it('should trigger fallback for high cursor latency', () => {
      safety.recordLatency('cursor', 10); // Exceeds 5ms budget
      expect(safety.isFallbackActive()).toBe(true);
      expect(fallbackHandler).toHaveBeenCalledWith('latency');
    });

    it('should not trigger for acceptable latency', () => {
      safety.recordLatency('layout', 50);
      safety.recordLatency('cursor', 2);
      expect(safety.isFallbackActive()).toBe(false);
    });
  });

  describe('triggerFallback', () => {
    it('should activate fallback mode', () => {
      safety.triggerFallback('manual');
      expect(safety.isFallbackActive()).toBe(true);
      expect(safety.getFallbackReason()).toBe('manual');
    });

    it('should not trigger if already active', () => {
      safety.triggerFallback('error');
      safety.triggerFallback('latency');
      expect(fallbackHandler).toHaveBeenCalledTimes(1);
    });

    it('should schedule recovery', () => {
      safety.triggerFallback('error');
      expect(safety.isFallbackActive()).toBe(true);

      vi.advanceTimersByTime(5000); // Advance past cooldown

      expect(safety.isFallbackActive()).toBe(false);
      expect(recoveryHandler).toHaveBeenCalled();
    });
  });

  describe('attemptRecovery', () => {
    it('should recover when not in cooldown', () => {
      safety.triggerFallback('error');
      vi.advanceTimersByTime(5000);
      expect(safety.isFallbackActive()).toBe(false);
    });

    it('should fail during cooldown', () => {
      safety.triggerFallback('error');
      const recovered = safety.attemptRecovery();
      expect(recovered).toBe(false);
      expect(safety.isFallbackActive()).toBe(true);
    });

    it('should reset error count on recovery', () => {
      safety.recordError(new Error('1'));
      safety.recordError(new Error('2'));
      safety.recordError(new Error('3'));
      vi.advanceTimersByTime(5000);
      safety.recordError(new Error('4')); // Should not trigger immediately
      expect(safety.isFallbackActive()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear error count', () => {
      safety.recordError(new Error('1'));
      safety.recordError(new Error('2'));
      safety.reset();
      safety.recordError(new Error('3'));
      expect(safety.isFallbackActive()).toBe(false);
    });
  });
});
