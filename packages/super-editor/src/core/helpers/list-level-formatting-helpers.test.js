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
