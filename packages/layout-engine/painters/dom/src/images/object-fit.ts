import type { ObjectFit } from '@superdoc/contracts';

export const applyImageObjectFit = (img: HTMLImageElement, objectFit: ObjectFit): void => {
  img.style.objectFit = objectFit;
  if (objectFit === 'cover') {
    img.style.objectPosition = 'left top';
  } else {
    img.style.removeProperty('object-position');
  }
};
