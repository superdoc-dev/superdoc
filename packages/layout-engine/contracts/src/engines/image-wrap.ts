/**
 * @superdoc/engines-image-wrap contract
 *
 * Computes text wrapping exclusions for anchored images.
 * Handles both rectangular (Square/TopAndBottom) and polygon-based (Tight/Through) wrapping.
 */

export interface WrapStyle {
  type: 'None' | 'Square' | 'Tight' | 'Through' | 'TopAndBottom';
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  distTop?: number; // pt
  distBottom?: number; // pt
  distLeft?: number; // pt
  distRight?: number; // pt
  polygon?: number[][]; // OOXML coordinates relative to image bounds ([x, y] pairs)
}

export interface Rect {
  x: number; // pt
  y: number; // pt
  width: number; // pt
  height: number; // pt
}

/**
 * Scale an OOXML wrap polygon to absolute page coordinates.
 *
 * OOXML polygons are expressed in EMUs relative to the image's native size.
 * This function scales them to match the rendered image dimensions and position.
 *
 * @param ooxml - Array of [x, y] coordinate pairs from OOXML (in EMUs, 0-based)
 * @param imageRect - Rendered image rectangle in pt
 * @returns Scaled polygon in absolute page coordinates (pt)
 */
export function scaleWrapPolygon(ooxml: number[][], imageRect: Rect): number[][] {
  if (!ooxml || ooxml.length === 0) {
    return [];
  }

  // Find bounding box of OOXML polygon to compute scale factors
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of ooxml) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const ooxmlWidth = maxX - minX;
  const ooxmlHeight = maxY - minY;

  // Avoid division by zero
  if (ooxmlWidth === 0 || ooxmlHeight === 0) {
    return [];
  }

  // Scale factors to map OOXML coords to image rect
  const scaleX = imageRect.width / ooxmlWidth;
  const scaleY = imageRect.height / ooxmlHeight;

  // Transform each point
  return ooxml.map(([x, y]) => [imageRect.x + (x - minX) * scaleX, imageRect.y + (y - minY) * scaleY]);
}

/**
 * Compute horizontal exclusion range for a line intersecting a wrapped image.
 *
 * For rectangular wrapping (Square/TopAndBottom):
 * - Returns the image bounds + padding distances
 *
 * For polygon wrapping (Tight/Through):
 * - Samples the polygon at the given Y coordinate
 * - Returns the horizontal range occupied by the polygon at that height
 *
 * @param image - Image rectangle and wrap style
 * @param lineY - Top Y coordinate of the text line (pt)
 * @param lineHeight - Height of the text line (pt)
 * @returns Exclusion range (left/right in pt), or null if no intersection
 */
export function computeWrapExclusion(
  image: { rect: Rect; wrap: WrapStyle },
  lineY: number,
  lineHeight: number,
): { left: number; right: number } | null {
  const { rect, wrap } = image;

  // Expand image bounds by wrap distances
  const top = rect.y - (wrap.distTop ?? 0);
  const bottom = rect.y + rect.height + (wrap.distBottom ?? 0);
  const left = rect.x - (wrap.distLeft ?? 0);
  const right = rect.x + rect.width + (wrap.distRight ?? 0);

  // Check if line intersects image vertically
  const lineBottom = lineY + lineHeight;
  if (lineBottom <= top || lineY >= bottom) {
    return null; // No vertical intersection
  }

  // Handle wrap type
  switch (wrap.type) {
    case 'None':
      return null;

    case 'TopAndBottom':
      // Text flows above/below but not beside
      return null;

    case 'Square':
      // Rectangular exclusion
      return { left, right };

    case 'Tight':
    case 'Through': {
      // Polygon-based exclusion
      if (!wrap.polygon || wrap.polygon.length === 0) {
        // Fall back to rectangular if no polygon
        return { left, right };
      }

      // Sample polygon at line's vertical position
      const polygon = wrap.polygon;
      const midY = lineY + lineHeight / 2;

      // Find horizontal extent of polygon at this Y
      let polyLeft = Infinity;
      let polyRight = -Infinity;

      for (let i = 0; i < polygon.length; i++) {
        const [x1, y1] = polygon[i];
        const [x2, y2] = polygon[(i + 1) % polygon.length];

        // Check if edge intersects the line's Y range
        const edgeMinY = Math.min(y1, y2);
        const edgeMaxY = Math.max(y1, y2);

        if (midY >= edgeMinY && midY <= edgeMaxY) {
          // Compute X coordinate at midY via linear interpolation
          const t = (midY - y1) / (y2 - y1);
          const x = x1 + t * (x2 - x1);

          polyLeft = Math.min(polyLeft, x);
          polyRight = Math.max(polyRight, x);
        }
      }

      if (polyLeft === Infinity || polyRight === -Infinity) {
        // Polygon doesn't intersect at this Y
        return null;
      }

      // Add wrap distances
      return {
        left: polyLeft - (wrap.distLeft ?? 0),
        right: polyRight + (wrap.distRight ?? 0),
      };
    }

    default:
      return null;
  }
}
