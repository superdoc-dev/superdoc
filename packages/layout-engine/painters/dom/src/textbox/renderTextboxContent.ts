import type { ShapeTextContent } from '@superdoc/contracts';
import { createShapeTextImageElement } from '../images/drawing-image.js';
import type { FragmentRenderContext } from '../renderer.js';
import { validateHexColor } from '../svg-utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WORDART_LINE_FILL_RATIO = 0.9;

type TextInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type RenderTextboxContentParams = {
  doc: Document;
  textContent?: ShapeTextContent;
  textAlign?: string;
  textVerticalAlign?: 'top' | 'center' | 'bottom';
  textInsets?: TextInsets;
  isWordArt?: boolean;
  width: number;
  height: number;
  context?: FragmentRenderContext;
};

export const hasShapeTextContent = (textContent?: ShapeTextContent): textContent is ShapeTextContent => {
  return Array.isArray(textContent?.parts) && textContent.parts.length > 0;
};

export const renderTextboxContent = ({
  doc,
  textContent,
  textAlign = 'center',
  textVerticalAlign,
  textInsets,
  isWordArt = false,
  width,
  height,
  context,
}: RenderTextboxContentParams): HTMLElement | SVGSVGElement => {
  if (!hasShapeTextContent(textContent)) {
    return doc.createElement('div');
  }

  if (isWordArt) {
    return createWordArtTextElement(doc, textContent, textAlign, textInsets, width, height, context);
  }

  return createFallbackTextElement(doc, textContent, textAlign, textVerticalAlign, textInsets, context);
};

const createWordArtTextElement = (
  doc: Document,
  textContent: ShapeTextContent,
  textAlign: string,
  textInsets: TextInsets | undefined,
  width: number,
  height: number,
  context?: FragmentRenderContext,
): SVGSVGElement => {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.classList.add('superdoc-wordart-text');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';

  const insets = textInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const availableWidth = Math.max(1, width - insets.left - insets.right);
  const availableHeight = Math.max(1, height - insets.top - insets.bottom);
  const lines = buildWordArtLines(textContent, context);
  const lineCount = Math.max(lines.length, 1);
  const lineHeight = availableHeight / lineCount;
  const fontSize = Math.max(1, lineHeight * WORDART_LINE_FILL_RATIO);
  const textAnchor = getWordArtTextAnchor(textAlign);
  const textX = getWordArtTextX(textAlign, insets.left, availableWidth);

  lines.forEach((parts, lineIndex) => {
    if (parts.length === 0) {
      return;
    }

    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.setAttribute('xml:space', 'preserve');
    textEl.setAttribute('x', String(textX));
    textEl.setAttribute('y', String(insets.top + lineHeight * (lineIndex + 0.5)));
    textEl.setAttribute('text-anchor', textAnchor);
    textEl.setAttribute('dominant-baseline', 'middle');
    textEl.setAttribute('font-size', String(fontSize));
    textEl.setAttribute('textLength', String(availableWidth));
    textEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');

    parts.forEach((part) => {
      const tspan = doc.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('xml:space', 'preserve');
      tspan.textContent = part.text;
      applyWordArtTextFormatting(tspan, part.formatting);
      textEl.appendChild(tspan);
    });

    svg.appendChild(textEl);
  });

  return svg;
};

const buildWordArtLines = (
  textContent: ShapeTextContent,
  context?: FragmentRenderContext,
): Array<Array<{ text: string; formatting?: ShapeTextContent['parts'][number]['formatting'] }>> => {
  const lines: Array<Array<{ text: string; formatting?: ShapeTextContent['parts'][number]['formatting'] }>> = [[]];

  textContent.parts.forEach((part) => {
    if (part.isLineBreak) {
      lines.push([]);
      return;
    }

    const resolvedText = resolveShapeTextPartText(part, context);
    if (!resolvedText) {
      return;
    }

    lines[lines.length - 1].push({
      text: resolvedText,
      formatting: part.formatting,
    });
  });

  const nonEmptyLines = lines.filter((line) => line.length > 0);
  return nonEmptyLines.length > 0 ? nonEmptyLines : [[]];
};

const resolveShapeTextPartText = (part: ShapeTextContent['parts'][number], context?: FragmentRenderContext): string => {
  if (part.fieldType === 'PAGE') {
    return context?.pageNumberText ?? String(context?.pageNumber ?? 1);
  }
  if (part.fieldType === 'NUMPAGES') {
    return String(context?.totalPages ?? 1);
  }
  return part.text;
};

const getWordArtTextAnchor = (textAlign: string): 'start' | 'middle' | 'end' => {
  if (textAlign === 'right' || textAlign === 'r') {
    return 'end';
  }
  if (textAlign === 'center') {
    return 'middle';
  }
  return 'start';
};

const getWordArtTextX = (textAlign: string, leftInset: number, availableWidth: number): number => {
  if (textAlign === 'right' || textAlign === 'r') {
    return leftInset + availableWidth;
  }
  if (textAlign === 'center') {
    return leftInset + availableWidth / 2;
  }
  return leftInset;
};

const applyWordArtTextFormatting = (
  element: SVGTextElement | SVGTSpanElement,
  formatting?: ShapeTextContent['parts'][number]['formatting'],
): void => {
  if (!formatting) {
    return;
  }
  if (formatting.bold) {
    element.setAttribute('font-weight', 'bold');
  }
  if (formatting.italic) {
    element.setAttribute('font-style', 'italic');
  }
  if (formatting.fontFamily) {
    element.setAttribute('font-family', formatting.fontFamily);
  }
  if (formatting.color) {
    const validatedColor = validateHexColor(formatting.color);
    if (validatedColor) {
      element.setAttribute('fill', validatedColor);
    }
  }
  if (formatting.letterSpacing != null) {
    element.setAttribute('letter-spacing', String(formatting.letterSpacing));
  }
};

const createFallbackTextElement = (
  doc: Document,
  textContent: ShapeTextContent,
  textAlign: string,
  textVerticalAlign?: 'top' | 'center' | 'bottom',
  textInsets?: TextInsets,
  context?: FragmentRenderContext,
): HTMLElement => {
  const textDiv = doc.createElement('div');
  textDiv.style.position = 'absolute';
  textDiv.style.top = '0';
  textDiv.style.left = '0';
  textDiv.style.width = '100%';
  textDiv.style.height = '100%';
  textDiv.style.display = 'flex';
  textDiv.style.flexDirection = 'column';

  const verticalAlign = textVerticalAlign ?? 'top';
  if (verticalAlign === 'top') {
    textDiv.style.justifyContent = 'flex-start';
  } else if (verticalAlign === 'bottom') {
    textDiv.style.justifyContent = 'flex-end';
  } else {
    textDiv.style.justifyContent = 'center';
  }

  if (textInsets) {
    textDiv.style.padding = `${textInsets.top}px ${textInsets.right}px ${textInsets.bottom}px ${textInsets.left}px`;
  } else {
    textDiv.style.padding = '10px';
  }

  textDiv.style.boxSizing = 'border-box';
  textDiv.style.wordWrap = 'break-word';
  textDiv.style.overflowWrap = 'break-word';
  textDiv.style.overflow = 'hidden';
  textDiv.style.minWidth = '0';
  textDiv.style.fontSize = '12px';
  textDiv.style.lineHeight = '1.2';

  if (textAlign === 'center') {
    textDiv.style.textAlign = 'center';
  } else if (textAlign === 'right' || textAlign === 'r') {
    textDiv.style.textAlign = 'right';
  } else {
    textDiv.style.textAlign = 'left';
  }

  let currentParagraph = createTextParagraph(doc);

  textContent.parts.forEach((part) => {
    if (part.isLineBreak) {
      textDiv.appendChild(currentParagraph);
      currentParagraph = createTextParagraph(doc);
      if (part.isEmptyParagraph) {
        currentParagraph.style.minHeight = '1em';
      }
    } else if (part.kind === 'image' && part.src) {
      currentParagraph.appendChild(createShapeTextImageElement(doc, part));
    } else {
      const span = doc.createElement('span');
      span.textContent = resolveShapeTextPartText(part, context);
      if (part.formatting) {
        if (part.formatting.bold) {
          span.style.fontWeight = 'bold';
        }
        if (part.formatting.italic) {
          span.style.fontStyle = 'italic';
        }
        if (part.formatting.fontFamily) {
          span.style.fontFamily = part.formatting.fontFamily;
        }
        if (part.formatting.color) {
          const validatedColor = validateHexColor(part.formatting.color);
          if (validatedColor) {
            span.style.color = validatedColor;
          }
        }
        if (part.formatting.fontSize) {
          span.style.fontSize = `${part.formatting.fontSize}px`;
        }
        if (part.formatting.letterSpacing != null) {
          span.style.letterSpacing = `${part.formatting.letterSpacing}px`;
        }
      }
      currentParagraph.appendChild(span);
    }
  });

  textDiv.appendChild(currentParagraph);

  return textDiv;
};

const createTextParagraph = (doc: Document): HTMLElement => {
  const paragraph = doc.createElement('div');
  paragraph.style.width = '100%';
  paragraph.style.minWidth = '0';
  paragraph.style.whiteSpace = 'normal';
  return paragraph;
};
