import type { ImageBlock, ImageFragment, ResolvedImageItem, SdtMetadata } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '../constants.js';
import type { FragmentRenderContext } from '../renderer.js';
import { CLASS_NAMES, fragmentStyles } from '../styles.js';
import { applyStyles } from '../utils/apply-styles.js';
import { createBlockImageContent } from './image-block.js';
import type { BuildImageHyperlinkAnchor } from './types.js';

type RenderImageFragmentOptions = {
  doc: Document | null;
  fragment: ImageFragment;
  context: FragmentRenderContext;
  resolvedItem?: ResolvedImageItem;
  applyResolvedFragmentFrame: (
    el: HTMLElement,
    item: ResolvedImageItem,
    fragment: ImageFragment,
    section?: 'body' | 'header' | 'footer',
  ) => void;
  applyFragmentFrame: (el: HTMLElement, fragment: ImageFragment, section?: 'body' | 'header' | 'footer') => void;
  applyFragmentWrapperZIndex: (el: HTMLElement, fragment: ImageFragment) => void;
  applySdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  applyContainerSdtDataset: (el: HTMLElement | null, metadata?: SdtMetadata | null) => void;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
  createErrorPlaceholder: (blockId: string, error: unknown) => HTMLElement;
};

export const buildImageGeometryTransform = (attrs: {
  width: number;
  height: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}): string => {
  const transforms: string[] = [];
  if (attrs.rotation != null && attrs.rotation !== 0) {
    const angleRad = (attrs.rotation * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const newTopLeftX = (attrs.width / 2) * (1 - cosA) + (attrs.height / 2) * sinA;
    const newTopLeftY = (attrs.width / 2) * sinA + (attrs.height / 2) * (1 - cosA);
    transforms.push(`translate(${-newTopLeftX}px, ${-newTopLeftY}px)`);
    transforms.push(`rotate(${attrs.rotation}deg)`);
  }
  if (attrs.flipH) {
    transforms.push('scaleX(-1)');
  }
  if (attrs.flipV) {
    transforms.push('scaleY(-1)');
  }
  return transforms.join(' ');
};

export const applyImageGeometryTransform = (
  target: HTMLElement,
  attrs: {
    width: number;
    height: number;
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
  },
): void => {
  const transform = buildImageGeometryTransform(attrs);
  if (!transform) {
    return;
  }
  target.style.transform = transform;
  target.style.transformOrigin = 'center';
};

export const renderImageFragment = ({
  doc,
  fragment,
  context,
  resolvedItem,
  applyResolvedFragmentFrame,
  applyFragmentFrame,
  applyFragmentWrapperZIndex,
  applySdtDataset,
  applyContainerSdtDataset,
  buildImageHyperlinkAnchor,
  createErrorPlaceholder,
}: RenderImageFragmentOptions): HTMLElement => {
  try {
    if (resolvedItem?.block?.kind !== 'image') {
      throw new Error(`DomPainter: missing resolved image block for fragment ${fragment.blockId}`);
    }
    const block = resolvedItem.block as ImageBlock;

    if (!doc) {
      throw new Error('DomPainter: document is not available');
    }

    const fragmentEl = doc.createElement('div');
    fragmentEl.classList.add(CLASS_NAMES.fragment, DOM_CLASS_NAMES.IMAGE_FRAGMENT);
    applyStyles(fragmentEl, fragmentStyles);
    if (resolvedItem) {
      applyResolvedFragmentFrame(fragmentEl, resolvedItem, fragment, context.section);
    } else {
      applyFragmentFrame(fragmentEl, fragment, context.section);
      fragmentEl.style.height = `${fragment.height}px`;
      applyFragmentWrapperZIndex(fragmentEl, fragment);
    }
    applySdtDataset(fragmentEl, block.attrs?.sdt);
    applyContainerSdtDataset(fragmentEl, block.attrs?.containerSdt);

    if (block.id) {
      fragmentEl.setAttribute('data-sd-block-id', block.id);
    }

    const imgPmStart = resolvedItem?.pmStart;
    if (imgPmStart != null) {
      fragmentEl.dataset.pmStart = String(imgPmStart);
    }
    const imgPmEnd = resolvedItem?.pmEnd;
    if (imgPmEnd != null) {
      fragmentEl.dataset.pmEnd = String(imgPmEnd);
    }

    const imgMetadata = resolvedItem?.metadata;
    if (imgMetadata && !block.attrs?.vmlWatermark) {
      fragmentEl.setAttribute('data-image-metadata', JSON.stringify(imgMetadata));
    }

    // AIDEV-NOTE: Keep srcRect crop/zoom transforms on the image element via
    // applyImageClipPath, and geometry transforms on the fragment wrapper.
    // Putting both on the same element overwrites clip-path scaling.
    applyImageGeometryTransform(fragmentEl, {
      width: block.width ?? fragment.width,
      height: block.height ?? fragment.height,
      rotation: block.rotation,
      flipH: block.flipH,
      flipV: block.flipV,
    });

    const imageChild = createBlockImageContent({
      doc,
      block,
      clipContainer: fragmentEl,
      buildImageHyperlinkAnchor,
    });
    fragmentEl.appendChild(imageChild);

    return fragmentEl;
  } catch (error) {
    console.error('[DomPainter] Image fragment rendering failed:', { fragment, error });
    return createErrorPlaceholder(fragment.blockId, error);
  }
};
