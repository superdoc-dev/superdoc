/**
 * Tests for PerformanceMetricsCollector
 */

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { PerformanceMetricsCollector } from '../src/performance-metrics';

describe('PerformanceMetricsCollector', () => {
  let collector: PerformanceMetricsCollector;

  beforeEach(() => {
    collector = new PerformanceMetricsCollector({
      cursorUpdateLatency: 2,
      p0LayoutDuration: 5,
    });
  });

  describe('constructor', () => {
    it('should initialize with budgets', () => {
      expect(collector).toBeDefined();
    });

    it('should accept custom max samples', () => {
      const custom = new PerformanceMetricsCollector({}, 500);
      expect(custom).toBeDefined();
    });
  });

  describe('record', () => {
    it('should record a metric sample', () => {
      collector.record('cursorUpdateLatency', 1.5);
      const summary = collector.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(1);
      expect(summary.avg).toBe(1.5);
    });

    it('should record multiple samples', () => {
      collector.record('cursorUpdateLatency', 1.0);
      collector.record('cursorUpdateLatency', 2.0);
      collector.record('cursorUpdateLatency', 3.0);
      const summary = collector.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(3);
      expect(summary.min).toBe(1.0);
      expect(summary.max).toBe(3.0);
      expect(summary.avg).toBe(2.0);
    });

    it('should record with context', () => {
      collector.record('cursorUpdateLatency', 1.5, { position: 42 });
      const exported = collector.export();
      expect(exported.cursorUpdateLatency[0].context).toEqual({ position: 42 });
    });

    it('should trim old samples when over limit', () => {
      const small = new PerformanceMetricsCollector({}, 10);
      for (let i = 0; i < 20; i++) {
        small.record('cursorUpdateLatency', i);
      }
      const summary = small.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(10); // Limited to max samples
    });
  });

  describe('startTimer', () => {
    it('should measure duration', async () => {
      const endTimer = collector.startTimer('p0LayoutDuration');
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait 10ms
      endTimer();

      const summary = collector.getSummary('p0LayoutDuration');
      expect(summary.count).toBe(1);
      expect(summary.avg).toBeGreaterThan(5); // Should be at least 5ms
    });

    it('should record multiple timings', () => {
      const timer1 = collector.startTimer('p0LayoutDuration');
      timer1();
      const timer2 = collector.startTimer('p0LayoutDuration');
      timer2();

      const summary = collector.getSummary('p0LayoutDuration');
      expect(summary.count).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should return empty summary for no samples', () => {
      const summary = collector.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(0);
      expect(summary.min).toBe(0);
      expect(summary.max).toBe(0);
      expect(summary.avg).toBe(0);
      expect(summary.p50).toBe(0);
      expect(summary.p95).toBe(0);
      expect(summary.p99).toBe(0);
    });

    it('should calculate statistics correctly', () => {
      // Record 100 samples from 0 to 99
      for (let i = 0; i < 100; i++) {
        collector.record('cursorUpdateLatency', i);
      }

      const summary = collector.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(100);
      expect(summary.min).toBe(0);
      expect(summary.max).toBe(99);
      expect(summary.avg).toBe(49.5);
      expect(summary.p50).toBeCloseTo(49.5, 1);
      expect(summary.p95).toBeGreaterThan(90);
      expect(summary.p99).toBeGreaterThan(95);
    });
  });

  describe('getAllSummaries', () => {
    it('should return summaries for all metrics', () => {
      collector.record('cursorUpdateLatency', 1.5);
      collector.record('p0LayoutDuration', 3.0);

      const summaries = collector.getAllSummaries();
      expect(summaries.cursorUpdateLatency.count).toBe(1);
      expect(summaries.p0LayoutDuration.count).toBe(1);
      expect(summaries.p1LayoutDuration.count).toBe(0);
    });
  });

  describe('checkBudgets', () => {
    it('should return empty array when within budget', () => {
      collector.record('cursorUpdateLatency', 1.0);
      const violations = collector.checkBudgets();
      expect(violations).toEqual([]);
    });

    it('should detect budget violations', () => {
      // Record samples that exceed budget
      for (let i = 0; i < 100; i++) {
        collector.record('cursorUpdateLatency', 5.0); // Budget is 2ms
      }

      const violations = collector.checkBudgets();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].metric).toBe('cursorUpdateLatency');
      expect(violations[0].value).toBeGreaterThan(2);
      expect(violations[0].budget).toBe(2);
    });

    it('should check multiple metrics', () => {
      const multi = new PerformanceMetricsCollector({
        cursorUpdateLatency: 1,
        p0LayoutDuration: 2,
      });

      // Violate both budgets
      for (let i = 0; i < 100; i++) {
        multi.record('cursorUpdateLatency', 5.0);
        multi.record('p0LayoutDuration', 10.0);
      }

      const violations = multi.checkBudgets();
      expect(violations.length).toBe(2);
    });
  });

  describe('export', () => {
    it('should export all metric data', () => {
      collector.record('cursorUpdateLatency', 1.5);
      collector.record('p0LayoutDuration', 3.0);

      const data = collector.export();
      expect(data.cursorUpdateLatency.length).toBe(1);
      expect(data.p0LayoutDuration.length).toBe(1);
      expect(data.cursorUpdateLatency[0].value).toBe(1.5);
    });

    it('should create independent copies', () => {
      collector.record('cursorUpdateLatency', 1.5);
      const data = collector.export();
      data.cursorUpdateLatency.push({
        timestamp: Date.now(),
        value: 999,
      });

      const summary = collector.getSummary('cursorUpdateLatency');
      expect(summary.count).toBe(1); // Original unchanged
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      collector.record('cursorUpdateLatency', 1.5);
      collector.record('p0LayoutDuration', 3.0);
      collector.clear();

      const summaries = collector.getAllSummaries();
      expect(summaries.cursorUpdateLatency.count).toBe(0);
      expect(summaries.p0LayoutDuration.count).toBe(0);
    });
  });
});
