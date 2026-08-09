import { describe, expect, it, vi } from 'vite-plus/test';

import { applyTextEffects, resolveTextReflectionTransform } from './text-effects.js';

describe('applyTextEffects', () => {
  it('paints solid fill, outline, and directional shadow independently', () => {
    const element = document.createElement('span');

    applyTextEffects(element, {
      fill: '#FFFFFF',
      outline: { width: 1, fill: '#E97132' },
      shadow: {
        color: { color: '#4EA72E', alpha: 0.5 },
        blurRadius: 0,
        distance: 4,
        direction: 45,
      },
    });

    expect(element.style.color).toBe('#FFFFFF');
    expect(element.style.webkitTextStroke).toBe('1px #E97132');
    expect(element.style.textShadow).toContain('2.8284271247461903px 2.82842712474619px 0px');
    expect(element.style.textShadow).toContain('rgba(78, 167, 46, 0.5)');
  });

  it('paints gradient text and a below-text reflection without changing font metrics', () => {
    const element = document.createElement('span');

    applyTextEffects(element, {
      fill: {
        type: 'gradient',
        gradientType: 'linear',
        angle: 90,
        stops: [
          { position: 0, color: '#275417' },
          { position: 1, color: '#4EA72E' },
        ],
      },
      reflection: {
        blurRadius: 0.66,
        distance: 0,
        direction: 90,
        startAlpha: 0.53,
        startPosition: 0,
        endAlpha: 0.003,
        endPosition: 0.355,
        scaleX: 1,
        scaleY: -0.9,
      },
    });

    expect(element.style.backgroundImage).toContain('linear-gradient(0deg');
    expect(element.style.backgroundClip).toBe('text');
    expect(element.style.color).toBe('transparent');
    // The non-browser test DOM has no Canvas 2D metrics, so reflection paint
    // fails closed here. Geometry is covered independently below with explicit
    // glyph bounds; the browser proof exercises the generated paint layer.
    expect(element.style.webkitBoxReflect).toBeUndefined();
    expect(element.style.fontSize).toBe('');
    expect(element.style.letterSpacing).toBe('');
  });

  it('anchors a scaled reflection to visible glyph ink instead of the CSS line box', () => {
    const placement = resolveTextReflectionTransform(
      {
        blurRadius: 0.66,
        distance: 0,
        direction: 90,
        startAlpha: 0.53,
        startPosition: 0,
        endAlpha: 0.003,
        endPosition: 0.355,
        scaleX: 1,
        scaleY: -0.9,
      },
      { left: 0, top: 13.5, right: 180.3, bottom: 45.42 },
    );

    expect(placement).toEqual({
      transform: 'translate(0px, 86.298px) scale(1, -0.9)',
      maskDirection: 'bottom',
    });
  });

  it('paints reflection as generated content without duplicating selectable DOM text', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({
        actualBoundingBoxAscent: 31.55,
        actualBoundingBoxDescent: 0.42,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 180.3,
        fontBoundingBoxAscent: 45,
        fontBoundingBoxDescent: 14,
      }),
    } as unknown as CanvasRenderingContext2D);
    const element = document.createElement('span');
    element.textContent = 'Word Art';
    element.style.fontFamily = 'Aptos, sans-serif';
    element.style.fontSize = '48px';

    try {
      applyTextEffects(element, {
        reflection: {
          blurRadius: 0.66,
          distance: 0,
          direction: 90,
          startAlpha: 0.53,
          startPosition: 0,
          endAlpha: 0.003,
          endPosition: 0.355,
          scaleX: 1,
          scaleY: -0.9,
        },
      });
    } finally {
      getContext.mockRestore();
    }

    expect(element.textContent).toBe('Word Art');
    expect(element.childElementCount).toBe(0);
    expect(element.classList.contains('superdoc-text-reflection')).toBe(true);
    expect(element.dataset.superdocReflectionText).toBe('Word Art');
    expect(element.style.getPropertyValue('--sd-text-reflection-transform')).toBe(
      'translate(0px, 86.298px) scale(1, -0.9)',
    );
    expect(element.style.getPropertyValue('--sd-text-reflection-mask')).toContain('to bottom');
    expect(element.style.getPropertyValue('--sd-text-reflection-blur')).toBe('0.66px');
  });

  it('fails closed for an unsupported gradient outline instead of inventing a stroke color', () => {
    const element = document.createElement('span');
    applyTextEffects(element, {
      outline: {
        width: 2,
        fill: {
          type: 'gradient',
          gradientType: 'linear',
          angle: 0,
          stops: [
            { position: 0, color: '#000000' },
            { position: 1, color: '#FFFFFF' },
          ],
        },
      },
    });

    expect(element.style.webkitTextStroke).toBeUndefined();
  });
});
