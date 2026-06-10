import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getThemeColor,
  getPresetColor,
  applyColorModifier,
  extractStrokeWidth,
  extractStrokeColor,
  extractFillColor,
  extractLineEnds,
  extractShapeEffects,
  extractCustomGeometry,
} from './vector-shape-helpers.js';
import { emuToPixels, rotToDegrees } from '@converter/helpers.js';

vi.mock('@converter/helpers.js', () => ({
  emuToPixels: vi.fn(),
  rotToDegrees: vi.fn(),
}));

describe('getThemeColor', () => {
  it('returns correct color for known theme names', () => {
    expect(getThemeColor('accent1')).toBe('#5b9bd5');
    expect(getThemeColor('accent6')).toBe('#70ad47');
  });

  it('returns default black for unknown theme name', () => {
    expect(getThemeColor('unknown')).toBe('#000000');
  });
});

describe('getPresetColor', () => {
  it('returns correct color for common preset color names', () => {
    expect(getPresetColor('black')).toBe('#000000');
    expect(getPresetColor('white')).toBe('#ffffff');
    expect(getPresetColor('red')).toBe('#ff0000');
    expect(getPresetColor('blue')).toBe('#0000ff');
    expect(getPresetColor('green')).toBe('#008000');
    expect(getPresetColor('yellow')).toBe('#ffff00');
  });

  it('returns null for unknown preset color name', () => {
    expect(getPresetColor('unknownColor')).toBeNull();
  });
});

describe('applyColorModifier', () => {
  it('applies shade modifier', () => {
    expect(applyColorModifier('#70ad47', 'shade', '50000')).toBe('#385724');
  });

  it('applies tint modifier', () => {
    expect(applyColorModifier('#70ad47', 'tint', '50000')).toBe('#b8d6a3');
  });

  it('tint modifier at 100% produces white', () => {
    expect(applyColorModifier('#70ad47', 'tint', '100000')).toBe('#ffffff');
  });

  it('applies lumMod modifier', () => {
    expect(applyColorModifier('#4472c4', 'lumMod', '60000')).toBe('#294476');
  });

  it('applies lumOff modifier', () => {
    expect(applyColorModifier('#294476', 'lumOff', '40000')).toBe('#8faadc');
  });

  it('returns original color for unknown modifier', () => {
    expect(applyColorModifier('#70ad47', 'unknown', '50000')).toBe('#70ad47');
  });
});

describe('extractStrokeWidth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => parseInt(emu, 10) / 12700);
  });

  it('extracts stroke width from a:ln element', () => {
    const spPr = {
      elements: [{ name: 'a:ln', attributes: { w: '25400' } }],
    };

    expect(extractStrokeWidth(spPr)).toBe(2);
  });

  it('returns default 1 when no a:ln element found', () => {
    expect(extractStrokeWidth({ elements: [] })).toBe(1);
    expect(extractStrokeWidth(null)).toBe(1);
  });

  it('returns default 1 when a:ln has no w attribute', () => {
    const spPr = {
      elements: [{ name: 'a:ln', attributes: {} }],
    };
    expect(extractStrokeWidth(spPr)).toBe(1);
  });

  it('returns hairline width (0.75) for w="0"', () => {
    // In OOXML, w="0" means hairline (thinnest visible stroke), not invisible
    const spPr = {
      elements: [{ name: 'a:ln', attributes: { w: '0' } }],
    };
    expect(extractStrokeWidth(spPr)).toBe(0.75);
  });

  it('returns hairline width (0.75) for w=0 (numeric)', () => {
    const spPr = {
      elements: [{ name: 'a:ln', attributes: { w: 0 } }],
    };
    expect(extractStrokeWidth(spPr)).toBe(0.75);
  });
});

describe('extractStrokeColor', () => {
  it('returns null when noFill is present', () => {
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          elements: [{ name: 'a:noFill' }],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBeNull();
  });

  it('extracts theme color with modifiers from spPr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          elements: [
            {
              name: 'a:solidFill',
              elements: [
                {
                  name: 'a:schemeClr',
                  attributes: { val: 'accent6' },
                  elements: [{ name: 'a:shade', attributes: { val: '75000' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBe('#548235');
  });

  it('extracts RGB color from srgbClr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          elements: [
            {
              name: 'a:solidFill',
              elements: [{ name: 'a:srgbClr', attributes: { val: 'ff0000' } }],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBe('#ff0000');
  });

  it('extracts preset color from prstClr (e.g., black)', () => {
    // Text boxes commonly use <a:prstClr val="black"/> for stroke
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          attributes: { w: '0' },
          elements: [
            {
              name: 'a:solidFill',
              elements: [{ name: 'a:prstClr', attributes: { val: 'black' } }],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBe('#000000');
  });

  it('extracts preset color with modifiers from prstClr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          elements: [
            {
              name: 'a:solidFill',
              elements: [
                {
                  name: 'a:prstClr',
                  attributes: { val: 'white' },
                  elements: [{ name: 'a:shade', attributes: { val: '50000' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBe('#808080');
  });

  it('applies shade modifier to srgbClr stroke color', () => {
    const spPr = {
      elements: [
        {
          name: 'a:ln',
          elements: [
            {
              name: 'a:solidFill',
              elements: [
                {
                  name: 'a:srgbClr',
                  attributes: { val: 'FFFFFF' },
                  elements: [{ name: 'a:shade', attributes: { val: '50000' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, null)).toBe('#808080');
  });

  it('falls back to style when spPr has no stroke', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:lnRef',
          elements: [{ name: 'a:schemeClr', attributes: { val: 'accent1' } }],
        },
      ],
    };

    expect(extractStrokeColor(spPr, style)).toBe('#5b9bd5');
  });

  it('returns null (no stroke) when no stroke in spPr and no style provided', () => {
    // Per ECMA-376: when no stroke is specified and no style exists, shape should have no stroke
    expect(extractStrokeColor({ elements: [] }, null)).toBeNull();
  });

  it('returns null (no stroke) when no stroke in spPr and style has no lnRef', () => {
    const spPr = { elements: [] };
    const style = { elements: [] };
    expect(extractStrokeColor(spPr, style)).toBeNull();
  });

  it('returns null (no stroke) when lnRef idx is 0', () => {
    // Per OOXML spec, lnRef idx="0" means "no stroke"
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:lnRef',
          attributes: { idx: '0' },
          elements: [],
        },
      ],
    };
    expect(extractStrokeColor(spPr, style)).toBeNull();
  });

  it('returns null (no stroke) when lnRef has no schemeClr', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:lnRef',
          attributes: { idx: '1' },
          elements: [], // No schemeClr
        },
      ],
    };
    expect(extractStrokeColor(spPr, style)).toBeNull();
  });

  it('falls back to style lnRef with srgbClr', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:lnRef',
          attributes: { idx: '1' },
          elements: [{ name: 'a:srgbClr', attributes: { val: '123456' } }],
        },
      ],
    };

    expect(extractStrokeColor(spPr, style)).toBe('#123456');
  });

  it('falls back to style lnRef with prstClr and modifiers', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:lnRef',
          attributes: { idx: '1' },
          elements: [
            {
              name: 'a:prstClr',
              attributes: { val: 'white' },
              elements: [{ name: 'a:shade', attributes: { val: '50000' } }],
            },
          ],
        },
      ],
    };

    expect(extractStrokeColor(spPr, style)).toBe('#808080');
  });
});

describe('extractFillColor', () => {
  it('returns null when noFill is present', () => {
    const spPr = { elements: [{ name: 'a:noFill' }] };
    expect(extractFillColor(spPr, null)).toBeNull();
  });

  it('extracts theme color with modifiers from spPr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:solidFill',
          elements: [
            {
              name: 'a:schemeClr',
              attributes: { val: 'accent5' },
              elements: [
                { name: 'a:lumMod', attributes: { val: '60000' } },
                { name: 'a:lumOff', attributes: { val: '40000' } },
              ],
            },
          ],
        },
      ],
    };

    expect(extractFillColor(spPr, null)).toBe('#8faadc');
  });

  it('extracts RGB color from srgbClr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:solidFill',
          elements: [{ name: 'a:srgbClr', attributes: { val: '00ff00' } }],
        },
      ],
    };

    expect(extractFillColor(spPr, null)).toBe('#00ff00');
  });

  it('extracts preset color from prstClr (e.g., white)', () => {
    const spPr = {
      elements: [
        {
          name: 'a:solidFill',
          elements: [{ name: 'a:prstClr', attributes: { val: 'white' } }],
        },
      ],
    };

    expect(extractFillColor(spPr, null)).toBe('#ffffff');
  });

  it('extracts preset color with alpha from prstClr', () => {
    const spPr = {
      elements: [
        {
          name: 'a:solidFill',
          elements: [
            {
              name: 'a:prstClr',
              attributes: { val: 'red' },
              elements: [{ name: 'a:alpha', attributes: { val: '50000' } }],
            },
          ],
        },
      ],
    };

    expect(extractFillColor(spPr, null)).toEqual({
      type: 'solidWithAlpha',
      color: '#ff0000',
      alpha: 0.5,
    });
  });

  it('returns placeholder for unsupported fills', () => {
    // Gradient fills now return a gradient object
    const gradientResult = extractFillColor({ elements: [{ name: 'a:gradFill' }] }, null);
    expect(gradientResult).toEqual({
      type: 'gradient',
      stops: [],
      angle: 0,
      gradientType: 'linear',
    });

    // Image fills still return placeholder color
    expect(extractFillColor({ elements: [{ name: 'a:blipFill' }] }, null)).toBe('#cccccc');
  });

  it('falls back to style when spPr has no fill', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:fillRef',
          elements: [{ name: 'a:schemeClr', attributes: { val: 'accent6' } }],
        },
      ],
    };

    expect(extractFillColor(spPr, style)).toBe('#70ad47');
  });

  it('returns null (transparent) when no fill in spPr and no style provided', () => {
    // Per ECMA-376: when no fill is specified and no style exists, shape should be transparent
    expect(extractFillColor({ elements: [] }, null)).toBeNull();
  });

  it('returns null (transparent) when no fill in spPr and style has no fillRef', () => {
    const spPr = { elements: [] };
    const style = { elements: [] };
    expect(extractFillColor(spPr, style)).toBeNull();
  });

  it('returns null (transparent) when fillRef idx is 0', () => {
    // Per OOXML spec, fillRef idx="0" means "no fill"
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:fillRef',
          attributes: { idx: '0' },
          elements: [],
        },
      ],
    };
    expect(extractFillColor(spPr, style)).toBeNull();
  });

  it('returns null (transparent) when fillRef has no schemeClr', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:fillRef',
          attributes: { idx: '1' },
          elements: [], // No schemeClr
        },
      ],
    };
    expect(extractFillColor(spPr, style)).toBeNull();
  });

  it('falls back to style fillRef with srgbClr and alpha', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:fillRef',
          attributes: { idx: '1' },
          elements: [
            {
              name: 'a:srgbClr',
              attributes: { val: '00ff00' },
              elements: [{ name: 'a:alpha', attributes: { val: '50000' } }],
            },
          ],
        },
      ],
    };

    expect(extractFillColor(spPr, style)).toEqual({
      type: 'solidWithAlpha',
      color: '#00ff00',
      alpha: 0.5,
    });
  });

  it('falls back to style fillRef with prstClr and modifiers', () => {
    const spPr = { elements: [] };
    const style = {
      elements: [
        {
          name: 'a:fillRef',
          attributes: { idx: '1' },
          elements: [
            {
              name: 'a:prstClr',
              attributes: { val: 'white' },
              elements: [{ name: 'a:shade', attributes: { val: '50000' } }],
            },
          ],
        },
      ],
    };

    expect(extractFillColor(spPr, style)).toBe('#808080');
  });
});

describe('extractShapeEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => Number(emu) / 9525);
    rotToDegrees.mockImplementation((rot) => Number(rot) / 60000);
  });

  it('returns null when effectLst is missing', () => {
    expect(extractShapeEffects({ elements: [] })).toBeNull();
  });

  it('returns null when outerShdw is missing', () => {
    const spPr = {
      elements: [{ name: 'a:effectLst', elements: [] }],
    };

    expect(extractShapeEffects(spPr)).toBeNull();
  });

  it('parses fixture-like scheme color outer shadow', () => {
    const spPr = {
      elements: [
        {
          name: 'a:effectLst',
          elements: [
            {
              name: 'a:outerShdw',
              attributes: { blurRad: '63500', dist: '63500', dir: '2700000', algn: 'tl', rotWithShape: '0' },
              elements: [
                {
                  name: 'a:schemeClr',
                  attributes: { val: 'bg1' },
                  elements: [
                    { name: 'a:lumMod', attributes: { val: '65000' } },
                    { name: 'a:alpha', attributes: { val: '40000' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = extractShapeEffects(spPr);

    expect(result?.outerShadow).toEqual(
      expect.objectContaining({
        type: 'outerShadow',
        direction: 45,
        color: '#a6a6a6',
        opacity: 0.4,
      }),
    );
    expect(result?.outerShadow.blurRadius).toBeCloseTo(6.6667, 4);
    expect(result?.outerShadow.distance).toBeCloseTo(6.6667, 4);
  });

  it('parses srgbClr outer shadows', () => {
    const spPr = {
      elements: [
        {
          name: 'a:effectLst',
          elements: [
            {
              name: 'a:outerShdw',
              attributes: { blurRad: '9525', dist: '19050', dir: '5400000' },
              elements: [{ name: 'a:srgbClr', attributes: { val: '112233' } }],
            },
          ],
        },
      ],
    };

    expect(extractShapeEffects(spPr)?.outerShadow).toEqual({
      type: 'outerShadow',
      blurRadius: 1,
      distance: 2,
      direction: 90,
      color: '#112233',
      opacity: 1,
    });
  });

  it('omits unused outer shadow transform fields', () => {
    const spPr = {
      elements: [
        {
          name: 'a:effectLst',
          elements: [
            {
              name: 'a:outerShdw',
              attributes: { algn: 'tl', rotWithShape: '1', sx: '120000', sy: '80000', kx: '180000', ky: '240000' },
              elements: [{ name: 'a:srgbClr', attributes: { val: '000000' } }],
            },
          ],
        },
      ],
    };

    expect(extractShapeEffects(spPr)?.outerShadow).toEqual({
      type: 'outerShadow',
      blurRadius: 0,
      distance: 0,
      direction: 0,
      color: '#000000',
      opacity: 1,
    });
  });
});

describe('namespace prefix tolerance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emuToPixels.mockImplementation((emu) => parseInt(emu, 10) / 12700);
    rotToDegrees.mockImplementation((rot) => parseInt(rot, 10) / 60000);
  });

  // Recursively rewrite every DrawingML node prefix from `a:` to the given replacement.
  // Mirrors the helper used in encode-image-node-helpers.test.js.
  const renameDrawingMlPrefix = (node, prefix) => {
    if (!node || typeof node !== 'object') return node;
    if (typeof node.name === 'string' && node.name.startsWith('a:')) {
      node.name = `${prefix}:${node.name.slice(2)}`;
    }
    if (Array.isArray(node.elements)) {
      node.elements.forEach((child) => renameDrawingMlPrefix(child, prefix));
    }
    return node;
  };

  it('extractStrokeWidth resolves a:ln when re-prefixed to ns6:', () => {
    const spPr = renameDrawingMlPrefix({ elements: [{ name: 'a:ln', attributes: { w: '25400' } }] }, 'ns6');

    expect(extractStrokeWidth(spPr)).toBe(2);
  });

  it('extractStrokeColor resolves the full a:ln/a:solidFill/a:srgbClr chain when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:ln',
            elements: [
              {
                name: 'a:solidFill',
                elements: [{ name: 'a:srgbClr', attributes: { val: 'ff0000' } }],
              },
            ],
          },
        ],
      },
      'ns6',
    );

    expect(extractStrokeColor(spPr, null)).toBe('#ff0000');
  });

  it('extractStrokeColor honours a:noFill when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:ln',
            elements: [{ name: 'a:noFill' }],
          },
        ],
      },
      'ns6',
    );

    expect(extractStrokeColor(spPr, null)).toBeNull();
  });

  it('extractFillColor resolves a:solidFill schemeClr with modifiers when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:solidFill',
            elements: [
              {
                name: 'a:schemeClr',
                attributes: { val: 'accent6' },
                elements: [{ name: 'a:shade', attributes: { val: '75000' } }],
              },
            ],
          },
        ],
      },
      'ns6',
    );

    expect(extractFillColor(spPr, null)).toBe('#548235');
  });

  it('extractLineEnds resolves a:ln/a:headEnd/a:tailEnd when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:ln',
            elements: [
              { name: 'a:headEnd', attributes: { type: 'triangle', w: 'med', len: 'med' } },
              { name: 'a:tailEnd', attributes: { type: 'arrow', w: 'lg', len: 'lg' } },
            ],
          },
        ],
      },
      'ns6',
    );

    const result = extractLineEnds(spPr);
    expect(result).toEqual({
      head: { type: 'triangle', width: 'med', length: 'med' },
      tail: { type: 'arrow', width: 'lg', length: 'lg' },
    });
  });

  it('extractCustomGeometry resolves a:custGeom/a:pathLst/a:path tree when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:custGeom',
            elements: [
              {
                name: 'a:pathLst',
                elements: [
                  {
                    name: 'a:path',
                    attributes: { w: '100', h: '100' },
                    elements: [
                      {
                        name: 'a:moveTo',
                        elements: [{ name: 'a:pt', attributes: { x: '0', y: '0' } }],
                      },
                      {
                        name: 'a:lnTo',
                        elements: [{ name: 'a:pt', attributes: { x: '100', y: '100' } }],
                      },
                      { name: 'a:close' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      'ns6',
    );

    const result = extractCustomGeometry(spPr);
    expect(result).not.toBeNull();
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatchObject({ w: 100, h: 100 });
    expect(result.paths[0].d).toBe('M 0 0 L 100 100 Z');
  });

  it('extractFillColor extracts gradFill stops and angle when re-prefixed', () => {
    const spPr = renameDrawingMlPrefix(
      {
        elements: [
          {
            name: 'a:gradFill',
            elements: [
              {
                name: 'a:gsLst',
                elements: [
                  {
                    name: 'a:gs',
                    attributes: { pos: '0' },
                    elements: [{ name: 'a:srgbClr', attributes: { val: 'ff0000' } }],
                  },
                  {
                    name: 'a:gs',
                    attributes: { pos: '100000' },
                    elements: [
                      {
                        name: 'a:srgbClr',
                        attributes: { val: '0000ff' },
                        elements: [{ name: 'a:alpha', attributes: { val: '50000' } }],
                      },
                    ],
                  },
                ],
              },
              { name: 'a:lin', attributes: { ang: '5400000' } }, // 90deg
            ],
          },
        ],
      },
      'ns6',
    );

    const fill = extractFillColor(spPr, null);
    expect(fill).toMatchObject({
      gradientType: 'linear',
      angle: 90,
      stops: [
        { position: 0, color: '#ff0000', alpha: 1 },
        { position: 1, color: '#0000ff', alpha: 0.5 },
      ],
    });
  });
});
