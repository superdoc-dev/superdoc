/**
 * Chart OOXML parsing helpers.
 *
 * Extracts chart data from OOXML chart XML parts (word/charts/chartN.xml)
 * and converts them into a normalized ChartModel for rendering.
 *
 * Supported chart types: bar/line/area/pie/doughnut/scatter/bubble/radar/stock/surface.
 * Data is read from cached values (c:strCache / c:numCache) to avoid
 * needing the embedded Excel workbook.
 */

/** OOXML namespace URI for chart graphic data. */
export const CHART_URI = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

/** OOXML relationship type for chart parts. */
export const CHART_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

/**
 * Known OOXML chart element names mapped to their normalized chart type.
 * Exhaustive for common Word chart types.
 */
const CHART_TYPE_MAP = {
  'c:barChart': 'barChart',
  'c:bar3DChart': 'barChart',
  'c:lineChart': 'lineChart',
  'c:line3DChart': 'lineChart',
  'c:pieChart': 'pieChart',
  'c:pie3DChart': 'pieChart',
  'c:ofPieChart': 'ofPieChart',
  'c:areaChart': 'areaChart',
  'c:area3DChart': 'areaChart',
  'c:scatterChart': 'scatterChart',
  'c:bubbleChart': 'bubbleChart',
  'c:bubble3DChart': 'bubbleChart',
  'c:doughnutChart': 'doughnutChart',
  'c:radarChart': 'radarChart',
  'c:stockChart': 'stockChart',
  'c:surfaceChart': 'surfaceChart',
  'c:surface3DChart': 'surfaceChart',
};

const CHART_TYPE_NAMES = new Set(Object.keys(CHART_TYPE_MAP));

// ============================================================================
// XML traversal helpers
// ============================================================================

/**
 * Find a direct child element by name.
 * @param {Object} node - XML node with `elements` array
 * @param {string} name - Element name to find
 * @returns {Object|undefined}
 */
const findChild = (node, name) => node?.elements?.find((el) => el.name === name);

/**
 * Find all direct children with a given name.
 * @param {Object} node - XML node with `elements` array
 * @param {string} name - Element name to filter
 * @returns {Object[]}
 */
const findChildren = (node, name) => node?.elements?.filter((el) => el.name === name) ?? [];

/**
 * Get an attribute value from an XML node.
 * @param {Object} node - XML node
 * @param {string} attr - Attribute name
 * @returns {string|undefined}
 */
const getAttr = (node, attr) => node?.attributes?.[attr];

// ============================================================================
// Chart part resolution
// ============================================================================

/**
 * Normalize a relationship target path to a zip entry key.
 *
 * Handles the variants that different DOCX producers emit:
 * - Relative:  "charts/chart1.xml"
 * - Prefixed:  "./charts/chart1.xml"
 * - Parent:    "../charts/chart1.xml" (from a sub-folder rels file)
 * - Absolute:  "/word/charts/chart1.xml"
 *
 * All are normalized to "word/charts/chart1.xml" for zip lookup.
 *
 * @param {string} target - Raw Target attribute from the Relationship element
 * @returns {string}
 */
function normalizeChartTarget(target) {
  let cleaned = target;

  // Strip leading "/" (absolute OPC path)
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);

  // Strip leading "./" (explicit current-dir)
  if (cleaned.startsWith('./')) cleaned = cleaned.slice(2);

  // Resolve "../" segments relative to word/ (rels files live in word/_rels/)
  while (cleaned.startsWith('../')) cleaned = cleaned.slice(3);

  // Ensure the path starts with "word/"
  if (!cleaned.startsWith('word/')) cleaned = `word/${cleaned}`;

  return cleaned;
}

/**
 * Resolve the chart part path from a relationship ID.
 *
 * Looks up the relationship in the owning story part's rels file
 * (e.g., `word/_rels/header1.xml.rels`), falling back to `document.xml.rels`.
 * The target path is normalized to handle producer-specific variants.
 *
 * @param {Object} docx - The document zip contents
 * @param {string} chartRelId - The r:id value from c:chart element
 * @param {string} [filename] - Current document part filename (e.g., "document.xml", "header1.xml")
 * @returns {{ chartPartPath: string, chartRel: Object }|null}
 */
export function resolveChartPart(docx, chartRelId, filename) {
  if (!chartRelId || !docx) return null;

  const currentFile = filename || 'document.xml';
  const rels = docx[`word/_rels/${currentFile}.rels`] || docx['word/_rels/document.xml.rels'];
  const relationships = findChild(rels, 'Relationships');

  const chartRel = relationships?.elements?.find((el) => getAttr(el, 'Id') === chartRelId);
  if (!chartRel) return null;

  const target = getAttr(chartRel, 'Target');
  if (!target) return null;

  const chartPartPath = normalizeChartTarget(target);
  return { chartPartPath, chartRel };
}

// ============================================================================
// Chart XML parsing
// ============================================================================

/**
 * Parse a chart XML part into a normalized ChartModel.
 *
 * @param {Object} chartXml - Parsed XML of word/charts/chartN.xml
 * @returns {import('@superdoc/contracts').ChartModel|null}
 */
export function parseChartXml(chartXml) {
  const chartSpace = chartXml?.name === 'c:chartSpace' ? chartXml : findChild(chartXml, 'c:chartSpace');
  const chart = findChild(chartSpace, 'c:chart');
  if (!chart) return null;

  const plotArea = findChild(chart, 'c:plotArea');
  if (!plotArea) return null;

  // Find the chart type element (c:barChart, c:lineChart, etc.)
  const chartTypeEntry = findChartTypeElement(plotArea);
  if (!chartTypeEntry) return null;

  const { element: chartTypeEl, chartType } = chartTypeEntry;

  const subType = extractGrouping(chartTypeEl);
  const barDirection = extractBarDirection(chartTypeEl);
  const series = parseSeries(chartTypeEl, chartType);
  const categoryAxis = parseAxis(plotArea, 'c:catAx');
  const valueAxis = parseAxis(plotArea, 'c:valAx');
  const legendPosition = parseLegendPosition(chart);
  const styleId = parseStyleId(chartSpace);

  return {
    chartType,
    ...(subType && { subType }),
    ...(barDirection && { barDirection }),
    series,
    ...(categoryAxis && { categoryAxis }),
    ...(valueAxis && { valueAxis }),
    ...(legendPosition && { legendPosition }),
    ...(styleId != null && { styleId }),
  };
}

// ============================================================================
// Internal parsing functions
// ============================================================================

/**
 * Find the first chart type element in a plotArea.
 * Recognized types map to their normalized name; unrecognized types
 * use the raw element name (e.g., 'c:surfaceChart') for placeholder rendering.
 * @param {Object} plotArea
 * @returns {{ element: Object, chartType: string }|null}
 */
function findChartTypeElement(plotArea) {
  for (const el of plotArea.elements || []) {
    if (CHART_TYPE_NAMES.has(el.name)) {
      return { element: el, chartType: CHART_TYPE_MAP[el.name] };
    }
  }

  // Fallback: unrecognized chart type element (e.g., c:surfaceChart, c:bubbleChart)
  // Still parse what we can so the renderer shows a labeled placeholder.
  for (const el of plotArea.elements || []) {
    if (el.name?.startsWith('c:') && el.name.endsWith('Chart')) {
      return { element: el, chartType: el.name.replace('c:', '') };
    }
  }

  return null;
}

/**
 * Extract the grouping attribute (e.g., 'clustered', 'stacked').
 * @param {Object} chartTypeEl
 * @returns {string|undefined}
 */
function extractGrouping(chartTypeEl) {
  const grouping = findChild(chartTypeEl, 'c:grouping');
  return getAttr(grouping, 'val') || undefined;
}

/**
 * Extract bar direction ('col' or 'bar') from a barChart element.
 * @param {Object} chartTypeEl
 * @returns {'col'|'bar'|undefined}
 */
function extractBarDirection(chartTypeEl) {
  const barDir = findChild(chartTypeEl, 'c:barDir');
  const val = getAttr(barDir, 'val');
  return val === 'col' || val === 'bar' ? val : undefined;
}

/**
 * Parse all series (c:ser) from a chart type element.
 * @param {Object} chartTypeEl
 * @returns {import('@superdoc/contracts').ChartSeriesData[]}
 */
function parseSeries(chartTypeEl, chartType) {
  return findChildren(chartTypeEl, 'c:ser').map((seriesEl) => parseOneSeries(seriesEl, chartType));
}

/**
 * Parse a single c:ser element into ChartSeriesData.
 * @param {Object} serEl
 * @param {string} chartType
 * @returns {import('@superdoc/contracts').ChartSeriesData}
 */
function parseOneSeries(serEl, chartType) {
  const name = extractSeriesName(serEl);
  const categories = extractCachedStrings(findChild(serEl, 'c:cat'));
  const values = extractCachedNumbers(findChild(serEl, 'c:val'));
  const xValues = extractCachedNumbers(findChild(serEl, 'c:xVal'));
  const yValues = extractCachedNumbers(findChild(serEl, 'c:yVal'));
  const bubbleSizes = extractCachedNumbers(findChild(serEl, 'c:bubbleSize'));

  if (chartType === 'scatterChart' || chartType === 'bubbleChart') {
    const parsedCategoryValues = categories.map((value) => Number(value));
    const numericCategoryValues = parsedCategoryValues.every((value) => Number.isFinite(value))
      ? parsedCategoryValues
      : [];
    const seriesXValues = xValues.length ? xValues : numericCategoryValues;
    const seriesYValues = yValues.length ? yValues : values;
    const seriesCategories = categories.length
      ? categories
      : seriesXValues.map((value, index) => formatChartLabel(value, index + 1));

    const seriesData = {
      name,
      categories: seriesCategories,
      values: seriesYValues,
      ...(seriesXValues.length ? { xValues: seriesXValues } : {}),
      ...(chartType === 'bubbleChart' && bubbleSizes.length ? { bubbleSizes } : {}),
    };

    return seriesData;
  }

  return { name, categories, values };
}

/**
 * Format numeric chart labels for generated category text.
 * @param {number} value
 * @param {number} fallbackIndex
 * @returns {string}
 */
function formatChartLabel(value, fallbackIndex) {
  if (!Number.isFinite(value)) return `Category ${fallbackIndex}`;
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
}

/**
 * Extract the series name from c:tx.
 * @param {Object} serEl
 * @returns {string}
 */
function extractSeriesName(serEl) {
  const tx = findChild(serEl, 'c:tx');
  const strRef = findChild(tx, 'c:strRef');
  const strCache = findChild(strRef, 'c:strCache');
  const pt = findChild(strCache, 'c:pt');
  const v = findChild(pt, 'c:v');
  return v?.elements?.[0]?.text ?? `Series ${getAttr(findChild(serEl, 'c:idx'), 'val') ?? ''}`.trim();
}

/**
 * Extract cached string values from c:cat or similar element.
 * @param {Object} parentEl - Element containing c:strRef or c:numRef
 * @returns {string[]}
 */
function extractCachedStrings(parentEl) {
  if (!parentEl) return [];

  // Try c:strRef > c:strCache first
  const strRef = findChild(parentEl, 'c:strRef');
  const strCache = findChild(strRef, 'c:strCache');

  // Fallback to c:numRef > c:numCache (some charts use numeric categories)
  const numRef = findChild(parentEl, 'c:numRef');
  const numCache = findChild(numRef, 'c:numCache');

  const cache = strCache || numCache;
  if (!cache) return [];

  return findChildren(cache, 'c:pt')
    .sort((a, b) => (Number(getAttr(a, 'idx')) || 0) - (Number(getAttr(b, 'idx')) || 0))
    .map((pt) => findChild(pt, 'c:v')?.elements?.[0]?.text ?? '');
}

/**
 * Extract cached numeric values from c:val.
 * @param {Object} parentEl - Element containing c:numRef
 * @returns {number[]}
 */
function extractCachedNumbers(parentEl) {
  if (!parentEl) return [];

  const numRef = findChild(parentEl, 'c:numRef');
  const numCache = findChild(numRef, 'c:numCache');
  if (!numCache) return [];

  return findChildren(numCache, 'c:pt')
    .sort((a, b) => (Number(getAttr(a, 'idx')) || 0) - (Number(getAttr(b, 'idx')) || 0))
    .map((pt) => {
      const text = findChild(pt, 'c:v')?.elements?.[0]?.text;
      const num = Number(text);
      return Number.isFinite(num) ? num : 0;
    });
}

/**
 * Parse an axis element (c:catAx or c:valAx).
 * @param {Object} plotArea
 * @param {string} axisName
 * @returns {import('@superdoc/contracts').ChartAxisConfig|undefined}
 */
function parseAxis(plotArea, axisName) {
  const axis = findChild(plotArea, axisName);
  if (!axis) return undefined;

  const titleEl = findChild(axis, 'c:title');
  const title = extractAxisTitle(titleEl);
  const scaling = findChild(axis, 'c:scaling');
  const orientation = getAttr(findChild(scaling, 'c:orientation'), 'val');

  const config = {};
  if (title) config.title = title;
  if (orientation === 'minMax' || orientation === 'maxMin') config.orientation = orientation;

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Extract title text from an axis title element.
 * @param {Object} titleEl
 * @returns {string|undefined}
 */
function extractAxisTitle(titleEl) {
  if (!titleEl) return undefined;
  const tx = findChild(titleEl, 'c:tx');
  const rich = findChild(tx, 'c:rich');
  const p = findChild(rich, 'a:p');
  const r = findChild(p, 'a:r');
  const t = findChild(r, 'a:t');
  return t?.elements?.[0]?.text || undefined;
}

/**
 * Parse legend position from chart element.
 * @param {Object} chart - c:chart element
 * @returns {string|undefined}
 */
function parseLegendPosition(chart) {
  const legend = findChild(chart, 'c:legend');
  if (!legend) return undefined;
  const legendPos = findChild(legend, 'c:legendPos');
  return getAttr(legendPos, 'val') || undefined;
}

/**
 * Parse chart style ID from chartSpace.
 * Checks mc:AlternateContent for c14:style, then mc:Fallback c:style, then direct c:style.
 * @param {Object} chartSpace - c:chartSpace element
 * @returns {number|undefined}
 */
function parseStyleId(chartSpace) {
  // Try mc:AlternateContent > mc:Choice > c14:style first
  const altContent = findChild(chartSpace, 'mc:AlternateContent');
  if (altContent) {
    const choice = findChild(altContent, 'mc:Choice');
    const c14Style = findChild(choice, 'c14:style');
    const val = getAttr(c14Style, 'val');
    if (val != null) return Number(val);

    // Fallback branch for consumers that do not support c14
    const fallback = findChild(altContent, 'mc:Fallback');
    const fallbackStyle = findChild(fallback, 'c:style');
    const fallbackVal = getAttr(fallbackStyle, 'val');
    if (fallbackVal != null) return Number(fallbackVal);
  }

  // Fallback to c:style
  const cStyle = findChild(chartSpace, 'c:style');
  const val = getAttr(cStyle, 'val');
  return val != null ? Number(val) : undefined;
}
