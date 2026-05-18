import type { DrawingBlock, DrawingFragment, ResolvedDrawingItem } from '@superdoc/contracts';
import type { FragmentRenderContext } from '../renderer.js';
import { CLASS_NAMES, fragmentStyles } from '../styles.js';
import { applyStyles } from '../utils/apply-styles.js';
import type { BuildImageHyperlinkAnchor } from '../images/types.js';
import { renderDrawingContent } from './renderDrawingContent.js';

type RenderDrawingFragmentOptions = {
  doc: Document | null;
  fragment: DrawingFragment;
  context: FragmentRenderContext;
  resolvedItem?: ResolvedDrawingItem;
  applyResolvedFragmentFrame: (
    el: HTMLElement,
    item: ResolvedDrawingItem,
    fragment: DrawingFragment,
    section?: 'body' | 'header' | 'footer',
  ) => void;
  applyFragmentFrame: (el: HTMLElement, fragment: DrawingFragment, section?: 'body' | 'header' | 'footer') => void;
  applyFragmentWrapperZIndex: (el: HTMLElement, fragment: DrawingFragment) => void;
  buildImageHyperlinkAnchor: BuildImageHyperlinkAnchor;
  createErrorPlaceholder: (blockId: string, error: unknown) => HTMLElement;
};

export const renderDrawingFragment = ({
  doc,
  fragment,
  context,
  resolvedItem,
  applyResolvedFragmentFrame,
  applyFragmentFrame,
  applyFragmentWrapperZIndex,
  buildImageHyperlinkAnchor,
  createErrorPlaceholder,
}: RenderDrawingFragmentOptions): HTMLElement => {
  try {
    if (resolvedItem?.block?.kind !== 'drawing') {
      throw new Error(`DomPainter: missing resolved drawing block for fragment ${fragment.blockId}`);
    }
    const block = resolvedItem.block as DrawingBlock;

    if (!doc) {
      throw new Error('DomPainter: document is not available');
    }

    const fragmentEl = doc.createElement('div');
    fragmentEl.classList.add(CLASS_NAMES.fragment, 'superdoc-drawing-fragment');
    applyStyles(fragmentEl, fragmentStyles);
    if (resolvedItem) {
      applyResolvedFragmentFrame(fragmentEl, resolvedItem, fragment, context.section);
    } else {
      applyFragmentFrame(fragmentEl, fragment, context.section);
      fragmentEl.style.height = `${fragment.height}px`;
      applyFragmentWrapperZIndex(fragmentEl, fragment);
    }
    fragmentEl.style.position = 'absolute';
    fragmentEl.style.overflow = 'hidden';

    const innerWrapper = doc.createElement('div');
    innerWrapper.classList.add('superdoc-drawing-inner');
    innerWrapper.style.position = 'absolute';
    innerWrapper.style.left = '50%';
    innerWrapper.style.top = '50%';
    innerWrapper.style.width = `${fragment.geometry.width}px`;
    innerWrapper.style.height = `${fragment.geometry.height}px`;
    innerWrapper.style.transformOrigin = 'center';

    const scale = fragment.scale ?? 1;
    const transforms: string[] = ['translate(-50%, -50%)'];
    transforms.push(`rotate(${fragment.geometry.rotation ?? 0}deg)`);
    transforms.push(`scaleX(${fragment.geometry.flipH ? -1 : 1})`);
    transforms.push(`scaleY(${fragment.geometry.flipV ? -1 : 1})`);
    transforms.push(`scale(${scale})`);
    innerWrapper.style.transform = transforms.join(' ');

    innerWrapper.appendChild(
      renderDrawingContent({
        doc,
        block,
        geometry: fragment.geometry,
        context,
        buildImageHyperlinkAnchor,
      }),
    );
    fragmentEl.appendChild(innerWrapper);

    return fragmentEl;
  } catch (error) {
    console.error('[DomPainter] Drawing fragment rendering failed:', { fragment, error });
    return createErrorPlaceholder(fragment.blockId, error);
  }
};
