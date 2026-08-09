/**
 * Ruler Core - Framework-agnostic ruler logic
 *
 * This module provides the core functionality for rendering rulers in the document editor.
 * It can be used by both the DOM painter (for per-page rulers) and Vue components
 * (for interactive overlay rulers).
 *
 * @module ruler-core
 */

/**
 * Page size in inches
 */
export type PageSize = {
  width: number;
  height: number;
};

/**
 * Page margins in inches
 */
export type PageMargins = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * A single tick mark on the ruler
 */
export type RulerTick = {
  /** CSS class name suffix (e.g., 'main', 'half', 'eighth') */
  size: 'main' | 'half' | 'eighth';
  /** Height as CSS percentage string (e.g., '40%') */
  height: string;
  /** Optional whole-unit number label (inch or cm, per `unit`; only on main ticks) */
  label?: number;
  /** X position in pixels from left edge */
  x: number;
};

/**
 * Measurement unit the ruler numbers/ticks reflect. `in` = inches (the default,
 * unchanged behaviour), `cm` = centimetres (Word's alternate measurement unit).
 */
export type RulerUnit = 'in' | 'cm';

/**
 * Complete ruler definition with ticks and margin positions
 */
export type RulerDefinition = {
  /** Width of the ruler in pixels */
  widthPx: number;
  /** Height of the ruler in pixels */
  heightPx: number;
  /** Array of tick marks */
  ticks: RulerTick[];
  /** Left margin handle position in pixels */
  leftMarginPx: number;
  /** Right margin handle position in pixels */
  rightMarginPx: number;
  /** Page width in inches (for calculations) */
  pageWidthInches: number;
};

/**
 * Configuration for ruler generation
 */
export type RulerConfig = {
  /** Page size in inches */
  pageSize: PageSize;
  /** Page margins in inches */
  pageMargins: PageMargins;
  /** Pixels per inch (default: 96) */
  ppi?: number;
  /** Ruler height in pixels (default: 25) */
  heightPx?: number;
  /** Measurement unit for tick numbering/spacing (default: 'in'). */
  unit?: RulerUnit;
};

/** Default pixels per inch */
const DEFAULT_PPI = 96;

/** Default ruler height in pixels */
const DEFAULT_RULER_HEIGHT = 25;

/** Centimetres per inch (exact). */
const CM_PER_INCH = 2.54;

/**
 * Build the tick marks for a page of the given inch width.
 *
 * Inches (default): 8 subdivisions per inch — a labelled main tick, three eighth
 * ticks, a half tick, three eighth ticks — matching the historical ruler exactly.
 * Spacing is ppi-aware (`ppi / 8` px per eighth), so 1 inch = `ppi` px; at the
 * default 96 ppi this is the historical 12px eighth spacing.
 *
 * Centimetres: a labelled main tick every whole cm with a half tick at each
 * 0.5 cm, matching Word's centimetre ruler. Positions are in unscaled page
 * pixels (the caller scales by zoom), so 1 cm = `ppi / 2.54` px.
 */
function buildRulerTicks(pageWidthInInches: number, unit: RulerUnit, ppi: number): RulerTick[] {
  const ticks: RulerTick[] = [];

  if (unit === 'cm') {
    const cmPx = ppi / CM_PER_INCH;
    const totalCm = pageWidthInInches * CM_PER_INCH;
    for (let cm = 0; cm < totalCm; cm++) {
      const x = cm * cmPx;
      ticks.push({ size: 'main', height: '20%', label: cm, x });
      // Half-centimetre tick, unless it would fall past the page edge.
      if (totalCm - cm > 0.5) {
        ticks.push({ size: 'half', height: '40%', x: x + cmPx / 2 });
      }
    }
    return ticks;
  }

  // Eighth-inch spacing derived from the caller's ppi so inch mode stays
  // ppi-aware like cm mode. 8 subdivisions per inch → ppi/8 px each
  // (12px at the default 96 ppi, matching the historical fixed spacing).
  const eighthPx = ppi / 8;

  let currentX = 0;
  for (let inch = 0; inch < pageWidthInInches; inch++) {
    const remaining = pageWidthInInches - inch;

    // Main tick (inch marker with label)
    ticks.push({ size: 'main', height: '20%', label: inch, x: currentX });
    currentX += eighthPx;

    // First set of eighth ticks (3 ticks)
    for (let i = 0; i < 3; i++) {
      ticks.push({ size: 'eighth', height: '10%', x: currentX });
      currentX += eighthPx;
    }

    // Half tick
    ticks.push({ size: 'half', height: '40%', x: currentX });
    currentX += eighthPx;

    // Stop if we're at the last half inch
    if (remaining <= 0.5) break;

    // Second set of eighth ticks (3 ticks)
    for (let i = 0; i < 3; i++) {
      ticks.push({ size: 'eighth', height: '10%', x: currentX });
      currentX += eighthPx;
    }
  }

  return ticks;
}

/**
 * Generate a complete ruler definition based on page configuration.
 *
 * This function creates an array of tick marks representing inch markers,
 * half-inch markers, and eighth-inch markers, along with margin handle positions.
 *
 * @param config - Ruler configuration including page size and margins
 * @returns Complete ruler definition with ticks and margin positions
 * @throws {Error} If PPI is not positive, page dimensions are not positive, or margins exceed page dimensions
 *
 * @example
 * ```typescript
 * const ruler = generateRulerDefinition({
 *   pageSize: { width: 8.5, height: 11 },
 *   pageMargins: { left: 1, right: 1, top: 1, bottom: 1 }
 * });
 * console.log(ruler.ticks.length); // Number of tick marks
 * console.log(ruler.leftMarginPx); // 96 (1 inch * 96 PPI)
 * ```
 */
export function generateRulerDefinition(config: RulerConfig): RulerDefinition {
  const ppi = config.ppi ?? DEFAULT_PPI;
  const heightPx = config.heightPx ?? DEFAULT_RULER_HEIGHT;
  const { pageSize, pageMargins } = config;

  // Validate inputs
  if (!Number.isFinite(ppi) || ppi <= 0) {
    throw new Error(`Invalid PPI: ${ppi}. Must be a positive finite number.`);
  }
  if (!Number.isFinite(pageSize.width) || pageSize.width <= 0) {
    throw new Error(`Invalid page width: ${pageSize.width}. Must be a positive finite number.`);
  }
  if (!Number.isFinite(pageSize.height) || pageSize.height <= 0) {
    throw new Error(`Invalid page height: ${pageSize.height}. Must be a positive finite number.`);
  }
  if (!Number.isFinite(pageMargins.left) || pageMargins.left < 0) {
    throw new Error(`Invalid left margin: ${pageMargins.left}. Must be a non-negative finite number.`);
  }
  if (!Number.isFinite(pageMargins.right) || pageMargins.right < 0) {
    throw new Error(`Invalid right margin: ${pageMargins.right}. Must be a non-negative finite number.`);
  }
  if (pageMargins.left + pageMargins.right >= pageSize.width) {
    throw new Error(
      `Invalid margins: left (${pageMargins.left}) + right (${pageMargins.right}) must be less than page width (${pageSize.width}).`,
    );
  }

  const widthPx = pageSize.width * ppi;
  const ticks = buildRulerTicks(pageSize.width, config.unit ?? 'in', ppi);

  return {
    widthPx,
    heightPx,
    ticks,
    leftMarginPx: pageMargins.left * ppi,
    rightMarginPx: widthPx - pageMargins.right * ppi,
    pageWidthInches: pageSize.width,
  };
}

/**
 * Convert a pixel position to inches.
 *
 * @param px - Position in pixels
 * @param ppi - Pixels per inch (default: 96)
 * @returns Position in inches
 */
export function pxToInches(px: number, ppi: number = DEFAULT_PPI): number {
  return px / ppi;
}

/**
 * Convert inches to pixels.
 *
 * @param inches - Position in inches
 * @param ppi - Pixels per inch (default: 96)
 * @returns Position in pixels
 */
export function inchesToPx(inches: number, ppi: number = DEFAULT_PPI): number {
  return inches * ppi;
}

/**
 * Calculate new margin value from handle position.
 *
 * @param handleX - Handle X position in pixels
 * @param side - Which margin side ('left' or 'right')
 * @param pageWidthPx - Total page width in pixels
 * @param ppi - Pixels per inch (default: 96)
 * @returns New margin value in inches
 */
export function calculateMarginFromHandle(
  handleX: number,
  side: 'left' | 'right',
  pageWidthPx: number,
  ppi: number = DEFAULT_PPI,
): number {
  if (side === 'left') {
    return handleX / ppi;
  } else {
    return (pageWidthPx - handleX) / ppi;
  }
}

/**
 * Clamp a handle position within valid bounds.
 *
 * @param handleX - Proposed handle X position in pixels
 * @param side - Which margin side ('left' or 'right')
 * @param otherHandleX - Position of the other handle in pixels
 * @param pageWidthPx - Total page width in pixels
 * @param minContentWidthPx - Minimum content width in pixels (default: 200)
 * @returns Clamped handle position in pixels
 * @throws {Error} If any input is not a finite number
 */
export function clampHandlePosition(
  handleX: number,
  side: 'left' | 'right',
  otherHandleX: number,
  pageWidthPx: number,
  minContentWidthPx: number = 200,
): number {
  // Validate inputs
  if (!Number.isFinite(handleX)) {
    throw new Error(`Invalid handleX: ${handleX}. Must be a finite number.`);
  }
  if (!Number.isFinite(otherHandleX)) {
    throw new Error(`Invalid otherHandleX: ${otherHandleX}. Must be a finite number.`);
  }
  if (!Number.isFinite(pageWidthPx)) {
    throw new Error(`Invalid pageWidthPx: ${pageWidthPx}. Must be a finite number.`);
  }
  if (!Number.isFinite(minContentWidthPx)) {
    throw new Error(`Invalid minContentWidthPx: ${minContentWidthPx}. Must be a finite number.`);
  }

  if (side === 'left') {
    // Left handle: must be >= 0 and leave room for min content width
    const min = 0;
    const max = otherHandleX - minContentWidthPx;
    return Math.max(min, Math.min(max, handleX));
  } else {
    // Right handle: must be <= page width and leave room for min content width
    const min = otherHandleX + minContentWidthPx;
    const max = pageWidthPx;
    return Math.max(min, Math.min(max, handleX));
  }
}

/**
 * Ruler handle state for drag interactions
 */
export type RulerHandleState = {
  side: 'left' | 'right';
  x: number;
  isDragging: boolean;
  initialX: number;
};

/**
 * Create initial handle states from a ruler definition.
 *
 * @param definition - Ruler definition with margin positions
 * @returns Object with left and right handle states
 */
export function createHandleStates(definition: RulerDefinition): {
  left: RulerHandleState;
  right: RulerHandleState;
} {
  return {
    left: {
      side: 'left',
      x: definition.leftMarginPx,
      isDragging: false,
      initialX: definition.leftMarginPx,
    },
    right: {
      side: 'right',
      x: definition.rightMarginPx,
      isDragging: false,
      initialX: definition.rightMarginPx,
    },
  };
}

/**
 * Configuration for ruler generation using pixel values directly.
 * Useful when working with the layout engine which uses pixels internally.
 */
export type RulerConfigPx = {
  /** Page width in pixels */
  pageWidthPx: number;
  /** Page height in pixels */
  pageHeightPx: number;
  /** Left margin in pixels */
  leftMarginPx: number;
  /** Right margin in pixels */
  rightMarginPx: number;
  /** Pixels per inch (default: 96) - used for tick spacing */
  ppi?: number;
  /** Ruler height in pixels (default: 25) */
  heightPx?: number;
  /** Measurement unit for tick numbering/spacing (default: 'in'). */
  unit?: RulerUnit;
};

/**
 * Generate a ruler definition from pixel values.
 *
 * This is useful when integrating with the layout engine, which works in pixels.
 * The tick marks are still generated based on inch divisions for visual consistency.
 *
 * @param config - Ruler configuration with pixel values
 * @returns Complete ruler definition
 * @throws {Error} If PPI is not positive, page dimensions are not positive, or margins exceed page dimensions
 *
 * @example
 * ```typescript
 * // In DOM painter with pixel values from layout
 * const ruler = generateRulerDefinitionFromPx({
 *   pageWidthPx: 816,   // 8.5 inches * 96
 *   pageHeightPx: 1056, // 11 inches * 96
 *   leftMarginPx: 96,   // 1 inch
 *   rightMarginPx: 96,  // 1 inch
 * });
 * ```
 */
export function generateRulerDefinitionFromPx(config: RulerConfigPx): RulerDefinition {
  const ppi = config.ppi ?? DEFAULT_PPI;
  const heightPx = config.heightPx ?? DEFAULT_RULER_HEIGHT;
  const { pageWidthPx, leftMarginPx, rightMarginPx } = config;

  // Validate inputs
  if (!Number.isFinite(ppi) || ppi <= 0) {
    throw new Error(`Invalid PPI: ${ppi}. Must be a positive finite number.`);
  }
  if (!Number.isFinite(pageWidthPx) || pageWidthPx <= 0) {
    throw new Error(`Invalid page width: ${pageWidthPx}px. Must be a positive finite number.`);
  }
  if (!Number.isFinite(config.pageHeightPx) || config.pageHeightPx <= 0) {
    throw new Error(`Invalid page height: ${config.pageHeightPx}px. Must be a positive finite number.`);
  }
  if (!Number.isFinite(leftMarginPx) || leftMarginPx < 0) {
    throw new Error(`Invalid left margin: ${leftMarginPx}px. Must be a non-negative finite number.`);
  }
  if (!Number.isFinite(rightMarginPx) || rightMarginPx < 0) {
    throw new Error(`Invalid right margin: ${rightMarginPx}px. Must be a non-negative finite number.`);
  }
  if (leftMarginPx + rightMarginPx >= pageWidthPx) {
    throw new Error(
      `Invalid margins: left (${leftMarginPx}px) + right (${rightMarginPx}px) must be less than page width (${pageWidthPx}px).`,
    );
  }

  // Calculate page width in inches for tick generation
  const pageWidthInches = pageWidthPx / ppi;
  const ticks = buildRulerTicks(pageWidthInches, config.unit ?? 'in', ppi);

  return {
    widthPx: pageWidthPx,
    heightPx,
    ticks,
    leftMarginPx,
    rightMarginPx: pageWidthPx - rightMarginPx,
    pageWidthInches,
  };
}
