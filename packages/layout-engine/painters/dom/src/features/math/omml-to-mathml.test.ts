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
    expect(result!.getAttribute('displaystyle')).toBeNull();
    expect(result!.getAttribute('display')).toBeNull();

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
    expect(result!.getAttribute('displaystyle')).toBe('true');
    expect(result!.getAttribute('display')).toBe('block');
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

  it('converts m:f (fraction) to <mfrac> with numerator and denominator', () => {
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

  it('wraps multi-part fraction operands in <mrow> for valid arity', () => {
    // (a+b)/(c+d) — both numerator and denominator have multiple runs
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:f',
          elements: [
            {
              name: 'm:num',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'b' }] }] },
              ],
            },
            {
              name: 'm:den',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'c' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'd' }] }] },
              ],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const mfrac = result!.querySelector('mfrac');
    expect(mfrac).not.toBeNull();
    // <mfrac> must have exactly 2 children (num + den), each wrapped in <mrow>
    expect(mfrac!.children.length).toBe(2);
    expect(mfrac!.children[0]!.textContent).toBe('a+b');
    expect(mfrac!.children[1]!.textContent).toBe('c+d');
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

  it('renders underbar (bot) as <munder> with U+203E', () => {
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
    expect(mo?.textContent).toBe('\u203E');
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
    expect(mo?.textContent).toBe('\u203E');
  });
});

describe('m:sSub converter', () => {
  it('converts m:sSub to <msub> with base and subscript', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSub',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msub = result!.querySelector('msub');
    expect(msub).not.toBeNull();
    expect(msub!.children.length).toBe(2);
    expect(msub!.children[0]!.textContent).toBe('a');
    expect(msub!.children[1]!.textContent).toBe('1');
  });

  it('ignores m:sSubPr properties element', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSub',
          elements: [
            { name: 'm:sSubPr', elements: [{ name: 'm:ctrlPr' }] },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'n' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msub = result!.querySelector('msub');
    expect(msub).not.toBeNull();
    expect(msub!.children.length).toBe(2);
    expect(msub!.children[0]!.textContent).toBe('x');
    expect(msub!.children[1]!.textContent).toBe('n');
  });

  it('wraps multi-part base and subscript in <mrow> for valid arity', () => {
    // x_{n+1} — subscript has 3 runs that must be grouped
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSub',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'n' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
              ],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msub = result!.querySelector('msub');
    expect(msub).not.toBeNull();
    // <msub> must have exactly 2 children (base + subscript), each wrapped in <mrow>
    expect(msub!.children.length).toBe(2);
    expect(msub!.children[0]!.textContent).toBe('x');
    expect(msub!.children[1]!.textContent).toBe('n+1');
  });

  it('handles missing m:sub gracefully', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSub',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msub = result!.querySelector('msub');
    expect(msub).not.toBeNull();
    expect(msub!.children[0]!.textContent).toBe('a');
  });
});

describe('m:sSup converter', () => {
  it('converts m:sSup to <msup> with base and superscript', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSup',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msup = result!.querySelector('msup');
    expect(msup).not.toBeNull();
    expect(msup!.children.length).toBe(2);
    expect(msup!.children[0]!.textContent).toBe('x');
    expect(msup!.children[1]!.textContent).toBe('2');
  });

  it('ignores m:sSupPr properties element', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSup',
          elements: [
            { name: 'm:sSupPr', elements: [{ name: 'm:ctrlPr' }] },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] }],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'b' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msup = result!.querySelector('msup');
    expect(msup).not.toBeNull();
    expect(msup!.children.length).toBe(2);
    expect(msup!.children[0]!.textContent).toBe('a');
    expect(msup!.children[1]!.textContent).toBe('b');
  });

  it('wraps multi-part base and superscript in <mrow> for valid arity', () => {
    // (x+1)^2 — base has 3 runs that must be grouped
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSup',
          elements: [
            {
              name: 'm:e',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
              ],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msup = result!.querySelector('msup');
    expect(msup).not.toBeNull();
    // <msup> must have exactly 2 children (base + superscript), each wrapped in <mrow>
    expect(msup!.children.length).toBe(2);
    expect(msup!.children[0]!.textContent).toBe('x+1');
    expect(msup!.children[1]!.textContent).toBe('2');
  });

  it('handles missing m:sup gracefully', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSup',
          elements: [
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
    const msup = result!.querySelector('msup');
    expect(msup).not.toBeNull();
    expect(msup!.children[0]!.textContent).toBe('x');
  });
});

describe('m:sSubSup converter', () => {
  it('converts m:sSubSup to <msubsup> with base, subscript, and superscript', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSubSup',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'i' }] }] }],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msubsup = result!.querySelector('msubsup');
    expect(msubsup).not.toBeNull();
    expect(msubsup!.children.length).toBe(3);
    expect(msubsup!.children[0]!.textContent).toBe('x');
    expect(msubsup!.children[1]!.textContent).toBe('i');
    expect(msubsup!.children[2]!.textContent).toBe('2');
  });

  it('ignores m:sSubSupPr properties element', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSubSup',
          elements: [
            { name: 'm:sSubSupPr', elements: [{ name: 'm:alnScr' }] },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'a' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'n' }] }] }],
            },
            {
              name: 'm:sup',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'k' }] }] }],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msubsup = result!.querySelector('msubsup');
    expect(msubsup).not.toBeNull();
    expect(msubsup!.children.length).toBe(3);
    expect(msubsup!.children[0]!.textContent).toBe('a');
    expect(msubsup!.children[1]!.textContent).toBe('n');
    expect(msubsup!.children[2]!.textContent).toBe('k');
  });

  it('wraps multi-part operands in <mrow> for valid arity', () => {
    // x_{n+1}^{k-1} — both sub and sup have multiple runs
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSubSup',
          elements: [
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
            {
              name: 'm:sub',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'n' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
              ],
            },
            {
              name: 'm:sup',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'k' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '-' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
              ],
            },
          ],
        },
      ],
    };
    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    const msubsup = result!.querySelector('msubsup');
    expect(msubsup).not.toBeNull();
    expect(msubsup!.children.length).toBe(3);
    expect(msubsup!.children[0]!.textContent).toBe('x');
    expect(msubsup!.children[1]!.textContent).toBe('n+1');
    expect(msubsup!.children[2]!.textContent).toBe('k-1');
  });

  it('handles missing m:sub and m:sup gracefully', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:sSubSup',
          elements: [
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
    const msubsup = result!.querySelector('msubsup');
    expect(msubsup).not.toBeNull();
    expect(msubsup!.children[0]!.textContent).toBe('x');
  });
});

describe('m:func converter', () => {
  it('converts m:func to function name + apply operator + argument', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'sin' }] }] }],
            },
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
    expect(result!.textContent).toBe(`sin${'\u2061'}x`);

    const mrow = result!.querySelector('mrow');
    expect(mrow).not.toBeNull();

    const functionIdentifier = mrow!.querySelector('mi');
    expect(functionIdentifier).not.toBeNull();
    expect(functionIdentifier!.textContent).toBe('sin');
    expect(functionIdentifier!.getAttribute('mathvariant')).toBe('normal');

    const applyOperator = mrow!.querySelector('mo');
    expect(applyOperator).not.toBeNull();
    expect(applyOperator!.textContent).toBe('\u2061');
  });

  it('ignores m:funcPr properties element', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            { name: 'm:funcPr', elements: [{ name: 'm:ctrlPr' }] },
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'log' }] }] }],
            },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '10' }] }] }],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.textContent).toBe(`log${'\u2061'}10`);
  });

  it('renders single-character function names upright', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'f' }] }] }],
            },
            {
              name: 'm:e',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    const firstMi = result!.querySelector('mi');
    expect(firstMi).not.toBeNull();
    expect(firstMi!.textContent).toBe('f');
    expect(firstMi!.getAttribute('mathvariant')).toBe('normal');
  });

  it('wraps multi-part arguments in <mrow>', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'sin' }] }] }],
            },
            {
              name: 'm:e',
              elements: [
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '+' }] }] },
                { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '1' }] }] },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();

    const outerRow = result!.querySelector('math > mrow');
    expect(outerRow).not.toBeNull();
    expect(outerRow!.children.length).toBe(3);
    expect(outerRow!.children[0]!.textContent).toBe('sin');
    expect(outerRow!.children[1]!.textContent).toBe('\u2061');
    expect(outerRow!.children[2]!.textContent).toBe('x+1');
  });

  it('renders only the argument when m:fName is missing', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
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
    expect(result!.textContent).toBe('x');

    // No apply operator when function name is missing
    const mo = result!.querySelector('mo');
    expect(mo).toBeNull();
  });

  it('renders only the function name when m:e is missing', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'sin' }] }] }],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.textContent).toBe('sin');

    // No apply operator when argument is missing
    const mo = result!.querySelector('mo');
    expect(mo).toBeNull();

    // Function name should still be upright
    const mi = result!.querySelector('mi');
    expect(mi!.getAttribute('mathvariant')).toBe('normal');
  });

  it('returns null for empty m:func', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).toBeNull();
  });

  it('handles nested m:func (sin of cos x)', () => {
    const omml = {
      name: 'm:oMath',
      elements: [
        {
          name: 'm:func',
          elements: [
            {
              name: 'm:fName',
              elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'sin' }] }] }],
            },
            {
              name: 'm:e',
              elements: [
                {
                  name: 'm:func',
                  elements: [
                    {
                      name: 'm:fName',
                      elements: [
                        { name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'cos' }] }] },
                      ],
                    },
                    {
                      name: 'm:e',
                      elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = convertOmmlToMathml(omml, doc);
    expect(result).not.toBeNull();
    expect(result!.textContent).toBe(`sin${'\u2061'}cos${'\u2061'}x`);

    // Both function names should be upright
    const mis = result!.querySelectorAll('mi[mathvariant="normal"]');
    expect(mis.length).toBe(2);
    expect(mis[0]!.textContent).toBe('sin');
    expect(mis[1]!.textContent).toBe('cos');
  });
});
