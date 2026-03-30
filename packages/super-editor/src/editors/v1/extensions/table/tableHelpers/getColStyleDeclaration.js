// @ts-check
export const getColStyleDeclaration = (minWidth, width) => {
  if (width != null) {
    const numericWidth = Number(width);
    if (Number.isFinite(numericWidth) && numericWidth >= 0) {
      // Respect the stored width exactly, even when narrower than the configured minimum.
      return ['width', `${numericWidth}px`];
    }
  }

  // Set the minimum with on the column if it has no stored width.
  return ['min-width', `${minWidth}px`];
};
