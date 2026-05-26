import type {
  ChartDrawing,
  CustomGeometryData,
  DrawingBlock,
  DrawingGeometry,
  GradientFill,
  PositionedDrawingGeometry,
  ShapeGroupChild,
  ShapeGroupDrawing,
  ShapeTextContent,
  SolidFillWithAlpha,
  VectorShapeDrawing,
  VectorShapeStyle,
} from '@superdoc/contracts';
import { getPresetShapeSvg } from '@superdoc/preset-geometry';
import { createChartElement as renderChartToElement } from '../chart-renderer.js';
import { createDrawingImageElement, createShapeGroupImageElement } from '../images/drawing-image.js';
import type { BuildImageHyperlinkAnchor } from '../images/types.js';
import { applyAlphaToSVG, applyGradientToSVG } from '../svg-utils.js';
import type { FragmentRenderContext } from '../fragment-context.js';
import { hasShapeTextContent, renderTextboxContent } from '../textbox/renderTextboxContent.js';
import { createDrawingPlaceholder } from './placeholder.js';

type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

type LineEnds = {
  head?: LineEnd;
  tail?: LineEnd;
};

type EffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type VectorShapeDrawingWithEffects = VectorShapeDrawing & {
  lineEnds?: LineEnds;
  effectExtent?: EffectExtent;
};

export type RenderDrawingContentParams = {
  doc: Document;
  block: DrawingBlock;
  geometry?: DrawingGeometry;
  context?: FragmentRenderContext;
  clipContainer?: HTMLElement;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
};

export const renderDrawingContent = ({
  doc,
  block,
  geometry,
  context,
  clipContainer,
  buildImageHyperlinkAnchor,
}: RenderDrawingContentParams): HTMLElement => {
  return renderDrawingBlock({ doc, buildImageHyperlinkAnchor }, block, geometry, context, clipContainer);
};

type DrawingRenderContext = {
  doc: Document;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
};

const renderDrawingBlock = (
  renderer: DrawingRenderContext,
  block: DrawingBlock,
  geometry?: DrawingGeometry,
  context?: FragmentRenderContext,
  clipContainer?: HTMLElement,
): HTMLElement => {
  if (block.drawingKind === 'image') {
    if (!block.src) {
      return createDrawingPlaceholder(renderer.doc);
    }
    return createDrawingImageElement(renderer.doc, block, renderer.buildImageHyperlinkAnchor, clipContainer);
  }
  if (block.drawingKind === 'vectorShape') {
    return createVectorShapeElement(renderer, block, geometry ?? block.geometry, false, context);
  }
  if (block.drawingKind === 'shapeGroup') {
    return createShapeGroupElement(renderer, block, context);
  }
  if (block.drawingKind === 'chart') {
    return createChartElement(renderer, block);
  }
  return createDrawingPlaceholder(renderer.doc);
};

const createVectorShapeElement = (
  renderer: DrawingRenderContext,
  block: VectorShapeDrawingWithEffects,
  geometry?: DrawingGeometry,
  applyTransforms = false,
  context?: FragmentRenderContext,
): HTMLElement => {
  const container = renderer.doc.createElement('div');
  container.classList.add('superdoc-vector-shape');
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  const { offsetX, offsetY, innerWidth, innerHeight } = getEffectExtentMetrics(block, geometry);
  const contentContainer = renderer.doc.createElement('div');
  contentContainer.style.position = 'absolute';
  contentContainer.style.left = `${offsetX}px`;
  contentContainer.style.top = `${offsetY}px`;
  contentContainer.style.width = `${innerWidth}px`;
  contentContainer.style.height = `${innerHeight}px`;
  if (applyTransforms && geometry) {
    applyVectorShapeTransforms(contentContainer, geometry);
  }

  const customGeomSvg = block.customGeometry ? tryCreateCustomGeometrySvg(block, innerWidth, innerHeight) : null;
  const svgMarkup = !customGeomSvg && block.shapeKind ? tryCreatePresetSvg(block, innerWidth, innerHeight) : null;
  const resolvedSvgMarkup = customGeomSvg || svgMarkup;

  if (resolvedSvgMarkup) {
    const svgElement = parseSafeSvg(renderer, resolvedSvgMarkup);
    if (svgElement) {
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      svgElement.style.display = 'block';

      if (block.fillColor && typeof block.fillColor === 'object') {
        if ('type' in block.fillColor && block.fillColor.type === 'gradient') {
          applyGradientToSVG(svgElement, block.fillColor as GradientFill);
        } else if ('type' in block.fillColor && block.fillColor.type === 'solidWithAlpha') {
          applyAlphaToSVG(svgElement, block.fillColor as SolidFillWithAlpha);
        }
      }

      applyLineEnds(renderer, svgElement, block);
      contentContainer.appendChild(svgElement);

      if (hasShapeTextContent(block.textContent)) {
        const textElement = createShapeTextElement(renderer, block, innerWidth, innerHeight, context);
        contentContainer.appendChild(textElement);
      }

      container.appendChild(contentContainer);
      return container;
    }
  }

  applyFallbackShapeStyle(contentContainer, block);

  if (hasShapeTextContent(block.textContent)) {
    const textElement = createShapeTextElement(renderer, block, innerWidth, innerHeight, context);
    contentContainer.appendChild(textElement);
  }

  container.appendChild(contentContainer);
  return container;
};

const applyFallbackShapeStyle = (container: HTMLElement, block: VectorShapeDrawing): void => {
  if (block.fillColor === null) {
    container.style.background = 'none';
  } else if (typeof block.fillColor === 'string') {
    container.style.background = block.fillColor;
  } else if (typeof block.fillColor === 'object' && 'type' in block.fillColor) {
    if (block.fillColor.type === 'solidWithAlpha') {
      const alpha = (block.fillColor as SolidFillWithAlpha).alpha;
      const color = (block.fillColor as SolidFillWithAlpha).color;
      container.style.background = color;
      container.style.opacity = alpha.toString();
    } else if (block.fillColor.type === 'gradient') {
      container.style.background = 'rgba(15, 23, 42, 0.1)';
    }
  } else {
    container.style.background = 'rgba(15, 23, 42, 0.1)';
  }

  if (block.strokeColor === null) {
    container.style.border = 'none';
  } else if (typeof block.strokeColor === 'string') {
    const strokeWidth = block.strokeWidth ?? 1;
    container.style.border = `${strokeWidth}px solid ${block.strokeColor}`;
  } else {
    container.style.border = '1px solid rgba(15, 23, 42, 0.3)';
  }
};

const createShapeTextElement = (
  renderer: DrawingRenderContext,
  block: VectorShapeDrawing,
  width: number,
  height: number,
  context?: FragmentRenderContext,
): Element => {
  const textContent = block.textContent;
  if (!hasShapeTextContent(textContent)) {
    return renderer.doc.createElement('div');
  }

  return renderTextboxContent({
    doc: renderer.doc,
    textContent,
    textAlign: block.textAlign ?? 'center',
    textVerticalAlign: block.textVerticalAlign,
    textInsets: block.textInsets,
    isWordArt: block.attrs?.isWordArt === true,
    width,
    height,
    context,
  });
};

const tryCreatePresetSvg = (
  block: VectorShapeDrawing,
  widthOverride?: number,
  heightOverride?: number,
): string | null => {
  try {
    let fillColor: string | undefined;
    if (block.fillColor === null) {
      fillColor = 'none';
    } else if (typeof block.fillColor === 'string') {
      fillColor = block.fillColor;
    }
    const strokeColor =
      block.strokeColor === null ? 'none' : typeof block.strokeColor === 'string' ? block.strokeColor : undefined;

    if (block.shapeKind === 'line' || block.shapeKind === 'straightConnector1') {
      const width = widthOverride ?? block.geometry.width;
      const height = heightOverride ?? block.geometry.height;
      const stroke = strokeColor ?? '#000000';
      const strokeWidth = block.strokeWidth ?? 1;

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="${stroke}" stroke-width="${strokeWidth}" />
</svg>`;
    }

    return getPresetShapeSvg({
      preset: block.shapeKind ?? '',
      styleOverrides: () => ({
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: block.strokeWidth ?? undefined,
      }),
      width: widthOverride ?? block.geometry.width,
      height: heightOverride ?? block.geometry.height,
    });
  } catch (error) {
    console.warn(`[DomPainter] Unable to render preset shape "${block.shapeKind}":`, error);
    return null;
  }
};

const tryCreateCustomGeometrySvg = (block: VectorShapeDrawing, width: number, height: number): string | null => {
  const custGeom = block.customGeometry;
  if (!custGeom?.paths?.length) return null;

  let fillColor: string;
  if (block.fillColor === null) {
    fillColor = 'none';
  } else if (typeof block.fillColor === 'string') {
    fillColor = block.fillColor;
  } else {
    fillColor = '#000000';
  }
  const strokeColor =
    block.strokeColor === null ? 'none' : typeof block.strokeColor === 'string' ? block.strokeColor : 'none';
  const strokeWidth = block.strokeColor === null ? 0 : (block.strokeWidth ?? 0);

  const firstPath = custGeom.paths[0];
  const viewW = firstPath.w || width;
  const viewH = firstPath.h || height;

  if (viewW === 0 || viewH === 0) return null;

  const needsEdgeStroke = fillColor !== 'none' && strokeColor === 'none';
  const edgeStroke = needsEdgeStroke
    ? ` stroke="${fillColor}" stroke-width="0.5" vector-effect="non-scaling-stroke"`
    : '';

  const pathElements = custGeom.paths
    .map((p) => {
      const pathW = p.w || viewW;
      const pathH = p.h || viewH;
      const needsTransform = pathW !== viewW || pathH !== viewH;
      const scaleX = viewW / pathW;
      const scaleY = viewH / pathH;
      const transform = needsTransform ? ` transform="scale(${scaleX}, ${scaleY})"` : '';
      const strokeAttr = strokeColor !== 'none' ? ` stroke="${strokeColor}" stroke-width="${strokeWidth}"` : edgeStroke;
      return `<path d="${p.d}" fill="${fillColor}" fill-rule="evenodd"${strokeAttr}${transform} />`;
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="none">
  ${pathElements}
</svg>`;
};

const parseSafeSvg = (renderer: DrawingRenderContext, markup: string): SVGElement | null => {
  const DOMParserCtor = renderer.doc.defaultView?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!DOMParserCtor) {
    return null;
  }
  const parser = new DOMParserCtor();
  const parsed = parser.parseFromString(markup, 'image/svg+xml');
  if (!parsed || parsed.getElementsByTagName('parsererror').length > 0) {
    return null;
  }
  const svgElement = parsed.documentElement as unknown as SVGElement | null;
  if (!svgElement) return null;
  stripUnsafeSvgContent(svgElement);
  const imported = renderer.doc.importNode(svgElement, true);
  return imported ? (imported as unknown as SVGElement) : null;
};

const stripUnsafeSvgContent = (element: Element): void => {
  element.querySelectorAll('script').forEach((script) => script.remove());
  const sanitize = (node: Element) => {
    Array.from(node.attributes).forEach((attr) => {
      if (attr.name.toLowerCase().startsWith('on')) {
        node.removeAttribute(attr.name);
      }
    });
    Array.from(node.children).forEach((child) => {
      sanitize(child as Element);
    });
  };
  sanitize(element);
};

const getEffectExtentMetrics = (
  block: VectorShapeDrawingWithEffects,
  geometry?: DrawingGeometry,
): {
  offsetX: number;
  offsetY: number;
  innerWidth: number;
  innerHeight: number;
} => {
  const left = block.effectExtent?.left ?? 0;
  const top = block.effectExtent?.top ?? 0;
  const right = block.effectExtent?.right ?? 0;
  const bottom = block.effectExtent?.bottom ?? 0;
  const sourceGeometry = geometry ?? block.geometry;
  const width = sourceGeometry.width ?? 0;
  const height = sourceGeometry.height ?? 0;
  const innerWidth = Math.max(0, width - left - right);
  const innerHeight = Math.max(0, height - top - bottom);
  return { offsetX: left, offsetY: top, innerWidth, innerHeight };
};

const applyLineEnds = (
  renderer: DrawingRenderContext,
  svgElement: SVGElement,
  block: VectorShapeDrawingWithEffects,
): void => {
  const lineEnds = block.lineEnds;
  if (!lineEnds) return;
  if (block.strokeColor === null) return;
  const strokeColor = typeof block.strokeColor === 'string' ? block.strokeColor : '#000000';
  const strokeWidth = block.strokeWidth ?? 1;
  if (strokeWidth <= 0) return;

  const target = findLineEndTarget(svgElement);
  if (!target) return;

  const defs = ensureSvgDefs(renderer, svgElement);
  const baseId = sanitizeSvgId(`sd-line-${block.id}`);

  if (lineEnds.tail) {
    const id = `${baseId}-tail`;
    appendLineEndMarker(renderer, defs, id, lineEnds.tail, strokeColor, true, block.effectExtent ?? undefined);
    target.setAttribute('marker-start', `url(#${id})`);
  }

  if (lineEnds.head) {
    const id = `${baseId}-head`;
    appendLineEndMarker(renderer, defs, id, lineEnds.head, strokeColor, false, block.effectExtent ?? undefined);
    target.setAttribute('marker-end', `url(#${id})`);
  }
};

const findLineEndTarget = (svgElement: SVGElement): SVGElement | null => {
  const line = svgElement.querySelector('line');
  if (line) return line as SVGElement;
  const path = svgElement.querySelector('path');
  if (path) return path as SVGElement;
  const polyline = svgElement.querySelector('polyline');
  return polyline as SVGElement | null;
};

const ensureSvgDefs = (renderer: DrawingRenderContext, svgElement: SVGElement): SVGDefsElement => {
  const existing = svgElement.querySelector('defs');
  if (existing) return existing as SVGDefsElement;
  const defs = renderer.doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svgElement.insertBefore(defs, svgElement.firstChild);
  return defs;
};

const appendLineEndMarker = (
  renderer: DrawingRenderContext,
  defs: SVGDefsElement,
  id: string,
  lineEnd: LineEnd,
  strokeColor: string,
  isStart: boolean,
  effectExtent?: EffectExtent,
): void => {
  if (defs.querySelector(`#${id}`)) return;

  const marker = renderer.doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('orient', 'auto');

  const sizeScale = (value?: string): number => {
    if (value === 'sm') return 0.75;
    if (value === 'lg') return 1.25;
    return 1;
  };
  const effectMax = effectExtent
    ? Math.max(effectExtent.left ?? 0, effectExtent.right ?? 0, effectExtent.top ?? 0, effectExtent.bottom ?? 0)
    : 0;
  const useEffectExtent = Number.isFinite(effectMax) && effectMax > 0;
  const markerWidth = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.length);
  const markerHeight = useEffectExtent ? effectMax * 2 : 4 * sizeScale(lineEnd.width);
  marker.setAttribute('markerUnits', useEffectExtent ? 'userSpaceOnUse' : 'strokeWidth');
  marker.setAttribute('markerWidth', markerWidth.toString());
  marker.setAttribute('markerHeight', markerHeight.toString());
  marker.setAttribute('refX', isStart ? '0' : '10');
  marker.setAttribute('refY', '5');

  const shape = createLineEndShape(renderer, lineEnd.type ?? 'triangle', strokeColor, isStart);
  marker.appendChild(shape);
  defs.appendChild(marker);
};

const createLineEndShape = (
  renderer: DrawingRenderContext,
  type: string,
  strokeColor: string,
  isStart: boolean,
): SVGElement => {
  const normalized = type.toLowerCase();
  if (normalized === 'diamond') {
    const path = renderer.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 5 L 5 0 L 10 5 L 5 10 Z');
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    return path;
  }
  if (normalized === 'oval') {
    const circle = renderer.doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '5');
    circle.setAttribute('cy', '5');
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', strokeColor);
    circle.setAttribute('stroke', 'none');
    return circle;
  }

  const path = renderer.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = isStart ? 'M 10 0 L 0 5 L 10 10 Z' : 'M 0 0 L 10 5 L 0 10 Z';
  path.setAttribute('d', d);
  path.setAttribute('fill', strokeColor);
  path.setAttribute('stroke', 'none');
  return path;
};

const sanitizeSvgId = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
};

const applyVectorShapeTransforms = (target: HTMLElement | SVGElement, geometry: DrawingGeometry): void => {
  const transforms: string[] = [];
  if (geometry.rotation) {
    transforms.push(`rotate(${geometry.rotation}deg)`);
  }
  if (geometry.flipH) {
    transforms.push('scaleX(-1)');
  }
  if (geometry.flipV) {
    transforms.push('scaleY(-1)');
  }
  if (transforms.length > 0) {
    target.style.transformOrigin = 'center';
    target.style.transform = transforms.join(' ');
  } else {
    target.style.removeProperty('transform');
    target.style.removeProperty('transform-origin');
  }
};

const createShapeGroupElement = (
  renderer: DrawingRenderContext,
  block: ShapeGroupDrawing,
  context?: FragmentRenderContext,
): HTMLElement => {
  const groupEl = renderer.doc.createElement('div');
  groupEl.classList.add('superdoc-shape-group');
  groupEl.style.position = 'relative';
  groupEl.style.width = '100%';
  groupEl.style.height = '100%';

  const groupTransform = block.groupTransform;
  let contentContainer: HTMLElement = groupEl;

  const visibleWidth = groupTransform?.width ?? block.geometry.width ?? 0;
  const visibleHeight = groupTransform?.height ?? block.geometry.height ?? 0;

  if (groupTransform) {
    const inner = renderer.doc.createElement('div');
    inner.style.position = 'absolute';
    inner.style.left = '0';
    inner.style.top = '0';
    inner.style.width = `${Math.max(1, visibleWidth)}px`;
    inner.style.height = `${Math.max(1, visibleHeight)}px`;
    groupEl.appendChild(inner);
    contentContainer = inner;
  }

  block.shapes.forEach((child) => {
    const childContent = createGroupChildContent(renderer, child, context);
    if (!childContent) return;
    const attrs = (child as ShapeGroupChild).attrs ?? {};
    const wrapper = renderer.doc.createElement('div');
    wrapper.classList.add('superdoc-shape-group__child');
    wrapper.style.position = 'absolute';

    wrapper.style.left = `${Number(attrs.x ?? 0)}px`;
    wrapper.style.top = `${Number(attrs.y ?? 0)}px`;

    const childW = typeof attrs.width === 'number' ? attrs.width : block.geometry.width;
    const childH = typeof attrs.height === 'number' ? attrs.height : block.geometry.height;
    wrapper.style.width = `${Math.max(1, childW)}px`;
    wrapper.style.height = `${Math.max(1, childH)}px`;

    wrapper.style.transformOrigin = 'center';
    const transforms: string[] = [];
    if (attrs.rotation) {
      transforms.push(`rotate(${attrs.rotation}deg)`);
    }
    if (attrs.flipH) {
      transforms.push('scaleX(-1)');
    }
    if (attrs.flipV) {
      transforms.push('scaleY(-1)');
    }
    if (transforms.length > 0) {
      wrapper.style.transform = transforms.join(' ');
    }
    childContent.style.width = '100%';
    childContent.style.height = '100%';
    wrapper.appendChild(childContent);
    contentContainer.appendChild(wrapper);
  });

  return groupEl;
};

const createGroupChildContent = (
  renderer: DrawingRenderContext,
  child: ShapeGroupChild,
  context?: FragmentRenderContext,
): HTMLElement | null => {
  if (child.shapeType === 'vectorShape' && 'fillColor' in child.attrs) {
    const attrs = child.attrs as PositionedDrawingGeometry &
      VectorShapeStyle & {
        kind?: string;
        customGeometry?: CustomGeometryData;
        shapeId?: string;
        shapeName?: string;
        textContent?: ShapeTextContent;
        textAlign?: string;
        lineEnds?: LineEnds;
      };
    const childGeometry = {
      width: attrs.width ?? 0,
      height: attrs.height ?? 0,
      rotation: attrs.rotation ?? 0,
      flipH: attrs.flipH ?? false,
      flipV: attrs.flipV ?? false,
    };
    const vectorChild: VectorShapeDrawingWithEffects = {
      drawingKind: 'vectorShape',
      kind: 'drawing',
      id: `${attrs.shapeId ?? child.shapeType}`,
      geometry: childGeometry,
      padding: undefined,
      margin: undefined,
      anchor: undefined,
      wrap: undefined,
      attrs: child.attrs,
      drawingContentId: undefined,
      drawingContent: undefined,
      shapeKind: attrs.kind,
      customGeometry: attrs.customGeometry,
      fillColor: attrs.fillColor,
      strokeColor: attrs.strokeColor,
      strokeWidth: attrs.strokeWidth,
      lineEnds: attrs.lineEnds,
      textContent: attrs.textContent,
      textAlign: attrs.textAlign,
      textVerticalAlign: attrs.textVerticalAlign,
      textInsets: attrs.textInsets,
    };
    return createVectorShapeElement(renderer, vectorChild, childGeometry, false, context);
  }
  if (child.shapeType === 'image' && 'src' in child.attrs) {
    return createShapeGroupImageElement(renderer.doc, child);
  }
  return createDrawingPlaceholder(renderer.doc);
};

const createChartElement = (renderer: DrawingRenderContext, block: ChartDrawing): HTMLElement => {
  return renderChartToElement(renderer.doc, block.chartData, block.geometry);
};
