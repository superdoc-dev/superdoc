import type { ImageHyperlink } from '@superdoc/contracts';

export type BuildImageHyperlinkAnchor = (
  imageEl: HTMLElement,
  hyperlink: ImageHyperlink | undefined,
  display: 'block' | 'inline-block',
) => HTMLElement;
