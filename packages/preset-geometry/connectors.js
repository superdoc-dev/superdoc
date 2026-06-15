const SVG_NS = 'http://www.w3.org/2000/svg';
const CONNECTOR_SVG_ELEMENTS = 'path, line, polyline';

export const CONNECTOR_PRESET_SHAPES = new Set([
  'bentConnector2',
  'bentConnector3',
  'bentConnector4',
  'bentConnector5',
  'curvedConnector2',
  'curvedConnector3',
  'curvedConnector4',
  'curvedConnector5',
]);

export function isConnectorPresetShape(kind) {
  return typeof kind === 'string' && CONNECTOR_PRESET_SHAPES.has(kind);
}

export function formatSvgNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '0';
}

export function getConnectorPresetPath(kind, width, height) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const xMid = w / 2;
  const yMid = h / 2;
  const xQuarter = w * 0.25;
  const xThreeQuarter = w * 0.75;
  const yQuarter = h * 0.25;
  const yThreeQuarter = h * 0.75;
  const fmt = formatSvgNumber;

  switch (kind) {
    case 'bentConnector2':
      return `M 0 0 L ${fmt(w)} 0 L ${fmt(w)} ${fmt(h)}`;
    case 'bentConnector3':
      return `M 0 0 L ${fmt(xMid)} 0 L ${fmt(xMid)} ${fmt(h)} L ${fmt(w)} ${fmt(h)}`;
    case 'bentConnector4':
      return `M 0 0 L ${fmt(xMid)} 0 L ${fmt(xMid)} ${fmt(yMid)} L ${fmt(w)} ${fmt(yMid)} L ${fmt(w)} ${fmt(h)}`;
    case 'bentConnector5':
      return `M 0 0 L ${fmt(xQuarter)} 0 L ${fmt(xQuarter)} ${fmt(yMid)} L ${fmt(xThreeQuarter)} ${fmt(yMid)} L ${fmt(xThreeQuarter)} ${fmt(h)} L ${fmt(w)} ${fmt(h)}`;
    case 'curvedConnector2':
      return `M 0 0 C ${fmt(xMid)} 0 ${fmt(w)} ${fmt(yMid)} ${fmt(w)} ${fmt(h)}`;
    case 'curvedConnector3':
      return `M 0 0 C ${fmt(xQuarter)} 0 ${fmt(xMid)} ${fmt(yQuarter)} ${fmt(xMid)} ${fmt(yMid)} C ${fmt(xMid)} ${fmt(yThreeQuarter)} ${fmt(xThreeQuarter)} ${fmt(h)} ${fmt(w)} ${fmt(h)}`;
    case 'curvedConnector4':
      return `M 0 0 C ${fmt(xQuarter)} 0 ${fmt(xMid)} ${fmt(h * 0.125)} ${fmt(xMid)} ${fmt(yQuarter)} C ${fmt(xMid)} ${fmt(h * 0.375)} ${fmt(w * 0.625)} ${fmt(yMid)} ${fmt(xThreeQuarter)} ${fmt(yMid)} C ${fmt(w * 0.875)} ${fmt(yMid)} ${fmt(w)} ${fmt(yThreeQuarter)} ${fmt(w)} ${fmt(h)}`;
    case 'curvedConnector5':
      return `M 0 0 C ${fmt(xQuarter * 0.5)} 0 ${fmt(xQuarter)} ${fmt(yQuarter * 0.5)} ${fmt(xQuarter)} ${fmt(yQuarter)} C ${fmt(xQuarter)} ${fmt(yMid * 0.75)} ${fmt(xQuarter)} ${fmt(yMid)} ${fmt(xMid)} ${fmt(yMid)} C ${fmt(xThreeQuarter)} ${fmt(yMid)} ${fmt(xThreeQuarter)} ${fmt(yMid * 1.25)} ${fmt(xThreeQuarter)} ${fmt(yThreeQuarter)} C ${fmt(xThreeQuarter)} ${fmt(h * 0.875)} ${fmt(xThreeQuarter + xQuarter * 0.5)} ${fmt(h)} ${fmt(w)} ${fmt(h)}`;
    default:
      return null;
  }
}

export function getConnectorStrokePadding(strokeColor, strokeWidth) {
  return strokeColor !== null && strokeWidth > 0 ? strokeWidth / 2 : 0;
}

export function createConnectorPresetSvg({ kind, strokeColor, strokeWidth, width, height }) {
  const pathD = getConnectorPresetPath(kind, width, height);
  if (!pathD) return null;

  const stroke = strokeColor === null ? 'none' : strokeColor || '#000000';
  const resolvedStrokeWidth = strokeWidth ?? 1;
  const formattedWidth = formatSvgNumber(width);
  const formattedHeight = formatSvgNumber(height);
  const strokePadding = getConnectorStrokePadding(strokeColor, resolvedStrokeWidth);
  const viewBoxX = formatSvgNumber(-strokePadding);
  const viewBoxY = formatSvgNumber(-strokePadding);
  const viewBoxWidth = formatSvgNumber(width + strokePadding * 2);
  const viewBoxHeight = formatSvgNumber(height + strokePadding * 2);

  return `<svg xmlns="${SVG_NS}" width="${formattedWidth}" height="${formattedHeight}" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="none">
  <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${formatSvgNumber(resolvedStrokeWidth)}" vector-effect="non-scaling-stroke" />
</svg>`;
}

export function applyNonScalingStrokeToConnectorTarget(target) {
  const stroke = target.getAttribute('stroke');
  if (!stroke || stroke === 'none') return;
  target.setAttribute('vector-effect', 'non-scaling-stroke');
}

export function applyNonScalingStrokeToConnector(svgElement) {
  svgElement.querySelectorAll(CONNECTOR_SVG_ELEMENTS).forEach(applyNonScalingStrokeToConnectorTarget);
}

export function createLineEndShape(doc, type, strokeColor, isStart) {
  const normalized = type.toLowerCase();
  if (normalized === 'diamond') {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 5 L 5 0 L 10 5 L 5 10 Z');
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    return path;
  }
  if (normalized === 'oval') {
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '5');
    circle.setAttribute('cy', '5');
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', strokeColor);
    circle.setAttribute('stroke', 'none');
    return circle;
  }

  const path = doc.createElementNS(SVG_NS, 'path');
  const d = isStart ? 'M 10 0 L 0 5 L 10 10 Z' : 'M 0 0 L 10 5 L 0 10 Z';
  path.setAttribute('d', d);
  path.setAttribute('fill', strokeColor);
  path.setAttribute('stroke', 'none');
  return path;
}

export function createLineEndMarker(doc, defs, id, lineEnd, strokeColor, _strokeWidth, isStart) {
  if (defs.querySelector(`#${id}`)) return;

  const marker = doc.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('orient', 'auto');

  const sizeScale = (value) => {
    if (value === 'sm') return 0.75;
    if (value === 'lg') return 1.25;
    return 1;
  };
  const markerWidth = 8 * sizeScale(lineEnd.length);
  const markerHeight = 8 * sizeScale(lineEnd.width);
  marker.setAttribute('markerUnits', 'strokeWidth');
  marker.setAttribute('markerWidth', markerWidth.toString());
  marker.setAttribute('markerHeight', markerHeight.toString());
  marker.setAttribute('refX', isStart ? '0' : '10');
  marker.setAttribute('refY', '5');

  const shape = createLineEndShape(doc, lineEnd.type || 'triangle', strokeColor, isStart);
  marker.appendChild(shape);
  defs.appendChild(marker);
}
