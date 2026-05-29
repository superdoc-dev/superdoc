import { describe, expect, it } from 'vitest';
import { preProcessBibliographyInstruction } from './bibliography-preprocessor.js';

describe('preProcessBibliographyInstruction', () => {
  it('synthesizes an empty paragraph when the field has no rendered content', () => {
    const result = preProcessBibliographyInstruction([], 'BIBLIOGRAPHY');

    expect(result).toEqual([
      {
        name: 'sd:bibliography',
        type: 'element',
        attributes: {
          instruction: 'BIBLIOGRAPHY',
        },
        elements: [
          {
            name: 'w:p',
            type: 'element',
            elements: [],
          },
        ],
      },
    ]);
  });

  it('wraps loose runs in a synthesized paragraph (single-paragraph field)', () => {
    // SD-3005: When the entire BIBLIOGRAPHY envelope lives inside one <w:p>, the
    // collected after-separate nodes are <w:r> runs, not <w:p> paragraphs. The
    // bibliography PM node declares `content: 'paragraph+'`, so emitting loose
    // runs as direct children crashes the schema. The preprocessor must group
    // adjacent inline nodes into a synthesized <w:p>.
    const r1 = {
      name: 'w:r',
      type: 'element',
      elements: [{ name: 'w:t', elements: [{ text: 'Smith, J. (2024). ' }] }],
    };
    const r2 = { name: 'w:r', type: 'element', elements: [{ name: 'w:t', elements: [{ text: 'Document Formats.' }] }] };

    const result = preProcessBibliographyInstruction([r1, r2], 'BIBLIOGRAPHY \\l 1033 ');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sd:bibliography');
    expect(result[0].elements).toEqual([{ name: 'w:p', type: 'element', elements: [r1, r2] }]);
  });

  it('preserves existing w:p children as-is (multi-paragraph field)', () => {
    const p1 = { name: 'w:p', type: 'element', elements: [{ name: 'w:r', elements: [] }] };
    const p2 = { name: 'w:p', type: 'element', elements: [{ name: 'w:r', elements: [] }] };

    const result = preProcessBibliographyInstruction([p1, p2], 'BIBLIOGRAPHY');

    expect(result[0].elements).toEqual([p1, p2]);
  });

  it('groups runs around paragraphs without merging them (mixed content)', () => {
    const leadingRun = { name: 'w:r', type: 'element', elements: [] };
    const para = { name: 'w:p', type: 'element', elements: [] };
    const trailingRun = { name: 'w:r', type: 'element', elements: [] };

    const result = preProcessBibliographyInstruction([leadingRun, para, trailingRun], 'BIBLIOGRAPHY');

    expect(result[0].elements).toEqual([
      { name: 'w:p', type: 'element', elements: [leadingRun] },
      para,
      { name: 'w:p', type: 'element', elements: [trailingRun] },
    ]);
  });

  it('preserves instructionTokens so split instructions round-trip (SD-3066)', () => {
    // Parity with index/toa: a BIBLIOGRAPHY instruction split across runs
    // (e.g. 'BIBLIOGRAPHY ' + '\\l 1033 ') must keep its raw fragments so the
    // exporter can rebuild the original runs instead of collapsing to one.
    const instructionTokens = [
      { type: 'text', text: 'BIBLIOGRAPHY ' },
      { type: 'text', text: '\\l 1033 ' },
    ];

    const result = preProcessBibliographyInstruction([], 'BIBLIOGRAPHY \\l 1033', null, instructionTokens);

    expect(result[0].attributes.instructionTokens).toEqual(instructionTokens);
  });

  it('omits instructionTokens when none are provided', () => {
    const result = preProcessBibliographyInstruction([], 'BIBLIOGRAPHY');

    expect(result[0].attributes).not.toHaveProperty('instructionTokens');
  });
});
