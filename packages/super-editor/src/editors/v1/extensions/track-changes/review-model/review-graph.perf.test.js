import { describe, expect, it } from 'vitest';
import { TrackInsertMarkName } from '../constants.js';
import { buildReviewGraph } from './review-graph.js';
import { createReviewGraphTestSchema, markAttrs, stateFromTrackedSpans } from './test-fixtures.js';

const schema = createReviewGraphTestSchema();

const insertMark = (attrs) => ({ markType: TrackInsertMarkName, attrs: markAttrs(attrs) });

describe('review-graph: performance', () => {
  // Phase0-002 "Graph Invariants": "Graph rebuild must be O(N) in tracked-mark
  // spans. Add a performance test or benchmark around a document with at
  // least 5,000 tracked spans and a key-repeat edit inside an existing
  // tracked insertion."
  //
  // The threshold here is intentionally generous so CI variance does not
  // flake the suite. The assertion exists to catch a regression that turns
  // the build accidentally O(N^2): on a healthy machine the build for 5k
  // distinct-id spans finishes well under 100ms; we allow 2.5s.
  it('builds a graph with at least 5000 distinct tracked-mark spans within budget', () => {
    const N = 5000;
    const spans = [];
    for (let i = 0; i < N; i++) {
      // Each span gets a distinct id so the merge pass cannot collapse them.
      // Interleave with one untracked space so the spans stay as discrete
      // mark spans rather than being merged into one inline node.
      spans.push({ text: `x`, marks: [insertMark({ id: `id-${i}` })] });
      spans.push({ text: ' ', marks: [] });
    }

    const { state } = stateFromTrackedSpans({ schema, spans });

    const start = Date.now();
    const graph = buildReviewGraph({ state });
    const elapsed = Date.now() - start;

    expect(graph.changes.size).toBe(N);
    expect(elapsed).toBeLessThan(2500);
  });

  // Same shape with one shared id: this is what a "long, key-repeat-style
  // refinement inside a single tracked insertion" looks like once the
  // compiler folds adjacent same-id segments. The merge pass should collapse
  // them, so this test asserts on segment count rather than time.
  it('merges 5000 adjacent same-id insertion segments into one segment', () => {
    const N = 5000;
    const spans = [];
    for (let i = 0; i < N; i++) {
      spans.push({ text: 'x', marks: [insertMark({ id: 'one' })] });
    }
    const { state } = stateFromTrackedSpans({ schema, spans });
    const graph = buildReviewGraph({ state });
    expect(graph.changes.size).toBe(1);
    // Even though each character is a distinct PM text node, the merge pass
    // should produce one segment because positions are adjacent and attrs
    // are identical.
    expect(graph.changes.get('one').segments).toHaveLength(1);
    expect(graph.changes.get('one').segments[0].to - graph.changes.get('one').segments[0].from).toBe(N);
  });
});
