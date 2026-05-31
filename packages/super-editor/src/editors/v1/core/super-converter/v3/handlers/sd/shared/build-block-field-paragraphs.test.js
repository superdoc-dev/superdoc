import { describe, it, expect } from 'vitest';
import { wrapParagraphsAsComplexField } from './build-block-field-paragraphs.js';

const instr = [
  { name: 'w:instrText', attributes: { 'xml:space': 'preserve' }, elements: [{ type: 'text', text: 'INDEX' }] },
];

const fldCharTypesOf = (run) =>
  (run?.elements || []).filter((e) => e.name === 'w:fldChar').map((e) => e.attributes['w:fldCharType']);

describe('wrapParagraphsAsComplexField', () => {
  it('synthesizes a single paragraph carrying begin/separate/end when content is empty', () => {
    const result = wrapParagraphsAsComplexField([], instr);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('w:p');
    const types = result[0].elements.flatMap(fldCharTypesOf);
    expect(types).toEqual(['begin', 'separate', 'end']);
  });

  it('splices begin/separate into the first paragraph after its w:pPr and end into the last', () => {
    const first = {
      name: 'w:p',
      elements: [
        { name: 'w:pPr', elements: [] },
        { name: 'w:r', elements: [] },
      ],
    };
    const last = { name: 'w:p', elements: [{ name: 'w:r', elements: [] }] };

    const result = wrapParagraphsAsComplexField([first, last], instr);

    // begin/separate land after the pPr in the first paragraph
    expect(result[0].elements[0].name).toBe('w:pPr');
    expect(fldCharTypesOf(result[0].elements[1])).toEqual(['begin']);
    expect(result[0].elements[2]).toEqual({ name: 'w:r', elements: instr });
    expect(fldCharTypesOf(result[0].elements[3])).toEqual(['separate']);
    // end is appended to the last paragraph
    const lastTypes = result[result.length - 1].elements.flatMap(fldCharTypesOf);
    expect(lastTypes).toEqual(['end']);
  });

  it('inserts begin at index 0 when the first paragraph has no w:pPr', () => {
    const only = { name: 'w:p', elements: [{ name: 'w:r', elements: [] }] };

    const result = wrapParagraphsAsComplexField([only], instr);

    expect(fldCharTypesOf(result[0].elements[0])).toEqual(['begin']);
    const types = result[0].elements.flatMap(fldCharTypesOf);
    expect(types).toEqual(['begin', 'separate', 'end']);
  });

  it('restores wrapper paragraph properties before inserting field runs', () => {
    const wrapperPPr = {
      name: 'w:pPr',
      elements: [
        { name: 'w:pStyle', attributes: { 'w:val': 'Index1' } },
        { name: 'w:sectPr', elements: [] },
      ],
    };
    const only = {
      name: 'w:p',
      elements: [{ name: 'w:pPr', elements: [{ name: 'w:pStyle', attributes: { 'w:val': 'IndexVisual' } }] }],
    };

    const result = wrapParagraphsAsComplexField([only], instr, wrapperPPr);

    expect(result[0].elements[0]).toEqual(wrapperPPr);
    expect(fldCharTypesOf(result[0].elements[1])).toEqual(['begin']);
    expect(result[0].elements[2]).toEqual({ name: 'w:r', elements: instr });
  });
});
