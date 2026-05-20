import type { ImageBlock, ImageFragmentMetadata, ImageMeasure } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { applySdtDataset } from '../sdt/dataset.js';
import { createBlockImageContent } from './image-block.js';
import type { BuildImageHyperlinkAnchor } from './types.js';

type TableImagePlacement =
  | { mode: 'flowing' }
  | {
      mode: 'anchored';
      left: number;
      top: number;
      zIndex?: number;
    };

export type RenderTableImageFrameParams = {
  doc: Document;
  block: ImageBlock;
  measure: ImageMeasure;
  placement: TableImagePlacement;
  contentMaxWidth: number;
  contentMaxHeight: number;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
};

const readFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readPmRange = (block: ImageBlock): { pmStart?: number; pmEnd?: number } => ({
  pmStart: readFiniteNumber(block.attrs?.pmStart),
  pmEnd: readFiniteNumber(block.attrs?.pmEnd),
});

const buildTableImageMetadata = (
  block: ImageBlock,
  measure: ImageMeasure,
  maxWidth: number,
  maxHeight: number,
): ImageFragmentMetadata => {
  const originalWidth = readFiniteNumber(block.width) ?? measure.width;
  const originalHeight = readFiniteNumber(block.height) ?? measure.height;
  const aspectRatio = originalWidth > 0 && originalHeight > 0 ? originalWidth / originalHeight : 1;
  const minWidth = 20;
  return {
    originalWidth,
    originalHeight,
    maxWidth,
    maxHeight,
    aspectRatio,
    minWidth,
    minHeight: minWidth / aspectRatio,
  };
};

export const renderTableImageFrame = ({
  doc,
  block,
  measure,
  placement,
  contentMaxWidth,
  contentMaxHeight,
  buildImageHyperlinkAnchor,
}: RenderTableImageFrameParams): HTMLElement => {
  const wrapper = doc.createElement('div');
  wrapper.style.position = placement.mode === 'anchored' ? 'absolute' : 'relative';
  wrapper.style.width = `${measure.width}px`;
  wrapper.style.height = `${measure.height}px`;
  wrapper.style.maxWidth = '100%';
  wrapper.style.boxSizing = 'border-box';
  if (placement.mode === 'flowing') {
    wrapper.classList.add(DOM_CLASS_NAMES.IMAGE_FRAGMENT);
    wrapper.style.flexShrink = '0';
    wrapper.setAttribute('data-sd-block-id', block.id);
    const pmRange = readPmRange(block);
    if (pmRange.pmStart != null) wrapper.dataset.pmStart = String(pmRange.pmStart);
    if (pmRange.pmEnd != null) wrapper.dataset.pmEnd = String(pmRange.pmEnd);
    if (!block.attrs?.vmlWatermark) {
      wrapper.setAttribute(
        'data-image-metadata',
        JSON.stringify(buildTableImageMetadata(block, measure, contentMaxWidth, contentMaxHeight)),
      );
    }
  } else {
    wrapper.style.left = `${placement.left}px`;
    wrapper.style.top = `${placement.top}px`;
    if (placement.zIndex != null) {
      wrapper.style.zIndex = String(placement.zIndex);
    }
  }

  applySdtDataset(wrapper, block.attrs?.sdt);

  wrapper.appendChild(
    createBlockImageContent({
      doc,
      block,
      className: 'superdoc-table-image',
      clipContainer: wrapper,
      imageDisplay: 'block',
      buildImageHyperlinkAnchor,
    }),
  );

  return wrapper;
};
