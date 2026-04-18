import { describe, it, expect } from 'vitest';
import { getTestDataByFileName } from '../../../../../../tests/helpers/helpers.js';
import { translator as w_b_translator } from './b-translator.js';

describe('w:b translator integration (import/export across all w:val forms)', async () => {
  const fileName = 'ooxml-bold-vals-demo.docx';
  const xmlMap = await getTestDataByFileName(fileName);
  const doc = xmlMap['word/document.xml'];
  const body = doc.elements[0].elements.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];

  // Collect all w:b occurrences in document order
  const boldNodes = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = (child.elements || []).find((el) => el.name === 'w:rPr');
      const wB = rPr?.elements?.find((el) => el.name === 'w:b');
      if (wB) boldNodes.push(wB);
    });
  });

  it('finds <w:b> runs present in the demo file', () => {
    // Document now only embeds bold-on variants (presence, true, 1, on)
    expect(boldNodes.length).toBe(4);
  });

  it('wraps existing nodes in attribute translator results without altering raw attributes', () => {
    const encoded = boldNodes.map((node) => w_b_translator.encode({ nodes: [node] }));
    encoded.forEach((result) => {
      expect(result).toBe(true);
    });
  });

  it('normalizes w:val variants to booleans via encodeAttributes helper', () => {
    const cases = [
      { raw: 'true', expected: true },
      { raw: '1', expected: true },
      { raw: 'on', expected: true },
      { raw: true, expected: true },
      { raw: 1, expected: true },
      { raw: 'false', expected: false },
      { raw: '0', expected: false },
      { raw: 'off', expected: false },
      { raw: false, expected: false },
      { raw: 0, expected: false },
    ];

    cases.forEach(({ raw, expected }) => {
      const result = w_b_translator.encode({ nodes: [{ attributes: { 'w:val': raw } }] });
      expect(result).toBe(expected);
    });
  });

  it('emits w:val="0" only when bold is explicitly false during decode', () => {
    const falseAttrs = w_b_translator.decode({ node: { attrs: { bold: false } } });
    expect(falseAttrs).toEqual({ attributes: { 'w:val': '0' } });

    const trueAttrs = w_b_translator.decode({ node: { attrs: { bold: true } } });
    expect(trueAttrs).toEqual({ attributes: {} });

    const missingAttrs = w_b_translator.decode({ node: { attrs: {} } });
    expect(missingAttrs).toBeUndefined();
  });
});
