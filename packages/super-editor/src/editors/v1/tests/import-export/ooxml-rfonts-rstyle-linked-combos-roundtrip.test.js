import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDataByFileName } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const find = (el, name) => (el?.elements || []).find((e) => e.name === name);

const extractFontsFromElement = (rFontsEl) => {
  if (!rFontsEl?.attributes) return null;
  return { ...rFontsEl.attributes };
};

const normalizeFonts = (fonts) => {
  if (!fonts) return null;
  const normalized = { ...fonts };
  if (normalized['w:eastAsia'] && normalized['w:val'] === undefined) {
    normalized['w:val'] = normalized['w:eastAsia'];
  }
  return Object.keys(normalized).length ? normalized : null;
};

const collectRunsWithFonts = (doc) => {
  const runs = [];

  const processParagraph = (paragraph) => {
    (paragraph.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');

      const inlineFonts = normalizeFonts(extractFontsFromElement(find(rPr, 'w:rFonts')));
      const fonts = normalizeFonts(inlineFonts);

      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      runs.push({ text, fonts });
    });
  };

  const walk = (node) => {
    (node?.elements || []).forEach((child) => {
      if (child.name === 'w:p') processParagraph(child);
      else if (child.elements) walk(child);
    });
  };

  walk(doc);
  return runs;
};

describe('OOXML rFonts + rStyle + linked combinations round-trip', () => {
  const fileName = 'ooxml-rFonts-rstyle-linked-combos-demo.docx';
  let sourceRuns = [];
  let exportedRuns = [];

  beforeAll(async () => {
    const sourceXmlMap = await getTestDataByFileName(fileName);
    sourceRuns = collectRunsWithFonts(sourceXmlMap['word/document.xml']);

    const exported = await getExportedResult(fileName);
    exportedRuns = collectRunsWithFonts(exported);
  });

  it('preserves rFonts attributes across import/export, including style-driven and inline overrides', () => {
    expect(exportedRuns.length).toBe(sourceRuns.length);

    const n = sourceRuns.length;
    for (let i = 0; i < n; i++) {
      expect(Boolean(exportedRuns[i].text)).toBe(true);
      const expectedFonts = sourceRuns[i].fonts;
      const actualFonts = exportedRuns[i].fonts;

      if (!expectedFonts) {
        expect(actualFonts).toEqual(null);
        continue;
      }

      const expectedKeys = Object.keys(expectedFonts);
      const requiredKeys = expectedKeys.filter((key) => ['w:ascii', 'w:hAnsi'].includes(key));

      if (!actualFonts) {
        expect(requiredKeys.length).toBe(0);
        continue;
      }

      requiredKeys.forEach((key) => {
        expect(actualFonts?.[key]).toBe(expectedFonts[key]);
      });
    }
  });
});
