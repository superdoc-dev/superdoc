import type { FlowBlock, Layout } from '@superdoc/contracts';

export function createLayoutMetrics(
  perf: Performance | undefined,
  startMark: number | undefined,
  layout: Layout,
  blocks: FlowBlock[],
): { durationMs: number; blockCount: number; pageCount: number } | undefined {
  if (!perf || startMark == null || typeof perf.now !== 'function') {
    return undefined;
  }
  const durationMs = Math.max(0, perf.now() - startMark);
  return {
    durationMs,
    blockCount: blocks.length,
    pageCount: layout.pages?.length ?? 0,
  };
}
