import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createChartImmutabilityPlugin } from './chart-immutability-plugin.js';

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
});
