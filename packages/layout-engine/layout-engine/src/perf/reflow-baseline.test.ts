import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { layoutDocument } from '../index.js';
import type { FlowBlock, Measure, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';

// Write inside this package to avoid cwd issues; we'll collate later in the plan doc
const resultsPath = path.resolve(process.cwd(), 'perf-baseline-results.json');

function makePara(text: string): [ParagraphBlock, ParagraphMeasure] {
  const block = {
    id: 'p_' + Math.random().toString(36).slice(2),
    kind: 'paragraph' as const,
    attrs: { style: {} },
    runs: [{ text }],
  } as unknown as ParagraphBlock;

  const measure = {
    id: block.id,
    kind: 'paragraph' as const,
    lines: [
      {
        spans: [{ text, width: Math.min(500, text.length * 6), height: 14, ascent: 11, descent: 3 }],
        width: Math.min(500, text.length * 6),
        height: 14,
      },
    ],
  } as unknown as ParagraphMeasure;

  return [block, measure];
}

describe('Perf Baseline: layout reflow', () => {
  it('measures layoutDocument on small doc', () => {
    const blocks: FlowBlock[] = [];
    const measures: Measure[] = [];

    for (let i = 0; i < 200; i++) {
      const [b, m] = makePara('Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
      blocks.push(b);
      measures.push(m);
    }

    const t0 = performance.now();
    const layout = layoutDocument(blocks, measures, {});
    const t1 = performance.now();

    const reflowMs = t1 - t0;

    // Write/update results json for Phase 0 plan
    const result = {
      timestamp: new Date().toISOString(),
      layoutEngine: { reflowSmallDocMs: reflowMs, pages: (layout.pages || []).length },
    };

    try {
      let existing: Record<string, unknown> = {};
      if (fs.existsSync(resultsPath)) {
        const content = fs.readFileSync(resultsPath, 'utf8');
        existing = JSON.parse(content) as Record<string, unknown>;
      }
      fs.writeFileSync(resultsPath, JSON.stringify({ ...existing, ...result }, null, 2));
    } catch {
      // Ignore write errors
    }

    expect(reflowMs).toBeGreaterThan(0);
  });
});
