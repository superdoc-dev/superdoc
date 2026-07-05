/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { ShapeGroupView } from './ShapeGroupView.js';

function createView(kind, attrs = {}) {
  return new ShapeGroupView({
    node: {
      attrs: {
        width: 120,
        height: 80,
        shapes: [
          {
            shapeType: 'vectorShape',
            attrs: {
              kind,
              x: 0,
              y: 0,
              width: 120,
              height: 80,
              fillColor: null,
              strokeColor: '#123456',
              strokeWidth: 2,
              ...attrs,
            },
          },
        ],
      },
    },
    editor: { view: {} },
    getPos: vi.fn(() => 0),
    decorations: [],
    innerDecorations: [],
    extension: {},
    htmlAttributes: {},
  });
}

describe('ShapeGroupView connector rendering', () => {
  it.each([
    ['bentConnector2', 'M 0 0 L 120 0 L 120 80'],
    ['bentConnector3', 'M 0 0 L 60 0 L 60 80 L 120 80'],
    ['bentConnector4', 'M 0 0 L 60 0 L 60 40 L 120 40 L 120 80'],
    ['bentConnector5', 'M 0 0 L 30 0 L 30 40 L 90 40 L 90 80 L 120 80'],
  ])('renders %s with non-degenerate path data', (kind, expectedPath) => {
    const view = createView(kind);
    const path = view.dom.querySelector('path');

    expect(path?.getAttribute('d')).toBe(expectedPath);
    expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it.each(['curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5'])(
    'renders %s without duplicate consecutive curve endpoints',
    (kind) => {
      const view = createView(kind);
      const path = view.dom.querySelector('path');

      expect(path?.getAttribute('d')).toBeTruthy();
      expect(path?.getAttribute('d')).not.toContain('60 40 60 40');
      expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    },
  );

  it('uses the shared viewBox padding strategy for connector strokes', () => {
    const view = createView('bentConnector4', { strokeWidth: 4 });
    const connectorSvg = view.dom.querySelector('g svg');
    const path = connectorSvg?.querySelector('path');

    expect(connectorSvg?.getAttribute('viewBox')).toBe('-2 -2 124 84');
    expect(path?.getAttribute('d')).toBe('M 0 0 L 60 0 L 60 40 L 120 40 L 120 80');
    expect(path?.hasAttribute('transform')).toBe(false);
  });
});

describe('ShapeGroupView picture fills', () => {
  it('renders vector child picture fills as SVG patterns', () => {
    const view = createView('rect', {
      fillColor: {
        type: 'picture',
        src: 'data:image/png;base64,group-picture',
      },
    });

    const filledShape = view.dom.querySelector('[fill^="url(#picture-fill-"]');
    const pattern = view.dom.querySelector('pattern');
    const image = view.dom.querySelector('pattern image');
    expect(filledShape?.getAttribute('fill')).toMatch(/^url\(#picture-fill-/);
    expect(pattern?.getAttribute('patternUnits')).toBe('objectBoundingBox');
    expect(image?.getAttribute('href')).toBe('data:image/png;base64,group-picture');
  });
});
