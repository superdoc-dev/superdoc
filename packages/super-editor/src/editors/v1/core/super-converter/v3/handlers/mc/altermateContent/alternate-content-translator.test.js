import { describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_ALTERNATE_CONTENT_REQUIRES,
  config,
  selectAlternateContentElements,
  translator,
} from './alternate-content-translator.js';
import { NodeTranslator } from '../../../node-translator/index.js';

describe('mc:AltermateContent translator', () => {
  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('mc:AlternateContent');
    expect(config.sdNodeOrKeyName).toEqual([]);
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
    expect(config.attributes).toEqual([]);
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('mc:AlternateContent');
    expect(translator.sdNodeOrKeyName).toEqual([]);
  });

  describe('encode', () => {
    it('returns null if extraParams.node is missing', () => {
      const params = {
        nodeListHandler: { handler: vi.fn() },
        extraParams: {},
      };
      const result = translator.encode(params);
      expect(result).toBeNull();
    });

    it('returns null when no usable choice or fallback elements exist', () => {
      const params = {
        nodeListHandler: { handler: vi.fn() },
        extraParams: {
          node: {
            type: 'mc:AlternateContent',
            elements: [{ name: 'mc:Choice', attributes: { Requires: 'unsupported' } }],
          },
        },
      };
      const result = translator.encode(params);
      expect(result).toBeNull();
    });

    it('calls nodeListHandler with the contents of mc:Choice and updated path', () => {
      const handlerSpy = vi.fn().mockReturnValue(['handled']);
      const params = {
        nodeListHandler: { handler: handlerSpy },
        path: [],
        extraParams: {
          node: {
            type: 'mc:AlternateContent',
            elements: [
              {
                name: 'mc:Choice',
                attributes: { Requires: 'wps' },
                elements: [{ name: 'w:drawing' }],
              },
            ],
          },
        },
      };

      const result = translator.encode(params);
      expect(handlerSpy).toHaveBeenCalledWith({
        ...params,
        nodes: [{ name: 'w:drawing' }],
        path: [params.extraParams.node, params.extraParams.node.elements[0]],
      });
      expect(result).toEqual(['handled']);
    });

    it('falls back to mc:Fallback when no supported choice exists', () => {
      const handlerSpy = vi.fn().mockReturnValue(['fallback']);
      const fallbackNode = { name: 'mc:Fallback', elements: [{ name: 'w:p' }] };
      const params = {
        nodeListHandler: { handler: handlerSpy },
        path: [],
        extraParams: {
          node: {
            type: 'mc:AlternateContent',
            elements: [
              { name: 'mc:Choice', attributes: { Requires: 'unsupported' }, elements: [{ name: 'w:r' }] },
              fallbackNode,
            ],
          },
        },
      };

      const result = translator.encode(params);
      expect(handlerSpy).toHaveBeenCalledWith({
        ...params,
        nodes: fallbackNode.elements,
        path: [params.extraParams.node, fallbackNode],
      });
      expect(result).toEqual(['fallback']);
    });

    it('falls back to the first choice when neither supported choice nor fallback exists', () => {
      const handlerSpy = vi.fn().mockReturnValue(['choice']);
      const choiceNode = { name: 'mc:Choice', attributes: { Requires: 'unsupported' }, elements: [{ name: 'w:r' }] };
      const params = {
        nodeListHandler: { handler: handlerSpy },
        path: [],
        extraParams: {
          node: {
            type: 'mc:AlternateContent',
            elements: [choiceNode],
          },
        },
      };

      const result = translator.encode(params);
      expect(handlerSpy).toHaveBeenCalledWith({
        ...params,
        nodes: choiceNode.elements,
        path: [params.extraParams.node, choiceNode],
      });
      expect(result).toEqual(['choice']);
    });
  });

  describe('decode', () => {
    it('returns mc:AlternateContent structure with w:drawing inside mc:Choice', () => {
      const params = {
        node: {
          attrs: {
            drawingContent: { elements: [{ name: 'wp:inline' }] },
          },
        },
      };

      const result = translator.decode(params);

      expect(result).toEqual({
        name: 'mc:AlternateContent',
        elements: [
          {
            name: 'mc:Choice',
            attributes: { Requires: 'wps' },
            elements: [
              {
                name: 'w:drawing',
                elements: [{ name: 'wp:inline' }],
              },
            ],
          },
        ],
      });
    });

    it('handles empty drawingContent gracefully', () => {
      const params = { node: { attrs: {} } };
      const result = translator.decode(params);

      expect(result).toEqual({
        name: 'mc:AlternateContent',
        elements: [
          {
            name: 'mc:Choice',
            attributes: { Requires: 'wps' },
            elements: [
              {
                name: 'w:drawing',
                elements: [],
              },
            ],
          },
        ],
      });
    });
  });
});

describe('selectAlternateContentElements', () => {
  it('includes modern w16 namespaces in the support set', () => {
    expect(SUPPORTED_ALTERNATE_CONTENT_REQUIRES.has('w16')).toBe(true);
    expect(SUPPORTED_ALTERNATE_CONTENT_REQUIRES.has('w16cex')).toBe(true);
    expect(SUPPORTED_ALTERNATE_CONTENT_REQUIRES.has('w16sdtfl')).toBe(true);
  });

  it('selects supported choice when namespace matches set', () => {
    const choice = {
      name: 'mc:Choice',
      attributes: { Requires: 'foo wps bar' },
      elements: [{ name: 'w:r' }],
    };
    const node = {
      elements: [choice, { name: 'mc:Fallback', elements: [{ name: 'w:p' }] }],
    };

    const { branch, elements } = selectAlternateContentElements(node);
    expect(branch).toBe(choice);
    expect(elements).toEqual(choice.elements);
  });

  it('returns fallback when no choice is supported', () => {
    const fallback = { name: 'mc:Fallback', elements: [{ name: 'w:p' }] };
    const node = {
      elements: [{ name: 'mc:Choice', attributes: { Requires: 'unsupported' }, elements: [{ name: 'w:r' }] }, fallback],
    };

    const { branch, elements } = selectAlternateContentElements(node);
    expect(branch).toBe(fallback);
    expect(elements).toEqual(fallback.elements);
  });

  it('returns null elements when nothing is selectable', () => {
    const node = { elements: [{ name: 'mc:Choice', attributes: {}, elements: null }] };
    const { branch, elements } = selectAlternateContentElements(node);
    expect(branch).toBe(node.elements[0]);
    expect(elements).toBeNull();
  });
});
