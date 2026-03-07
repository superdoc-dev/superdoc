/**
 * Chart SVG Renderer
 *
 * Renders ChartDrawing blocks as inline SVG elements.
 * Supports bar/column, line, area, pie, doughnut, scatter, bubble, and radar charts
 * with fallback placeholder for unsupported types.
 *
 * Performance guardrails (§11):
 * - Max 20 rendered series
 * - Max 500 data points per series
 * - Max 5,000 SVG elements per chart
 */

import type { ChartModel, ChartSeriesData, DrawingGeometry } from '@superdoc/contracts';

// ============================================================================
// Performance Guardrails (§11)
// ============================================================================

const MAX_RENDERED_SERIES = 20;
const MAX_POINTS_PER_SERIES = 500;
const SVG_ELEMENT_BUDGET = 5_000;

// ============================================================================
// Visual Constants
// ============================================================================

const SERIES_COLORS = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
const AXIS_COLOR = '#595959';
const GRID_COLOR = '#E0E0E0';
const LABEL_COLOR = '#333';
const TICK_LABEL_COLOR = '#666';
const FONT_FAMILY = 'Calibri, Arial, sans-serif';
const PLACEHOLDER_BG = '#f8f9fa';
const PLACEHOLDER_BORDER = '#dee2e6';
const PLACEHOLDER_TEXT_COLOR = '#6c757d';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CHART_PADDING = { top: 30, right: 20, bottom: 50, left: 60 };
const VALUE_TICK_COUNT = 5;

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a chart element from a ChartDrawing block.
 * Routes to the correct renderer based on chart type, with placeholder fallback.
 */
export function createChartElement(
  doc: Document,
  chartData: ChartModel | undefined,
  geometry: DrawingGeometry,
): HTMLElement {
  const container = doc.createElement('div');
  container.classList.add('superdoc-chart');
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.position = 'relative';

  if (!chartData || !chartData.series?.length) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  if (chartData.chartType === 'barChart') {
    return renderBarChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'lineChart') {
    return renderLineChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'stockChart') {
    return renderLineChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'areaChart') {
    return renderAreaChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'scatterChart') {
    return renderScatterChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'bubbleChart') {
    return renderBubbleChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'radarChart') {
    return renderRadarChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'pieChart') {
    return renderPieChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'doughnutChart') {
    return renderDoughnutChart(doc, container, chartData, geometry);
  }
  if (chartData.chartType === 'ofPieChart') {
    return renderPieChart(doc, container, chartData, geometry);
  }

  return createChartPlaceholder(doc, container, `Chart: ${chartData.chartType}`);
}

/**
 * Create a placeholder for charts with missing data or unsupported types.
 * Preserves layout dimensions and is print-visible.
 */
export function createChartPlaceholder(doc: Document, container: HTMLElement, label: string): HTMLElement {
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.background = PLACEHOLDER_BG;
  container.style.border = `1px solid ${PLACEHOLDER_BORDER}`;
  container.style.borderRadius = '4px';
  container.style.color = PLACEHOLDER_TEXT_COLOR;
  container.style.fontSize = '13px';
  container.style.fontFamily = FONT_FAMILY;

  const icon = doc.createElement('span');
  icon.textContent = '\u{1F4CA} ';
  container.appendChild(icon);

  const text = doc.createElement('span');
  text.textContent = label;
  container.appendChild(text);

  return container;
}

// ============================================================================
// Bar Chart Renderer
// ============================================================================

/** Format a numeric tick value for chart axis labels. */
export function formatTickValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type BarChartLayout = {
  plotWidth: number;
  plotHeight: number;
  groupWidth: number;
  barWidth: number;
  barGap: number;
  baselineY: number;
  valueRange: number;
  minValue: number;
  maxValue: number;
};

/**
 * Apply performance guardrails to chart data, truncating series and data points
 * that exceed rendering limits. Returns the truncated data and whether truncation occurred.
 */
function applyGuardrails(chart: ChartModel): { series: ChartSeriesData[]; truncated: boolean } {
  let truncated = false;
  let series = chart.series;

  if (series.length > MAX_RENDERED_SERIES) {
    series = series.slice(0, MAX_RENDERED_SERIES);
    truncated = true;
  }

  series = series.map((s) => {
    if (s.values.length <= MAX_POINTS_PER_SERIES && s.categories.length <= MAX_POINTS_PER_SERIES) {
      return s;
    }
    truncated = true;
    return {
      name: s.name,
      categories: s.categories.slice(0, MAX_POINTS_PER_SERIES),
      values: s.values.slice(0, MAX_POINTS_PER_SERIES),
      ...(s.xValues && { xValues: s.xValues.slice(0, MAX_POINTS_PER_SERIES) }),
      ...(s.bubbleSizes && { bubbleSizes: s.bubbleSizes.slice(0, MAX_POINTS_PER_SERIES) }),
    };
  });

  return { series, truncated };
}

function computeBarLayout(width: number, height: number, series: ChartSeriesData[]): BarChartLayout {
  const plotWidth = Math.max(1, width - CHART_PADDING.left - CHART_PADDING.right);
  const plotHeight = Math.max(1, height - CHART_PADDING.top - CHART_PADDING.bottom);

  const allValues = series.flatMap((s) => s.values);
  const maxValue = Math.max(0, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const valueRange = Math.max(1, maxValue - minValue);

  const categories = series[0]?.categories ?? [];
  const categoryCount = Math.max(1, categories.length);
  const seriesCount = series.length;

  const groupWidth = plotWidth / categoryCount;
  const barGap = Math.max(1, groupWidth * 0.1);
  const totalBarWidth = groupWidth - barGap * 2;
  const barWidth = Math.max(1, totalBarWidth / seriesCount);
  const baselineY = CHART_PADDING.top + plotHeight * (maxValue / valueRange);

  return { plotWidth, plotHeight, groupWidth, barWidth, barGap, baselineY, valueRange, minValue, maxValue };
}

function renderBars(doc: Document, svg: SVGSVGElement, series: ChartSeriesData[], layout: BarChartLayout): void {
  const { groupWidth, barGap, barWidth, baselineY, valueRange, plotHeight } = layout;

  for (let si = 0; si < series.length; si++) {
    const s = series[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;

    for (let ci = 0; ci < s.values.length; ci++) {
      const value = s.values[ci]!;
      const barHeight = Math.abs(value / valueRange) * plotHeight;
      const x = CHART_PADDING.left + ci * groupWidth + barGap + si * barWidth;
      const y = value >= 0 ? baselineY - barHeight : baselineY;

      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(barWidth));
      rect.setAttribute('height', String(Math.max(0.5, barHeight)));
      rect.setAttribute('fill', color);
      svg.appendChild(rect);
    }
  }
}

function renderAxes(doc: Document, svg: SVGSVGElement, layout: BarChartLayout): void {
  const { plotWidth, plotHeight, baselineY } = layout;

  // Vertical axis
  const vAxis = doc.createElementNS(SVG_NS, 'line');
  vAxis.setAttribute('x1', String(CHART_PADDING.left));
  vAxis.setAttribute('y1', String(CHART_PADDING.top));
  vAxis.setAttribute('x2', String(CHART_PADDING.left));
  vAxis.setAttribute('y2', String(CHART_PADDING.top + plotHeight));
  vAxis.setAttribute('stroke', AXIS_COLOR);
  vAxis.setAttribute('stroke-width', '1');
  svg.appendChild(vAxis);

  // Horizontal baseline
  const hAxis = doc.createElementNS(SVG_NS, 'line');
  hAxis.setAttribute('x1', String(CHART_PADDING.left));
  hAxis.setAttribute('y1', String(baselineY));
  hAxis.setAttribute('x2', String(CHART_PADDING.left + plotWidth));
  hAxis.setAttribute('y2', String(baselineY));
  hAxis.setAttribute('stroke', AXIS_COLOR);
  hAxis.setAttribute('stroke-width', '1');
  svg.appendChild(hAxis);
}

function renderCategoryLabels(
  doc: Document,
  svg: SVGSVGElement,
  categories: string[],
  layout: BarChartLayout,
  width: number,
): void {
  const { groupWidth, plotHeight } = layout;
  const categoryCount = Math.max(1, categories.length);
  const fontSize = Math.max(8, Math.min(12, width / categoryCount / 5));

  for (let ci = 0; ci < categories.length; ci++) {
    const labelX = CHART_PADDING.left + ci * groupWidth + groupWidth / 2;
    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(labelX));
    label.setAttribute('y', String(CHART_PADDING.top + plotHeight + 16));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', String(fontSize));
    label.setAttribute('fill', LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = categories[ci] ?? '';
    svg.appendChild(label);
  }
}

function renderValueTicks(doc: Document, svg: SVGSVGElement, layout: BarChartLayout, height: number): void {
  const { plotWidth, plotHeight, valueRange, minValue } = layout;
  const tickStep = valueRange / VALUE_TICK_COUNT;
  const fontSize = Math.max(8, Math.min(11, height / 30));

  for (let i = 0; i <= VALUE_TICK_COUNT; i++) {
    const tickValue = minValue + tickStep * i;
    const tickY = CHART_PADDING.top + plotHeight - (plotHeight * (tickValue - minValue)) / valueRange;

    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(CHART_PADDING.left - 6));
    label.setAttribute('y', String(tickY + 3));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('font-size', String(fontSize));
    label.setAttribute('fill', TICK_LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = formatTickValue(tickValue);
    svg.appendChild(label);

    if (i > 0 && i < VALUE_TICK_COUNT) {
      const gridLine = doc.createElementNS(SVG_NS, 'line');
      gridLine.setAttribute('x1', String(CHART_PADDING.left));
      gridLine.setAttribute('y1', String(tickY));
      gridLine.setAttribute('x2', String(CHART_PADDING.left + plotWidth));
      gridLine.setAttribute('y2', String(tickY));
      gridLine.setAttribute('stroke', GRID_COLOR);
      gridLine.setAttribute('stroke-width', '0.5');
      svg.appendChild(gridLine);
    }
  }
}

function renderLegend(doc: Document, svg: SVGSVGElement, series: ChartSeriesData[], height: number): void {
  const legendY = height - 12;
  let legendX = CHART_PADDING.left;

  for (let si = 0; si < series.length; si++) {
    const s = series[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;

    const swatch = doc.createElementNS(SVG_NS, 'rect');
    swatch.setAttribute('x', String(legendX));
    swatch.setAttribute('y', String(legendY - 8));
    swatch.setAttribute('width', '10');
    swatch.setAttribute('height', '10');
    swatch.setAttribute('fill', color);
    svg.appendChild(swatch);

    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(legendX + 14));
    label.setAttribute('y', String(legendY));
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = s.name;
    svg.appendChild(label);

    legendX += 14 + s.name.length * 6 + 16;
  }
}

function renderTruncationIndicator(doc: Document, svg: SVGSVGElement, width: number): void {
  const indicator = doc.createElementNS(SVG_NS, 'text');
  indicator.setAttribute('x', String(width - 8));
  indicator.setAttribute('y', '14');
  indicator.setAttribute('text-anchor', 'end');
  indicator.setAttribute('font-size', '10');
  indicator.setAttribute('fill', PLACEHOLDER_TEXT_COLOR);
  indicator.setAttribute('font-family', FONT_FAMILY);
  indicator.textContent = 'Data truncated for display';
  svg.appendChild(indicator);
}

type CartesianLayout = {
  plotWidth: number;
  plotHeight: number;
  minValue: number;
  maxValue: number;
  valueRange: number;
  baselineY: number;
  categoryCount: number;
};

function toCartesianLayout(
  width: number,
  height: number,
  series: ChartSeriesData[],
  forceZeroMin = false,
): CartesianLayout {
  const plotWidth = Math.max(1, width - CHART_PADDING.left - CHART_PADDING.right);
  const plotHeight = Math.max(1, height - CHART_PADDING.top - CHART_PADDING.bottom);

  const values = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  let minValue = values.length ? Math.min(...values) : 0;
  let maxValue = values.length ? Math.max(...values) : 1;

  if (forceZeroMin) {
    minValue = Math.min(0, minValue);
    maxValue = Math.max(0, maxValue);
  }
  if (maxValue === minValue) {
    minValue -= 1;
    maxValue += 1;
  }

  const valueRange = Math.max(1, maxValue - minValue);
  const zeroRatio = (0 - minValue) / valueRange;
  const baselineRatio = Math.max(0, Math.min(1, zeroRatio));
  const baselineY = CHART_PADDING.top + plotHeight - plotHeight * baselineRatio;

  const categoryCount = Math.max(1, series[0]?.categories?.length ?? series[0]?.values?.length ?? 1);

  return { plotWidth, plotHeight, minValue, maxValue, valueRange, baselineY, categoryCount };
}

function pointX(layout: CartesianLayout, index: number): number {
  if (layout.categoryCount <= 1) {
    return CHART_PADDING.left + layout.plotWidth / 2;
  }
  return CHART_PADDING.left + (layout.plotWidth * index) / (layout.categoryCount - 1);
}

function pointY(layout: CartesianLayout, value: number): number {
  return CHART_PADDING.top + layout.plotHeight - ((value - layout.minValue) / layout.valueRange) * layout.plotHeight;
}

function renderCartesianAxes(doc: Document, svg: SVGSVGElement, layout: CartesianLayout): void {
  const vAxis = doc.createElementNS(SVG_NS, 'line');
  vAxis.setAttribute('x1', String(CHART_PADDING.left));
  vAxis.setAttribute('y1', String(CHART_PADDING.top));
  vAxis.setAttribute('x2', String(CHART_PADDING.left));
  vAxis.setAttribute('y2', String(CHART_PADDING.top + layout.plotHeight));
  vAxis.setAttribute('stroke', AXIS_COLOR);
  vAxis.setAttribute('stroke-width', '1');
  svg.appendChild(vAxis);

  const hAxis = doc.createElementNS(SVG_NS, 'line');
  hAxis.setAttribute('x1', String(CHART_PADDING.left));
  hAxis.setAttribute('y1', String(layout.baselineY));
  hAxis.setAttribute('x2', String(CHART_PADDING.left + layout.plotWidth));
  hAxis.setAttribute('y2', String(layout.baselineY));
  hAxis.setAttribute('stroke', AXIS_COLOR);
  hAxis.setAttribute('stroke-width', '1');
  svg.appendChild(hAxis);
}

function renderPointCategoryLabels(
  doc: Document,
  svg: SVGSVGElement,
  categories: string[],
  layout: CartesianLayout,
  width: number,
): void {
  const labels = categories.length ? categories : Array.from({ length: layout.categoryCount }, (_, i) => String(i + 1));
  const categoryCount = Math.max(1, labels.length);
  const fontSize = Math.max(8, Math.min(12, width / categoryCount / 4));

  for (let i = 0; i < labels.length; i++) {
    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(pointX(layout, i)));
    label.setAttribute('y', String(CHART_PADDING.top + layout.plotHeight + 16));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', String(fontSize));
    label.setAttribute('fill', LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = labels[i] ?? '';
    svg.appendChild(label);
  }
}

function renderCartesianValueTicks(doc: Document, svg: SVGSVGElement, layout: CartesianLayout, height: number): void {
  const tickStep = layout.valueRange / VALUE_TICK_COUNT;
  const fontSize = Math.max(8, Math.min(11, height / 30));

  for (let i = 0; i <= VALUE_TICK_COUNT; i++) {
    const tickValue = layout.minValue + tickStep * i;
    const tickY =
      CHART_PADDING.top + layout.plotHeight - (layout.plotHeight * (tickValue - layout.minValue)) / layout.valueRange;

    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(CHART_PADDING.left - 6));
    label.setAttribute('y', String(tickY + 3));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('font-size', String(fontSize));
    label.setAttribute('fill', TICK_LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = formatTickValue(tickValue);
    svg.appendChild(label);

    if (i > 0 && i < VALUE_TICK_COUNT) {
      const grid = doc.createElementNS(SVG_NS, 'line');
      grid.setAttribute('x1', String(CHART_PADDING.left));
      grid.setAttribute('y1', String(tickY));
      grid.setAttribute('x2', String(CHART_PADDING.left + layout.plotWidth));
      grid.setAttribute('y2', String(tickY));
      grid.setAttribute('stroke', GRID_COLOR);
      grid.setAttribute('stroke-width', '0.5');
      svg.appendChild(grid);
    }
  }
}

type XYLayout = {
  plotWidth: number;
  plotHeight: number;
  minX: number;
  maxX: number;
  xRange: number;
  minY: number;
  maxY: number;
  yRange: number;
  axisX: number;
  axisY: number;
};

type XYPoint = { x: number; y: number; size?: number };

function toXYPoints(series: ChartSeriesData): XYPoint[] {
  const yValues = series.values;
  const xValues = series.xValues?.length ? series.xValues : yValues.map((_, index) => index + 1);
  const sizes = series.bubbleSizes ?? [];
  const count = Math.min(xValues.length, yValues.length);
  const points: XYPoint[] = [];

  for (let i = 0; i < count; i++) {
    const x = xValues[i];
    const y = yValues[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const size = sizes[i];
    points.push({ x, y, ...(Number.isFinite(size) ? { size } : {}) });
  }

  return points;
}

function toXYLayout(width: number, height: number, points: XYPoint[], forceZeroMin = false): XYLayout {
  const plotWidth = Math.max(1, width - CHART_PADDING.left - CHART_PADDING.right);
  const plotHeight = Math.max(1, height - CHART_PADDING.top - CHART_PADDING.bottom);

  let minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  let maxX = points.length ? Math.max(...points.map((point) => point.x)) : 1;
  let minY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
  let maxY = points.length ? Math.max(...points.map((point) => point.y)) : 1;

  if (forceZeroMin) {
    minX = Math.min(0, minX);
    maxX = Math.max(0, maxX);
    minY = Math.min(0, minY);
    maxY = Math.max(0, maxY);
  }

  if (maxX === minX) {
    minX -= 1;
    maxX += 1;
  }
  if (maxY === minY) {
    minY -= 1;
    maxY += 1;
  }

  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);

  const axisXRatio = Math.max(0, Math.min(1, (0 - minX) / xRange));
  const axisYRatio = Math.max(0, Math.min(1, (0 - minY) / yRange));
  const axisX = CHART_PADDING.left + plotWidth * axisXRatio;
  const axisY = CHART_PADDING.top + plotHeight - plotHeight * axisYRatio;

  return { plotWidth, plotHeight, minX, maxX, xRange, minY, maxY, yRange, axisX, axisY };
}

function xyToSvgX(layout: XYLayout, xValue: number): number {
  return CHART_PADDING.left + ((xValue - layout.minX) / layout.xRange) * layout.plotWidth;
}

function xyToSvgY(layout: XYLayout, yValue: number): number {
  return CHART_PADDING.top + layout.plotHeight - ((yValue - layout.minY) / layout.yRange) * layout.plotHeight;
}

function renderXYAxes(doc: Document, svg: SVGSVGElement, layout: XYLayout): void {
  const yAxis = doc.createElementNS(SVG_NS, 'line');
  yAxis.setAttribute('x1', String(layout.axisX));
  yAxis.setAttribute('y1', String(CHART_PADDING.top));
  yAxis.setAttribute('x2', String(layout.axisX));
  yAxis.setAttribute('y2', String(CHART_PADDING.top + layout.plotHeight));
  yAxis.setAttribute('stroke', AXIS_COLOR);
  yAxis.setAttribute('stroke-width', '1');
  svg.appendChild(yAxis);

  const xAxis = doc.createElementNS(SVG_NS, 'line');
  xAxis.setAttribute('x1', String(CHART_PADDING.left));
  xAxis.setAttribute('y1', String(layout.axisY));
  xAxis.setAttribute('x2', String(CHART_PADDING.left + layout.plotWidth));
  xAxis.setAttribute('y2', String(layout.axisY));
  xAxis.setAttribute('stroke', AXIS_COLOR);
  xAxis.setAttribute('stroke-width', '1');
  svg.appendChild(xAxis);
}

function renderXYTicks(doc: Document, svg: SVGSVGElement, layout: XYLayout, height: number): void {
  const fontSize = Math.max(8, Math.min(11, height / 30));

  for (let i = 0; i <= VALUE_TICK_COUNT; i++) {
    const tickRatio = i / VALUE_TICK_COUNT;
    const yValue = layout.minY + layout.yRange * tickRatio;
    const y = CHART_PADDING.top + layout.plotHeight - layout.plotHeight * tickRatio;

    const yLabel = doc.createElementNS(SVG_NS, 'text');
    yLabel.setAttribute('x', String(CHART_PADDING.left - 6));
    yLabel.setAttribute('y', String(y + 3));
    yLabel.setAttribute('text-anchor', 'end');
    yLabel.setAttribute('font-size', String(fontSize));
    yLabel.setAttribute('fill', TICK_LABEL_COLOR);
    yLabel.setAttribute('font-family', FONT_FAMILY);
    yLabel.textContent = formatTickValue(yValue);
    svg.appendChild(yLabel);

    if (i > 0 && i < VALUE_TICK_COUNT) {
      const grid = doc.createElementNS(SVG_NS, 'line');
      grid.setAttribute('x1', String(CHART_PADDING.left));
      grid.setAttribute('y1', String(y));
      grid.setAttribute('x2', String(CHART_PADDING.left + layout.plotWidth));
      grid.setAttribute('y2', String(y));
      grid.setAttribute('stroke', GRID_COLOR);
      grid.setAttribute('stroke-width', '0.5');
      svg.appendChild(grid);
    }

    const xValue = layout.minX + layout.xRange * tickRatio;
    const x = CHART_PADDING.left + layout.plotWidth * tickRatio;
    const xLabel = doc.createElementNS(SVG_NS, 'text');
    xLabel.setAttribute('x', String(x));
    xLabel.setAttribute('y', String(CHART_PADDING.top + layout.plotHeight + 16));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('font-size', String(fontSize));
    xLabel.setAttribute('fill', TICK_LABEL_COLOR);
    xLabel.setAttribute('font-family', FONT_FAMILY);
    xLabel.textContent = formatTickValue(xValue);
    svg.appendChild(xLabel);
  }
}

function estimateScatterBubbleElements(pointsBySeries: XYPoint[][], hasLegend: boolean): number {
  const points = pointsBySeries.reduce((sum, seriesPoints) => sum + seriesPoints.length, 0);
  const axes = 2;
  const ticks = (VALUE_TICK_COUNT + 1) * 2;
  const gridLines = Math.max(0, VALUE_TICK_COUNT - 1);
  const legend = hasLegend ? pointsBySeries.length * 2 : 0;
  return points + axes + ticks + gridLines + legend;
}

function renderScatterChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);
  const pointsBySeries = series.map(toXYPoints);
  const allPoints = pointsBySeries.flat();
  if (allPoints.length === 0) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  const hasLegend = chart.legendPosition !== undefined;
  const estimated = estimateScatterBubbleElements(pointsBySeries, hasLegend);
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const layout = toXYLayout(width, height, allPoints, false);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  renderXYAxes(doc, svg, layout);
  renderXYTicks(doc, svg, layout, height);

  for (let si = 0; si < pointsBySeries.length; si++) {
    const points = pointsBySeries[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;
    for (const point of points) {
      const marker = doc.createElementNS(SVG_NS, 'circle');
      marker.setAttribute('cx', String(xyToSvgX(layout, point.x)));
      marker.setAttribute('cy', String(xyToSvgY(layout, point.y)));
      marker.setAttribute('r', '3');
      marker.setAttribute('fill', color);
      marker.setAttribute('fill-opacity', '0.85');
      svg.appendChild(marker);
    }
  }

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function renderBubbleChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);
  const pointsBySeries = series.map(toXYPoints);
  const allPoints = pointsBySeries.flat();
  if (allPoints.length === 0) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  const hasLegend = chart.legendPosition !== undefined;
  const estimated = estimateScatterBubbleElements(pointsBySeries, hasLegend);
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const layout = toXYLayout(width, height, allPoints, false);
  const allSizes = allPoints.map((point) => point.size).filter((size): size is number => size != null && size > 0);
  const maxBubbleSize = allSizes.length ? Math.max(...allSizes) : 1;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  renderXYAxes(doc, svg, layout);
  renderXYTicks(doc, svg, layout, height);

  for (let si = 0; si < pointsBySeries.length; si++) {
    const points = pointsBySeries[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;
    for (const point of points) {
      const size = point.size && point.size > 0 ? point.size : maxBubbleSize * 0.5;
      const radius = maxBubbleSize > 0 ? 4 + (size / maxBubbleSize) * 10 : 6;

      const bubble = doc.createElementNS(SVG_NS, 'circle');
      bubble.setAttribute('cx', String(xyToSvgX(layout, point.x)));
      bubble.setAttribute('cy', String(xyToSvgY(layout, point.y)));
      bubble.setAttribute('r', String(Math.max(2, radius)));
      bubble.setAttribute('fill', color);
      bubble.setAttribute('fill-opacity', '0.45');
      bubble.setAttribute('stroke', color);
      bubble.setAttribute('stroke-width', '1');
      svg.appendChild(bubble);
    }
  }

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function estimateRadarElements(series: ChartSeriesData[], categoryCount: number, hasLegend: boolean): number {
  const ringCount = 4;
  const grid = ringCount + categoryCount;
  const labels = categoryCount;
  const seriesElements = series.reduce((sum, s) => sum + 1 + Math.min(categoryCount, s.values.length), 0);
  const legend = hasLegend ? series.length * 2 : 0;
  return grid + labels + seriesElements + legend;
}

function renderRadarChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);
  const categories = series[0]?.categories ?? [];
  const categoryCount = Math.max(3, categories.length, ...series.map((oneSeries) => oneSeries.values.length));
  const hasLegend = chart.legendPosition !== undefined;
  const estimated = estimateRadarElements(series, categoryCount, hasLegend);
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const allValues = series.flatMap((oneSeries) => oneSeries.values).filter((value) => Number.isFinite(value));
  const maxValue = allValues.length ? Math.max(...allValues) : 1;
  const minValue = allValues.length ? Math.min(...allValues) : 0;
  const valueRange = Math.max(1, maxValue - Math.min(0, minValue));

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  const legendSpace = hasLegend ? 34 : 10;
  const radius = Math.max(10, Math.min(width - 60, height - legendSpace - 60) / 2);
  const centerX = width / 2;
  const centerY = CHART_PADDING.top + (height - CHART_PADDING.top - legendSpace) / 2;
  const ringCount = 4;

  for (let ring = 1; ring <= ringCount; ring++) {
    const ringRadius = (radius * ring) / ringCount;
    const ringPoints: string[] = [];
    for (let i = 0; i < categoryCount; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / categoryCount;
      ringPoints.push(`${centerX + ringRadius * Math.cos(angle)},${centerY + ringRadius * Math.sin(angle)}`);
    }
    const polygon = doc.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', ringPoints.join(' '));
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', GRID_COLOR);
    polygon.setAttribute('stroke-width', '0.8');
    svg.appendChild(polygon);
  }

  for (let i = 0; i < categoryCount; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / categoryCount;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const spoke = doc.createElementNS(SVG_NS, 'line');
    spoke.setAttribute('x1', String(centerX));
    spoke.setAttribute('y1', String(centerY));
    spoke.setAttribute('x2', String(x));
    spoke.setAttribute('y2', String(y));
    spoke.setAttribute('stroke', GRID_COLOR);
    spoke.setAttribute('stroke-width', '0.8');
    svg.appendChild(spoke);

    const labelRadius = radius + 14;
    const labelX = centerX + labelRadius * Math.cos(angle);
    const labelY = centerY + labelRadius * Math.sin(angle);
    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(labelX));
    label.setAttribute('y', String(labelY));
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.setAttribute(
      'text-anchor',
      Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end',
    );
    label.textContent = categories[i] ?? `Category ${i + 1}`;
    svg.appendChild(label);
  }

  for (let si = 0; si < series.length; si++) {
    const oneSeries = series[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;
    const points: string[] = [];
    const pointPositions: Array<{ x: number; y: number }> = [];
    const pointCount = Math.min(categoryCount, oneSeries.values.length);
    for (let i = 0; i < pointCount; i++) {
      const value = oneSeries.values[i] ?? 0;
      const normalized = Math.max(0, (value - Math.min(0, minValue)) / valueRange);
      const pointRadius = normalized * radius;
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / categoryCount;
      const x = centerX + pointRadius * Math.cos(angle);
      const y = centerY + pointRadius * Math.sin(angle);
      points.push(`${x},${y}`);
      pointPositions.push({ x, y });
    }

    if (points.length > 0) {
      const polygon = doc.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', points.join(' '));
      polygon.setAttribute('fill', color);
      polygon.setAttribute('fill-opacity', '0.18');
      polygon.setAttribute('stroke', color);
      polygon.setAttribute('stroke-width', '1.8');
      svg.appendChild(polygon);
    }

    for (const point of pointPositions) {
      const marker = doc.createElementNS(SVG_NS, 'circle');
      marker.setAttribute('cx', String(point.x));
      marker.setAttribute('cy', String(point.y));
      marker.setAttribute('r', '2.5');
      marker.setAttribute('fill', color);
      svg.appendChild(marker);
    }
  }

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function estimateLineAreaElements(
  series: ChartSeriesData[],
  categories: string[],
  hasLegend: boolean,
  withMarkers: boolean,
): number {
  const points = series.reduce((sum, s) => sum + s.values.length, 0);
  const pathPerSeries = series.length;
  const markerCount = withMarkers ? points : 0;
  const axes = 2;
  const valueTicks = (VALUE_TICK_COUNT + 1) * 2;
  const categoryLabels = categories.length;
  const legend = hasLegend ? series.length * 2 : 0;
  return pathPerSeries + markerCount + axes + valueTicks + categoryLabels + legend;
}

type PieSlice = {
  label: string;
  value: number;
  color: string;
};

function normalizePieSlices(series: ChartSeriesData): { slices: PieSlice[]; truncated: boolean } {
  let truncated = false;
  const maxCount = Math.min(series.values.length, MAX_POINTS_PER_SERIES);
  if (series.values.length > maxCount) truncated = true;

  const slices: PieSlice[] = [];
  for (let i = 0; i < maxCount; i++) {
    const raw = Number(series.values[i]);
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    slices.push({
      label: series.categories[i] ?? `Category ${i + 1}`,
      value,
      color: SERIES_COLORS[i % SERIES_COLORS.length]!,
    });
  }

  return { slices, truncated };
}

function renderPieSlices(
  doc: Document,
  svg: SVGSVGElement,
  slices: PieSlice[],
  centerX: number,
  centerY: number,
  radius: number,
): void {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return;

  let start = -Math.PI / 2;
  for (const slice of slices) {
    if (slice.value <= 0) continue;

    const sweep = (slice.value / total) * Math.PI * 2;
    if (sweep >= Math.PI * 2 - 0.0001) {
      const full = doc.createElementNS(SVG_NS, 'circle');
      full.setAttribute('cx', String(centerX));
      full.setAttribute('cy', String(centerY));
      full.setAttribute('r', String(radius));
      full.setAttribute('fill', slice.color);
      full.setAttribute('stroke', '#fff');
      full.setAttribute('stroke-width', String(Math.max(1, radius * 0.01)));
      svg.appendChild(full);
      break;
    }

    const end = start + sweep;
    const x1 = centerX + radius * Math.cos(start);
    const y1 = centerY + radius * Math.sin(start);
    const x2 = centerX + radius * Math.cos(end);
    const y2 = centerY + radius * Math.sin(end);
    const largeArc = sweep > Math.PI ? 1 : 0;

    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', slice.color);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', String(Math.max(1, radius * 0.01)));
    svg.appendChild(path);

    start = end;
  }
}

function renderPieLegend(doc: Document, svg: SVGSVGElement, slices: PieSlice[], width: number, height: number): void {
  const totalWidth = slices.reduce((acc, slice) => acc + 14 + slice.label.length * 6 + 16, 0);
  let legendX = Math.max(10, (width - totalWidth) / 2);
  const legendY = height - 14;

  for (const slice of slices) {
    const swatch = doc.createElementNS(SVG_NS, 'rect');
    swatch.setAttribute('x', String(legendX));
    swatch.setAttribute('y', String(legendY - 8));
    swatch.setAttribute('width', '10');
    swatch.setAttribute('height', '10');
    swatch.setAttribute('fill', slice.color);
    svg.appendChild(swatch);

    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(legendX + 14));
    label.setAttribute('y', String(legendY));
    label.setAttribute('font-size', '10');
    label.setAttribute('fill', LABEL_COLOR);
    label.setAttribute('font-family', FONT_FAMILY);
    label.textContent = slice.label;
    svg.appendChild(label);

    legendX += 14 + slice.label.length * 6 + 16;
  }
}

function renderPieChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const series = chart.series[0];
  if (!series) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  const { slices, truncated } = normalizePieSlices(series);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  if (slices.length * 3 > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, 'Chart too large');
  }

  const { width, height } = geometry;
  const hasLegend = chart.legendPosition !== undefined;
  const title = series.name?.trim() || '';
  const hasTitle = title.length > 0;
  const titleSpace = hasTitle ? 34 : 10;
  const legendSpace = hasLegend ? 40 : 10;
  const plotWidth = Math.max(1, width - 20);
  const plotHeight = Math.max(1, height - titleSpace - legendSpace);
  const centerX = width / 2;
  const centerY = titleSpace + plotHeight / 2;
  const radius = Math.max(8, Math.min(plotWidth, plotHeight) * 0.45);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  if (hasTitle) {
    const titleEl = doc.createElementNS(SVG_NS, 'text');
    titleEl.setAttribute('x', String(centerX));
    titleEl.setAttribute('y', '24');
    titleEl.setAttribute('text-anchor', 'middle');
    titleEl.setAttribute('font-size', String(Math.max(12, Math.min(22, width / 18))));
    titleEl.setAttribute('fill', AXIS_COLOR);
    titleEl.setAttribute('font-family', FONT_FAMILY);
    titleEl.textContent = title;
    svg.appendChild(titleEl);
  }

  renderPieSlices(doc, svg, slices, centerX, centerY, radius);

  if (hasLegend) {
    renderPieLegend(doc, svg, slices, width, height);
  }

  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function renderLineChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);
  const categories = series[0]?.categories ?? [];
  const hasLegend = chart.legendPosition !== undefined;
  const estimated = estimateLineAreaElements(series, categories, hasLegend, true);
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const layout = toCartesianLayout(width, height, series, false);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  renderCartesianAxes(doc, svg, layout);
  renderCartesianValueTicks(doc, svg, layout, height);
  renderPointCategoryLabels(doc, svg, categories, layout, width);

  for (let si = 0; si < series.length; si++) {
    const s = series[si]!;
    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;
    const points: string[] = [];
    for (let i = 0; i < s.values.length; i++) {
      const x = pointX(layout, i);
      const y = pointY(layout, s.values[i] ?? 0);
      points.push(`${x},${y}`);
    }
    if (points.length === 0) continue;

    const line = doc.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', points.join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    for (let i = 0; i < s.values.length; i++) {
      const marker = doc.createElementNS(SVG_NS, 'circle');
      marker.setAttribute('cx', String(pointX(layout, i)));
      marker.setAttribute('cy', String(pointY(layout, s.values[i] ?? 0)));
      marker.setAttribute('r', '2.5');
      marker.setAttribute('fill', color);
      svg.appendChild(marker);
    }
  }

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function renderAreaChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);
  const categories = series[0]?.categories ?? [];
  const hasLegend = chart.legendPosition !== undefined;
  const estimated = estimateLineAreaElements(series, categories, hasLegend, false) + series.length;
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const layout = toCartesianLayout(width, height, series, true);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  renderCartesianAxes(doc, svg, layout);
  renderCartesianValueTicks(doc, svg, layout, height);
  renderPointCategoryLabels(doc, svg, categories, layout, width);

  for (let si = 0; si < series.length; si++) {
    const s = series[si]!;
    if (s.values.length === 0) continue;

    const color = SERIES_COLORS[si % SERIES_COLORS.length]!;
    const firstX = pointX(layout, 0);
    const pathParts = [`M ${firstX} ${layout.baselineY}`];

    for (let i = 0; i < s.values.length; i++) {
      pathParts.push(`L ${pointX(layout, i)} ${pointY(layout, s.values[i] ?? 0)}`);
    }

    const lastX = pointX(layout, Math.max(0, s.values.length - 1));
    pathParts.push(`L ${lastX} ${layout.baselineY} Z`);

    const area = doc.createElementNS(SVG_NS, 'path');
    area.setAttribute('d', pathParts.join(' '));
    area.setAttribute('fill', color);
    area.setAttribute('fill-opacity', '0.35');
    area.setAttribute('stroke', color);
    area.setAttribute('stroke-width', '1.5');
    svg.appendChild(area);
  }

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

function renderDoughnutSlices(
  doc: Document,
  svg: SVGSVGElement,
  slices: PieSlice[],
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
): void {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return;

  let start = -Math.PI / 2;
  for (const slice of slices) {
    if (slice.value <= 0) continue;
    const sweep = (slice.value / total) * Math.PI * 2;

    if (sweep >= Math.PI * 2 - 0.0001) {
      const ring = doc.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(centerX));
      ring.setAttribute('cy', String(centerY));
      ring.setAttribute('r', String((outerRadius + innerRadius) / 2));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', slice.color);
      ring.setAttribute('stroke-width', String(Math.max(1, outerRadius - innerRadius)));
      svg.appendChild(ring);
      break;
    }

    const end = start + sweep;
    const x1 = centerX + outerRadius * Math.cos(start);
    const y1 = centerY + outerRadius * Math.sin(start);
    const x2 = centerX + outerRadius * Math.cos(end);
    const y2 = centerY + outerRadius * Math.sin(end);

    const ix1 = centerX + innerRadius * Math.cos(start);
    const iy1 = centerY + innerRadius * Math.sin(start);
    const ix2 = centerX + innerRadius * Math.cos(end);
    const iy2 = centerY + innerRadius * Math.sin(end);

    const largeArc = sweep > Math.PI ? 1 : 0;
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute(
      'd',
      `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} ` +
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`,
    );
    path.setAttribute('fill', slice.color);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1');
    svg.appendChild(path);

    start = end;
  }
}

function renderDoughnutChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const series = chart.series[0];
  if (!series) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  const { slices, truncated } = normalizePieSlices(series);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return createChartPlaceholder(doc, container, 'No chart data');
  }

  if (slices.length * 3 > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, 'Chart too large');
  }

  const { width, height } = geometry;
  const hasLegend = chart.legendPosition !== undefined;
  const title = series.name?.trim() || '';
  const hasTitle = title.length > 0;
  const titleSpace = hasTitle ? 34 : 10;
  const legendSpace = hasLegend ? 40 : 10;
  const plotWidth = Math.max(1, width - 20);
  const plotHeight = Math.max(1, height - titleSpace - legendSpace);
  const centerX = width / 2;
  const centerY = titleSpace + plotHeight / 2;
  const outerRadius = Math.max(8, Math.min(plotWidth, plotHeight) * 0.45);
  const innerRadius = Math.max(2, outerRadius * 0.58);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  if (hasTitle) {
    const titleEl = doc.createElementNS(SVG_NS, 'text');
    titleEl.setAttribute('x', String(centerX));
    titleEl.setAttribute('y', '24');
    titleEl.setAttribute('text-anchor', 'middle');
    titleEl.setAttribute('font-size', String(Math.max(12, Math.min(22, width / 18))));
    titleEl.setAttribute('fill', AXIS_COLOR);
    titleEl.setAttribute('font-family', FONT_FAMILY);
    titleEl.textContent = title;
    svg.appendChild(titleEl);
  }

  renderDoughnutSlices(doc, svg, slices, centerX, centerY, outerRadius, innerRadius);

  if (hasLegend) {
    renderPieLegend(doc, svg, slices, width, height);
  }
  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}

/**
 * Estimate the number of SVG elements a bar chart will produce.
 * Used to check the element budget before rendering.
 */
function estimateSvgElements(series: ChartSeriesData[], categories: string[], hasLegend: boolean): number {
  const bars = series.reduce((sum, s) => sum + s.values.length, 0);
  const axes = 2;
  const categoryLabels = categories.length;
  const valueTicks = (VALUE_TICK_COUNT + 1) * 2; // labels + grid lines
  const legend = hasLegend ? series.length * 2 : 0; // swatch + label per series
  return bars + axes + categoryLabels + valueTicks + legend;
}

function renderBarChart(
  doc: Document,
  container: HTMLElement,
  chart: ChartModel,
  geometry: DrawingGeometry,
): HTMLElement {
  const { width, height } = geometry;
  const { series, truncated } = applyGuardrails(chart);

  const categories = series[0]?.categories ?? [];
  const hasLegend = chart.legendPosition !== undefined;

  // Enforce SVG element budget (§11): fall back to simplified rendering
  const estimated = estimateSvgElements(series, categories, hasLegend);
  if (estimated > SVG_ELEMENT_BUDGET) {
    return createChartPlaceholder(doc, container, `Chart too complex for inline rendering (${estimated} elements)`);
  }

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.display = 'block';

  const layout = computeBarLayout(width, height, series);

  renderBars(doc, svg, series, layout);
  renderAxes(doc, svg, layout);
  renderCategoryLabels(doc, svg, categories, layout, width);
  renderValueTicks(doc, svg, layout, height);

  if (hasLegend) {
    renderLegend(doc, svg, series, height);
  }

  if (truncated) {
    renderTruncationIndicator(doc, svg, width);
  }

  container.appendChild(svg);
  return container;
}
