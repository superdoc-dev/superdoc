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

type AnchoredPositionOptions = {
  placement?: Placement;
  offset?: number;
  flip?: boolean;
  boundary?: HTMLElement | null;
};

/**
 * Calculates the position in pixels of a content element relative to a trigger element based on the specified position and offset.
 * This is useful for positioning tooltips, popovers, or other floating elements in relation to a reference element.
 * @param trigger - The element that triggers the positioning of the content element. A DOMRect can also be provided for more precise control.
 * @param contentElem - The content element to be positioned.
 * @param options.placement - The desired position of the content element relative to the trigger element 'top', 'bottom', 'left', or 'right' (defaults to 'top').
 * @param options.offset - An optional offset value to adjust the position of the content element (default is 0).
 * @param options.flip - An optional boolean to determine if the position should flip to the opposite side if there isn't enough space (default is true).
 * @param options.boundary - An optional HTMLElement that defines the boundary within which the content element should be positioned. If not provided, the viewport is used as the boundary.
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
  trigger: HTMLElement | DOMRect,
  contentElem: HTMLElement,
  options: AnchoredPositionOptions = {},
): { top: number; left: number; computedPlacement: Placement } => {
  const { placement = 'top', offset = 0, flip = true, boundary = null } = options;
  const triggerRect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : trigger;
  const contentWidth = contentElem.offsetWidth;
  const contentHeight = isElemScrollable(contentElem) ? contentElem.scrollHeight : contentElem.offsetHeight;
  const maxLeftPos = getBoundaryRight(boundary) - contentWidth - GUTTER;
  const { availableAbove, availableBelow, availableLeft, availableRight } = getAvailableSpace(triggerRect, {
    offset,
    boundary,
  });

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
      top = Math.max(GUTTER, triggerRect.top - contentHeight - offset);
      left = triggerRect.left + (triggerRect.width - contentWidth) / 2;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
      break;
    case 'top-start':
      top = Math.max(GUTTER, triggerRect.top - contentHeight - offset);
      left = triggerRect.left;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
      break;
    case 'top-end':
      top = Math.max(GUTTER, triggerRect.top - contentHeight - offset);
      left = triggerRect.right - contentWidth;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
      break;
    case 'bottom':
      top = triggerRect.bottom + offset;
      left = triggerRect.left + (triggerRect.width - contentWidth) / 2;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
      break;
    case 'bottom-start':
      top = triggerRect.bottom + offset;
      left = triggerRect.left;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
      break;
    case 'bottom-end':
      top = triggerRect.bottom + offset;
      left = triggerRect.right - contentWidth;
      left = Math.max(GUTTER, Math.min(left, maxLeftPos));
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
 * @param trigger - The element for which to calculate the available space. A DOMRect can also be provided for more precise control.
 * @param options.offset - An optional offset value to adjust the available space calculation (default is 0).
 * @param options.boundary - An optional HTMLElement that defines the boundary within which the available space should be calculated. If not provided, the viewport is used as the boundary.
 * @returns An object containing the available space in pixels above, below, to the left, and to the right of the trigger element.
 */
export const getAvailableSpace = (
  trigger: HTMLElement | DOMRect,
  options: { offset?: number; boundary?: HTMLElement | null } = {},
) => {
  const { offset = 0, boundary = null } = options;
  const rect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : trigger;

  if (!isRectWithinBoundary(rect, boundary)) {
    console.warn(
      'Trigger element is outside the specified boundary. Available positioning space calculations will be inaccurate.',
    );
  }

  const belowTop = rect.bottom + offset;
  const aboveBottom = rect.top - offset;
  const availableBelow = Math.max(0, getBoundaryBottom(boundary) - belowTop - GUTTER);
  const availableAbove = Math.max(0, aboveBottom - getBoundaryTop(boundary) - GUTTER);
  const availableLeft = Math.max(0, rect.left - getBoundaryLeft(boundary) - offset - GUTTER);
  const availableRight = Math.max(0, getBoundaryRight(boundary) - rect.right - offset - GUTTER);
  return { availableBelow, availableAbove, availableLeft, availableRight };
};

/**
 * Calculates the maximum available width and height for a content element based on the specified placement relative to a trigger element.
 * @param trigger - The element that triggers the positioning of the content element. A DOMRect can also be provided for more precise control.
 * @param placement - The desired placement of the content element relative to the trigger element ('top', 'bottom', 'left', 'right', etc.).
 * @param options.offset - An optional offset value to adjust the available space calculation (default is 0).
 * @param options.boundary - An optional HTMLElement that defines the boundary within which the available space should be calculated. If not provided, the viewport is used as the boundary.
 * @returns An object containing the maximum available width and height for the content element.
 */
export const getAvailableSpaceForPlacement = (
  trigger: HTMLElement | DOMRect,
  placement: Placement,
  options: { offset?: number; boundary?: HTMLElement | null } = {},
) => {
  const { offset = 0, boundary = null } = options;
  const triggerRect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : trigger;
  const { availableAbove, availableBelow, availableLeft, availableRight } = getAvailableSpace(triggerRect, {
    offset,
    boundary,
  });

  let maxHeight = 0;
  let maxWidth = 0;

  switch (placement) {
    case 'top':
      maxWidth = getBoundaryRight(boundary) - GUTTER * 2;
      maxHeight = availableAbove;
      break;
    case 'bottom':
      maxWidth = getBoundaryRight(boundary) - GUTTER * 2;
      maxHeight = availableBelow;
      break;
    case 'left':
      maxWidth = availableLeft;
      maxHeight = getBoundaryBottom(boundary) - GUTTER * 2;
      break;
    case 'right':
      maxWidth = availableRight;
      maxHeight = getBoundaryBottom(boundary) - GUTTER * 2;
      break;
    case 'top-start':
      maxWidth = availableRight + triggerRect.width;
      maxHeight = availableAbove;
      break;
    case 'top-end':
      maxWidth = availableLeft + triggerRect.width;
      maxHeight = availableAbove;
      break;
    case 'bottom-start':
      maxWidth = availableRight + triggerRect.width;
      maxHeight = availableBelow;
      break;
    case 'bottom-end':
      maxWidth = availableLeft + triggerRect.width;
      maxHeight = availableBelow;
      break;
    case 'left-start':
      maxWidth = availableLeft;
      maxHeight = availableBelow + triggerRect.height;
      break;
    case 'left-end':
      maxWidth = availableLeft;
      maxHeight = availableAbove + triggerRect.height;
      break;
    case 'right-start':
      maxWidth = availableRight;
      maxHeight = availableBelow + triggerRect.height;
      break;
    case 'right-end':
      maxWidth = availableRight;
      maxHeight = availableAbove + triggerRect.height;
      break;
  }

  return { maxWidth, maxHeight };
};

const isElemScrollable = (elem: HTMLElement) => {
  const computedStyle = window.getComputedStyle(elem);
  const isScrollable = ['auto', 'scroll'].includes(computedStyle.overflowY);
  return isScrollable && elem.scrollHeight >= elem.clientHeight;
};

const getBoundaryTop = (boundary: HTMLElement | null) => {
  if (!boundary) {
    return 0;
  }
  const boundaryRect = boundary.getBoundingClientRect();
  return boundaryRect.top;
};

const getBoundaryRight = (boundary: HTMLElement | null) => {
  if (!boundary) {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }
  const boundaryRect = boundary.getBoundingClientRect();
  return boundaryRect.right;
};

const getBoundaryBottom = (boundary: HTMLElement | null) => {
  if (!boundary) {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }
  const boundaryRect = boundary.getBoundingClientRect();
  return boundaryRect.bottom;
};

const getBoundaryLeft = (boundary: HTMLElement | null) => {
  if (!boundary) {
    return 0;
  }
  const boundaryRect = boundary.getBoundingClientRect();
  return boundaryRect.left;
};

const isRectWithinBoundary = (rect: DOMRect, boundary: HTMLElement | null) => {
  if (!boundary) {
    return true;
  }
  const boundaryRect = boundary.getBoundingClientRect();

  return (
    rect.top >= boundaryRect.top &&
    rect.left >= boundaryRect.left &&
    rect.bottom <= boundaryRect.bottom &&
    rect.right <= boundaryRect.right
  );
};
