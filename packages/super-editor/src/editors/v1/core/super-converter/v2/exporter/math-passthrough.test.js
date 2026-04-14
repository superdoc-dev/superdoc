import { describe, it, expect } from 'vitest';
import { translatePassthroughNode } from '../../exporter.js';

// Math nodes (mathInline / mathBlock) serialize back to OOXML via a generic
// passthrough that deep-copies node.attrs.originalXml. These tests lock in
// that behavior so m:sPre (and other math objects) round-trip on export.

describe('math export passthrough', () => {
  it('deep-copies m:sPre originalXml with child order preserved', () => {
    // Spec-correct child order per ECMA-376 §22.1.2.99: (m:sPrePr, m:sub, m:sup, m:e)
    const originalXml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sPre',
          elements: [
            { name: 'm:sPrePr', elements: [{ name: 'm:ctrlPr' }] },
            {
              name: 'm:sub',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] }],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
            },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'A' }] }] }],
            },
          ],
        },
      ],
    };

    const node = { attrs: { originalXml } };
    const result = translatePassthroughNode({ node });

    expect(result).not.toBe(originalXml);
    expect(result.name).toBe('m:oMath');
    expect(result.elements[0].name).toBe('m:sPre');
    expect(result.elements[0].elements.map((e) => e.name)).toEqual(['m:sPrePr', 'm:sub', 'm:sup', 'm:e']);

    // Verify deep copy: mutating the result must not affect the source
    result.elements[0].elements[1].elements[0].elements[0].elements[0].text = 'MUTATED';
    expect(originalXml.elements[0].elements[1].elements[0].elements[0].elements[0].text).toBe('1');
  });

  it('passes through m:oMathPara wrapping m:sPre for display-mode export', () => {
    const originalXml = {
      name: 'm:oMathPara',
      elements: [
        {
          name: 'm:oMath',
          elements: [
            {
              name: 'm:sPre',
              elements: [
                { name: 'm:sPrePr', elements: [{ name: 'm:ctrlPr' }] },
                {
                  name: 'm:sub',
                  elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] }],
                },
                {
                  name: 'm:sup',
                  elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
                },
                {
                  name: 'm:e',
                  elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'Z' }] }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = translatePassthroughNode({ node: { attrs: { originalXml } } });

    expect(result.name).toBe('m:oMathPara');
    expect(result.elements[0].name).toBe('m:oMath');
    expect(result.elements[0].elements[0].name).toBe('m:sPre');
  });

  it('returns null when originalXml is missing', () => {
    expect(translatePassthroughNode({ node: { attrs: {} } })).toBeNull();
    expect(translatePassthroughNode({ node: {} })).toBeNull();
    expect(translatePassthroughNode({})).toBeNull();
  });
});
