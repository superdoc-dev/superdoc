import { performance } from 'node:perf_hooks';
import type { FlowBlock, Layout, ParagraphBlock, ParagraphMeasure, Run } from '@superdoc/contracts';
import type { LayoutOptions } from '@superdoc/layout-engine';
import { measureBlock } from '@superdoc/measuring-dom';
import { createDomPainter } from '@superdoc/painter-dom';
import { layoutDocument } from '@superdoc/layout-engine';
import { incrementalLayout, measureCache, resolveMeasurementConstraints } from '../incrementalLayout';

const LETTER_LAYOUT: LayoutOptions = {
  pageSize: { w: 612, h: 792 },
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

const BASE_TEXT =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sodales sem at ligula pretium, vitae tempor ex congue. Integer vitae volutpat nulla, sit amet placerat leo. Suspendisse potenti. ';

type BenchmarkConfig = {
  targetPages: number;
  iterations?: number;
  layout?: LayoutOptions;
  editStride?: number;
};

export type BenchmarkResult = {
  targetPages: number;
  actualPages: number;
  initialPages: number;
  totalBlocks: number;
  iterations: number;
  blocksPerPage: number;
  blockHeight: number;
  initialLayoutMs: number;
  latency: {
    samples: number[];
    average: number;
    p50: number;
    p90: number;
    p99: number;
    max: number;
    min: number;
  };
  cache: {
    hits: number;
    misses: number;
    sets: number;
    invalidations: number;
    clears: number;
    hitRate: number;
  };
};

export type BenchmarkSuiteOptions = {
  scenarios?: BenchmarkConfig[];
};

export async function runBenchmarkSuite(options: BenchmarkSuiteOptions = {}): Promise<BenchmarkResult[]> {
  const scenarios = options.scenarios ?? [
    { targetPages: 1 },
    { targetPages: 10 },
    { targetPages: 25 },
    { targetPages: 50 },
  ];

  const results: BenchmarkResult[] = [];
  for (const scenario of scenarios) {
    const result = await runBenchmarkScenario(scenario);
    results.push(result);
  }
  return results;
}

export async function runBenchmarkScenario(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const layoutOptions: LayoutOptions = config.layout ?? LETTER_LAYOUT;
  const iterations = config.iterations ?? 10;

  measureCache.clear();
  measureCache.resetStats();

  const doc = await createSyntheticDocument(config.targetPages, layoutOptions);

  const measure = (block: FlowBlock, dims: { maxWidth: number; maxHeight: number }) => measureBlock(block, dims);

  let previousBlocks: FlowBlock[] = [];
  let previousLayout: Layout | null = null;

  const startFull = performance.now();
  const initial = await incrementalLayout(previousBlocks, previousLayout, doc.blocks, layoutOptions, measure);
  const initialDuration = performance.now() - startFull;

  const mount = ensureBenchmarkMount();
  const painter = createDomPainter({
    blocks: doc.blocks,
    measures: initial.measures,
  });
  painter.paint(initial.layout, mount);

  previousBlocks = doc.blocks;
  previousLayout = initial.layout;

  // Reset stats so incremental phase captures hit/miss ratios after warm cache.
  measureCache.resetStats();

  const durations: number[] = [];
  const totalBlocks = previousBlocks.length;
  const stride = config.editStride ?? 7;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const blockIndex = (iteration * stride) % totalBlocks;
    const nextBlocks = mutateBlocks(previousBlocks, blockIndex, iteration);

    const start = performance.now();

    const result = await incrementalLayout(previousBlocks, previousLayout, nextBlocks, layoutOptions, measure);
    painter.setData?.(nextBlocks, result.measures);
    painter.paint(result.layout, mount);
    const duration = performance.now() - start;
    durations.push(duration);

    previousBlocks = nextBlocks;
    previousLayout = result.layout;
  }

  const stats = measureCache.getStats();
  const lookups = stats.hits + stats.misses;
  const hitRate = lookups === 0 ? 1 : stats.hits / lookups;

  return {
    targetPages: config.targetPages,
    actualPages: previousLayout.pages.length,
    initialPages: initial.layout.pages.length,
    totalBlocks,
    iterations,
    blocksPerPage: doc.blocksPerPage,
    blockHeight: doc.blockHeight,
    initialLayoutMs: initialDuration,
    latency: summarizeDurations(durations),
    cache: {
      ...stats,
      hitRate,
    },
  };
}

type SyntheticDocument = {
  blocks: FlowBlock[];
  blockHeight: number;
  blocksPerPage: number;
};

async function createSyntheticDocument(targetPages: number, layoutOptions: LayoutOptions): Promise<SyntheticDocument> {
  const baseBlock = createParagraphBlock(0);
  const constraints = resolveMeasurementConstraints(layoutOptions);
  const measureConstraints = {
    maxWidth: constraints.measurementWidth,
    maxHeight: constraints.measurementHeight,
  };
  const measurement = (await measureBlock(baseBlock, measureConstraints)) as ParagraphMeasure;
  if (measurement.totalHeight <= 0) {
    throw new Error('Benchmark: measurement height is zero');
  }

  const pageSize = layoutOptions.pageSize ?? LETTER_LAYOUT.pageSize!;
  const margins = layoutOptions.margins ?? LETTER_LAYOUT.margins!;
  const contentHeight = pageSize.h - (margins.top + margins.bottom);

  if (measurement.totalHeight >= contentHeight) {
    throw new Error('Benchmark: base block exceeds page content height; reduce BASE_TEXT');
  }

  const blocksPerPage = Math.max(1, Math.floor(contentHeight / measurement.totalHeight));
  const totalBlocks = Math.max(1, targetPages * blocksPerPage);

  const blocks: FlowBlock[] = [];
  const measures: ParagraphMeasure[] = [];
  for (let index = 0; index < totalBlocks; index += 1) {
    const block = createParagraphBlock(index);
    blocks.push(block);
    measures.push((await measureBlock(block, measureConstraints)) as ParagraphMeasure);
  }

  let layout = layoutDocument(blocks, measures, layoutOptions);
  let guard = 0;
  while (layout.pages.length < targetPages && guard < targetPages * 4) {
    const block = createParagraphBlock(blocks.length);
    blocks.push(block);
    measures.push((await measureBlock(block, measureConstraints)) as ParagraphMeasure);
    layout = layoutDocument(blocks, measures, layoutOptions);
    guard += 1;
  }

  while (layout.pages.length > targetPages && blocks.length > 1) {
    blocks.pop();
    measures.pop();
    layout = layoutDocument(blocks, measures, layoutOptions);
  }

  const adjustedBlocksPerPage = Math.ceil(blocks.length / targetPages);

  return {
    blocks,
    blockHeight: measurement.totalHeight,
    blocksPerPage: adjustedBlocksPerPage,
  };
}

const ensureBenchmarkMount = (): HTMLElement => {
  const existing = document.getElementById('layout-benchmark-root');
  if (existing) {
    existing.innerHTML = '';
    return existing;
  }
  const mount = document.createElement('div');
  mount.id = 'layout-benchmark-root';
  document.body.appendChild(mount);
  return mount;
};

const createParagraphBlock = (index: number): ParagraphBlock => {
  const multiplier = 4;
  const text = Array.from({ length: multiplier }, () => BASE_TEXT.trim()).join(' ');
  const run: Run = {
    text: `${text} [${index}]`,
    fontFamily: 'Times New Roman',
    fontSize: 16,
  };
  return {
    kind: 'paragraph',
    id: `${index * 2}-paragraph`,
    runs: [run],
  };
};

const mutateBlocks = (blocks: FlowBlock[], blockIndex: number, iteration: number): FlowBlock[] => {
  return blocks.map((block, index): FlowBlock => {
    if (index !== blockIndex || block.kind !== 'paragraph') {
      return block;
    }
    const token = String.fromCharCode(97 + (iteration % 26));
    const nextRuns = block.runs.map((run, runIndex) =>
      runIndex === 0
        ? {
            ...run,
            text: `${'text' in run ? (run.text ?? '') : ''}${token}`,
          }
        : run,
    );
    return {
      ...block,
      runs: nextRuns,
    } as ParagraphBlock;
  });
};

const summarizeDurations = (durations: number[]) => {
  if (durations.length === 0) {
    return {
      samples: [],
      average: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      max: 0,
      min: 0,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (sorted.length === 1) return sorted[0];
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sorted[low];
    const fraction = rank - low;
    return sorted[low] + (sorted[high] - sorted[low]) * fraction;
  };

  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    samples: durations,
    average: total / durations.length,
    p50: percentile(50),
    p90: percentile(90),
    p99: percentile(99),
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
};
