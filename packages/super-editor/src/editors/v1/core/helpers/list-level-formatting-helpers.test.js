// @ts-check
import { describe, expect, it, vi } from 'vitest';
import { LevelFormattingHelpers } from './list-level-formatting-helpers.js';

// ──────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ──────────────────────────────────────────────────────────────────────────────

/** Create a minimal raw w:lvl element with standard defaults. */
function makeLvlElement(ilvl, overrides = {}) {
  const elements = [
    { type: 'element', name: 'w:start', attributes: { 'w:val': '1' } },
    { type: 'element', name: 'w:numFmt', attributes: { 'w:val': overrides.numFmt ?? 'decimal' } },
    { type: 'element', name: 'w:lvlText', attributes: { 'w:val': overrides.lvlText ?? `%${ilvl + 1}.` } },
    { type: 'element', name: 'w:lvlJc', attributes: { 'w:val': overrides.alignment ?? 'left' } },
    {
      type: 'element',
      name: 'w:pPr',
      elements: [
        {
          type: 'element',
          name: 'w:ind',
          attributes: {
            'w:left': String(overrides.left ?? 720 * (ilvl + 1)),
            'w:hanging': String(overrides.hanging ?? 360),
          },
        },
      ],
    },
  ];

  if (overrides.suff) {
    elements.push({ type: 'element', name: 'w:suff', attributes: { 'w:val': overrides.suff } });
  }

  if (overrides.fontFamily) {
    elements.push({
      type: 'element',
      name: 'w:rPr',
      elements: [
        {
          type: 'element',
          name: 'w:rFonts',
          attributes: {
            'w:ascii': overrides.fontFamily,
            'w:hAnsi': overrides.fontFamily,
            'w:eastAsia': overrides.fontFamily,
            'w:cs': overrides.fontFamily,
          },
        },
      ],
    });
  }

  return {
    type: 'element',
    name: 'w:lvl',
    attributes: { 'w:ilvl': String(ilvl) },
    elements,
  };
}

/** Create a minimal abstract definition with the given levels. */
function makeAbstract(abstractNumId, levelCount = 9) {
  const elements = [];
  for (let i = 0; i < levelCount; i++) {
    elements.push(makeLvlElement(i));
  }
  return {
    type: 'element',
    name: 'w:abstractNum',
    attributes: { 'w:abstractNumId': String(abstractNumId) },
    elements,
  };
}

/** Create a mock editor with numbering data. */
function makeEditor(abstractNumId = 1, numId = 10) {
  const abstract = makeAbstract(abstractNumId);
  const numDef = {
    type: 'element',
    name: 'w:num',
    attributes: { 'w:numId': String(numId) },
    elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractNumId) } }],
  };

  return {
    converter: {
      numbering: {
        abstracts: { [abstractNumId]: abstract },
        definitions: { [numId]: numDef },
      },
      translatedNumbering: { abstracts: {}, definitions: {} },
    },
    emit: vi.fn(),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// findLevelElement
// ──────────────────────────────────────────────────────────────────────────────

describe('findLevelElement', () => {
  it('finds a level element by ilvl', () => {
    const abstract = makeAbstract(1);
    const lvl = LevelFormattingHelpers.findLevelElement(abstract, 0);
    expect(lvl).toBeDefined();
    expect(lvl.attributes['w:ilvl']).toBe('0');
  });

  it('returns undefined for missing level', () => {
    const abstract = makeAbstract(1, 3);
    expect(LevelFormattingHelpers.findLevelElement(abstract, 5)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// readLevelProperties
// ──────────────────────────────────────────────────────────────────────────────

describe('readLevelProperties', () => {
  it('reads all standard properties from a level element', () => {
    const lvl = makeLvlElement(2, { numFmt: 'lowerLetter', lvlText: '%3.', alignment: 'center', suff: 'space' });
    const props = LevelFormattingHelpers.readLevelProperties(lvl, 2);

    expect(props.level).toBe(2);
    expect(props.numFmt).toBe('lowerLetter');
    expect(props.lvlText).toBe('%3.');
    expect(props.start).toBe(1);
    expect(props.alignment).toBe('center');
    expect(props.trailingCharacter).toBe('space');
    expect(props.indents).toEqual({ left: 2160, hanging: 360 });
  });

  it('reads marker font when present', () => {
    const lvl = makeLvlElement(0, { fontFamily: 'Symbol' });
    const props = LevelFormattingHelpers.readLevelProperties(lvl, 0);
    expect(props.markerFont).toBe('Symbol');
  });

  it('omits missing optional properties', () => {
    const lvl = makeLvlElement(0);
    const props = LevelFormattingHelpers.readLevelProperties(lvl, 0);
    expect(props.trailingCharacter).toBeUndefined();
    expect(props.markerFont).toBeUndefined();
    expect(props.pictureBulletId).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelNumberingFormat
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelNumberingFormat', () => {
  it('sets numFmt, lvlText, and start on the target level', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelNumberingFormat(editor, 1, 0, {
      numFmt: 'lowerRoman',
      lvlText: '%1)',
      start: 5,
    });

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('lowerRoman');
    expect(lvl.elements.find((e) => e.name === 'w:lvlText').attributes['w:val']).toBe('%1)');
    expect(lvl.elements.find((e) => e.name === 'w:start').attributes['w:val']).toBe('5');
  });

  it('returns false when values already match (no-op)', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelNumberingFormat(editor, 1, 0, {
      numFmt: 'decimal',
      lvlText: '%1.',
      start: 1,
    });

    expect(changed).toBe(false);
  });

  it('omits start when not provided', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelNumberingFormat(editor, 1, 0, {
      numFmt: 'upperLetter',
      lvlText: '%1.',
    });

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    // Start should remain unchanged at '1'
    expect(lvl.elements.find((e) => e.name === 'w:start').attributes['w:val']).toBe('1');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelBulletMarker
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelBulletMarker', () => {
  it('sets numFmt to bullet and lvlText to the marker', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelBulletMarker(editor, 1, 0, '\u2022');

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('bullet');
    expect(lvl.elements.find((e) => e.name === 'w:lvlText').attributes['w:val']).toBe('\u2022');
  });

  it('returns false when already a matching bullet', () => {
    const editor = makeEditor();
    // First set to bullet
    LevelFormattingHelpers.setLevelBulletMarker(editor, 1, 0, '\u2022');

    // Set again with same values
    const changed = LevelFormattingHelpers.setLevelBulletMarker(editor, 1, 0, '\u2022');
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelPictureBulletId
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelPictureBulletId', () => {
  it('sets the picture bullet ID on a level', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelPictureBulletId(editor, 1, 0, 42);

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:lvlPicBulletId').attributes['w:val']).toBe('42');
  });

  it('returns false when the same ID is already set', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelPictureBulletId(editor, 1, 0, 42);

    const changed = LevelFormattingHelpers.setLevelPictureBulletId(editor, 1, 0, 42);
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelAlignment
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelAlignment', () => {
  it('sets the level justification', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelAlignment(editor, 1, 0, 'center');

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:lvlJc').attributes['w:val']).toBe('center');
  });

  it('returns false when alignment already matches', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelAlignment(editor, 1, 0, 'left');
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelIndents
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelIndents', () => {
  it('sets left and hanging indents', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelIndents(editor, 1, 0, { left: 1440, hanging: 720 });

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    const ind = lvl.elements.find((e) => e.name === 'w:pPr').elements.find((e) => e.name === 'w:ind');
    expect(ind.attributes['w:left']).toBe('1440');
    expect(ind.attributes['w:hanging']).toBe('720');
  });

  it('removes firstLine when hanging is set', () => {
    const editor = makeEditor();
    // Manually add firstLine
    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    const ind = lvl.elements.find((e) => e.name === 'w:pPr').elements.find((e) => e.name === 'w:ind');
    ind.attributes['w:firstLine'] = '200';

    LevelFormattingHelpers.setLevelIndents(editor, 1, 0, { hanging: 500 });

    expect(ind.attributes['w:firstLine']).toBeUndefined();
    expect(ind.attributes['w:hanging']).toBe('500');
  });

  it('removes hanging when firstLine is set', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelIndents(editor, 1, 0, { firstLine: 300 });

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    const ind = lvl.elements.find((e) => e.name === 'w:pPr').elements.find((e) => e.name === 'w:ind');
    expect(ind.attributes['w:hanging']).toBeUndefined();
    expect(ind.attributes['w:firstLine']).toBe('300');
  });

  it('returns false when indents already match', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelIndents(editor, 1, 0, { left: 720, hanging: 360 });
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelTrailingCharacter
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelTrailingCharacter', () => {
  it('sets the trailing character (suffix)', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelTrailingCharacter(editor, 1, 0, 'space');

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:suff').attributes['w:val']).toBe('space');
  });

  it('returns false when suffix already matches', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelTrailingCharacter(editor, 1, 0, 'space');

    const changed = LevelFormattingHelpers.setLevelTrailingCharacter(editor, 1, 0, 'space');
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setLevelMarkerFont
// ──────────────────────────────────────────────────────────────────────────────

describe('setLevelMarkerFont', () => {
  it('creates rPr and rFonts when missing', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.setLevelMarkerFont(editor, 1, 0, 'Symbol');

    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    const rPr = lvl.elements.find((e) => e.name === 'w:rPr');
    const rFonts = rPr.elements.find((e) => e.name === 'w:rFonts');
    expect(rFonts.attributes['w:ascii']).toBe('Symbol');
    expect(rFonts.attributes['w:hAnsi']).toBe('Symbol');
    expect(rFonts.attributes['w:eastAsia']).toBe('Symbol');
    expect(rFonts.attributes['w:cs']).toBe('Symbol');
  });

  it('updates existing rFonts', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelMarkerFont(editor, 1, 0, 'Symbol');

    const changed = LevelFormattingHelpers.setLevelMarkerFont(editor, 1, 0, 'Wingdings');
    expect(changed).toBe(true);

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    const rFonts = lvl.elements.find((e) => e.name === 'w:rPr').elements.find((e) => e.name === 'w:rFonts');
    expect(rFonts.attributes['w:ascii']).toBe('Wingdings');
  });

  it('returns false when font already matches', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelMarkerFont(editor, 1, 0, 'Symbol');

    const changed = LevelFormattingHelpers.setLevelMarkerFont(editor, 1, 0, 'Symbol');
    expect(changed).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// clearLevelOverride
// ──────────────────────────────────────────────────────────────────────────────

describe('clearLevelOverride', () => {
  it('returns false when no override exists (no-op)', () => {
    const editor = makeEditor();
    const changed = LevelFormattingHelpers.clearLevelOverride(editor, 10, 0);
    expect(changed).toBe(false);
  });

  it('returns true and removes an existing override', () => {
    const editor = makeEditor();
    // Add a lvlOverride to the numDef
    const numDef = editor.converter.numbering.definitions[10];
    numDef.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '5' } }],
    });

    const changed = LevelFormattingHelpers.clearLevelOverride(editor, 10, 0);
    expect(changed).toBe(true);
    expect(LevelFormattingHelpers.hasLevelOverride(editor, 10, 0)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// materializeLevelFormattingOverride
// ──────────────────────────────────────────────────────────────────────────────

describe('materializeLevelFormattingOverride', () => {
  it('moves lvlOverride formatting into the abstract while preserving startOverride', () => {
    const editor = makeEditor();
    const numDef = editor.converter.numbering.definitions[10];
    numDef.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [
        { type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } },
        makeLvlElement(0, {
          lvlText: '(%1)',
          alignment: 'center',
          left: 1440,
          hanging: 1080,
          suff: 'tab',
        }),
      ],
    });

    const before = LevelFormattingHelpers.captureEffectiveStyle(editor, 1, 10, [0]);

    const changed = LevelFormattingHelpers.materializeLevelFormattingOverride(editor, 1, 10, 0);

    expect(changed).toBe(true);
    expect(LevelFormattingHelpers.captureEffectiveStyle(editor, 1, 10, [0])).toEqual(before);

    const lvl0 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl0.elements.find((e) => e.name === 'w:lvlText').attributes['w:val']).toBe('(%1)');
    expect(lvl0.elements.find((e) => e.name === 'w:lvlJc').attributes['w:val']).toBe('center');
    const ind = lvl0.elements.find((e) => e.name === 'w:pPr').elements.find((e) => e.name === 'w:ind');
    expect(ind.attributes['w:left']).toBe('1440');
    expect(ind.attributes['w:hanging']).toBe('1080');

    const remainingOverride = numDef.elements.find((e) => e.name === 'w:lvlOverride');
    expect(remainingOverride).toBeDefined();
    expect(remainingOverride.elements).toEqual([
      { type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } },
    ]);
  });

  it('returns false when only startOverride exists', () => {
    const editor = makeEditor();
    const numDef = editor.converter.numbering.definitions[10];
    numDef.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } }],
    });

    const changed = LevelFormattingHelpers.materializeLevelFormattingOverride(editor, 1, 10, 0);

    expect(changed).toBe(false);
    expect(numDef.elements).toHaveLength(2);
  });

  it('preserves instance lvlRestart when materializing formatting overrides', () => {
    const editor = makeEditor();
    const numDef = editor.converter.numbering.definitions[10];
    numDef.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [
        makeLvlElement(0, {
          lvlText: '(%1)',
        }),
      ],
    });
    numDef.elements[1].elements[0].elements.push({
      type: 'element',
      name: 'w:lvlRestart',
      attributes: { 'w:val': '1' },
    });

    const changed = LevelFormattingHelpers.materializeLevelFormattingOverride(editor, 1, 10, 0);

    expect(changed).toBe(true);
    const remainingOverride = numDef.elements.find((e) => e.name === 'w:lvlOverride');
    expect(remainingOverride).toBeDefined();
    expect(remainingOverride.elements).toEqual([
      {
        type: 'element',
        name: 'w:lvl',
        attributes: { 'w:ilvl': '0' },
        elements: [{ type: 'element', name: 'w:lvlRestart', attributes: { 'w:val': '1' } }],
      },
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// cloneAbstractIntoNum
// ──────────────────────────────────────────────────────────────────────────────

describe('cloneAbstractIntoNum', () => {
  it('retargets the existing num to a cloned abstract and preserves startOverride', () => {
    const editor = makeEditor();
    const numDef = editor.converter.numbering.definitions[10];
    numDef.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } }],
    });

    const { newAbstractNumId } = LevelFormattingHelpers.cloneAbstractIntoNum(editor, 1, 10);

    expect(newAbstractNumId).toBe(2);
    expect(
      Object.keys(editor.converter.numbering.abstracts)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 2]);
    expect(Object.keys(editor.converter.numbering.definitions).map(Number)).toEqual([10]);

    const abstractNumIdEl = numDef.elements.find((e) => e.name === 'w:abstractNumId');
    expect(abstractNumIdEl.attributes['w:val']).toBe('2');

    const override = numDef.elements.find((e) => e.name === 'w:lvlOverride');
    expect(override).toBeDefined();
    expect(override.elements).toEqual([{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } }]);
  });
});

describe('copySequenceStateOverrides', () => {
  it('copies startOverride to the cloned num without restoring formatting overrides', () => {
    const editor = makeEditor();
    editor.converter.numbering.definitions[11] = {
      type: 'element',
      name: 'w:num',
      attributes: { 'w:numId': '11' },
      elements: [{ type: 'element', name: 'w:abstractNumId', attributes: { 'w:val': '1' } }],
    };

    const sourceNum = editor.converter.numbering.definitions[10];
    sourceNum.elements.push({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [
        { type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } },
        makeLvlElement(0, { lvlText: '(%1)' }),
      ],
    });

    const changed = LevelFormattingHelpers.copySequenceStateOverrides(editor, 10, 11, [0]);

    expect(changed).toBe(true);
    const targetOverride = editor.converter.numbering.definitions[11].elements.find((e) => e.name === 'w:lvlOverride');
    expect(targetOverride).toEqual({
      type: 'element',
      name: 'w:lvlOverride',
      attributes: { 'w:ilvl': '0' },
      elements: [{ type: 'element', name: 'w:startOverride', attributes: { 'w:val': '7' } }],
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// captureTemplate
// ──────────────────────────────────────────────────────────────────────────────

describe('captureTemplate', () => {
  it('captures all levels from an abstract definition', () => {
    const editor = makeEditor();
    const template = LevelFormattingHelpers.captureTemplate(editor, 1);

    expect(template).not.toBeNull();
    expect(template.version).toBe(1);
    expect(template.levels).toHaveLength(9);
    expect(template.levels[0].level).toBe(0);
    expect(template.levels[0].numFmt).toBe('decimal');
    expect(template.levels[0].lvlText).toBe('%1.');
    expect(template.levels[0].start).toBe(1);
    expect(template.levels[0].alignment).toBe('left');
    expect(template.levels[0].indents).toEqual({ left: 720, hanging: 360 });
  });

  it('captures only specified levels', () => {
    const editor = makeEditor();
    const template = LevelFormattingHelpers.captureTemplate(editor, 1, [0, 2, 4]);

    expect(template.levels).toHaveLength(3);
    expect(template.levels.map((l) => l.level)).toEqual([0, 2, 4]);
  });

  it('returns null for missing abstract', () => {
    const editor = makeEditor();
    expect(LevelFormattingHelpers.captureTemplate(editor, 999)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// applyTemplateToAbstract
// ──────────────────────────────────────────────────────────────────────────────

describe('applyTemplateToAbstract', () => {
  it('applies all template levels to the abstract', () => {
    const editor = makeEditor();
    const template = {
      version: 1,
      levels: [
        { level: 0, numFmt: 'lowerRoman', lvlText: '%1)', start: 3, alignment: 'center' },
        { level: 1, numFmt: 'upperLetter', lvlText: '%2.', start: 1, alignment: 'right' },
      ],
    };

    const result = LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    expect(result.changed).toBe(true);

    // Verify level 0
    const lvl0 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl0.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('lowerRoman');
    expect(lvl0.elements.find((e) => e.name === 'w:lvlJc').attributes['w:val']).toBe('center');

    // Verify level 1
    const lvl1 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 1);
    expect(lvl1.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('upperLetter');
  });

  it('applies only specified levels from the template', () => {
    const editor = makeEditor();
    const template = {
      version: 1,
      levels: [
        { level: 0, numFmt: 'lowerRoman', lvlText: '%1)' },
        { level: 1, numFmt: 'upperLetter', lvlText: '%2.' },
      ],
    };

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template, [0]);

    // Level 0 should be changed
    const lvl0 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl0.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('lowerRoman');

    // Level 1 should be unchanged
    const lvl1 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 1);
    expect(lvl1.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('decimal');
  });

  it('returns error when requested level is not in template', () => {
    const editor = makeEditor();
    const template = {
      version: 1,
      levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.' }],
    };

    const result = LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template, [0, 5]);

    expect(result.changed).toBe(false);
    expect(result.error).toBe('LEVEL_NOT_IN_TEMPLATE');
  });

  it('returns no-op when all values already match', () => {
    const editor = makeEditor();
    const template = {
      version: 1,
      levels: [{ level: 0, numFmt: 'decimal', lvlText: '%1.', start: 1, alignment: 'left' }],
    };

    const result = LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    expect(result.changed).toBe(false);
  });

  it('is atomic: no changes when any level is missing from abstract', () => {
    const editor = makeEditor(1);
    // Remove level 5 from abstract
    const abstract = editor.converter.numbering.abstracts[1];
    abstract.elements = abstract.elements.filter((el) => !(el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === '5'));

    const template = {
      version: 1,
      levels: [
        { level: 0, numFmt: 'lowerRoman', lvlText: '%1)' },
        { level: 5, numFmt: 'upperLetter', lvlText: '%6.' },
      ],
    };

    const result = LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    expect(result.changed).toBe(false);
    expect(result.error).toBe('LEVEL_NOT_IN_ABSTRACT');

    // Level 0 should NOT have been modified (atomic rollback)
    const lvl0 = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl0.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('decimal');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Preset catalog
// ──────────────────────────────────────────────────────────────────────────────

describe('preset catalog', () => {
  it('provides templates for all 10 preset IDs', () => {
    const presetIds = [
      'decimal',
      'decimalParenthesis',
      'lowerLetter',
      'upperLetter',
      'lowerRoman',
      'upperRoman',
      'disc',
      'circle',
      'square',
      'dash',
    ];

    for (const id of presetIds) {
      const template = LevelFormattingHelpers.getPresetTemplate(id);
      expect(template, `preset ${id} should exist`).toBeDefined();
      expect(template.version).toBe(1);
      expect(template.levels).toHaveLength(9);
    }
  });

  it('returns undefined for unknown preset ID', () => {
    expect(LevelFormattingHelpers.getPresetTemplate('nonexistent')).toBeUndefined();
  });

  it('generates correct lvlText for ordered presets', () => {
    const decimal = LevelFormattingHelpers.getPresetTemplate('decimal');
    expect(decimal.levels[0].lvlText).toBe('%1.');
    expect(decimal.levels[1].lvlText).toBe('%2.');
    expect(decimal.levels[8].lvlText).toBe('%9.');

    const paren = LevelFormattingHelpers.getPresetTemplate('decimalParenthesis');
    expect(paren.levels[0].lvlText).toBe('%1)');
  });

  it('generates correct indents per level', () => {
    const decimal = LevelFormattingHelpers.getPresetTemplate('decimal');
    expect(decimal.levels[0].indents).toEqual({ left: 720, hanging: 360 });
    expect(decimal.levels[1].indents).toEqual({ left: 1440, hanging: 360 });
    expect(decimal.levels[8].indents).toEqual({ left: 6480, hanging: 360 });
  });

  it('includes markerFont for bullet presets', () => {
    const disc = LevelFormattingHelpers.getPresetTemplate('disc');
    expect(disc.levels[0].markerFont).toBe('Symbol');
    expect(disc.levels[0].numFmt).toBe('bullet');
    expect(disc.levels[0].lvlText).toBe('\u2022');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers for rFonts-centric tests below
// ──────────────────────────────────────────────────────────────────────────────

/** Swap a specific ilvl inside an editor's abstract with a freshly-built level. */
function replaceLevel(editor, abstractNumId, ilvl, overrides) {
  const abstract = editor.converter.numbering.abstracts[abstractNumId];
  const idx = abstract.elements.findIndex((el) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === String(ilvl));
  abstract.elements[idx] = makeLvlElement(ilvl, overrides);
}

/** Read the rFonts ascii value from a level, or undefined if not present. */
function getLevelFontAscii(editor, abstractNumId, ilvl) {
  const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[abstractNumId], ilvl);
  const rPr = lvl.elements.find((el) => el.name === 'w:rPr');
  const rFonts = rPr?.elements?.find((el) => el.name === 'w:rFonts');
  return rFonts?.attributes?.['w:ascii'];
}

// ──────────────────────────────────────────────────────────────────────────────
// Symbol-font normalization on bullet → ordered transitions
// ──────────────────────────────────────────────────────────────────────────────

describe('symbol-font normalization on bullet → ordered transitions', () => {
  it('clears Wingdings rFonts when applying a decimal preset to a bullet level', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 2, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    const template = LevelFormattingHelpers.getPresetTemplate('decimal');
    const result = LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    expect(result.changed).toBe(true);
    expect(getLevelFontAscii(editor, 1, 2)).toBeUndefined();
    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 2);
    expect(lvl.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('decimal');
  });

  it('clears Symbol and Webdings rFonts when applying an ordered preset', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 1, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Symbol' });
    replaceLevel(editor, 1, 3, { numFmt: 'bullet', lvlText: '■', fontFamily: 'Webdings' });

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, LevelFormattingHelpers.getPresetTemplate('lowerLetter'));

    expect(getLevelFontAscii(editor, 1, 1)).toBeUndefined();
    expect(getLevelFontAscii(editor, 1, 3)).toBeUndefined();
  });

  it('preserves legitimate text-font rFonts (Courier New) on ordered transition', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 2, { numFmt: 'bullet', lvlText: 'o', fontFamily: 'Courier New' });

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, LevelFormattingHelpers.getPresetTemplate('decimal'));

    expect(getLevelFontAscii(editor, 1, 2)).toBe('Courier New');
  });

  it('does not strip rFonts on bullet → bullet transitions', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 2, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    // Apply only level 2 from the 'square' bullet preset, so rFonts handling
    // comes exclusively from the normalizer (which must no-op for bullet targets).
    // The subsequent markerFont path would then overwrite, but this asserts the
    // normalizer itself is a no-op for bullet numFmt.
    const square = LevelFormattingHelpers.getPresetTemplate('square');
    // Strip markerFont from the entry we apply so nothing else touches rFonts.
    const entryWithoutFont = { ...square.levels[2], markerFont: undefined };
    const template = { version: 1, levels: [entryWithoutFont] };

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template, [2]);

    // Font must survive — bullet numFmt never triggers the symbol-font sweep.
    expect(getLevelFontAscii(editor, 1, 2)).toBe('Wingdings');
  });

  it('clears rFonts via setLevelNumberStyle (single-numFmt path)', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Symbol' });

    const changed = LevelFormattingHelpers.setLevelNumberStyle(editor, 1, 0, 'lowerLetter');

    expect(changed).toBe(true);
    expect(getLevelFontAscii(editor, 1, 0)).toBeUndefined();
    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:numFmt').attributes['w:val']).toBe('lowerLetter');
  });

  it('clears rFonts via setLevelNumberingFormat (numFmt+lvlText path)', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    LevelFormattingHelpers.setLevelNumberingFormat(editor, 1, 0, {
      numFmt: 'decimal',
      lvlText: '%1.',
    });

    expect(getLevelFontAscii(editor, 1, 0)).toBeUndefined();
  });

  it('removes the enclosing w:rPr when stripping rFonts empties it', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    LevelFormattingHelpers.setLevelNumberStyle(editor, 1, 0, 'decimal');

    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:rPr')).toBeUndefined();
  });

  it('strips rFonts when a symbol font is on hAnsi but not ascii', () => {
    const editor = makeEditor();
    const lvl = {
      type: 'element',
      name: 'w:lvl',
      attributes: { 'w:ilvl': '0' },
      elements: [
        { type: 'element', name: 'w:numFmt', attributes: { 'w:val': 'bullet' } },
        { type: 'element', name: 'w:lvlText', attributes: { 'w:val': '' } },
        {
          type: 'element',
          name: 'w:rPr',
          elements: [{ type: 'element', name: 'w:rFonts', attributes: { 'w:hAnsi': 'Wingdings' } }],
        },
      ],
    };
    const abstract = editor.converter.numbering.abstracts[1];
    const idx = abstract.elements.findIndex((el) => el.name === 'w:lvl' && el.attributes?.['w:ilvl'] === '0');
    abstract.elements[idx] = lvl;

    LevelFormattingHelpers.setLevelNumberStyle(editor, 1, 0, 'decimal');

    const updated = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(updated.elements.find((e) => e.name === 'w:rPr')).toBeUndefined();
  });

  it('matches symbol-font names case-insensitively', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: 'x', fontFamily: 'WINGDINGS' });

    LevelFormattingHelpers.setLevelNumberStyle(editor, 1, 0, 'decimal');

    expect(getLevelFontAscii(editor, 1, 0)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Donor font propagation in applyTemplateToAbstract
// ──────────────────────────────────────────────────────────────────────────────

describe('donor font propagation in applyTemplateToAbstract', () => {
  it('propagates a surviving text font onto stripped nested levels', () => {
    const editor = makeEditor();
    // L0, L1: legitimate text font (Courier New) — survives the normalizer
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Courier New' });
    replaceLevel(editor, 1, 1, { numFmt: 'bullet', lvlText: 'o', fontFamily: 'Courier New' });
    // L2, L3: symbol fonts — get stripped, then must inherit Courier New
    replaceLevel(editor, 1, 2, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });
    replaceLevel(editor, 1, 3, { numFmt: 'bullet', lvlText: '', fontFamily: 'Symbol' });

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, LevelFormattingHelpers.getPresetTemplate('decimal'));

    expect(getLevelFontAscii(editor, 1, 0)).toBe('Courier New');
    expect(getLevelFontAscii(editor, 1, 1)).toBe('Courier New');
    expect(getLevelFontAscii(editor, 1, 2)).toBe('Courier New');
    expect(getLevelFontAscii(editor, 1, 3)).toBe('Courier New');
  });

  it('leaves levels bare when no donor font exists (all levels were symbol fonts)', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Symbol' });
    replaceLevel(editor, 1, 1, { numFmt: 'bullet', lvlText: 'o', fontFamily: 'Symbol' });
    replaceLevel(editor, 1, 2, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, LevelFormattingHelpers.getPresetTemplate('decimal'));

    // No donor → propagation skipped, all three fall back to cascade.
    expect(getLevelFontAscii(editor, 1, 0)).toBeUndefined();
    expect(getLevelFontAscii(editor, 1, 1)).toBeUndefined();
    expect(getLevelFontAscii(editor, 1, 2)).toBeUndefined();
  });

  it('does not override an explicit markerFont on a template entry', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Courier New' });
    replaceLevel(editor, 1, 1, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    const template = {
      version: 1,
      levels: [
        { level: 0, numFmt: 'decimal', lvlText: '%1.' },
        { level: 1, numFmt: 'decimal', lvlText: '%2.', markerFont: 'Arial' },
      ],
    };

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    // L1's explicit markerFont wins over the donor propagation.
    expect(getLevelFontAscii(editor, 1, 1)).toBe('Arial');
    // L0 keeps its legitimate font (and also happens to be the donor).
    expect(getLevelFontAscii(editor, 1, 0)).toBe('Courier New');
  });

  it('skips propagation for bullet-target entries in the same template', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'bullet', lvlText: '•', fontFamily: 'Courier New' });
    replaceLevel(editor, 1, 1, { numFmt: 'bullet', lvlText: '', fontFamily: 'Wingdings' });

    const template = {
      version: 1,
      levels: [
        { level: 0, numFmt: 'decimal', lvlText: '%1.' },
        { level: 1, numFmt: 'bullet', lvlText: '•' },
      ],
    };

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template);

    // L1 remains bullet → normalizer doesn't strip → Wingdings is preserved.
    expect(getLevelFontAscii(editor, 1, 1)).toBe('Wingdings');
  });

  it('does not inject donor font into bare levels that were not stripped this call', () => {
    const editor = makeEditor();
    // L0 already ordered with a legitimate font — serves as a potential donor.
    replaceLevel(editor, 1, 0, { numFmt: 'decimal', fontFamily: 'Courier New' });
    // L2 is bare — user's intent is "inherit from paragraph style cascade."
    // L2 was not changed from any prior state in this call; no rFonts gets stripped.

    // Partial update: touch only indents/start at L2, leaving numFmt/lvlText alone.
    const template = {
      version: 1,
      levels: [{ level: 2, start: 5, indents: { left: 1000, hanging: 200 } }],
    };

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, template, [2]);

    // L2 must remain bare — the normalizer stripped nothing, so donor propagation
    // must not synthesize a font onto it.
    expect(getLevelFontAscii(editor, 1, 2)).toBeUndefined();
  });

  it('does not inject donor font onto already-ordered levels keeping their rFonts', () => {
    const editor = makeEditor();
    replaceLevel(editor, 1, 0, { numFmt: 'decimal', fontFamily: 'Courier New' });
    // L2 already ordered with its own legitimate font. Re-applying a template
    // must not overwrite it with L0's donor font.
    replaceLevel(editor, 1, 2, { numFmt: 'decimal', fontFamily: 'Arial' });

    LevelFormattingHelpers.applyTemplateToAbstract(editor, 1, LevelFormattingHelpers.getPresetTemplate('decimal'));

    expect(getLevelFontAscii(editor, 1, 0)).toBe('Courier New');
    expect(getLevelFontAscii(editor, 1, 2)).toBe('Arial');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure mutation behavior (no transaction side effects)
// ──────────────────────────────────────────────────────────────────────────────

describe('pure mutation behavior', () => {
  it('mutates converter.numbering in-place without emitting events', () => {
    const editor = makeEditor();
    LevelFormattingHelpers.setLevelAlignment(editor, 1, 0, 'right');

    // Verify in-place mutation happened
    const lvl = LevelFormattingHelpers.findLevelElement(editor.converter.numbering.abstracts[1], 0);
    expect(lvl.elements.find((e) => e.name === 'w:lvlJc').attributes['w:val']).toBe('right');

    // No transaction/emit — callers are responsible for wrapping in mutatePart
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('does not modify translatedNumbering (callers handle cache rebuild)', () => {
    const editor = makeEditor();
    const translatedBefore = editor.converter.translatedNumbering;
    LevelFormattingHelpers.setLevelAlignment(editor, 1, 0, 'center');

    // translatedNumbering is NOT updated — afterCommit in mutatePart handles that
    expect(editor.converter.translatedNumbering).toBe(translatedBefore);
  });
});
