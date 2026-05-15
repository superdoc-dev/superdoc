import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDataByFileName } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const THEME_KEYS = ['w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'];

const collectInlineRFonts = (doc) => {
  const found = [];

  const walk = (node) => {
    (node?.elements || []).forEach((child) => {
      if (child.name === 'w:r') {
        const rPr = (child.elements || []).find((e) => e.name === 'w:rPr');
        const rFonts = (rPr?.elements || []).find((e) => e.name === 'w:rFonts');
        if (rFonts) found.push(rFonts.attributes || {});
      } else if (child.elements) {
        walk(child);
      }
    });
  };

  walk(doc);
  return found;
};

const countAttr = (rFontsList, key) => rFontsList.reduce((n, attrs) => (attrs[key] ? n + 1 : n), 0);

describe('SD-2894 — theme rFonts preserved on DOCX round-trip', () => {
  const fileName = 'sd-2894-theme-rfonts.docx';
  let sourceRFonts = [];
  let exportedRFonts = [];

  beforeAll(async () => {
    const sourceXmlMap = await getTestDataByFileName(fileName);
    sourceRFonts = collectInlineRFonts(sourceXmlMap['word/document.xml']);

    const exported = await getExportedResult(fileName);
    exportedRFonts = collectInlineRFonts(exported);
  });

  it('preserves the inline rFonts count on document.xml', () => {
    expect(exportedRFonts.length).toBe(sourceRFonts.length);
  });

  // The ticket measured the bug by counts dropping (66 → 31). Asserting "≥ source" catches the
  // regression direction without over-fitting to leaks from the cascade that don't affect Word
  // rendering (e.g. a docDefault eastAsiaTheme appearing on an inline rFonts that didn't have one).
  it('does not drop theme attributes that were on the source', () => {
    for (const key of THEME_KEYS) {
      const sourceCount = countAttr(sourceRFonts, key);
      const exportedCount = countAttr(exportedRFonts, key);
      expect(exportedCount, `expected ${key} count to be >= source (${sourceCount})`).toBeGreaterThanOrEqual(
        sourceCount,
      );
    }
  });

  it('preserves the theme value verbatim on each run that had one', () => {
    expect(exportedRFonts.length).toBe(sourceRFonts.length);
    for (let i = 0; i < sourceRFonts.length; i++) {
      for (const key of THEME_KEYS) {
        if (sourceRFonts[i][key] !== undefined) {
          expect(exportedRFonts[i][key], `run #${i} ${key} should equal source`).toBe(sourceRFonts[i][key]);
        }
      }
    }
  });

  // This is the SD-2894 customer symptom: theme refs in the source were being replaced with concrete
  // font names on export, defeating Word's per-script font resolution and causing Times New Roman
  // body text to render as Calibri.
  it('does not substitute theme references with concrete font names on any run that had a theme reference in the source', () => {
    expect(exportedRFonts.length).toBe(sourceRFonts.length);
    const themeToConcrete = {
      'w:asciiTheme': 'w:ascii',
      'w:hAnsiTheme': 'w:hAnsi',
      'w:cstheme': 'w:cs',
      'w:eastAsiaTheme': 'w:eastAsia',
    };

    for (let i = 0; i < sourceRFonts.length; i++) {
      for (const [themeKey, concreteKey] of Object.entries(themeToConcrete)) {
        if (sourceRFonts[i][themeKey] !== undefined) {
          expect(
            exportedRFonts[i][concreteKey],
            `run #${i}: source had ${themeKey}, export must not have a concrete ${concreteKey}`,
          ).toBeUndefined();
        }
      }
    }
  });
});
