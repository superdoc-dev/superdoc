import { describe, it, expect, vi } from 'vitest';
import { translateContentBlock, translateVRectContentBlock } from './translate-content-block';
import { translator as alternateChoiceTranslator } from '@converter/v3/handlers/mc/altermateContent';
import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';
import { wrapTextInRun } from '@converter/exporter';

vi.mock('@converter/v3/handlers/mc/altermateContent');
vi.mock('@helpers/generateDocxRandomId');
vi.mock('@converter/exporter');

describe('translateContentBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wrapTextInRun.mockImplementation((content) => ({ name: 'w:r', elements: [content] }));
  });

  it('should use alternateChoiceTranslator when no vmlAttributes or horizontalRule', () => {
    const mockAlternateContent = { name: 'mc:AlternateContent' };
    alternateChoiceTranslator.decode.mockReturnValue(mockAlternateContent);

    const params = {
      node: {
        attrs: {},
      },
    };

    const result = translateContentBlock(params);

    expect(alternateChoiceTranslator.decode).toHaveBeenCalledWith(params);
    expect(wrapTextInRun).toHaveBeenCalledWith(mockAlternateContent);
  });

  it('should use translateVRectContentBlock when vmlAttributes present', () => {
    const params = {
      node: {
        attrs: {
          vmlAttributes: { hr: 't' },
        },
      },
    };

    generateRandomSigned32BitIntStrId.mockReturnValue('12345678');

    const result = translateContentBlock(params);

    expect(alternateChoiceTranslator.decode).not.toHaveBeenCalled();
    expect(result.elements[0].name).toBe('w:pict');
  });

  it('should use translateVRectContentBlock when horizontalRule is true', () => {
    const params = {
      node: {
        attrs: {
          horizontalRule: true,
        },
      },
    };

    generateRandomSigned32BitIntStrId.mockReturnValue('12345678');

    const result = translateContentBlock(params);

    expect(alternateChoiceTranslator.decode).not.toHaveBeenCalled();
    expect(result.elements[0].name).toBe('w:pict');
  });
});

describe('translateVRectContentBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateRandomSigned32BitIntStrId.mockReturnValue('12345678');
    wrapTextInRun.mockImplementation((content) => ({ name: 'w:r', elements: [content] }));
  });

  it('should create v:rect with basic attributes', () => {
    const params = {
      node: {
        attrs: {
          attributes: { id: '_x0000_i1025' },
          style: 'width:100pt;height:1.5pt',
        },
      },
    };

    const result = translateVRectContentBlock(params);
    const pict = result.elements[0];
    const rect = pict.elements[0];

    expect(rect).toEqual({
      name: 'v:rect',
      attributes: {
        id: '_x0000_i1025',
        style: 'width:100pt;height:1.5pt',
      },
    });
  });

  it('should add fillcolor when background is present', () => {
    const params = {
      node: {
        attrs: {
          background: '#4472C4',
        },
      },
    };

    const result = translateVRectContentBlock(params);
    const rect = result.elements[0].elements[0];

    expect(rect.attributes.fillcolor).toBe('#4472C4');
  });

  it('should add vmlAttributes to rect', () => {
    const params = {
      node: {
        attrs: {
          vmlAttributes: {
            hralign: 'center',
            hrstd: 't',
            hr: 't',
            stroked: 'f',
          },
        },
      },
    };

    const result = translateVRectContentBlock(params);
    const rect = result.elements[0].elements[0];

    expect(rect.attributes).toMatchObject({
      'o:hralign': 'center',
      'o:hrstd': 't',
      'o:hr': 't',
      stroked: 'f',
    });
  });

  it('should generate random id when not provided', () => {
    const params = {
      node: {
        attrs: {},
      },
    };

    const result = translateVRectContentBlock(params);
    const rect = result.elements[0].elements[0];

    expect(rect.attributes.id).toMatch(/^_x0000_i\d+$/);
  });

  it('should merge additional attributes without overwriting existing ones', () => {
    const params = {
      node: {
        attrs: {
          attributes: {
            id: 'custom-id',
            'o:button': 't',
            fillcolor: 'should-not-override',
          },
          background: '#FF0000',
        },
      },
    };

    const result = translateVRectContentBlock(params);
    const rect = result.elements[0].elements[0];

    expect(rect.attributes.id).toBe('custom-id');
    expect(rect.attributes.fillcolor).toBe('#FF0000');
    expect(rect.attributes['o:button']).toBe('t');
  });

  it('should wrap rect in pict with anchorId', () => {
    const params = {
      node: {
        attrs: {},
      },
    };

    const result = translateVRectContentBlock(params);
    const pict = result.elements[0];

    expect(pict.name).toBe('w:pict');
    expect(pict.attributes['w14:anchorId']).toBe('12345678');
    expect(generateRandomSigned32BitIntStrId).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VML fallback synthesis: horizontalRule nodes without legacy VML metadata
// (created via insertHorizontalRule or parsed from <hr> tags).
// ---------------------------------------------------------------------------
describe('translateVRectContentBlock - VML synthesis for new HRs', () => {
  /** Helper: build params matching createDefaultHorizontalRuleAttrs() output. */
  const buildNewHRParams = (overrides = {}) => ({
    node: {
      attrs: {
        horizontalRule: true,
        size: { width: '100%', height: 2 },
        background: '#e5e7eb',
        ...overrides,
      },
    },
  });

  /** Helper: extract the v:rect attributes from the translated result. */
  const getRectAttrs = (result) => result.elements[0].elements[0].attributes;

  beforeEach(() => {
    vi.clearAllMocks();
    generateRandomSigned32BitIntStrId.mockReturnValue('12345678');
    wrapTextInRun.mockImplementation((content) => ({ name: 'w:r', elements: [content] }));
  });

  it('should synthesize VML HR flags when vmlAttributes is absent', () => {
    const rectAttrs = getRectAttrs(translateVRectContentBlock(buildNewHRParams()));

    expect(rectAttrs['o:hr']).toBe('t');
    expect(rectAttrs['o:hrstd']).toBe('t');
    expect(rectAttrs['o:hralign']).toBe('center');
    expect(rectAttrs.stroked).toBe('f');
  });

  it('should synthesize VML style from size for full-width HR', () => {
    const rectAttrs = getRectAttrs(translateVRectContentBlock(buildNewHRParams()));

    // width: 100% -> nominal 468pt, height: 2px -> 1.5pt
    expect(rectAttrs.style).toBe('width:468pt;height:1.5pt');
  });

  it('should synthesize VML style from size for fixed-width HR', () => {
    const params = buildNewHRParams({ size: { width: 200, height: 3 } });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    // 200px / 1.33 ~= 150.4pt, 3px / 1.33 ~= 2.3pt
    expect(rectAttrs.style).toBe('width:150.4pt;height:2.3pt');
  });

  it('should synthesize VML style from percentage width without NaN values', () => {
    const params = buildNewHRParams({ size: { width: '50%', height: 2 } });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    expect(rectAttrs.style).toBe('width:234pt;height:1.5pt');
    expect(rectAttrs.style).not.toContain('NaN');
  });

  it('should synthesize VML style from px strings without NaN values', () => {
    const params = buildNewHRParams({ size: { width: '200px', height: '3px' } });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    expect(rectAttrs.style).toBe('width:150.4pt;height:2.3pt');
    expect(rectAttrs.style).not.toContain('NaN');
  });

  it('should omit invalid style dimensions instead of emitting NaNpt', () => {
    const params = buildNewHRParams({ size: { width: 'auto', height: 2 } });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    expect(rectAttrs.style).toBe('height:1.5pt');
    expect(rectAttrs.style).not.toContain('NaN');
  });

  it('should set fillcolor from background', () => {
    const rectAttrs = getRectAttrs(translateVRectContentBlock(buildNewHRParams()));

    expect(rectAttrs.fillcolor).toBe('#e5e7eb');
  });

  it('should synthesize missing HR flags when vmlAttributes is partial', () => {
    const params = buildNewHRParams({
      vmlAttributes: { hralign: 'left' },
    });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    expect(rectAttrs['o:hralign']).toBe('left');
    expect(rectAttrs['o:hr']).toBe('t');
    expect(rectAttrs['o:hrstd']).toBe('t');
    expect(rectAttrs.stroked).toBe('f');
  });

  it('should preserve explicit vmlAttributes over synthesis', () => {
    const params = buildNewHRParams({
      vmlAttributes: { hr: 't', hrstd: 't', hralign: 'left', stroked: 'f' },
    });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    // Uses the explicit value, not the synthesized default
    expect(rectAttrs['o:hralign']).toBe('left');
  });

  it('should preserve explicit style over synthesis', () => {
    const params = buildNewHRParams({ style: 'width:300pt;height:2pt' });
    const rectAttrs = getRectAttrs(translateVRectContentBlock(params));

    expect(rectAttrs.style).toBe('width:300pt;height:2pt');
  });

  it('should produce a complete exportable v:rect for a default HR', () => {
    const rectAttrs = getRectAttrs(translateVRectContentBlock(buildNewHRParams()));

    // Every attribute Word needs to render an HR should be present
    expect(rectAttrs).toMatchObject({
      style: 'width:468pt;height:1.5pt',
      fillcolor: '#e5e7eb',
      'o:hr': 't',
      'o:hrstd': 't',
      'o:hralign': 'center',
      stroked: 'f',
    });
    expect(rectAttrs.id).toBeDefined();
  });
});
