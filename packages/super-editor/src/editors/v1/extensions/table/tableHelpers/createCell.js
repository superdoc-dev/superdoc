// @ts-check
export const createCell = (cellType, cellContent = null, attrs = null) => {
  if (cellContent) {
    return cellType.createChecked(attrs, cellContent);
  }
  if (attrs) {
    return cellType.createAndFill(attrs);
  }
  return cellType.createAndFill();
};
