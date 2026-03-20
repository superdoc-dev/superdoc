import { describe, it, expect } from 'vitest';
import { getTestDataByFileName } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const find = (el, name) => (el?.elements || []).find((e) => e.name === name);

const collectExpectedFromSource = (doc) => {
  const body = doc.elements[0].elements.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];
  const runs = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');
      const wU = find(rPr, 'w:u');
      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      let underline = false;
      let underlineType = null;
      let color = null;
      let themeColor = null;
      let themeTint = null;
      let themeShade = null;
      if (wU) {
        const raw = wU.attributes?.['w:val'];
        const val = raw == null || raw === '' ? 'single' : String(raw);
        underlineType = val;
        underline = !(val.toLowerCase() === 'none' || val === '0');
        color = wU.attributes?.['w:color'] || null;
        themeColor = wU.attributes?.['w:themeColor'] || null;
        themeTint = wU.attributes?.['w:themeTint'] || null;
        themeShade = wU.attributes?.['w:themeShade'] || null;
      }
      runs.push({ text, underline, underlineType, color, themeColor, themeTint, themeShade });
    });
  });
  return runs;
};

const collectUnderlineFromExport = (doc) => {
  const body = doc.elements?.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];
  const runs = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');
      const wU = find(rPr, 'w:u');
      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      const attrs = wU?.attributes || {};
      const raw = attrs['w:val'];
      const val = raw == null || raw === '' ? 'single' : String(raw);
      const underline = !!wU && val.toLowerCase() !== 'none';
      runs.push({
        text,
        underline,
        underlineType: wU ? val : null,
        color: attrs['w:color'] || null,
        themeColor: attrs['w:themeColor'] || null,
        themeTint: attrs['w:themeTint'] || null,
        themeShade: attrs['w:themeShade'] || null,
      });
    });
  });
  return runs;
};

describe('OOXML underline + rStyle + linked combinations round-trip', async () => {
  const fileName = 'ooxml-underline-rstyle-linked-combos-demo.docx';
  const sourceXmlMap = await getTestDataByFileName(fileName);
  const sourceRuns = collectExpectedFromSource(sourceXmlMap['word/document.xml']);

  const exported = await getExportedResult(fileName);
  const exportedRuns = collectUnderlineFromExport(exported);

  it('maintains underline presence from inline w:u across import/export', () => {
    const n = Math.min(sourceRuns.length, exportedRuns.length);
    for (let i = 0; i < n; i++) {
      expect(Boolean(exportedRuns[i].text)).toBe(true);
      const prevText = sourceRuns[i - 1]?.text || '';
      const key = `${sourceRuns[i].text}|${prevText}`;
      const expected = sourceRuns[i].underline;
      expect(exportedRuns[i].underline).toBe(expected);

      const attributeExpectations = new Map([
        [
          "Red underline sample|  - w:u w:val='single' w:color='FF0000' (red underline): ",
          { color: 'FF0000', underlineType: 'single' },
        ],
        [
          "Theme-colored wave underline sample|  - w:u w:val='wave' w:themeColor='accent1' (theme-based underline color): ",
          { themeColor: 'accent1', underlineType: 'wave' },
        ],
      ]);

      const expectedAttrs = attributeExpectations.get(key);
      if (expectedAttrs) {
        if (expectedAttrs.color) {
          expect(exportedRuns[i].color).toBe(expectedAttrs.color);
        }
        if (expectedAttrs.themeColor) {
          expect(exportedRuns[i].themeColor).toBe(expectedAttrs.themeColor);
        }
        if (expectedAttrs.underlineType) {
          expect(exportedRuns[i].underlineType).toBe(expectedAttrs.underlineType);
        }
      }
    }
  });
});
