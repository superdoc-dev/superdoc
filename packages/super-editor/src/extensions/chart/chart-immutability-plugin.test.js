import { describe, it, expect } from 'vitest';
import { Schema, Slice } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import { createChartImmutabilityPlugin, CHART_IMMUTABILITY_KEY } from './chart-immutability-plugin.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline', inline: true },
    chart: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        chartData: { default: null },
        originalXml: { default: null },
        width: { default: 400 },
        height: { default: 300 },
      },
      toDOM: () => ['sd-chart', { style: 'display: inline-block;' }],
    },
  },
});

function createStateWithChart() {
  const chart = schema.nodes.chart.create({ chartData: { chartType: 'barChart', series: [] } });
  const para = schema.nodes.paragraph.create(null, [schema.text('before '), chart, schema.text(' after')]);
  const doc = schema.nodes.doc.create(null, [para]);
  return EditorState.create({ doc, schema, plugins: [createChartImmutabilityPlugin()] });
}

function createStateWithoutChart() {
  const para = schema.nodes.paragraph.create(null, [schema.text('plain text')]);
  const doc = schema.nodes.doc.create(null, [para]);
  return EditorState.create({ doc, schema, plugins: [createChartImmutabilityPlugin()] });
}

function findChartPos(state) {
  let chartPos = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'chart') chartPos = pos;
  });
  return chartPos;
}

describe('chart immutability plugin', () => {
  it('allows selection-only transactions', () => {
    const state = createStateWithChart();
    const tr = state.tr.setSelection(state.selection);
    const newState = state.applyTransaction(tr);
    expect(newState.failed).toBeUndefined();
  });

  it('rejects deletion of a chart node', () => {
    const state = createStateWithChart();
    const chartPos = findChartPos(state);
    expect(chartPos).toBeGreaterThan(-1);

    const tr = state.tr.delete(chartPos, chartPos + 1);
    const result = state.applyTransaction(tr);
    expect(result.state.doc.toString()).toBe(state.doc.toString());
  });

  it('rejects replacement of a chart node range', () => {
    const state = createStateWithChart();
    const chartPos = findChartPos(state);

    const replacement = schema.text('replaced');
    const tr = state.tr.replaceWith(chartPos, chartPos + 1, replacement);
    const result = state.applyTransaction(tr);
    expect(result.state.doc.toString()).toBe(state.doc.toString());
  });

  it('rejects attr changes on chart nodes via setNodeMarkup', () => {
    const state = createStateWithChart();
    const chartPos = findChartPos(state);

    const tr = state.tr.setNodeMarkup(chartPos, undefined, {
      chartData: { chartType: 'lineChart', series: [] },
      width: 800,
      height: 600,
    });
    const result = state.applyTransaction(tr);
    expect(result.state.doc.toString()).toBe(state.doc.toString());
  });

  it('allows edits to non-chart content in a doc with charts', () => {
    const state = createStateWithChart();
    const tr = state.tr.insertText('hello', 1);
    const result = state.applyTransaction(tr);
    expect(result.state.doc.textContent).toContain('hello');
  });

  it('rejects insertion of new chart nodes', () => {
    const state = createStateWithoutChart();
    const chart = schema.nodes.chart.create({ chartData: { chartType: 'barChart', series: [] } });
    const tr = state.tr.insert(1, chart);
    const result = state.applyTransaction(tr);
    // Transaction should be rejected — doc unchanged
    expect(result.state.doc.toString()).toBe(state.doc.toString());
  });

  it('allows text edits in docs without any charts (fast path)', () => {
    const state = createStateWithoutChart();
    const tr = state.tr.insertText('typing', 1);
    const result = state.applyTransaction(tr);
    expect(result.state.doc.textContent).toContain('typing');
  });

  it('allows remote collaboration replacements that span chart nodes', () => {
    const state = createStateWithChart();
    const replacementDoc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('remote'))]);
    const tr = state.tr
      .replace(0, state.doc.content.size, new Slice(replacementDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });

    const result = state.applyTransaction(tr);

    expect(result.state.doc.textContent).toContain('remote');
  });

  it('allows snapshot-exit replacements that span chart nodes (no isChangeOrigin)', () => {
    const state = createStateWithChart();
    const replacementDoc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text('snapshot exit')),
    ]);
    // y-prosemirror's unrenderSnapshot() sets { snapshot: null, prevSnapshot: null }
    // with no isChangeOrigin flag.
    const tr = state.tr
      .replace(0, state.doc.content.size, new Slice(replacementDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { snapshot: null, prevSnapshot: null });

    const result = state.applyTransaction(tr);

    expect(result.state.doc.textContent).toContain('snapshot exit');
  });

  it('rejects local chart deletion after Yjs sync inserts a chart', () => {
    // Start with no charts
    const state = createStateWithoutChart();

    // Simulate Yjs sync that introduces a chart
    const chart = schema.nodes.chart.create({ chartData: { chartType: 'barChart', series: [] } });
    const paraWithChart = schema.nodes.paragraph.create(null, [schema.text('synced '), chart]);
    const syncDoc = schema.nodes.doc.create(null, [paraWithChart]);
    const syncTr = state.tr
      .replace(0, state.doc.content.size, new Slice(syncDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const synced = state.applyTransaction(syncTr).state;

    // Local attempt to delete the chart must be rejected
    const chartPos = findChartPos(synced);
    expect(chartPos).toBeGreaterThan(-1);
    const deleteTr = synced.tr.delete(chartPos, chartPos + 1);
    const result = synced.applyTransaction(deleteTr);
    expect(result.state.doc.toString()).toBe(synced.doc.toString());
  });

  it('rejects local attr change on chart after Yjs sync inserts it', () => {
    const state = createStateWithoutChart();

    // Yjs sync introduces a chart
    const chart = schema.nodes.chart.create({ chartData: { chartType: 'barChart', series: [] } });
    const paraWithChart = schema.nodes.paragraph.create(null, [chart]);
    const syncDoc = schema.nodes.doc.create(null, [paraWithChart]);
    const syncTr = state.tr
      .replace(0, state.doc.content.size, new Slice(syncDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const synced = state.applyTransaction(syncTr).state;

    // Local setNodeMarkup must be rejected
    const chartPos = findChartPos(synced);
    const attrTr = synced.tr.setNodeMarkup(chartPos, undefined, {
      chartData: { chartType: 'lineChart', series: [] },
      width: 999,
      height: 999,
    });
    const result = synced.applyTransaction(attrTr);
    expect(result.state.doc.toString()).toBe(synced.doc.toString());
  });

  it('uses fast path after Yjs sync removes all charts', () => {
    const state = createStateWithChart();

    // Yjs sync replaces doc with chart-free content
    const plainDoc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('no charts'))]);
    const syncTr = state.tr
      .replace(0, state.doc.content.size, new Slice(plainDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const synced = state.applyTransaction(syncTr).state;

    // Local text edits should still work
    const textTr = synced.tr.insertText('hello', 1);
    const result = synced.applyTransaction(textTr);
    expect(result.state.doc.textContent).toContain('hello');
  });

  it('keeps chart count at 0 for Yjs text-only edits on chart-free docs (fast path)', () => {
    const state = createStateWithoutChart();
    expect(CHART_IMMUTABILITY_KEY.getState(state)).toBe(0);

    // Simulate multiple Yjs text-only remote edits — chart count must stay 0
    // without walking the full document each time.
    let current = state;
    for (let i = 0; i < 5; i++) {
      const syncTr = current.tr.insertText(`k${i}`, 1).setMeta(ySyncPluginKey, { isChangeOrigin: true });
      current = current.applyTransaction(syncTr).state;
      expect(CHART_IMMUTABILITY_KEY.getState(current)).toBe(0);
    }
  });

  it('recounts charts when Yjs sync introduces a chart into a chart-free doc', () => {
    const state = createStateWithoutChart();
    expect(CHART_IMMUTABILITY_KEY.getState(state)).toBe(0);

    // Yjs sync introduces a chart
    const chart = schema.nodes.chart.create({ chartData: { chartType: 'barChart', series: [] } });
    const paraWithChart = schema.nodes.paragraph.create(null, [schema.text('text '), chart]);
    const syncDoc = schema.nodes.doc.create(null, [paraWithChart]);
    const syncTr = state.tr
      .replace(0, state.doc.content.size, new Slice(syncDoc.content, 0, 0))
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });
    const synced = state.applyTransaction(syncTr).state;

    // Chart count must update to 1
    expect(CHART_IMMUTABILITY_KEY.getState(synced)).toBe(1);
  });
});
