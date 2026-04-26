/**
 * Typing Performance Benchmark Suite
 *
 * Automated benchmark system for measuring typing performance optimizations.
 * Provides standardized scenarios with statistical analysis and pass/fail criteria.
 *
 * Standard Benchmarks:
 * 1. Cursor calculation for various positions (target: <1ms)
 * 2. Selection calculation for ranges (target: <2ms)
 * 3. Local paragraph layout (target: <5ms)
 * 4. Font metrics cache lookup (target: <0.1ms)
 * 5. Paragraph index lookup (target: <0.1ms)
 * 6. Line cache lookup (target: <0.1ms)
 *
 * @module benchmarks
 */

/**
 * Result of running a benchmark scenario.
 */
export interface BenchmarkResult {
  /** Benchmark scenario name */
  name: string;
  /** Number of samples collected */
  samples: number;
  /** Minimum duration in ms */
  min: number;
  /** Maximum duration in ms */
  max: number;
  /** Average duration in ms */
  avg: number;
  /** 50th percentile (median) in ms */
  p50: number;
  /** 95th percentile in ms */
  p95: number;
  /** 99th percentile in ms */
  p99: number;
  /** Whether benchmark passed (P95 < target) */
  passed: boolean;
  /** Target duration in ms */
  target: number;
}

/**
 * A benchmark scenario definition.
 */
export interface BenchmarkScenario {
  /** Scenario name */
  name: string;
  /** Setup function called once before iterations */
  setup: () => Promise<void>;
  /** Function to benchmark (called multiple times) */
  run: () => void | Promise<void>;
  /** Teardown function called once after iterations */
  teardown?: () => void;
  /** Number of iterations to run */
  iterations: number;
  /** Target duration in ms for P95 */
  target: number;
}

/**
 * Calculates percentile from sorted array.
 *
 * @param sorted - Sorted array of values
 * @param p - Percentile (0.0 to 1.0)
 * @returns Percentile value
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Benchmark suite for typing performance testing.
 *
 * Runs standardized scenarios and produces statistical results.
 *
 * @example
 * ```typescript
 * const benchmark = new TypingPerfBenchmark();
 *
 * // Register standard benchmarks
 * benchmark.registerStandardBenchmarks();
 *
 * // Run all benchmarks
 * const results = await benchmark.runAll();
 *
 * // Check results
 * console.log(benchmark.toMarkdown());
 *
 * // Check if all passed
 * const allPassed = results.every(r => r.passed);
 * ```
 */
export class TypingPerfBenchmark {
  private scenarios: BenchmarkScenario[] = [];
  private results: BenchmarkResult[] = [];

  /**
   * Registers standard typing performance benchmarks.
   *
   * Includes cursor calculation, selection, layout, and cache benchmarks.
   */
  registerStandardBenchmarks(): void {
    // Note: These are placeholder implementations
    // Real implementations would require actual components from Phase 1-4

    this.registerScenario({
      name: 'Cursor calculation (beginning)',
      setup: async () => {
        // Setup test document
      },
      run: () => {
        // Calculate cursor at position 0
      },
      iterations: 1000,
      target: 1, // <1ms
    });

    this.registerScenario({
      name: 'Cursor calculation (middle)',
      setup: async () => {
        // Setup test document
      },
      run: () => {
        // Calculate cursor at middle position
      },
      iterations: 1000,
      target: 1, // <1ms
    });

    this.registerScenario({
      name: 'Cursor calculation (end)',
      setup: async () => {
        // Setup test document
      },
      run: () => {
        // Calculate cursor at end position
      },
      iterations: 1000,
      target: 1, // <1ms
    });

    this.registerScenario({
      name: 'Selection calculation (small range)',
      setup: async () => {
        // Setup test document
      },
      run: () => {
        // Calculate selection for 10-character range
      },
      iterations: 1000,
      target: 2, // <2ms
    });

    this.registerScenario({
      name: 'Selection calculation (large range)',
      setup: async () => {
        // Setup test document
      },
      run: () => {
        // Calculate selection for 100-character range
      },
      iterations: 1000,
      target: 2, // <2ms
    });

    this.registerScenario({
      name: 'Local paragraph layout (small)',
      setup: async () => {
        // Setup small paragraph
      },
      run: () => {
        // Layout small paragraph
      },
      iterations: 100,
      target: 5, // <5ms
    });

    this.registerScenario({
      name: 'Local paragraph layout (large)',
      setup: async () => {
        // Setup large paragraph
      },
      run: () => {
        // Layout large paragraph
      },
      iterations: 100,
      target: 5, // <5ms
    });

    this.registerScenario({
      name: 'Font metrics cache lookup',
      setup: async () => {
        // Setup cache with fonts
      },
      run: () => {
        // Lookup font metrics
      },
      iterations: 10000,
      target: 0.1, // <0.1ms
    });

    this.registerScenario({
      name: 'Paragraph index lookup',
      setup: async () => {
        // Setup paragraph index
      },
      run: () => {
        // Lookup paragraph
      },
      iterations: 10000,
      target: 0.1, // <0.1ms
    });

    this.registerScenario({
      name: 'Line cache lookup',
      setup: async () => {
        // Setup line cache
      },
      run: () => {
        // Lookup line
      },
      iterations: 10000,
      target: 0.1, // <0.1ms
    });
  }

  /**
   * Registers a custom benchmark scenario.
   *
   * @param scenario - Scenario to register
   *
   * @example
   * ```typescript
   * benchmark.registerScenario({
   *   name: 'Custom operation',
   *   setup: async () => { ... },
   *   run: () => { ... },
   *   iterations: 1000,
   *   target: 5,
   * });
   * ```
   */
  registerScenario(scenario: BenchmarkScenario): void {
    this.scenarios.push(scenario);
  }

  /**
   * Runs a single benchmark scenario.
   *
   * @param scenario - Scenario to run
   * @returns Benchmark result with statistics
   */
  async runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
    console.log(`Running benchmark: ${scenario.name}`);

    // Setup
    await scenario.setup();

    // Warmup (10% of iterations)
    const warmupCount = Math.ceil(scenario.iterations * 0.1);
    for (let i = 0; i < warmupCount; i++) {
      await scenario.run();
    }

    // Collect samples
    const samples: number[] = [];
    for (let i = 0; i < scenario.iterations; i++) {
      const start = performance.now();
      await scenario.run();
      const duration = performance.now() - start;
      samples.push(duration);
    }

    // Teardown
    if (scenario.teardown) {
      scenario.teardown();
    }

    // Calculate statistics
    const sorted = samples.sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const result: BenchmarkResult = {
      name: scenario.name,
      samples: samples.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      passed: percentile(sorted, 0.95) < scenario.target,
      target: scenario.target,
    };

    console.log(`  ${result.passed ? '✓' : '✗'} P95: ${result.p95.toFixed(3)}ms (target: ${scenario.target}ms)`);

    return result;
  }

  /**
   * Runs all registered benchmarks.
   *
   * @returns Array of results for all scenarios
   *
   * @example
   * ```typescript
   * const results = await benchmark.runAll();
   * const passed = results.filter(r => r.passed).length;
   * console.log(`${passed}/${results.length} benchmarks passed`);
   * ```
   */
  async runAll(): Promise<BenchmarkResult[]> {
    this.results = [];

    for (const scenario of this.scenarios) {
      const result = await this.runScenario(scenario);
      this.results.push(result);
    }

    return this.results;
  }

  /**
   * Gets the most recent benchmark results.
   *
   * @returns Array of benchmark results
   */
  getResults(): BenchmarkResult[] {
    return this.results;
  }

  /**
   * Exports results as a markdown table.
   *
   * @returns Markdown-formatted results table
   *
   * @example
   * ```typescript
   * const markdown = benchmark.toMarkdown();
   * console.log(markdown);
   * // Or write to file for documentation
   * ```
   */
  toMarkdown(): string {
    if (this.results.length === 0) {
      return 'No benchmark results available.';
    }

    const lines: string[] = [];

    // Header
    lines.push('# Typing Performance Benchmarks\n');

    // Summary
    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    lines.push(`**Summary**: ${passed}/${total} benchmarks passed (${passRate}%)\n`);

    // Table
    lines.push('| Benchmark | Samples | Min | Avg | P50 | P95 | P99 | Max | Target | Pass |');
    lines.push('|-----------|---------|-----|-----|-----|-----|-----|-----|--------|------|');

    for (const result of this.results) {
      const status = result.passed ? '✓' : '✗';
      lines.push(
        `| ${result.name} | ${result.samples} | ${result.min.toFixed(3)} | ${result.avg.toFixed(3)} | ${result.p50.toFixed(3)} | ${result.p95.toFixed(3)} | ${result.p99.toFixed(3)} | ${result.max.toFixed(3)} | ${result.target.toFixed(3)} | ${status} |`,
      );
    }

    lines.push('');
    lines.push('*All times in milliseconds*');

    return lines.join('\n');
  }

  /**
   * Exports results as JSON.
   *
   * @returns JSON string of results
   */
  toJSON(): string {
    return JSON.stringify(this.results, null, 2);
  }

  /**
   * Clears all registered scenarios and results.
   */
  clear(): void {
    this.scenarios = [];
    this.results = [];
  }
}
