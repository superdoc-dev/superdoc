import { describe, it, expect } from 'vitest';
import { generateNewListDefinition, type NumberingModel } from './numbering-transforms.js';

const emptyNumbering = (): NumberingModel => ({ abstracts: {}, definitions: {} });

const findLevel = (abstractDef: any, ilvl: string) =>
  abstractDef.elements.find((el: any) => el.name === 'w:lvl' && el.attributes['w:ilvl'] === ilvl);

const findChild = (lvl: any, name: string) => lvl?.elements?.find((el: any) => el.name === name);

const findRFonts = (lvl: any) => {
  const rPr = findChild(lvl, 'w:rPr');
  return rPr?.elements?.find((el: any) => el.name === 'w:rFonts') ?? null;
};

describe('generateNewListDefinition with bulletStyle', () => {
  it.each([
    ['disc', '•'],
    ['circle', '◦'],
    ['square', '▪'],
  ] as const)('overrides level-0 lvlText with the %s char', (style, expectedChar) => {
    const numbering = emptyNumbering();

    const { abstractDef } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle: style,
    });

    const lvl0 = findLevel(abstractDef, '0');
    expect(findChild(lvl0, 'w:lvlText').attributes['w:val']).toBe(expectedChar);
  });

  it('strips w:rFonts from level-0 rPr when a bulletStyle is set', () => {
    const numbering = emptyNumbering();

    const { abstractDef } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle: 'square',
    });

    const lvl0 = findLevel(abstractDef, '0');
    expect(findRFonts(lvl0)).toBeNull();
  });

  it('leaves w:rFonts in place at level 0 when bulletStyle is not provided', () => {
    const numbering = emptyNumbering();

    const { abstractDef } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
    });

    const lvl0 = findLevel(abstractDef, '0');
    // baseBulletList template includes a w:rFonts at level 0; un-overridden runs should keep it.
    expect(findRFonts(lvl0)).not.toBeNull();
  });

  it('does not touch sub-level lvlText when overriding level 0', () => {
    const numbering = emptyNumbering();

    const { abstractDef } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'bulletList',
      bulletStyle: 'square',
    });

    const lvl0Text = findChild(findLevel(abstractDef, '0'), 'w:lvlText').attributes['w:val'];
    const lvl1Text = findChild(findLevel(abstractDef, '1'), 'w:lvlText').attributes['w:val'];

    expect(lvl0Text).toBe('▪');
    // Level 1 keeps whatever the cloned baseBulletList template provides; the picker is shallow.
    expect(lvl1Text).not.toBe('▪');
  });

  it('ignores bulletStyle when listType is orderedList', () => {
    const numbering = emptyNumbering();

    const { abstractDef } = generateNewListDefinition(numbering, {
      numId: 1,
      listType: 'orderedList',
      bulletStyle: 'square',
    });

    const lvl0 = findLevel(abstractDef, '0');
    const lvlText = findChild(lvl0, 'w:lvlText').attributes['w:val'];
    // Ordered list templates use %1./%2. patterns, never the bullet char.
    expect(lvlText).not.toBe('▪');
    expect(lvlText).toContain('%');
  });

  it('registers a fresh num + abstract definition in the numbering model', () => {
    const numbering = emptyNumbering();

    const result = generateNewListDefinition(numbering, {
      numId: 7,
      listType: 'bulletList',
      bulletStyle: 'circle',
    });

    expect(numbering.definitions[7]).toBeDefined();
    expect(numbering.abstracts[result.abstractId]).toBeDefined();
    expect(result.numDef.attributes['w:numId']).toBe('7');
  });
});
