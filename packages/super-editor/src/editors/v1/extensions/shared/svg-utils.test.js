/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTextElement, createGradient, generateTransforms } from './svg-utils.js';

describe('svg-utils', () => {
  describe('createTextElement', () => {
    const createBasicTextContent = (text = 'Hello World') => ({
      parts: [{ text, formatting: {} }],
    });

    it('should create a foreignObject element', () => {
      const textContent = createBasicTextContent();
      const result = createTextElement(textContent, 'left', 100, 50);

      expect(result.tagName).toBe('foreignObject');
      expect(result.getAttribute('width')).toBe('100');
      expect(result.getAttribute('height')).toBe('50');
    });

    it('should render text content', () => {
      const textContent = createBasicTextContent('Test text');
      const result = createTextElement(textContent, 'left', 100, 50);

      const div = result.querySelector('div');
      expect(div.textContent).toContain('Test text');
    });

    describe('text alignment', () => {
      it('should apply left alignment', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50);

        const div = result.querySelector('div');
        expect(div.style.textAlign).toBe('left');
      });

      it('should apply center alignment', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'center', 100, 50);

        const div = result.querySelector('div');
        expect(div.style.textAlign).toBe('center');
      });

      it('should apply right alignment for "right"', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'right', 100, 50);

        const div = result.querySelector('div');
        expect(div.style.textAlign).toBe('right');
      });

      it('should apply right alignment for "r"', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'r', 100, 50);

        const div = result.querySelector('div');
        expect(div.style.textAlign).toBe('right');
      });
    });

    describe('vertical alignment options', () => {
      it('should apply flex-start for textVerticalAlign "top"', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {
          textVerticalAlign: 'top',
        });

        const div = result.querySelector('div');
        expect(div.style.justifyContent).toBe('flex-start');
      });

      it('should apply center for textVerticalAlign "center"', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {
          textVerticalAlign: 'center',
        });

        const div = result.querySelector('div');
        expect(div.style.justifyContent).toBe('center');
      });

      it('should apply flex-end for textVerticalAlign "bottom"', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {
          textVerticalAlign: 'bottom',
        });

        const div = result.querySelector('div');
        expect(div.style.justifyContent).toBe('flex-end');
      });

      it('should default to center when textVerticalAlign is not specified', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {});

        const div = result.querySelector('div');
        expect(div.style.justifyContent).toBe('center');
      });
    });

    describe('text insets options', () => {
      it('should apply custom text insets', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {
          textInsets: { top: 5, right: 10, bottom: 15, left: 20 },
        });

        const div = result.querySelector('div');
        expect(div.style.padding).toBe('5px 10px 15px 20px');
      });

      it('should apply default padding when textInsets is not specified', () => {
        const textContent = createBasicTextContent();
        const result = createTextElement(textContent, 'left', 100, 50, {});

        const div = result.querySelector('div');
        expect(div.style.padding).toBe('10px');
      });
    });

    describe('field type resolution', () => {
      it('should resolve PAGE field type to pageNumber', () => {
        const textContent = {
          parts: [{ text: '', fieldType: 'PAGE', formatting: {} }],
        };
        const result = createTextElement(textContent, 'left', 100, 50, {
          pageNumber: 5,
        });

        const span = result.querySelector('span');
        expect(span.textContent).toBe('5');
      });

      it('should resolve NUMPAGES field type to totalPages', () => {
        const textContent = {
          parts: [{ text: '', fieldType: 'NUMPAGES', formatting: {} }],
        };
        const result = createTextElement(textContent, 'left', 100, 50, {
          totalPages: 10,
        });

        const span = result.querySelector('span');
        expect(span.textContent).toBe('10');
      });

      it('should default PAGE to "1" when pageNumber not provided', () => {
        const textContent = {
          parts: [{ text: '', fieldType: 'PAGE', formatting: {} }],
        };
        const result = createTextElement(textContent, 'left', 100, 50, {});

        const span = result.querySelector('span');
        expect(span.textContent).toBe('1');
      });

      it('should default NUMPAGES to "1" when totalPages not provided', () => {
        const textContent = {
          parts: [{ text: '', fieldType: 'NUMPAGES', formatting: {} }],
        };
        const result = createTextElement(textContent, 'left', 100, 50, {});

        const span = result.querySelector('span');
        expect(span.textContent).toBe('1');
      });
    });

    describe('text formatting', () => {
      it('should apply bold formatting', () => {
        const textContent = {
          parts: [{ text: 'Bold', formatting: { bold: true } }],
        };
        const result = createTextElement(textContent, 'left', 100, 50);

        const span = result.querySelector('span');
        expect(span.style.fontWeight).toBe('bold');
      });

      it('should apply italic formatting', () => {
        const textContent = {
          parts: [{ text: 'Italic', formatting: { italic: true } }],
        };
        const result = createTextElement(textContent, 'left', 100, 50);

        const span = result.querySelector('span');
        expect(span.style.fontStyle).toBe('italic');
      });

      it('should apply font family', () => {
        const textContent = {
          parts: [{ text: 'Custom Font', formatting: { fontFamily: 'Arial, sans-serif' } }],
        };
        const result = createTextElement(textContent, 'left', 100, 50);

        const span = result.querySelector('span');
        expect(span.style.fontFamily).toBe('Arial, sans-serif');
      });

      it('should apply color with # prefix', () => {
        const textContent = {
          parts: [{ text: 'Red', formatting: { color: 'FF0000' } }],
        };
        const result = createTextElement(textContent, 'left', 100, 50);

        const span = result.querySelector('span');
        expect(span.style.color).toBe('rgb(255, 0, 0)');
      });

      it('should apply font size in pixels', () => {
        const textContent = {
          parts: [{ text: 'Large', formatting: { fontSize: 24 } }],
        };
        const result = createTextElement(textContent, 'left', 100, 50);

        const span = result.querySelector('span');
        expect(span.style.fontSize).toBe('24px');
      });
    });

    describe('line breaks', () => {
      it('should create new paragraph on line break', () => {
        const textContent = {
          parts: [
            { text: 'Line 1', formatting: {} },
            { text: '\n', isLineBreak: true, formatting: {} },
            { text: 'Line 2', formatting: {} },
          ],
        };
        const result = createTextElement(textContent, 'left', 100, 100);

        const div = result.querySelector('div');
        const paragraphs = div.querySelectorAll('div');
        expect(paragraphs.length).toBe(2);
      });

      it('should add min-height to empty paragraph line breaks', () => {
        const textContent = {
          parts: [
            { text: 'Line 1', formatting: {} },
            { text: '\n', isLineBreak: true, isEmptyParagraph: true, formatting: {} },
            { text: 'Line 2', formatting: {} },
          ],
        };
        const result = createTextElement(textContent, 'left', 100, 100);

        const div = result.querySelector('div');
        const paragraphs = div.querySelectorAll('div');
        expect(paragraphs[1].style.minHeight).toBe('1em');
      });
    });
  });

  describe('generateTransforms', () => {
    it('should return empty array for no transforms', () => {
      const result = generateTransforms({});
      expect(result).toEqual([]);
    });

    it('should include rotation transform', () => {
      const result = generateTransforms({ rotation: 45 });
      expect(result).toContain('rotate(45deg)');
    });

    it('should include flipH transform', () => {
      const result = generateTransforms({ flipH: true });
      expect(result).toContain('scaleX(-1)');
    });

    it('should include flipV transform', () => {
      const result = generateTransforms({ flipV: true });
      expect(result).toContain('scaleY(-1)');
    });

    it('should include all transforms', () => {
      const result = generateTransforms({ rotation: 90, flipH: true, flipV: true });
      expect(result).toHaveLength(3);
      expect(result).toContain('rotate(90deg)');
      expect(result).toContain('scaleX(-1)');
      expect(result).toContain('scaleY(-1)');
    });
  });

  describe('createGradient', () => {
    it('should return null for empty stops', () => {
      const result = createGradient({ gradientType: 'linear', stops: [], angle: 0 }, 'test-id');
      expect(result).toBeNull();
    });

    it('should return null for undefined stops', () => {
      const result = createGradient({ gradientType: 'linear', angle: 0 }, 'test-id');
      expect(result).toBeNull();
    });

    it('should create linear gradient', () => {
      const gradientData = {
        gradientType: 'linear',
        angle: 0,
        stops: [
          { position: 0, color: '#FF0000' },
          { position: 1, color: '#0000FF' },
        ],
      };
      const result = createGradient(gradientData, 'test-linear');

      expect(result.tagName).toBe('linearGradient');
      expect(result.getAttribute('id')).toBe('test-linear');
    });

    it('should create radial gradient', () => {
      const gradientData = {
        gradientType: 'radial',
        stops: [
          { position: 0, color: '#FF0000' },
          { position: 1, color: '#0000FF' },
        ],
      };
      const result = createGradient(gradientData, 'test-radial');

      expect(result.tagName).toBe('radialGradient');
      expect(result.getAttribute('id')).toBe('test-radial');
    });

    it('should add gradient stops', () => {
      const gradientData = {
        gradientType: 'linear',
        angle: 0,
        stops: [
          { position: 0, color: '#FF0000' },
          { position: 0.5, color: '#00FF00' },
          { position: 1, color: '#0000FF' },
        ],
      };
      const result = createGradient(gradientData, 'test-stops');

      const stops = result.querySelectorAll('stop');
      expect(stops).toHaveLength(3);
      expect(stops[0].getAttribute('offset')).toBe('0%');
      expect(stops[1].getAttribute('offset')).toBe('50%');
      expect(stops[2].getAttribute('offset')).toBe('100%');
    });

    it('should apply stop-opacity for alpha values', () => {
      const gradientData = {
        gradientType: 'linear',
        angle: 0,
        stops: [{ position: 0, color: '#FF0000', alpha: 0.5 }],
      };
      const result = createGradient(gradientData, 'test-alpha');

      const stop = result.querySelector('stop');
      expect(stop.getAttribute('stop-opacity')).toBe('0.5');
    });
  });
});
