import { describe, expect, it } from 'vitest';
import type { FragmentRenderContext } from '../renderer.js';
import { hasShapeTextContent, renderTextboxContent } from './renderTextboxContent.js';

describe('renderTextboxContent', () => {
  const createDoc = (): Document => document.implementation.createHTMLDocument('textbox-content');

  it('renders formatted fallback textbox text with alignment, vertical alignment, and insets', () => {
    const doc = createDoc();

    const el = renderTextboxContent({
      doc,
      width: 160,
      height: 80,
      textAlign: 'right',
      textVerticalAlign: 'bottom',
      textInsets: { top: 1, right: 2, bottom: 3, left: 4 },
      textContent: {
        parts: [
          {
            text: 'Hello',
            formatting: {
              bold: true,
              italic: true,
              fontFamily: 'Arial',
              fontSize: 14,
              color: '336699',
              letterSpacing: 1.5,
            },
          },
        ],
      },
    }) as HTMLElement;

    const span = el.querySelector('span') as HTMLSpanElement | null;
    expect(el.style.display).toBe('flex');
    expect(el.style.justifyContent).toBe('flex-end');
    expect(el.style.padding).toBe('1px 2px 3px 4px');
    expect(el.style.textAlign).toBe('right');
    expect(span?.textContent).toBe('Hello');
    expect(span?.style.fontWeight).toBe('bold');
    expect(span?.style.fontStyle).toBe('italic');
    expect(span?.style.fontFamily).toBe('Arial');
    expect(span?.style.fontSize).toBe('14px');
    expect(['#336699', 'rgb(51, 102, 153)']).toContain(span?.style.color);
    expect(span?.style.letterSpacing).toBe('1.5px');
  });

  it('preserves line breaks and empty paragraph spacing in fallback textbox text', () => {
    const doc = createDoc();

    const el = renderTextboxContent({
      doc,
      width: 160,
      height: 80,
      textContent: {
        parts: [{ text: 'First' }, { text: '', isLineBreak: true, isEmptyParagraph: true }, { text: 'Second' }],
      },
    }) as HTMLElement;

    const paragraphs = Array.from(el.children) as HTMLElement[];
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First');
    expect(paragraphs[1]?.textContent).toBe('Second');
    expect(paragraphs[1]?.style.minHeight).toBe('1em');
  });

  it('resolves PAGE and NUMPAGES field tokens from the fragment context', () => {
    const doc = createDoc();
    const context: FragmentRenderContext = {
      pageNumber: 3,
      pageNumberText: 'iii',
      totalPages: 9,
      pageIndex: 2,
      section: 'body',
    };

    const el = renderTextboxContent({
      doc,
      width: 160,
      height: 80,
      context,
      textContent: {
        parts: [{ text: '', fieldType: 'PAGE' }, { text: ' of ' }, { text: '', fieldType: 'NUMPAGES' }],
      },
    }) as HTMLElement;

    expect(el.textContent).toBe('iii of 9');
  });

  it('renders inline image parts inside fallback textbox text', () => {
    const doc = createDoc();

    const el = renderTextboxContent({
      doc,
      width: 160,
      height: 80,
      textContent: {
        parts: [
          { text: 'Before ' },
          {
            text: '',
            kind: 'image',
            src: 'data:image/png;base64,AAA',
            alt: 'Inline picture',
            width: 32,
            height: 18,
          },
        ],
      },
    }) as HTMLElement;

    const img = el.querySelector('img') as HTMLImageElement | null;
    expect(img?.src).toBe('data:image/png;base64,AAA');
    expect(img?.alt).toBe('Inline picture');
    expect(img?.style.width).toBe('32px');
    expect(img?.style.height).toBe('18px');
    expect(img?.style.display).toBe('inline-block');
  });

  it('renders WordArt text with SVG sizing, formatting, and field resolution', () => {
    const doc = createDoc();

    const svg = renderTextboxContent({
      doc,
      width: 200,
      height: 80,
      isWordArt: true,
      textAlign: 'center',
      textInsets: { top: 5, right: 20, bottom: 5, left: 10 },
      context: { pageNumber: 7, totalPages: 10, pageIndex: 6, section: 'body' },
      textContent: {
        parts: [
          {
            text: 'Page ',
            formatting: { fontFamily: 'Arial', color: 'C0C0C0', letterSpacing: 2 },
          },
          {
            text: '',
            fieldType: 'PAGE',
            formatting: { bold: true, italic: true },
          },
        ],
      },
    }) as SVGSVGElement;

    const text = svg.querySelector('text') as SVGTextElement | null;
    const tspans = svg.querySelectorAll('tspan');
    expect(svg.classList.contains('superdoc-wordart-text')).toBe(true);
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 80');
    expect(text?.textContent).toBe('Page 7');
    expect(text?.getAttribute('x')).toBe('95');
    expect(text?.getAttribute('textLength')).toBe('170');
    expect(text?.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
    expect(tspans[0]?.getAttribute('font-family')).toBe('Arial');
    expect(tspans[0]?.getAttribute('fill')).toBe('#C0C0C0');
    expect(tspans[0]?.getAttribute('letter-spacing')).toBe('2');
    expect(tspans[1]?.getAttribute('font-weight')).toBe('bold');
    expect(tspans[1]?.getAttribute('font-style')).toBe('italic');
  });

  it('reports only non-empty shape text content as renderable', () => {
    expect(hasShapeTextContent(undefined)).toBe(false);
    expect(hasShapeTextContent({ parts: [] })).toBe(false);
    expect(hasShapeTextContent({ parts: [{ text: 'value' }] })).toBe(true);
  });
});
