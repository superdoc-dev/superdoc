export type OuterShadowPaintEffect = {
  blurRadius: number;
  distance: number;
  direction: number;
};

export type PaintEffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export const resolveOuterShadowOffset = (shadow: OuterShadowPaintEffect): { dx: number; dy: number } => {
  const radians = (shadow.direction * Math.PI) / 180;
  return {
    dx: shadow.distance * Math.cos(radians),
    dy: shadow.distance * Math.sin(radians),
  };
};

export const getOuterShadowStdDeviation = (shadow: OuterShadowPaintEffect): number => {
  return Math.max(0, shadow.blurRadius / 2);
};

export const getOuterShadowPaintExtent = (shadow: OuterShadowPaintEffect): PaintEffectExtent => {
  const { dx, dy } = resolveOuterShadowOffset(shadow);
  const spread = getOuterShadowStdDeviation(shadow) * 3;
  return {
    left: Math.max(0, spread - dx),
    top: Math.max(0, spread - dy),
    right: Math.max(0, spread + dx),
    bottom: Math.max(0, spread + dy),
  };
};
