import type { ImageHyperlink } from '@superdoc/contracts';
import { encodeTooltip, sanitizeHref } from '@superdoc/url-validation';

export const buildImageHyperlinkAnchor = (
  doc: Document,
  imageEl: HTMLElement,
  hyperlink: ImageHyperlink | undefined,
  display: 'block' | 'inline-block',
): HTMLElement => {
  if (!hyperlink?.url) return imageEl;

  const sanitized = sanitizeHref(hyperlink.url);
  if (!sanitized?.href) return imageEl;

  const anchor = doc.createElement('a');
  anchor.href = sanitized.href;
  anchor.classList.add('superdoc-link');

  if (sanitized.protocol === 'http' || sanitized.protocol === 'https') {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }

  const tooltipSource =
    typeof hyperlink.tooltip === 'string' && hyperlink.tooltip.trim().length > 0 ? hyperlink.tooltip : hyperlink.url;
  const tooltipResult = encodeTooltip(tooltipSource);
  if (tooltipResult?.text) {
    anchor.title = tooltipResult.text;
  }

  for (const titledElement of [imageEl, ...Array.from(imageEl.querySelectorAll('[title]'))]) {
    titledElement.removeAttribute('title');
  }

  anchor.setAttribute('role', 'link');
  anchor.setAttribute('tabindex', '0');

  if (display === 'block') {
    anchor.style.cssText = 'display: block; width: 100%; height: 100%; cursor: pointer;';
  } else {
    anchor.style.display = 'inline-block';
    anchor.style.lineHeight = '0';
    anchor.style.cursor = 'pointer';
    anchor.style.verticalAlign = imageEl.style.verticalAlign || 'bottom';
  }

  anchor.appendChild(imageEl);
  return anchor;
};
