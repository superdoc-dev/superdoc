type Placement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'
  | 'left-start'
  | 'left-end'
  | 'right-start'
  | 'right-end';

/**
 * Minimum distance from the viewport edges in pixels
 */
const GUTTER = 8;

/**
 * A mapping of placements to their opposite placements, used for flipping the position.
 */
const FLIP_MAP: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
  'top-start': 'bottom-start',
  'top-end': 'bottom-end',
  'bottom-start': 'top-start',
  'bottom-end': 'top-end',
  'left-start': 'right-start',
  'left-end': 'right-end',
  'right-start': 'left-start',
  'right-end': 'left-end',
};

/**
 * Calculates the position in pixels of a content element relative to a trigger element based on the specified position and offset.
 * This is useful for positioning tooltips, popovers, or other floating elements in relation to a reference element.
 * @param triggerElem - The element that triggers the positioning of the content element.
 * @param contentElem - The content element to be positioned.
 * @param options - An object containing placement, offset, and flip options.
 * @param options.placement - The desired position of the content element relative to the trigger element 'top', 'bottom', 'left', or 'right' (defaults to 'top').
 * @param options.offset - An optional offset value to adjust the position of the content element (default is 0).
 * @param options.flip - An optional boolean to determine if the position should flip to the opposite side if there isn't enough space (default is true).
 * @returns An object containing the calculated top and left positions for the content element in pixels and the final computed placement after considering available space.
 * @example
 * ```javascript
 * const triggerElement = document.getElementById('trigger');
 * const contentElement = document.getElementById('content');
 * const position = 'bottom';
 * const offset = 10;
 * const anchoredPosition = getAnchoredPosition(triggerElement, contentElement, { position, offset });
 * contentElement.style.top = `${anchoredPosition.top}px`;
 * contentElement.style.left = `${anchoredPosition.left}px`;
 * ```
 */
export const getAnchoredPosition = (
  triggerElem: HTMLElement,
  contentElem: HTMLElement,
  options: { placement?: Placement; offset?: number; flip?: boolean } = { placement: 'top', offset: 0, flip: true },
): { top: number; left: number; computedPlacement: Placement } => {
  const { placement = 'top', offset = 0, flip = true } = options;
  const triggerRect = triggerElem.getBoundingClientRect();
  const contentWidth = contentElem.offsetWidth;
  const contentHeight = contentElem.offsetHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const { availableAbove, availableBelow, availableLeft, availableRight } = getAvailableSpace(triggerElem, offset);

  let computedPlacement = placement;

  if (flip) {
    if (
      (placement.startsWith('top') && availableAbove < contentHeight && availableBelow > availableAbove) ||
      (placement.startsWith('bottom') && availableBelow < contentHeight && availableAbove > availableBelow) ||
      (placement.startsWith('left') && availableLeft < contentWidth && availableRight > availableLeft) ||
      (placement.startsWith('right') && availableRight < contentWidth && availableLeft > availableRight)
    ) {
      computedPlacement = FLIP_MAP[placement];
    }

    if (
      (placement === 'left-start' || placement === 'right-start') &&
      availableBelow < contentHeight &&
      availableAbove > availableBelow
    ) {
      computedPlacement = placement.replace('start', 'end') as Placement;
    }
    if (
      (placement === 'left-end' || placement === 'right-end') &&
      availableAbove < contentHeight &&
      availableBelow > availableAbove
    ) {
      computedPlacement = placement.replace('end', 'start') as Placement;
    }
  }

  let top = 0;
  let left = 0;

  switch (computedPlacement) {
    case 'top':
      top = triggerRect.top - contentHeight - offset;
      left = triggerRect.left + (triggerRect.width - contentWidth) / 2;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'top-start':
      top = triggerRect.top - contentHeight - offset;
      left = triggerRect.left;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'top-end':
      top = triggerRect.top - contentHeight - offset;
      left = triggerRect.right - contentWidth;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'bottom':
      top = triggerRect.bottom + offset;
      left = triggerRect.left + (triggerRect.width - contentWidth) / 2;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'bottom-start':
      top = triggerRect.bottom + offset;
      left = triggerRect.left;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'bottom-end':
      top = triggerRect.bottom + offset;
      left = triggerRect.right - contentWidth;
      left = Math.max(GUTTER, Math.min(left, viewportWidth - contentWidth - GUTTER));
      break;
    case 'left':
      top = triggerRect.top + (triggerRect.height - contentHeight) / 2;
      left = triggerRect.left - contentWidth - offset;
      break;
    case 'left-start':
      top = triggerRect.top;
      left = triggerRect.left - contentWidth - offset;
      break;
    case 'left-end':
      top = Math.max(GUTTER, triggerRect.bottom - contentHeight);
      left = triggerRect.left - contentWidth - offset;
      break;
    case 'right':
      top = triggerRect.top + (triggerRect.height - contentHeight) / 2;
      left = triggerRect.right + offset;
      break;
    case 'right-start':
      top = triggerRect.top;
      left = triggerRect.right + offset;
      break;
    case 'right-end':
      top = Math.max(GUTTER, triggerRect.bottom - contentHeight);
      left = triggerRect.right + offset;
      break;
  }

  return { top, left, computedPlacement };
};

/**
 * Calculates the available space around a trigger element in the viewport, considering an optional offset.
 * @param triggerElem - The element for which to calculate the available space.
 * @param offset - An optional offset value to adjust the available space calculation (default is 0).
 * @returns An object containing the available space in pixels above, below, to the left, and to the right of the trigger element.
 */
export const getAvailableSpace = (triggerElem: HTMLElement, offset: number = 0) => {
  const rect = triggerElem.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const belowTop = rect.bottom + offset;
  const aboveBottom = rect.top - offset;
  const availableBelow = Math.max(0, viewportHeight - belowTop - GUTTER);
  const availableAbove = Math.max(0, aboveBottom - GUTTER);
  const availableLeft = Math.max(0, rect.left - offset - GUTTER);
  const availableRight = Math.max(0, viewportWidth - rect.right - offset - GUTTER);
  return { availableBelow, availableAbove, availableLeft, availableRight };
};
