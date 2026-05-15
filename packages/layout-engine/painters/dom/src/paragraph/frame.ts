import type { ParaFragment, ResolvedFragmentItem } from '@superdoc/contracts';
import { assertFragmentPmPositions } from '../pm-position-validation.js';

export type FragmentFrameSection = 'body' | 'header' | 'footer';

export const applyParagraphFragmentPmAttributes = (
  el: HTMLElement,
  fragment: ParaFragment,
  section?: FragmentFrameSection,
  resolvedItem?: ResolvedFragmentItem,
): void => {
  if (section === 'body' || section === undefined) {
    assertFragmentPmPositions(fragment, 'paragraph fragment');
  }

  const pmStart = resolvedItem ? resolvedItem.pmStart : fragment.pmStart;
  if (pmStart != null) {
    el.dataset.pmStart = String(pmStart);
  } else {
    delete el.dataset.pmStart;
  }

  const pmEnd = resolvedItem ? resolvedItem.pmEnd : fragment.pmEnd;
  if (pmEnd != null) {
    el.dataset.pmEnd = String(pmEnd);
  } else {
    delete el.dataset.pmEnd;
  }

  const continuesFromPrev = resolvedItem ? resolvedItem.continuesFromPrev : fragment.continuesFromPrev;
  if (continuesFromPrev) {
    el.dataset.continuesFromPrev = 'true';
  } else {
    delete el.dataset.continuesFromPrev;
  }

  const continuesOnNext = resolvedItem ? resolvedItem.continuesOnNext : fragment.continuesOnNext;
  if (continuesOnNext) {
    el.dataset.continuesOnNext = 'true';
  } else {
    delete el.dataset.continuesOnNext;
  }
};
