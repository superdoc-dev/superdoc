import { describe, it, expect } from 'vitest';
import {
  getAbstractDefinition,
  getListLevelDefinitionTag,
  getDefinitionForLevel,
} from '@core/super-converter/v2/importer/listImporter.js';
import { LEVELS_MAP_KEY } from '@core/super-converter/v2/importer/numberingCache.js';

function numberingXml(elements) {
  return {
    elements: [
      {
        elements,
      },
    ],
  };
}

function abstractNum({ id, tmpl, withLevels = true, fmt = 'decimal' }) {
  const els = [];
  if (tmpl) els.push({ name: 'w:tmpl', attributes: { 'w:val': String(tmpl) } });
  if (withLevels) {
    els.push({
      name: 'w:lvl',
      attributes: { 'w:ilvl': '0' },
      elements: [
        { name: 'w:numFmt', attributes: { 'w:val': String(fmt) } },
        { name: 'w:lvlText', attributes: { 'w:val': '•' } },
        { name: 'w:lvlJc', attributes: { 'w:val': 'left' } },
      ],
    });
  }
  return { name: 'w:abstractNum', attributes: { 'w:abstractNumId': String(id) }, elements: els };
}

function num({ numId, abstractId }) {
  return {
    name: 'w:num',
    attributes: { 'w:numId': String(numId) },
    elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': String(abstractId) } }],
  };
}

describe('getAbstractDefinition', () => {
  it('preserves the direct w:num -> w:abstractNumId mapping when levels exist (no template fallback)', () => {
    const numbering = numberingXml([
      // Place the template-matching abstract FIRST to expose the old bug
      abstractNum({ id: 0, tmpl: 'T1', withLevels: true }),
      // Direct abstract definition for id 42 has levels and the same template id T1
      abstractNum({ id: 42, tmpl: 'T1', withLevels: true }),
      // Map numId=5 to abstractId=42
      num({ numId: 5, abstractId: 42 }),
    ]);

    const docx = { 'word/numbering.xml': numbering };
    const def = getAbstractDefinition('5', docx);
    expect(def).toBeTruthy();
    expect(def.attributes['w:abstractNumId']).toBe('42');
  });

  it('falls back to template-based abstract when direct definition has no levels', () => {
    const numbering = numberingXml([
      // Place the template-matching abstract FIRST so fallback would choose it
      abstractNum({ id: 0, tmpl: 'T1', withLevels: true }),
      // Direct abstract definition for id 42 exists but has NO levels
      abstractNum({ id: 42, tmpl: 'T1', withLevels: false }),
      // Map numId=5 to abstractId=42
      num({ numId: 5, abstractId: 42 }),
    ]);

    const docx = { 'word/numbering.xml': numbering };
    const def = getAbstractDefinition('5', docx);
    expect(def).toBeTruthy();
    // Should pick the template-matching abstract (id=0) since 42 has no w:lvl
    expect(def.attributes['w:abstractNumId']).toBe('0');
  });

  it('does not select a template-matching abstract that lacks levels', () => {
    const numbering = numberingXml([
      // Place the no-level template abstract FIRST
      abstractNum({ id: 0, tmpl: 'T1', withLevels: false }),
      // Direct abstract (42) has levels but also has a template id
      abstractNum({ id: 42, tmpl: 'T1', withLevels: true }),
      num({ numId: 5, abstractId: 42 }),
    ]);

    const docx = { 'word/numbering.xml': numbering };
    const def = getAbstractDefinition('5', docx);
    expect(def).toBeTruthy();
    // Should not switch to the abstract without levels
    expect(def.attributes['w:abstractNumId']).toBe('42');
  });

  it('when multiple template matches exist, prefers one with levels', () => {
    const numbering = numberingXml([
      // Direct abstract (42) exists but has no levels
      abstractNum({ id: 42, tmpl: 'T1', withLevels: false }),
      // Template-matching abstract without levels (should be ignored)
      abstractNum({ id: 0, tmpl: 'T1', withLevels: false }),
      // Template-matching abstract WITH levels (should be chosen)
      abstractNum({ id: 7, tmpl: 'T1', withLevels: true }),
      num({ numId: 5, abstractId: 42 }),
    ]);

    const docx = { 'word/numbering.xml': numbering };
    const def = getAbstractDefinition('5', docx);
    expect(def).toBeTruthy();
    expect(def.attributes['w:abstractNumId']).toBe('7');
  });
});

describe('getListLevelDefinitionTag + template fallback behavior', () => {
  it('uses the direct abstract definition when levels exist even if a template match differs', () => {
    const numbering = numberingXml([
      // Put template-matching abstract FIRST to catch wrong fallback
      abstractNum({ id: 0, tmpl: 'T1', withLevels: true, fmt: 'lowerRoman' }),
      // Direct abstract (42) has levels with decimal
      abstractNum({ id: 42, tmpl: 'T1', withLevels: true, fmt: 'decimal' }),
      num({ numId: 5, abstractId: 42 }),
    ]);

    const docx = { 'word/numbering.xml': numbering };
    const { numFmt } = getListLevelDefinitionTag('5', 0, null, docx);
    // Should come from abstract 42 (decimal), not template-matching abstract 0 (lowerRoman)
    expect(numFmt).toBe('decimal');
  });
});

describe('getDefinitionForLevel', () => {
  it('returns memoized levels when cache is populated', () => {
    const lvlNode = { attributes: { 'w:ilvl': '0' } };
    const abstract = {
      elements: [lvlNode],
      [LEVELS_MAP_KEY]: new Map([[0, lvlNode]]),
    };

    expect(getDefinitionForLevel(abstract, '0')).toBe(lvlNode);
  });

  it('falls back to scanning elements when memoized levels are missing', () => {
    const lvlNode = { attributes: { 'w:ilvl': '3' } };
    const abstract = { elements: [{ name: 'w:lvl', attributes: { 'w:ilvl': '1' } }, lvlNode] };

    expect(getDefinitionForLevel(abstract, 3)).toBe(lvlNode);
  });

  it('returns undefined when level cannot be resolved', () => {
    const abstract = { elements: [] };

    expect(getDefinitionForLevel(null, 0)).toBeUndefined();
    expect(getDefinitionForLevel(abstract, 'not-a-level')).toBeUndefined();
  });
});
