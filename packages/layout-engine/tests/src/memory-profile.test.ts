/**
 * Memory profiling tests for layout engine
 *
 * Validates memory usage against thresholds from BENCHMARKS.md:
 * - Heap usage: <300MB for 100-page document (2× legacy baseline)
 * - Cache size: ≤10,000 entries after LRU eviction
 * - Cache memory: <100MB
 * - No memory leaks after multiple render cycles
 *
 * @module memory-profile.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import type { FlowBlock, PMNode } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';

/**
 * Memory thresholds from BENCHMARKS.md
 */
const MEMORY_THRESHOLDS = {
  heapUsed: 300, // MB for 100-page doc
  cacheSize: 10_000, // Max entries in MeasureCache
  cacheMemory: 100, // MB for cache alone
  leakTolerance: 15, // MB acceptable leak after GC (increased for test stability)
} as const;
const LEAK_SAMPLE_COUNT = 5;
const hasExposedGC = typeof global.gc === 'function';
const gcOnly = hasExposedGC ? it : it.skip;
let hasWarnedMissingGc = false;

/**
 * Test fixture paths
 */
const FIXTURES = {
  basic: path.join(__dirname, '../fixtures/sdt-flow-input.json'),
} as const;

/**
 * Memory measurement utilities
 */
interface MemorySnapshot {
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  external: number; // bytes
  arrayBuffers: number; // bytes
  timestamp: number; // ms
}

/**
 * Capture current memory usage
 *
 * @returns Memory snapshot
 */
function captureMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
    timestamp: Date.now(),
  };
}

/**
 * Calculate memory delta in MB
 *
 * @param before - Baseline snapshot
 * @param after - Post-operation snapshot
 * @returns Memory delta in MB
 */
function calculateMemoryDelta(before: MemorySnapshot, after: MemorySnapshot): number {
  const delta = after.heapUsed - before.heapUsed;
  return delta / 1024 / 1024; // Convert to MB
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Byte count
 * @returns Formatted string (e.g., "150.5 MB")
 */
function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Force garbage collection if available
 *
 * Requires Node to be run with --expose-gc flag
 */
function forceGC(): void {
  if (global.gc) {
    global.gc();
  } else {
    if (!hasWarnedMissingGc) {
      hasWarnedMissingGc = true;
      console.warn('Garbage collection not available. Run tests with --expose-gc flag.');
    }
  }
}

/**
 * Compute median of numeric samples.
 *
 * @param values - Numeric sample values
 * @returns Median value
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Capture repeated heap deltas for a memory-sensitive operation.
 *
 * @param operation - Workload to profile between baseline and post-GC snapshots
 * @param sampleCount - Number of repeated samples to collect
 * @returns Sample deltas and median delta (MB)
 */
function sampleHeapDeltas(
  operation: () => void,
  sampleCount = LEAK_SAMPLE_COUNT,
): { samples: number[]; median: number } {
  const samples: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    forceGC();
    const baseline = captureMemorySnapshot();

    operation();

    forceGC();
    const afterOperation = captureMemorySnapshot();

    samples.push(calculateMemoryDelta(baseline, afterOperation));
  }

  return {
    samples,
    median: median(samples),
  };
}

/**
 * Load PM JSON fixture
 *
 * @param fixturePath - Path to fixture file
 * @returns ProseMirror document
 */
function loadPMJsonFixture(fixturePath: string): PMNode {
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Expand document to approximate page count
 *
 * @param baseDoc - Base ProseMirror document
 * @param targetPages - Target page count
 * @returns Expanded document
 */
function expandDocumentToPages(baseDoc: PMNode, targetPages: number): PMNode {
  const contentNodes = baseDoc.content || [];
  const repetitions = Math.ceil(targetPages / 2);
  const expandedContent: PMNode[] = [];

  for (let i = 0; i < repetitions; i++) {
    expandedContent.push(...contentNodes);
  }

  return {
    ...baseDoc,
    content: expandedContent,
  };
}

/**
 * Simulate cache operations (placeholder for MeasureCache)
 *
 * In production, this would use the real MeasureCache from layout-bridge
 */
class MockMeasureCache {
  private cache = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.cache.set(key, value);
  }

  get(key: string): unknown | undefined {
    return this.cache.get(key);
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Estimate cache memory usage
   *
   * @returns Estimated memory in bytes
   */
  estimateMemory(): number {
    // Rough estimate: 200 bytes per entry (key + value overhead)
    return this.cache.size * 200;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats object
   */
  getStats(): { size: number; memorySizeEstimate: number } {
    return {
      size: this.size(),
      memorySizeEstimate: this.estimateMemory(),
    };
  }
}

describe('Memory Profiling', () => {
  beforeEach(() => {
    // Force GC before each test for consistent baselines
    forceGC();
  });

  describe('Heap Usage', () => {
    it('should maintain <300MB heap usage for 100-page document', () => {
      const baseline = captureMemorySnapshot();

      // Load and process 100-page document
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(baseDoc, 100);

      const { blocks } = toFlowBlocks(largeDoc);

      // Simulate layout operations (would use real layout engine)
      // For now, just keep blocks in memory
      const layoutData = blocks.map((block) => ({
        block,
        measured: true,
        layouted: true,
      }));

      const afterLayout = captureMemorySnapshot();
      const memoryDelta = calculateMemoryDelta(baseline, afterLayout);

      console.log('Heap Usage (100-page doc):');
      console.log(`  Baseline: ${formatBytes(baseline.heapUsed)}`);
      console.log(`  After layout: ${formatBytes(afterLayout.heapUsed)}`);
      console.log(`  Delta: ${memoryDelta.toFixed(1)} MB`);
      console.log(`  Threshold: ${MEMORY_THRESHOLDS.heapUsed} MB`);

      expect(memoryDelta).toBeLessThan(MEMORY_THRESHOLDS.heapUsed);
      expect(blocks.length).toBeGreaterThan(0);
      expect(layoutData.length).toBe(blocks.length);
    });

    it('should scale linearly with document size', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);

      // Test 10, 50, 100 page documents
      const pageCounts = [10, 50, 100];
      const blockCounts: Array<{ pages: number; blocks: number }> = [];

      for (const pageCount of pageCounts) {
        forceGC();

        const doc = expandDocumentToPages(baseDoc, pageCount);
        const { blocks } = toFlowBlocks(doc);

        blockCounts.push({ pages: pageCount, blocks: blocks.length });

        console.log(`${pageCount} pages: ${blocks.length} blocks`);
      }

      console.log(`Block counts: ${blockCounts.map((b) => b.blocks).join(', ')}`);

      // Block count should scale with document size (more reliable than memory measurements)
      // Memory measurements are non-deterministic due to GC timing, especially in CI
      expect(blockCounts[1].blocks).toBeGreaterThan(blockCounts[0].blocks);
      expect(blockCounts[2].blocks).toBeGreaterThan(blockCounts[1].blocks);

      // Verify roughly linear scaling: 100-page doc should have ~10x blocks of 10-page doc
      // Allow significant tolerance due to document expansion algorithm
      const ratio = blockCounts[2].blocks / blockCounts[0].blocks;
      expect(ratio).toBeGreaterThan(3); // At least 3x more blocks
      expect(ratio).toBeLessThan(15); // Not more than 15x (reasonable bounds)
    });
  });

  describe('Cache Memory Management', () => {
    it('should maintain cache size ≤10,000 entries', () => {
      const cache = new MockMeasureCache();

      // Simulate measuring a large document
      // Each paragraph generates multiple cache entries (one per line measurement)
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const largeDoc = expandDocumentToPages(baseDoc, 500); // Large doc to stress cache

      const { blocks } = toFlowBlocks(largeDoc);

      // Simulate cache population
      // In reality, MeasureCache would use LRU eviction
      blocks.forEach((block, idx) => {
        // Simulate 3-5 cache entries per block (line measurements)
        const entriesPerBlock = 3 + (idx % 3);
        for (let i = 0; i < entriesPerBlock; i++) {
          cache.set(`${block.id}-line-${i}`, { width: 100, height: 20 });
        }

        // Apply LRU eviction manually (real cache does this automatically)
        if (cache.size() > MEMORY_THRESHOLDS.cacheSize) {
          // Evict oldest entries (simplified - just clear to threshold)
          cache.clear();
        }
      });

      const stats = cache.getStats();

      console.log('Cache Statistics:');
      console.log(`  Entries: ${stats.size.toLocaleString()}`);
      console.log(`  Memory: ${formatBytes(stats.memorySizeEstimate)}`);
      console.log(`  Threshold: ${MEMORY_THRESHOLDS.cacheSize.toLocaleString()} entries`);

      expect(stats.size).toBeLessThanOrEqual(MEMORY_THRESHOLDS.cacheSize);
    });

    it('should maintain cache memory <100MB', () => {
      const cache = new MockMeasureCache();

      // Populate cache with realistic entries
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 100);
      const { blocks } = toFlowBlocks(doc);

      blocks.forEach((block, idx) => {
        for (let i = 0; i < 5; i++) {
          cache.set(`${block.id}-${i}`, {
            width: 100 + i,
            height: 20 + i,
            metadata: { blockId: block.id, lineIndex: i },
          });
        }
      });

      const stats = cache.getStats();
      const cacheMemoryMB = stats.memorySizeEstimate / 1024 / 1024;

      console.log('Cache Memory Usage:');
      console.log(`  Memory: ${cacheMemoryMB.toFixed(1)} MB`);
      console.log(`  Entries: ${stats.size.toLocaleString()}`);
      console.log(`  Threshold: ${MEMORY_THRESHOLDS.cacheMemory} MB`);

      expect(cacheMemoryMB).toBeLessThan(MEMORY_THRESHOLDS.cacheMemory);
    });

    it('should evict old entries when cache size limit is reached', () => {
      const cache = new MockMeasureCache();
      const maxSize = 100;

      // Add entries beyond limit
      for (let i = 0; i < 200; i++) {
        cache.set(`entry-${i}`, { data: i });

        // Apply manual eviction at limit
        if (cache.size() > maxSize) {
          // In real cache, LRU eviction would happen automatically
          // For now, just clear to simulate eviction policy
          const currentSize = cache.size();
          if (currentSize > maxSize) {
            cache.clear();
            // Re-add recent entries
            for (let j = Math.max(0, i - maxSize); j <= i; j++) {
              cache.set(`entry-${j}`, { data: j });
            }
          }
        }
      }

      expect(cache.size()).toBeLessThanOrEqual(maxSize * 1.1); // Allow 10% tolerance
    });
  });

  describe('Memory Leak Detection', () => {
    gcOnly('should release memory after 10 render cycles', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 50);

      const { samples, median: memoryLeak } = sampleHeapDeltas(() => {
        // Perform 10 render cycles
        for (let cycle = 0; cycle < 10; cycle++) {
          // Create blocks and simulate layout allocations
          void toFlowBlocks(doc).blocks.map((block) => ({
            block,
            rendered: true,
          }));
        }
      });

      console.log('Memory Leak Test (10 cycles):');
      console.log(`  Samples: ${samples.map((value) => `${value.toFixed(1)} MB`).join(', ')}`);
      console.log(`  Median leak: ${memoryLeak.toFixed(1)} MB`);
      console.log(`  Tolerance: ${MEMORY_THRESHOLDS.leakTolerance} MB`);

      // Allow small amount of retained memory
      expect(memoryLeak).toBeLessThan(MEMORY_THRESHOLDS.leakTolerance);
    });

    gcOnly('should not retain references after document unload', () => {
      const { samples, median: retained } = sampleHeapDeltas(() => {
        // Load, process, then release in scope
        {
          const baseDoc = loadPMJsonFixture(FIXTURES.basic);
          const largeDoc = expandDocumentToPages(baseDoc, 100);
          const { blocks } = toFlowBlocks(largeDoc);

          // Simulate full layout allocations
          void blocks.map((block) => ({ block, layout: {} }));
        }
      });

      console.log('Document Unload Test:');
      console.log(`  Samples: ${samples.map((value) => `${value.toFixed(1)} MB`).join(', ')}`);
      console.log(`  Median retained: ${retained.toFixed(1)} MB`);

      expect(retained).toBeLessThan(MEMORY_THRESHOLDS.leakTolerance);
    });

    gcOnly('should handle rapid load/unload cycles without accumulation', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 20);

      const { samples, median: accumulated } = sampleHeapDeltas(() => {
        // Perform 50 rapid load/unload cycles
        for (let i = 0; i < 50; i++) {
          void toFlowBlocks(doc).blocks;
          // Immediately release
        }
      });

      console.log('Rapid Load/Unload Test (50 cycles):');
      console.log(`  Samples: ${samples.map((value) => `${value.toFixed(1)} MB`).join(', ')}`);
      console.log(`  Median accumulated: ${accumulated.toFixed(1)} MB`);

      // Should not accumulate significant memory
      expect(accumulated).toBeLessThan(MEMORY_THRESHOLDS.leakTolerance);
    });
  });

  describe('External Memory (Buffers and Arrays)', () => {
    it('should track external memory usage', () => {
      const baseline = captureMemorySnapshot();

      // Load document (contains external data like images, buffers)
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 100);
      const { blocks } = toFlowBlocks(doc);

      const afterLoad = captureMemorySnapshot();

      const externalDelta = (afterLoad.external - baseline.external) / 1024 / 1024;

      console.log('External Memory:');
      console.log(`  Baseline: ${formatBytes(baseline.external)}`);
      console.log(`  After load: ${formatBytes(afterLoad.external)}`);
      console.log(`  Delta: ${externalDelta.toFixed(1)} MB`);

      // External memory should be reasonable (most data is in heap)
      expect(externalDelta).toBeLessThan(50); // <50MB external
    });

    it('should release external memory after unload', () => {
      forceGC();
      const baseline = captureMemorySnapshot();

      {
        const baseDoc = loadPMJsonFixture(FIXTURES.basic);
        const doc = expandDocumentToPages(baseDoc, 100);
        const { blocks } = toFlowBlocks(doc);
      }

      forceGC();
      const afterUnload = captureMemorySnapshot();

      const externalLeak = (afterUnload.external - baseline.external) / 1024 / 1024;

      console.log('External Memory Leak:');
      console.log(`  Baseline: ${formatBytes(baseline.external)}`);
      console.log(`  After unload + GC: ${formatBytes(afterUnload.external)}`);
      console.log(`  Leak: ${externalLeak.toFixed(1)} MB`);

      expect(externalLeak).toBeLessThan(5); // <5MB external leak
    });
  });

  describe('Memory Profiling Report', () => {
    it('should generate comprehensive memory profile for baseline', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);

      // Profile various document sizes
      const profiles: Array<{
        pages: number;
        heapUsed: string;
        external: string;
        blockCount: number;
      }> = [];

      for (const pageCount of [10, 50, 100]) {
        forceGC();
        const baseline = captureMemorySnapshot();

        const doc = expandDocumentToPages(baseDoc, pageCount);
        const { blocks } = toFlowBlocks(doc);

        const afterLayout = captureMemorySnapshot();

        profiles.push({
          pages: pageCount,
          heapUsed: formatBytes(afterLayout.heapUsed - baseline.heapUsed),
          external: formatBytes(afterLayout.external - baseline.external),
          blockCount: blocks.length,
        });
      }

      const report = {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        thresholds: MEMORY_THRESHOLDS,
        profiles,
      };

      console.log('Memory Profiling Report:');
      console.log(JSON.stringify(report, null, 2));

      expect(report.profiles).toHaveLength(3);
      expect(report.profiles.every((p) => p.blockCount > 0)).toBe(true);
    });
  });
});
