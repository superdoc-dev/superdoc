import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { convertOmmlToMathml, MATHML_NS } from './omml-to-mathml.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const doc = dom.window.document;

describe('convertOmmlToMathml', () => {
  it('returns null for null/undefined input', () => {
    expect(convertOmmlToMathml(null, doc)).toBeNull();
    expect(convertOmmlToMathml(undefined, doc)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(convertOmmlToMathml({}, doc)).toBeNull();
  });

  it('converts a simple m:oMath with text run to <math>', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.namespaceURI).toBe(MATHML_NS);
    expect(result!.localName).toBe('math');

    // Should contain an <mi> for the identifier 'x'
    const mi = result!.querySelector('mi');
    expect(mi).not.toBeNull();
    expect(mi!.textContent).toBe('x');
  });

  it('classifies numbers as <mn>', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: '42' }] }],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    const mn = result!.querySelector('mn');
    expect(mn).not.toBeNull();
    expect(mn!.textContent).toBe('42');
  });

  it('classifies operators as <mo>', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    const mo = result!.querySelector('mo');
    expect(mo).not.toBeNull();
    expect(mo!.textContent).toBe('+');
  });

  it('handles m:oMathPara by iterating child m:oMath elements', () => {
    const omml = {
      name: 'm:oMathPara',
      elements: [
        {
          name: 'm:oMathParaPr',
          elements: [{ name: 'm:jc', attributes: { 'm:val': 'center' } }],
        },
        {
          name: 'm:oMath',
          elements: [
            {
              name: 'm:r',
              elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'y' }] }],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.localName).toBe('math');
    // The m:oMathParaPr should be skipped (it ends with 'Pr')
    // The m:oMath child should produce content
    expect(result!.textContent).toBe('y');
  });

  it('skips property elements (names ending in Pr)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        { name: 'm:rPr', elements: [{ name: 'm:sty', attributes: { 'm:val': 'bi' } }] },
        {
          name: 'm:r',
          elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'z' }] }],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result!.textContent).toBe('z');
  });

  it('handles unimplemented math objects by extracting child content', () => {
    // m:f (fraction) is not yet implemented — should fall back to rendering children
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:f',
          elements: [
            { name: 'm:fPr', elements: [] },
            {
              name: 'm:num',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] }],
            },
            {
              name: 'm:den',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'b' }] }] }],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    // Should produce a <mfrac> with numerator and denominator
    const mfrac = result!.querySelector('mfrac');
    expect(mfrac).not.toBeNull();
    expect(mfrac!.children.length).toBe(2);
    expect(mfrac!.children[0]!.textContent).toBe('a');
    expect(mfrac!.children[1]!.textContent).toBe('b');
  });

  it('sets mathvariant=normal for m:nor (normal text) flag', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [
            { name: 'm:rPr', elements: [{ name: 'm:nor' }] },
            { name: 'm:t', elements: [{ type: 'text', text: 'sin' }] },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    const mi = result!.querySelector('mi');
    expect(mi).not.toBeNull();
    expect(mi!.getAttribute('mathvariant')).toBe('normal');
  });

  it('handles empty m:r (no m:t children)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:r',
          elements: [{ name: 'm:rPr', elements: [] }],
        },
      ],
    };

    // Should not crash; may return empty math or null
    const result = convertOmmlToMathml(omml, doc);
    // Result could be null (no content) or an empty <math>
    // Either is acceptable
  });

  it('handles multiple runs producing different element types', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] },
        { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
        { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.textContent).toBe('x+1');

    const children = Array.from(result!.children);
    expect(children.some((c) => c.localName === 'mi')).toBe(true); // x
    expect(children.some((c) => c.localName === 'mo')).toBe(true); // +
    expect(children.some((c) => c.localName === 'mn')).toBe(true); // 1
  });
});

describe('m:bar converter', () => {
  it('renders overbar (top) as <mover> with U+203E', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:bar',
          elements: [
            { name: 'm:barPr', elements: [{ name: 'm:pos', attributes: { 'm:val': 'top' } }] },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const mover = result!.querySelector('mover');
    expect(mover).not.toBeNull();
    expect(mover!.firstElementChild!.textContent).toBe('x');
    const mo = mover!.querySelector('mo');
    expect(mo?.textContent).toBe('\u203E');
  });

  it('renders underbar (bot) as <munder> with U+2015', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:bar',
          elements: [
            { name: 'm:barPr', elements: [{ name: 'm:pos', attributes: { 'm:val': 'bot' } }] },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'y' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const munder = result!.querySelector('munder');
    expect(munder).not.toBeNull();
    expect(munder!.firstElementChild!.textContent).toBe('y');
    const mo = munder!.querySelector('mo');
    expect(mo?.textContent).toBe('\u2015');
  });

  it('defaults to underbar when m:barPr is missing (matches Word behavior)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:bar',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'z' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const munder = result!.querySelector('munder');
    expect(munder).not.toBeNull();
    expect(munder!.firstElementChild!.textContent).toBe('z');
    const mo = munder!.querySelector('mo');
    expect(mo?.textContent).toBe('\u2015');
  });
});
