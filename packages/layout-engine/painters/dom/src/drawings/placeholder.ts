export const createDrawingPlaceholder = (doc: Document): HTMLElement => {
  const placeholder = doc.createElement('div');
  placeholder.classList.add('superdoc-drawing-placeholder');
  placeholder.style.width = '100%';
  placeholder.style.height = '100%';
  const stripePattern =
    'repeating-linear-gradient(45deg, rgba(15,23,42,0.1), rgba(15,23,42,0.1) 6px, rgba(15,23,42,0.2) 6px, rgba(15,23,42,0.2) 12px)';
  placeholder.style.background = stripePattern;
  placeholder.style.backgroundImage = stripePattern;
  placeholder.style.border = '1px dashed rgba(15, 23, 42, 0.3)';
  return placeholder;
};
