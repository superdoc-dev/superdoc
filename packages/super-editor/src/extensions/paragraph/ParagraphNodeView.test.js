// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParagraphNodeView } from './ParagraphNodeView.js';
import {
  calculateResolvedParagraphProperties,
  getResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { Attribute } from '@core/index.js';
import { resolveParagraphProperties, encodeCSSFromPPr } from '@converter/styles.js';
import { twipsToPixels } from '@converter/helpers.js';
import { calculateTabStyle } from '../tab/helpers/tabDecorations.js';
import { isList } from '@core/commands/list-helpers';

vi.mock('@core/index.js', () => ({
  Attribute: {
    getAttributesToRender: vi.fn().mockReturnValue({ class: 'paragraph', style: 'color: red;' }),
  },
}));

vi.mock('@converter/helpers.js', () => ({
  twipsToPixels: vi.fn().mockImplementation((value) => value / 20),
}));

vi.mock('../tab/helpers/tabDecorations.js', () => ({
  extractParagraphContext: vi.fn().mockReturnValue({ accumulatedTabWidth: 0 }),
  calculateTabStyle: vi.fn().mockReturnValue('width: 10px;'),
}));

vi.mock('@converter/styles.js', () => ({
  resolveRunProperties: vi.fn().mockReturnValue({ fontSize: '12pt' }),
  resolveParagraphProperties: vi.fn((_params, inlineProps) => inlineProps || {}),
  encodeCSSFromRPr: vi.fn().mockReturnValue({ 'font-size': '12pt' }),
  encodeCSSFromPPr: vi.fn().mockReturnValue({}),
}));

vi.mock('@core/commands/list-helpers', () => ({
  isList: vi.fn(),
}));

vi.mock('@helpers/index.js', () => ({
  findParentNodeClosestToPos: vi.fn().mockReturnValue(null),
}));

const createEditor = () => {
  const resolvedPos = {
    start: vi.fn().mockReturnValue(0),
    depth: 0,
    parent: {
      childCount: 1,
      child: vi.fn(),
    },
    index: vi.fn().mockReturnValue(0),
  };

  return {
    schema: {
      nodes: {
        tab: {
          create: vi.fn().mockReturnValue({}),
        },
      },
    },
    view: {},
    converter: {
      convertedXml: {},
      numbering: {},
      translatedNumbering: {},
      translatedLinkedStyles: {
        docDefaults: { runProperties: {}, paragraphProperties: {} },
        latentStyles: {},
        styles: {
          Normal: {
            styleId: 'Normal',
            type: 'paragraph',
            default: true,
            name: 'Normal',
            runProperties: {},
            paragraphProperties: {},
          },
        },
      },
    },
    state: {
      doc: {
        resolve: vi.fn().mockReturnValue(resolvedPos),
      },
    },
    helpers: {},
  };
};

const createNode = (overrides = {}) => ({
  type: { name: 'paragraph' },
  attrs: {
    paragraphProperties: {
      numberingProperties: {},
      runProperties: {},
      indent: { hanging: 720 },
    },
    listRendering: {
      suffix: 'tab',
      justification: 'left',
      markerText: '1.',
      path: [1],
    },
  },
  ...overrides,
});

describe('ParagraphNodeView', () => {
  /** @type {{ cancelAnimationFrame: ReturnType<typeof vi.fn>, requestAnimationFrame: ReturnType<typeof vi.fn> }} */
  const animationMocks = {
    cancelAnimationFrame: vi.fn(),
    requestAnimationFrame: vi.fn(),
  };
  const originalRAF = globalThis.requestAnimationFrame;
  const originalCAF = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.requestAnimationFrame = (cb) => {
      animationMocks.requestAnimationFrame(cb);
      cb();
      return 1;
    };
    globalThis.cancelAnimationFrame = animationMocks.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  const mountNodeView = (nodeOverrides = {}, options = {}) => {
    const node = createNode(nodeOverrides);
    const editor = createEditor();
    const getPos = vi.fn().mockReturnValue(0);
    const view = new ParagraphNodeView(node, editor, getPos, [], options.extensionAttrs || {});
    return { nodeView: view, node, editor, getPos };
  };

  it('creates list marker/separator on init when node is a list', () => {
    isList.mockReturnValue(true);
    const { nodeView } = mountNodeView();

    expect(nodeView.marker).toBeTruthy();
    expect(nodeView.marker.textContent).toBe('1.');
    expect(nodeView.separator).toBeTruthy();
    expect(nodeView.separator.className).toBe('sd-editor-tab');
    expect(Attribute.getAttributesToRender).toHaveBeenCalled();
  });

  it('removes list elements when node is not a list during update', () => {
    isList.mockReturnValue(true);
    const { nodeView } = mountNodeView({
      attrs: {
        paragraphProperties: {
          numberingProperties: {
            numId: 1,
            ilvl: 0,
          },
        },
        listRendering: {
          suffix: 'space',
          justification: 'left',
          markerText: '1.',
        },
      },
    });
    nodeView.marker = document.createElement('span');
    nodeView.separator = document.createElement('span');
    nodeView.dom.appendChild(nodeView.marker);
    nodeView.dom.appendChild(nodeView.separator);

    isList.mockReturnValue(false);
    const nextNode = createNode();
    const updated = nodeView.update(nextNode, []);

    expect(updated).toBe(true);
    expect(nodeView.marker).toBeNull();
    expect(nodeView.separator).toBeNull();
  });

  it('updates list rendering attributes and schedules animation', () => {
    isList.mockReturnValue(true);
    const baseAttrs = createNode().attrs;
    const { nodeView } = mountNodeView({ attrs: { ...baseAttrs } });
    const nextNode = createNode({
      attrs: {
        ...baseAttrs,
        listRendering: { ...baseAttrs.listRendering, suffix: 'space', justification: 'right', markerText: 'A.' },
      },
    });

    nodeView.update(nextNode, []);

    expect(animationMocks.requestAnimationFrame).toHaveBeenCalled();
    expect(nodeView.marker.textContent).toBe('A.');
    expect(nodeView.separator.textContent).toBe('\u00A0');
  });

  it('uses hanging indent width for right-justified tabs and skips tab helper', () => {
    isList.mockReturnValue(true);
    const attrs = {
      ...createNode().attrs,
      indent: { hanging: 720 },
      listRendering: { suffix: 'tab', justification: 'right', markerText: '1.' },
    };
    const { nodeView } = mountNodeView({ attrs });
    nodeView.marker.getBoundingClientRect = vi.fn().mockReturnValue({ width: 20 });

    expect(calculateTabStyle).not.toHaveBeenCalled();
    expect(twipsToPixels).toHaveBeenCalledWith(720);
    expect(nodeView.separator.style.cssText).toContain('width: 36');
  });

  it('falls back to tab helper for center justification', () => {
    isList.mockReturnValue(true);
    const newAttrs = {
      ...createNode().attrs,
      listRendering: { suffix: 'tab', justification: 'center', markerText: '1.' },
    };
    const { nodeView } = mountNodeView({});
    nodeView.marker.getBoundingClientRect = vi.fn().mockReturnValue({ width: 40 });
    nodeView.update({ ...nodeView.node, attrs: newAttrs }, []);

    expect(calculateTabStyle).toHaveBeenCalled();
    expect(nodeView.separator.style.cssText).toContain('margin-left: 20');
  });

  it('respects ignoreMutation rules for markers, separators, and style attribute', () => {
    isList.mockReturnValue(true);
    const { nodeView } = mountNodeView();
    const markerMutation = { target: nodeView.marker };
    const separatorMutation = { target: nodeView.separator };
    const styleMutation = { type: 'attributes', target: nodeView.dom, attributeName: 'style' };
    const otherMutation = { target: document.createElement('div') };

    expect(nodeView.ignoreMutation(markerMutation)).toBe(true);
    expect(nodeView.ignoreMutation(separatorMutation)).toBe(true);
    expect(nodeView.ignoreMutation(styleMutation)).toBe(true);
    expect(nodeView.ignoreMutation(otherMutation)).toBe(false);
  });

  it('destroys scheduled animations on destroy()', () => {
    isList.mockReturnValue(true);
    const { nodeView } = mountNodeView();
    nodeView.destroy();
    expect(animationMocks.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('caches resolved paragraph properties', () => {
    const node = createNode();
    const editor = createEditor();

    const first = calculateResolvedParagraphProperties(editor, node, {});
    const second = calculateResolvedParagraphProperties(editor, node, {});

    expect(first).toBe(second);
    expect(getResolvedParagraphProperties(node)).toBe(first);
  });

  it('applies resolved paragraph attributes and CSS to the DOM', () => {
    isList.mockReturnValue(true);
    const resolvedProps = {
      numberingProperties: { numId: 5, ilvl: 2 },
      framePr: { dropCap: 'drop' },
      styleId: 'Heading1',
    };
    resolveParagraphProperties.mockReturnValue(resolvedProps);
    encodeCSSFromPPr.mockReturnValue({ color: 'blue', marginTop: '10px' });

    const { nodeView } = mountNodeView({
      attrs: {
        paragraphProperties: resolvedProps,
        listRendering: { suffix: 'tab', justification: 'left', markerText: '1.' },
      },
    });

    expect(encodeCSSFromPPr).toHaveBeenCalledWith(resolvedProps, false, null);
    expect(nodeView.dom.getAttribute('data-num-id')).toBe('5');
    expect(nodeView.dom.getAttribute('data-level')).toBe('2');
    expect(nodeView.dom.classList.contains('sd-editor-dropcap')).toBe(true);
    expect(nodeView.dom.getAttribute('styleid')).toBe('Heading1');
    expect(nodeView.dom.style.color).toBe('blue');
    expect(nodeView.dom.style.marginTop).toBe('10px');
  });

  it('removes list-specific attributes when node is no longer a list', () => {
    isList.mockReturnValueOnce(true).mockReturnValue(false);
    resolveParagraphProperties
      .mockReturnValueOnce({ numberingProperties: { numId: 9, ilvl: 1 } })
      .mockReturnValueOnce({});

    const { nodeView } = mountNodeView();
    const nextNode = createNode({ attrs: { paragraphProperties: {}, listRendering: {} } });

    nodeView.update(nextNode, []);

    expect(nodeView.dom.getAttribute('data-num-id')).toBeNull();
    expect(nodeView.dom.getAttribute('data-level')).toBeNull();
    expect(nodeView.dom.classList.contains('sd-editor-dropcap')).toBe(false);
  });
});
