/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { ShapeGroupView } from './ShapeGroupView.js';

function createView(kind) {
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
    ['bentConnector2', 'M 0 0 L 118 0 L 118 78'],
    ['bentConnector3', 'M 0 0 L 59 0 L 59 78 L 118 78'],
    ['bentConnector4', 'M 0 0 L 59 0 L 59 39 L 118 39 L 118 78'],
    ['bentConnector5', 'M 0 0 L 29.5 0 L 29.5 39 L 88.5 39 L 88.5 78 L 118 78'],
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
      expect(path?.getAttribute('d')).not.toContain('59 39 59 39');
      expect(path?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    },
  );
});
