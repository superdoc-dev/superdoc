import { describe, it, expect } from 'vitest';
import { generateNewListDefinition, setLvlStyleOnAbstract, type NumberingModel } from './numbering-transforms';

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
    ['upper-alpha-paren', 'upperLetter', '%1)'],
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

  it('applies orderedStyle to a sublevel (ilvl=1 → "%2.") when orderedStyleLevel is set', () => {
    // Regression: when the user picks a list style with a non-empty selection on a
    // nested item, `toggleList` falls through to mode='create' and mints a new abstract
    // via this path. The override needs to land on the paragraph's actual level so the
    // marker actually changes — without this the new abstract only mutates level 0 and
    // the nested item keeps rendering the template's default sublevel marker.
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'upper-roman',
      orderedStyleLevel: 1,
    });

    const lvl0 = findLvl0(result.abstractDef);
    // Level 0 is left at the template's default ("decimal" / "%1.")
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('decimal');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('%1.');

    const lvl1 = result.abstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '1');
    expect(findChild(lvl1, 'w:numFmt').attributes['w:val']).toBe('upperRoman');
    expect(findChild(lvl1, 'w:lvlText').attributes['w:val']).toBe('%2.');
  });

  it('preserves the suffix character at sublevels (ilvl=2 → "%3)")', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'lower-alpha-paren',
      orderedStyleLevel: 2,
    });

    const lvl2 = result.abstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '2');
    expect(findChild(lvl2, 'w:numFmt').attributes['w:val']).toBe('lowerLetter');
    expect(findChild(lvl2, 'w:lvlText').attributes['w:val']).toBe('%3)');
  });

  it('does NOT touch the abstract when orderedStyle is unknown', () => {
    const numbering = freshModel();
    const result = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      // @ts-expect-error testing the runtime-defensive branch
      orderedStyle: 'klingon-numerals',
    });
    const lvl0 = findLvl0(result.abstractDef);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('decimal');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('%1.');
  });
});

describe('setLvlStyleOnAbstract', () => {
  it('rewrites bullet lvlText and numFmt and strips rFonts in place', () => {
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle: 'disc',
    });

    const ok = setLvlStyleOnAbstract(numbering, abstractId, 0, { bulletStyle: 'square' });
    expect(ok).toBe(true);

    const lvl0 = findLvl0(numbering.abstracts[abstractId]);
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('▪');
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('bullet');
    const rPr = findChild(lvl0, 'w:rPr');
    expect(findChild(rPr, 'w:rFonts')).toBeUndefined();
  });

  it('rewrites ordered numFmt and lvlText for upper-roman', () => {
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'decimal',
    });

    const ok = setLvlStyleOnAbstract(numbering, abstractId, 0, { orderedStyle: 'upper-roman' });
    expect(ok).toBe(true);

    const lvl0 = findLvl0(numbering.abstracts[abstractId]);
    expect(findChild(lvl0, 'w:numFmt').attributes['w:val']).toBe('upperRoman');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe('%1.');
  });

  it('strips inherited rFonts when switching a bullet level to ordered', () => {
    // Regression: a level minted from baseBulletList carries a Symbol/Wingdings rFonts
    // entry. Switching that level to ordered must drop it — otherwise the numeric marker
    // ("1.", "I.") renders in the bullet font and looks wrong.
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle: 'disc',
    });
    // Sanity: the bullet abstract starts WITH an rFonts entry (the Symbol font on the
    // level-0 bullet). Re-add it directly since the disc override strips the level-0 one;
    // sublevels still carry their original fonts. We test ilvl=2 (Wingdings square level).
    const lvl2 = numbering.abstracts[abstractId].elements.find(
      (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '2',
    );
    const rPrBefore = lvl2.elements.find((el: any) => el.name === 'w:rPr');
    expect(rPrBefore?.elements?.some((el: any) => el.name === 'w:rFonts')).toBe(true);

    const ok = setLvlStyleOnAbstract(numbering, abstractId, 2, { orderedStyle: 'decimal' });
    expect(ok).toBe(true);

    const rPrAfter = lvl2.elements.find((el: any) => el.name === 'w:rPr');
    expect(rPrAfter?.elements?.some((el: any) => el.name === 'w:rFonts')).toBe(false);
  });

  it('returns false for unknown abstract or missing level', () => {
    const numbering = freshModel();
    expect(setLvlStyleOnAbstract(numbering, 99, 0, { bulletStyle: 'disc' })).toBe(false);

    const { abstractId } = generateNewListDefinition(numbering, { numId: 1, listType: 'orderedList' });
    expect(setLvlStyleOnAbstract(numbering, abstractId, 99, { orderedStyle: 'decimal' })).toBe(false);
  });

  it('returns false when neither style is provided', () => {
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, { numId: 1, listType: 'bulletList' });
    expect(setLvlStyleOnAbstract(numbering, abstractId, 0, {})).toBe(false);
  });

  it('writes a level-correct lvlText placeholder for sublevels (ilvl=1 → "%2.")', () => {
    // Regression: at ilvl=1 the placeholder must reference the level being mutated,
    // not "%1" (which is the parent's counter). Otherwise every sublevel item renders
    // the same value as its parent.
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'decimal',
    });

    const ok = setLvlStyleOnAbstract(numbering, abstractId, 1, { orderedStyle: 'upper-roman' });
    expect(ok).toBe(true);

    const lvl1 = numbering.abstracts[abstractId].elements.find(
      (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '1',
    );
    expect(findChild(lvl1, 'w:numFmt').attributes['w:val']).toBe('upperRoman');
    expect(findChild(lvl1, 'w:lvlText').attributes['w:val']).toBe('%2.');
  });

  it('preserves the suffix character for paren styles at sublevels (ilvl=2 → "%3)")', () => {
    const numbering = freshModel();
    const { abstractId } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'decimal',
    });

    const ok = setLvlStyleOnAbstract(numbering, abstractId, 2, { orderedStyle: 'lower-alpha-paren' });
    expect(ok).toBe(true);

    const lvl2 = numbering.abstracts[abstractId].elements.find(
      (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === '2',
    );
    expect(findChild(lvl2, 'w:numFmt').attributes['w:val']).toBe('lowerLetter');
    expect(findChild(lvl2, 'w:lvlText').attributes['w:val']).toBe('%3)');
  });
});

describe('generateNewListDefinition - nested level cycle', () => {
  // Word's hybridMultilevel template cycles `decimal → lowerLetter → lowerRoman` across
  // ilvl 0..8. When the user picks an outer-level style, only that level's marker should
  // change — the nested levels (ilvl 1..8) must keep cycling lowerLetter / lowerRoman /
  // decimal so the document looks the way Word renders it. Encoding the full table here
  // catches any regression that would, for example, leave a level on `decimal` because the
  // override accidentally rewrote a sibling level.
  const NESTED_LEVEL_CYCLE: ReadonlyArray<{ ilvl: string; numFmt: string; lvlText: string }> = [
    { ilvl: '1', numFmt: 'lowerLetter', lvlText: '%2.' },
    { ilvl: '2', numFmt: 'lowerRoman', lvlText: '%3.' },
    { ilvl: '3', numFmt: 'decimal', lvlText: '%4.' },
    { ilvl: '4', numFmt: 'lowerLetter', lvlText: '%5.' },
    { ilvl: '5', numFmt: 'lowerRoman', lvlText: '%6.' },
    { ilvl: '6', numFmt: 'decimal', lvlText: '%7.' },
    { ilvl: '7', numFmt: 'lowerLetter', lvlText: '%8.' },
    { ilvl: '8', numFmt: 'lowerRoman', lvlText: '%9.' },
  ];

  const OUTER_STYLES = [
    'decimal',
    'decimal-paren',
    'upper-roman',
    'lower-roman',
    'upper-alpha',
    'upper-alpha-paren',
    'lower-alpha',
    'lower-alpha-paren',
  ] as const;

  it.each(OUTER_STYLES)(
    'keeps nested ilvl 1..8 on the lowerLetter/lowerRoman/decimal cycle when outer style is "%s"',
    (orderedStyle) => {
      const numbering = freshModel();
      const result = generateNewListDefinition(numbering, {
        numId: 1,
        listType: 'orderedList',
        orderedStyle,
      });

      for (const expected of NESTED_LEVEL_CYCLE) {
        const lvl = result.abstractDef.elements.find(
          (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === expected.ilvl,
        );
        expect(lvl, `ilvl=${expected.ilvl} should be present`).toBeDefined();
        expect(findChild(lvl, 'w:numFmt').attributes['w:val']).toBe(expected.numFmt);
        expect(findChild(lvl, 'w:lvlText').attributes['w:val']).toBe(expected.lvlText);
      }
    },
  );

  it('overrides only ilvl 0 — every nested level keeps its template marker', () => {
    // Belt-and-braces: directly compare the nested-level slice of an overridden abstract
    // to a freshly-generated one with no override. They must match level-for-level.
    const overridden = generateNewListDefinition(freshModel(), {
      numId: 1,
      listType: 'orderedList',
      orderedStyle: 'upper-roman',
    });
    const baseline = generateNewListDefinition(freshModel(), {
      numId: 1,
      listType: 'orderedList',
    });

    for (const expected of NESTED_LEVEL_CYCLE) {
      const overriddenLvl = overridden.abstractDef.elements.find(
        (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === expected.ilvl,
      );
      const baselineLvl = baseline.abstractDef.elements.find(
        (el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === expected.ilvl,
      );
      expect(findChild(overriddenLvl, 'w:numFmt').attributes['w:val']).toBe(
        findChild(baselineLvl, 'w:numFmt').attributes['w:val'],
      );
      expect(findChild(overriddenLvl, 'w:lvlText').attributes['w:val']).toBe(
        findChild(baselineLvl, 'w:lvlText').attributes['w:val'],
      );
    }
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
