/**
 * Unit helpers used by the editor-neutral normalize layer.
 *
 * Kept tiny and pure so v2 rendering can map twips/half-points/eighth-points
 * into the layout-engine pixel domain without depending on pm-adapter or v1
 * editor runtime.
 */

export const PX_PER_TWIP = 96 / 1440;
export const PX_PER_POINT = 96 / 72;
export const PX_PER_EIGHTH_POINT = PX_PER_POINT / 8;

export function twipsToPx(value: number): number {
  return value * PX_PER_TWIP;
}

export function halfPointsToPx(value: number): number {
  return (value / 2) * PX_PER_POINT;
}

export function eighthPointsToPx(value: number): number {
  return value * PX_PER_EIGHTH_POINT;
}
