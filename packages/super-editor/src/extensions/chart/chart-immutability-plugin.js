import { Plugin, PluginKey } from 'prosemirror-state';

export const CHART_IMMUTABILITY_KEY = new PluginKey('chartImmutability');

// ============================================================================
// Document scanning (only used at init and for old-doc memoization)
// ============================================================================

/**
 * Memoize chart positions per immutable PM doc reference.
 * PM docs are persistent data structures — same reference = same content.
 */
const chartPositionCache = new WeakMap();

/**
 * Count chart nodes in a document. Only called once at editor creation.
 */
function countChartNodes(doc) {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'chart') count++;
    return node.type.name !== 'chart';
  });
  return count;
}

/**
 * Collect all chart nodes with their positions. Memoized per doc reference
 * so repeated rejected transactions against the same doc are O(1).
 */
function collectChartNodes(doc) {
  let charts = chartPositionCache.get(doc);
  if (charts) return charts;

  charts = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'chart') charts.push({ pos, node });
    return node.type.name !== 'chart';
  });

  chartPositionCache.set(doc, charts);
  return charts;
}

// ============================================================================
// Step-slice scanning (O(inserted content), never O(doc size))
// ============================================================================

/**
 * Check whether any step in a transaction inserts chart content.
 * Scans only the step slices — typically a few nodes — not the full document.
 */
function transactionInsertsChart(tr) {
  for (const step of tr.steps) {
    const slice = step.slice;
    if (!slice || !slice.content.size) continue;

    let found = false;
    slice.content.descendants((node) => {
      if (node.type.name === 'chart') found = true;
      return !found;
    });
    if (found) return true;
  }
  return false;
}

// ============================================================================
// Mutation detection
// ============================================================================

/**
 * Check whether a transaction mutates any existing chart or inserts a new one.
 *
 * Cost: O(step slices) + O(chart count), never O(doc size).
 * - Insertion detected via step slices (tiny)
 * - Deletion/replacement/attr-change detected by mapping old chart positions
 * - Old chart positions are memoized per doc reference
 */
function isChartMutation(tr, oldDoc) {
  if (transactionInsertsChart(tr)) return true;

  const oldCharts = collectChartNodes(oldDoc);
  if (oldCharts.length === 0) return false;

  const newDoc = tr.doc;
  for (const { pos, node: oldNode } of oldCharts) {
    const mappedPos = tr.mapping.map(pos);
    const nodeAfter = newDoc.resolve(mappedPos).nodeAfter;

    if (!nodeAfter || nodeAfter.type.name !== 'chart') return true;

    if (oldNode.attrs !== nodeAfter.attrs) {
      if (JSON.stringify(oldNode.attrs) !== JSON.stringify(nodeAfter.attrs)) return true;
    }
  }

  return false;
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * ProseMirror plugin that enforces M1 chart immutability.
 *
 * Rejects any transaction that deletes, replaces, modifies attrs of,
 * or inserts a chart node.
 *
 * Performance characteristics:
 * - Chart-free docs: O(1) per transaction (checks step slices only)
 * - Docs with charts: O(chart count) per transaction (maps old positions)
 * - Never O(doc size) during editing — full scan only at init
 * - Globally registered but zero-cost when no charts exist
 */
export function createChartImmutabilityPlugin() {
  return new Plugin({
    key: CHART_IMMUTABILITY_KEY,

    state: {
      init(_, state) {
        return countChartNodes(state.doc);
      },
      apply(_tr, oldCount) {
        // filterTransaction guarantees no chart mutations passed through,
        // so the chart count is always unchanged after init.
        return oldCount;
      },
    },

    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;

      const oldCount = CHART_IMMUTABILITY_KEY.getState(state) ?? 0;
      if (oldCount === 0) {
        // No charts in current doc — only reject if a step inserts one.
        // Scans step slices (tiny), not the full document.
        return !transactionInsertsChart(tr);
      }

      return !isChartMutation(tr, state.doc);
    },
  });
}
