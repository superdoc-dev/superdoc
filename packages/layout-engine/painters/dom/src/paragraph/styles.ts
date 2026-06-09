import type { ParagraphAttrs } from '@superdoc/contracts';
import { applyRtlStyles } from '../features/inline-direction/index.js';

export const applyParagraphBlockStyles = (element: HTMLElement, attrs?: ParagraphAttrs): void => {
  if (!attrs) return;
  if (attrs.styleId) {
    element.setAttribute('styleid', attrs.styleId);
  }
  applyRtlStyles(element, attrs);
  if ((attrs as Record<string, unknown>).dropCap) {
    element.classList.add('sd-editor-dropcap');
  }
  const indent = attrs.indent;
  if (indent) {
    if (indent.left && indent.left > 0) {
      element.style.paddingLeft = `${indent.left}px`;
    }
    if (indent.right && indent.right > 0) {
      element.style.paddingRight = `${indent.right}px`;
    }
    const hasNegativeLeftIndent = indent.left != null && indent.left < 0;
    if (!hasNegativeLeftIndent) {
      const textIndent = (indent.firstLine ?? 0) - (indent.hanging ?? 0);
      if (textIndent) {
        element.style.textIndent = `${textIndent}px`;
      }
    }
  }
};

export const clearParagraphFrameIndentStyles = (element: HTMLElement): void => {
  if (element.style.paddingLeft) element.style.removeProperty('padding-left');
  if (element.style.paddingRight) element.style.removeProperty('padding-right');
  if (element.style.marginLeft) element.style.removeProperty('margin-left');
  if (element.style.marginRight) element.style.removeProperty('margin-right');
  if (element.style.textIndent) element.style.removeProperty('text-indent');
};
