// @ts-check
/**
 * Graph-invariant convenience layer.
 *
 * The invariant checks themselves live next to the builder in
 * review-graph.js so they share private types. This module is a thin entry
 * point that downstream code (compiler/decision engine) imports without
 * pulling in the full graph builder API surface.
 */

import { validateGraph } from './review-graph.js';

/**
 * Run invariants and return diagnostics by severity bucket.
 *
 * @param {import('./review-graph.js').TrackedReviewGraph} graph
 * @returns {{
 *   errors: Array<import('./review-graph.js').GraphDiagnostic>,
 *   warnings: Array<import('./review-graph.js').GraphDiagnostic>,
 *   info: Array<import('./review-graph.js').GraphDiagnostic>,
 *   all: Array<import('./review-graph.js').GraphDiagnostic>,
 * }}
 */
export const runGraphInvariants = (graph) => {
  const all = validateGraph(graph);
  const errors = [];
  const warnings = [];
  const info = [];
  for (const d of all) {
    if (d.severity === 'error') errors.push(d);
    else if (d.severity === 'warning') warnings.push(d);
    else info.push(d);
  }
  return { errors, warnings, info, all };
};

/**
 * True when the graph has any `error`-severity diagnostic.
 *
 * Decision and compiler paths must abort before dispatch when this returns
 * true.
 *
 * @param {import('./review-graph.js').TrackedReviewGraph} graph
 * @returns {boolean}
 */
export const graphHasErrors = (graph) => {
  for (const d of validateGraph(graph)) {
    if (d.severity === 'error') return true;
  }
  return false;
};
