import { describe, it, expect } from 'vitest';
import { generateNewListDefinition, type NumberingModel } from './numbering-transforms';

function freshModel(): NumberingModel {
  return { abstracts: {}, definitions: {} };
}

function findLvl0(abstractDef: any) {
  return abstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '0');
}
function findChild(parent: any, name: string) {
  return parent?.elements?.find((el: any) => el.name === name);
}

describe('generateNewListDefinition - bullet style override', () => {
  it.each([
    ['disc', '•'],
    ['circle', '◦'],
    ['square', '▪'],
  ] as const)('writes lvlText "%s" → %s and strips w:rFonts on lvl0', (bulletStyle, expectedChar) => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle,
    });

    const lvl0 = findLvl0(result.abstractDef);
    expect(lvl0).toBeDefined();

    const lvlText = findChild(lvl0, 'w:lvlText');
    expect(lvlText.attributes['w:val']).toBe(expectedChar);

    const numFmt = findChild(lvl0, 'w:numFmt');
    expect(numFmt.attributes['w:val']).toBe('bullet');

    const rPr = findChild(lvl0, 'w:rPr');
    // rPr stays but rFonts must be removed so the Unicode glyph
    // renders in the document's default font instead of Symbol/Wingdings.
    expect(rPr).toBeDefined();
    expect(findChild(rPr, 'w:rFonts')).toBeUndefined();
  });

  it('does NOT touch the abstract when bulletStyle is unknown (defensive)', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      // @ts-expect-error testing the runtime-defensive branch
      bulletStyle: 'triangle',
    });

    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('•');
    // rFonts should still be present from the base definition (not stripped).
    const rPr = findChild(lvl0, 'w:rPr');
    expect(findChild(rPr, 'w:rFonts')).toBeDefined();
  });

  it('ignores bulletStyle when listType is orderedList', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      bulletStyle: 'square',
    });
    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('decimal');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('%1.');
  });
});

describe('generateNewListDefinition - ordered style override', () => {
  it.each([
    ['decimal', 'decimal', '%1.'],
    ['decimal-paren', 'decimal', '%1)'],
    ['upper-roman', 'upperRoman', '%1.'],
    ['lower-roman', 'lowerRoman', '%1.'],
    ['upper-alpha', 'upperLetter', '%1.'],
    ['lower-alpha', 'lowerLetter', '%1.'],
    ['lower-alpha-paren', 'lowerLetter', '%1)'],
  ] as const)('writes numFmt=%s and lvlText=%s for orderedStyle="%s"', (orderedStyle, expectedFmt, expectedText) => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle,
    });

    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe(expectedFmt);
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe(expectedText);
  });

  it('does NOT add rFonts to ordered abstract (no font override needed for digits/letters)', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'lower-roman',
    });
    const lvl0 = findLvl0(result.abstractDef);
    const rPr = findChild(lvl0, 'w:rPr');
    // Base ordered def has no rPr; override path doesn't add one.
    if (rPr) expect(findChild(rPr, 'w:rFonts')).toBeUndefined();
  });

  it('ignores orderedStyle when listType is bulletList', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      orderedStyle: 'lower-roman',
    });
    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('bullet');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('•');
  });

  it('does NOT touch the abstract when orderedStyle is unknown', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      // @ts-expect-error testing the runtime-defensive branch
      orderedStyle: 'upper-alpha-paren',
    });
    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('decimal');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('%1.');
  });
});

describe('generateNewListDefinition - allocation', () => {
  it('allocates fresh abstractNumIds across calls', () => {
    const numbering = freshModel();
    const a = generateNewListDefinition(numbering, { numId: 1, listType: 'orderedList', orderedStyle: 'decimal' });
    const b = generateNewListDefinition(numbering, { numId: 2, listType: 'orderedList', orderedStyle: 'upper-roman' });
    expect(a.abstractId).not.toBe(b.abstractId);
    expect(numbering.abstracts[a.abstractId]).toBeDefined();
    expect(numbering.abstracts[b.abstractId]).toBeDefined();
  });

  it('writes numId → abstractNumId pointer in num definition', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 7,
      listType: 'orderedList',
      orderedStyle: 'decimal',
    });
    const numDef = numbering.definitions[7];
    expect(numDef).toBeDefined();
    expect(numDef.elements[0].name).toBe('w:abstractNumId');
    expect(numDef.elements[0].attributes['w:val']).toBe(String(result.abstractId));
  });
});
