/**
 * Performance Metrics Collector
 *
 * Comprehensive metrics collection system for typing performance monitoring.
 * Tracks latency, duration, and rate metrics with statistical analysis.
 *
 * Features:
 * - Per-metric sample collection with context
 * - Statistical summaries (min, max, avg, percentiles)
 * - Budget checking with configurable thresholds
 * - Sample limit management to prevent memory bloat
 * - Timer helpers for duration tracking
 *
 * Metrics tracked:
 * - cursorUpdateLatency: Time to update cursor position (target <2ms)
 * - p0LayoutDuration: P0 layout pass duration (target <5ms)
 * - p1LayoutDuration: P1 layout pass duration (target <50ms)
 * - workerRoundTrip: Worker message round-trip time (target <10ms)
 * - layoutStaleness: Time layout is stale during typing (target <100ms)
 * - geometryFallbackRate: Frequency of DOM measurement fallbacks
 * - cacheMissRate: Cache miss frequency
 * - droppedEvents: Number of dropped input events
 *
 * @module performance-metrics
 */

/**
 * Individual metric sample with timestamp and optional context.
 */
export interface MetricSample {
  /** Timestamp when sample was recorded (ms since epoch) */
  timestamp: number;
  /** Measured value */
  value: number;
  /** Optional contextual information about this sample */
  context?: Record<string, unknown>;
}

/**
 * Statistical summary of a metric's samples.
 */
export interface MetricSummary {
  /** Number of samples */
  count: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Average (mean) value */
  avg: number;
  /** 50th percentile (median) */
  p50: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
}

/**
 * All typing performance metrics tracked by the system.
 */
export interface TypingPerfMetrics {
  /** Cursor position update latency samples */
  cursorUpdateLatency: MetricSample[];
  /** P0 (critical) layout pass duration samples */
  p0LayoutDuration: MetricSample[];
  /** P1 (high priority) layout pass duration samples */
  p1LayoutDuration: MetricSample[];
  /** Web Worker round-trip time samples */
  workerRoundTrip: MetricSample[];
  /** Layout staleness duration samples */
  layoutStaleness: MetricSample[];
  /** Geometry fallback rate samples */
  geometryFallbackRate: MetricSample[];
  /** Cache miss rate samples */
  cacheMissRate: MetricSample[];
  /** Dropped input events samples */
  droppedEvents: MetricSample[];
}

/**
 * Budget violation report.
 */
export interface BudgetViolation {
  /** Metric that exceeded budget */
  metric: string;
  /** Measured value that violated budget */
  value: number;
  /** Budget threshold that was exceeded */
  budget: number;
}

/**
 * Calculates statistical summary from an array of samples.
 *
 * @param samples - Array of metric samples
 * @returns Statistical summary with percentiles
 */
function calculateSummary(samples: MetricSample[]): MetricSummary {
  if (samples.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const values = samples.map((s) => s.value).sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((acc, v) => acc + v, 0);

  return {
    count,
    min: values[0],
    max: values[count - 1],
    avg: sum / count,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}

/**
 * Calculates a percentile from sorted values.
 *
 * @param sortedValues - Array of values in ascending order
 * @param p - Percentile to calculate (0.0 to 1.0)
 * @returns The percentile value
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Performance metrics collector for typing optimization monitoring.
 *
 * Collects samples for various metrics and provides statistical analysis
 * with budget checking.
 *
 * @example
 * ```typescript
 * const metrics = new PerformanceMetricsCollector({
 *   cursorUpdateLatency: 2,
 *   p0LayoutDuration: 5,
 * });
 *
 * // Record a sample
 * metrics.record('cursorUpdateLatency', 1.5);
 *
 * // Use a timer
 * const endTimer = metrics.startTimer('p0LayoutDuration');
 * // ... perform layout ...
 * endTimer();
 *
 * // Get summary
 * const summary = metrics.getSummary('cursorUpdateLatency');
 * console.log(`P95: ${summary.p95}ms`);
 *
 * // Check budgets
 * const violations = metrics.checkBudgets();
 * if (violations.length > 0) {
 *   console.warn('Budget violations:', violations);
 * }
 * ```
 */
export class PerformanceMetricsCollector {
  private metrics: TypingPerfMetrics;
  private maxSamples: number;
  private budgets: Partial<Record<keyof TypingPerfMetrics, number>>;

  /**
   * Creates a new performance metrics collector.
   *
   * @param budgets - Performance budgets for each metric (in ms or rate)
   * @param maxSamples - Maximum samples to retain per metric (default: 1000)
   */
  constructor(budgets?: Partial<Record<keyof TypingPerfMetrics, number>>, maxSamples: number = 1000) {
    this.maxSamples = maxSamples;
    this.budgets = budgets || {};
    this.metrics = {
      cursorUpdateLatency: [],
      p0LayoutDuration: [],
      p1LayoutDuration: [],
      workerRoundTrip: [],
      layoutStaleness: [],
      geometryFallbackRate: [],
      cacheMissRate: [],
      droppedEvents: [],
    };
  }

  /**
   * Records a metric sample.
   *
   * Automatically manages sample buffer size by removing oldest samples
   * when the limit is reached.
   *
   * @param metric - Metric key to record
   * @param value - Measured value
   * @param context - Optional contextual information
   *
   * @example
   * ```typescript
   * collector.record('cursorUpdateLatency', 1.8, {
   *   position: 42,
   *   direction: 'forward',
   * });
   * ```
   */
  record(metric: keyof TypingPerfMetrics, value: number, context?: Record<string, unknown>): void {
    const sample: MetricSample = {
      timestamp: Date.now(),
      value,
      context,
    };

    this.metrics[metric].push(sample);

    // Trim old samples if over limit
    if (this.metrics[metric].length > this.maxSamples) {
      this.metrics[metric].shift();
    }
  }

  /**
   * Starts a timer for duration metrics.
   *
   * Returns a function that, when called, records the elapsed time.
   *
   * @param metric - Duration metric to time
   * @returns Function to call when operation completes
   *
   * @example
   * ```typescript
   * const endTimer = collector.startTimer('p0LayoutDuration');
   * await performLayout();
   * endTimer(); // Records elapsed time
   * ```
   */
  startTimer(metric: keyof TypingPerfMetrics): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.record(metric, duration);
    };
  }

  /**
   * Gets statistical summary for a specific metric.
   *
   * @param metric - Metric key to summarize
   * @returns Statistical summary including percentiles
   *
   * @example
   * ```typescript
   * const summary = collector.getSummary('cursorUpdateLatency');
   * console.log(`P95 latency: ${summary.p95.toFixed(2)}ms`);
   * ```
   */
  getSummary(metric: keyof TypingPerfMetrics): MetricSummary {
    return calculateSummary(this.metrics[metric]);
  }

  /**
   * Gets summaries for all metrics.
   *
   * @returns Record of all metric summaries
   *
   * @example
   * ```typescript
   * const allSummaries = collector.getAllSummaries();
   * for (const [metric, summary] of Object.entries(allSummaries)) {
   *   console.log(`${metric}: ${summary.avg.toFixed(2)}ms avg`);
   * }
   * ```
   */
  getAllSummaries(): Record<keyof TypingPerfMetrics, MetricSummary> {
    return {
      cursorUpdateLatency: this.getSummary('cursorUpdateLatency'),
      p0LayoutDuration: this.getSummary('p0LayoutDuration'),
      p1LayoutDuration: this.getSummary('p1LayoutDuration'),
      workerRoundTrip: this.getSummary('workerRoundTrip'),
      layoutStaleness: this.getSummary('layoutStaleness'),
      geometryFallbackRate: this.getSummary('geometryFallbackRate'),
      cacheMissRate: this.getSummary('cacheMissRate'),
      droppedEvents: this.getSummary('droppedEvents'),
    };
  }

  /**
   * Checks if any metrics exceed their configured budgets.
   *
   * Uses P95 values for comparison against budgets.
   *
   * @returns Array of budget violations (empty if all within budget)
   *
   * @example
   * ```typescript
   * const violations = collector.checkBudgets();
   * if (violations.length > 0) {
   *   console.warn('Performance budgets exceeded:', violations);
   *   // Consider triggering fallback
   * }
   * ```
   */
  checkBudgets(): BudgetViolation[] {
    const violations: BudgetViolation[] = [];

    for (const [metric, budget] of Object.entries(this.budgets)) {
      const summary = this.getSummary(metric as keyof TypingPerfMetrics);
      if (summary.count > 0 && summary.p95 > budget) {
        violations.push({
          metric,
          value: summary.p95,
          budget,
        });
      }
    }

    return violations;
  }

  /**
   * Exports all raw metric data.
   *
   * Useful for debugging and offline analysis.
   *
   * @returns Complete metrics data structure
   *
   * @example
   * ```typescript
   * const data = collector.export();
   * console.log(JSON.stringify(data, null, 2));
   * ```
   */
  export(): TypingPerfMetrics {
    return {
      cursorUpdateLatency: [...this.metrics.cursorUpdateLatency],
      p0LayoutDuration: [...this.metrics.p0LayoutDuration],
      p1LayoutDuration: [...this.metrics.p1LayoutDuration],
      workerRoundTrip: [...this.metrics.workerRoundTrip],
      layoutStaleness: [...this.metrics.layoutStaleness],
      geometryFallbackRate: [...this.metrics.geometryFallbackRate],
      cacheMissRate: [...this.metrics.cacheMissRate],
      droppedEvents: [...this.metrics.droppedEvents],
    };
  }

  /**
   * Clears all recorded metrics.
   *
   * Resets all sample arrays to empty state.
   *
   * @example
   * ```typescript
   * collector.clear(); // Start fresh measurement period
   * ```
   */
  clear(): void {
    for (const metric of Object.keys(this.metrics) as Array<keyof TypingPerfMetrics>) {
      this.metrics[metric] = [];
    }
  }
}

/**
 * Global singleton performance metrics collector instance.
 *
 * Configured with default performance budgets for typing optimization.
 *
 * @example
 * ```typescript
 * import { perfMetrics } from './performance-metrics';
 *
 * perfMetrics.record('cursorUpdateLatency', 1.5);
 * const summary = perfMetrics.getSummary('cursorUpdateLatency');
 * ```
 */
export const perfMetrics = new PerformanceMetricsCollector({
  cursorUpdateLatency: 2, // <2ms target
  p0LayoutDuration: 5, // <5ms target
  p1LayoutDuration: 50, // <50ms target
  workerRoundTrip: 10, // <10ms target
  layoutStaleness: 100, // <100ms acceptable
});
