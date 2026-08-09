import type { RenderPlaceholder } from '@superdoc/contracts';

export type CreateRenderPlaceholderOptions = {
  doc: Document;
  placeholder: RenderPlaceholder;
};

/** Stamp the shared diagnostic and accessibility contract on a placeholder. */
export const applyRenderPlaceholderSemantics = (element: HTMLElement, placeholder: RenderPlaceholder): void => {
  const diagnosticIds = Array.from(new Set(placeholder.diagnosticIds.filter(Boolean)));
  element.classList.add('superdoc-placeholder-block');
  element.dataset.placeholderDiagnosticIds = diagnosticIds.join(',');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', placeholder.accessibleName);
  element.title = placeholder.accessibleName;
};

/**
 * Paint an observable, print-visible replacement for content that the
 * projection layer deliberately kept fail-closed.
 */
export const createRenderPlaceholder = ({ doc, placeholder }: CreateRenderPlaceholderOptions): HTMLSpanElement => {
  const element = doc.createElement('span');
  applyRenderPlaceholderSemantics(element, placeholder);

  Object.assign(element.style, {
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    minWidth: '0',
    minHeight: '0',
    overflow: 'hidden',
    border: '1px dashed rgba(71, 85, 105, 0.65)',
    background:
      'repeating-linear-gradient(135deg, rgba(226,232,240,0.9), rgba(226,232,240,0.9) 6px, rgba(241,245,249,0.9) 6px, rgba(241,245,249,0.9) 12px)',
    color: '#475569',
    fontFamily: 'Arial, sans-serif',
    fontSize: '11px',
    lineHeight: '1.2',
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });

  element.textContent = placeholder.accessibleName;
  return element;
};
