export type NumericInput = number | string | null | undefined;

export const EMUS_PER_INCH = 914400;
export const PX_PER_INCH = 96;
export const PX_PER_EMU = PX_PER_INCH / EMUS_PER_INCH;
export const EMUS_PER_PX = EMUS_PER_INCH / PX_PER_INCH;

export type UnitConversionOptions = {
  /**
   * Number of decimal places to round to.
   */
  precision?: number;
  /**
   * Value returned when the input is null/undefined/NaN.
   * Defaults to 0.
   */
  fallback?: number;
};

export function emuToPx(value: NumericInput, options?: UnitConversionOptions): number {
  const fallback = options?.fallback ?? 0;
  const numeric = normalizeNumericInput(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const px = numeric * PX_PER_EMU;
  return roundWithPrecision(px, options?.precision, fallback);
}

export function pxToEmu(value: NumericInput, options?: UnitConversionOptions): number {
  const fallback = options?.fallback ?? 0;
  const numeric = normalizeNumericInput(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const emu = numeric * EMUS_PER_PX;
  return roundWithPrecision(emu, options?.precision, fallback);
}

export type RotatedBoundsInput = {
  width: number;
  height: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
};

export type RotatedBounds = {
  width: number;
  height: number;
};

/**
 * Computes the axis-aligned bounding box for a rectangle after applying rotation/flips.
 * Rotation is assumed to happen around the rectangle's center.
 */
export function calculateRotatedBounds(input: RotatedBoundsInput): RotatedBounds {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const theta = degToRad(input.rotation ?? 0);

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const rotatedWidth = Math.abs(width * cos) + Math.abs(height * sin);
  const rotatedHeight = Math.abs(width * sin) + Math.abs(height * cos);

  return {
    width: rotatedWidth,
    height: rotatedHeight,
  };
}

export type Transform2D = {
  translateX?: number;
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
};

export type Matrix2D = [number, number, number, number, number, number];

export type Point = { x: number; y: number };

export const identityMatrix = (): Matrix2D => [1, 0, 0, 1, 0, 0];

/**
 * Converts a lightweight transform descriptor into an affine matrix.
 * Rotation uses degrees and defaults to 0. Flips are translated into scale -1.
 */
export function toMatrix(transform: Transform2D): Matrix2D {
  const rotation = normalizeRotation(transform.rotation ?? 0);
  const theta = degToRad(rotation);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const scaleX = (transform.flipH ? -1 : 1) * (Number.isFinite(transform.scaleX) ? (transform.scaleX as number) : 1);
  const scaleY = (transform.flipV ? -1 : 1) * (Number.isFinite(transform.scaleY) ? (transform.scaleY as number) : 1);

  const translateX = Number.isFinite(transform.translateX) ? (transform.translateX as number) : 0;
  const translateY = Number.isFinite(transform.translateY) ? (transform.translateY as number) : 0;

  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, translateX, translateY];
}

/**
 * Multiplies two affine matrices (a ∘ b). The result applies `b` first, then `a`.
 */
export function multiplyMatrices(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/**
 * Composes multiple transforms so they can be applied to points later on.
 * Transforms are applied in input order (first entry applied first).
 */
export function composeTransforms(transforms: Transform2D[]): Matrix2D {
  return transforms.reduce<Matrix2D>((matrix, transform) => {
    const next = toMatrix(transform);
    return multiplyMatrices(next, matrix);
  }, identityMatrix());
}

export function applyMatrix(point: Point, matrix: Matrix2D): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

export function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) {
    return 0;
  }
  let normalized = rotation % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

function normalizeNumericInput(value: NumericInput): number {
  if (value == null) return Number.NaN;
  if (typeof value === 'string') {
    const numeric = Number(value);
    return numeric;
  }
  return value;
}

function roundWithPrecision(value: number, precision?: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (typeof precision === 'number' && precision >= 0) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
  return value;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
