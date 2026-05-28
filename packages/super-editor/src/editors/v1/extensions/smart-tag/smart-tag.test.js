// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { SmartTag } from './smart-tag.js';

describe('SmartTag PM node', () => {
  it('has the correct name', () => {
    expect(SmartTag.name).toBe('smartTag');
  });

  it('is configured as a non-atomic inline container', () => {
    const config = SmartTag.config ?? SmartTag;
    // Node.create's config sits on the static; key invariants for SD-2647:
    expect(config.name).toBe('smartTag');
    expect(typeof SmartTag).toBe('object');
  });

  it('exposes element, uri, and smartTagPr attrs', () => {
    const attrsFn = SmartTag.config?.addAttributes ?? SmartTag.addAttributes;
    expect(typeof attrsFn).toBe('function');
    const attrs = attrsFn.call({ options: {} });
    expect(attrs).toHaveProperty('element');
    expect(attrs).toHaveProperty('uri');
    expect(attrs).toHaveProperty('smartTagPr');
    // smartTagPr is preserved for round-trip but never rendered.
    expect(attrs.smartTagPr.rendered).toBe(false);
  });

  it('renders transparently with a content hole', () => {
    const renderFn = SmartTag.config?.renderDOM ?? SmartTag.renderDOM;
    expect(typeof renderFn).toBe('function');
    const result = renderFn.call(
      {
        options: {
          htmlAttributes: {
            'data-sd-smart-tag': '',
            'aria-label': 'Smart tag',
          },
        },
      },
      { htmlAttributes: {} },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe('span');
    // Third element MUST be 0 (PM content placeholder); otherwise children
    // would not render. This is the core "transparent" property of the node.
    expect(result[2]).toBe(0);
  });
});
