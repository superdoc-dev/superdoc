function getScrollableParent(element) {
  let currentElement = element;

  while (currentElement) {
    const overflowY = window.getComputedStyle(currentElement).overflowY;
    if (/(auto|scroll)/.test(overflowY) && currentElement.scrollHeight > currentElement.clientHeight) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

export function scrollToElement(targetElement, options = { behavior: 'smooth', block: 'start' }) {
  if (!targetElement) return;

  const container = getScrollableParent(targetElement);

  const containerRect = container.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const offsetTop = targetRect.top - containerRect.top + container.scrollTop;
  const scrollPaddingTopValue = window.getComputedStyle(container).scrollPaddingTop?.trim();
  const resolvedScrollPaddingTop = scrollPaddingTopValue?.endsWith('px')
    ? Number(scrollPaddingTopValue.slice(0, -2))
    : 0;
  // Hosts can opt in to space for sticky or overlay chrome with scroll-padding-top resolved to pixels.
  const scrollPaddingTop =
    Number.isFinite(resolvedScrollPaddingTop) && resolvedScrollPaddingTop >= 0 ? resolvedScrollPaddingTop : 0;

  container.scrollTo({
    top:
      options.block === 'start'
        ? offsetTop - scrollPaddingTop
        : offsetTop - container.clientHeight + targetElement.offsetHeight,
    behavior: options.behavior,
  });
}
