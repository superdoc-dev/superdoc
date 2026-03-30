export const getRotationMargins = (w, h, angleDegrees) => {
  const rad = angleDegrees * (Math.PI / 180);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  const boundingWidth = w * cos + h * sin;
  const boundingHeight = w * sin + h * cos;

  const marginLeftRight = Math.round(Math.max(0, (boundingWidth - w) / 2));
  const marginTopBottom = Math.round(Math.max(0, (boundingHeight - h) / 2));

  return {
    horizontal: marginLeftRight,
    vertical: marginTopBottom,
  };
};
