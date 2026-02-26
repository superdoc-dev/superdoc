import type { CustomGeometry } from '@superdoc/contracts';

/**
 * Minimal interface for the block properties needed by createCustomGeometrySvg.
 * Avoids coupling to renderer-internal types (VectorShapeDrawingWithEffects).
 */
export interface CustomGeometrySvgInput {
  customGeometry?: CustomGeometry;
  geometry: { width: number; height: number };
  fillColor?: string | null | unknown;
  strokeColor?: string | null | unknown;
  strokeWidth?: number;
}

/**
 * Generates SVG markup from custom geometry path data (a:custGeom).
 * Converts stored OOXML path commands (already converted to SVG d-strings) into a full SVG element.
 *
 * @param block - Block with custom geometry data and shape styling
 * @param widthOverride - Override display width (pixels)
 * @param heightOverride - Override display height (pixels)
 * @returns SVG markup string, or null if no custom geometry
 */
export const createCustomGeometrySvg = (
  block: CustomGeometrySvgInput,
  widthOverride?: number,
  heightOverride?: number,
): string | null => {
  const geom = block.customGeometry;
  if (!geom || !geom.paths.length) return null;

  const width = widthOverride ?? block.geometry.width;
  const height = heightOverride ?? block.geometry.height;

  // Resolve fill color — null means "no fill" (a:noFill), use 'none'
  let fillColor: string;
  if (block.fillColor === null) {
    fillColor = 'none';
  } else if (typeof block.fillColor === 'string') {
    fillColor = block.fillColor;
  } else {
    fillColor = 'none';
  }

  const strokeColor =
    block.strokeColor === null ? 'none' : typeof block.strokeColor === 'string' ? block.strokeColor : 'none';
  const strokeWidth = block.strokeWidth ?? 0;

  // Build SVG paths — scale the path coordinate space to the actual display dimensions via viewBox
  const pathElements = geom.paths
    .map((p) => {
      const pathFill = p.fill === 'none' ? 'none' : fillColor;
      // Per-path stroke: a:path stroke="0" suppresses the outline for that path
      const pathStroke = p.stroke === false ? 'none' : strokeColor;
      const pathStrokeWidth = p.stroke === false ? 0 : strokeWidth;
      // Sanitize d attribute — only allow SVG path commands and numbers
      const safeD = p.d.replace(/[^MmLlHhVvCcSsQqTtAaZz0-9.,\s\-+eE]/g, '');
      return `<path d="${safeD}" fill="${pathFill}" stroke="${pathStroke}" stroke-width="${pathStrokeWidth}" />`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${geom.width} ${geom.height}" preserveAspectRatio="none">${pathElements}</svg>`;
};
