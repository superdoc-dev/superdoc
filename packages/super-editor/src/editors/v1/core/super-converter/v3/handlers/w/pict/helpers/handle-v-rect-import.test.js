import { describe, it, expect, vi } from 'vitest';
import { handleVRectImport } from './handle-v-rect-import';
import { parseInlineStyles } from './parse-inline-styles';

vi.mock('./parse-inline-styles');

describe('handleVRectImport', () => {
  const createPict = (rectAttributes = {}) => ({
    name: 'w:pict',
    elements: [
      {
        name: 'v:rect',
        attributes: rectAttributes,
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    parseInlineStyles.mockReturnValue({});
  });

  it('should create contentBlock with basic rect attributes', () => {
    const pict = createPict({
      id: '_x0000_i1025',
      fillcolor: '#4472C4',
    });

    const result = handleVRectImport({ pict });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('contentBlock');
    expect(result[0].attrs.attributes).toEqual({
      id: '_x0000_i1025',
      fillcolor: '#4472C4',
    });
    expect(result[0].attrs.background).toBe('#4472C4');
  });

  it('should parse style and extract dimensions', () => {
    parseInlineStyles.mockReturnValue({
      width: '100pt',
      height: '1.5pt',
    });

    const pict = createPict({
      style: 'width:100pt;height:1.5pt',
    });

    const result = handleVRectImport({ pict });

    expect(result).toHaveLength(1);
    expect(parseInlineStyles).toHaveBeenCalledWith('width:100pt;height:1.5pt');
    expect(result[0].attrs.size).toEqual({
      width: 133, // 100 * 1.33
      height: 2, // 1.5 * 1.33 rounded up
    });
    expect(result[0].attrs.style).toBe('width: 100pt;height: 1.5pt;');
  });

  it('should set width to 100% for full-page horizontal rules', () => {
    parseInlineStyles.mockReturnValue({
      width: '',
      height: '1.5pt',
    });

    const pict = createPict({
      'o:hr': 't',
      style: 'width:;height:1.5pt',
    });

    const result = handleVRectImport({ pict });

    expect(result).toHaveLength(1);
    expect(result[0].attrs.size.width).toBe('100%');
  });

  it('should extract VML attributes', () => {
    const pict = createPict({
      'o:hralign': 'center',
      'o:hrstd': 't',
      'o:hr': 't',
      stroked: 'f',
    });

    const result = handleVRectImport({ pict });

    expect(result).toHaveLength(1);
    expect(result[0].attrs.vmlAttributes).toEqual({
      hralign: 'center',
      hrstd: 't',
      hr: 't',
      stroked: 'f',
    });
  });

  it('should mark as horizontal rule when o:hr or o:hrstd is true', () => {
    const pict1 = createPict({ 'o:hr': 't' });
    const pict2 = createPict({ 'o:hrstd': 't' });

    const result1 = handleVRectImport({ pict: pict1 });
    const result2 = handleVRectImport({ pict: pict2 });

    expect(result1[0].attrs.horizontalRule).toBe(true);
    expect(result2[0].attrs.horizontalRule).toBe(true);
  });

  it('returns null when pict does not contain a v:rect element', () => {
    const pict = {
      name: 'w:pict',
      elements: [{ name: 'v:shape', attributes: {} }],
    };

    const result = handleVRectImport({ pict });

    expect(result).toBeNull();
  });
});
