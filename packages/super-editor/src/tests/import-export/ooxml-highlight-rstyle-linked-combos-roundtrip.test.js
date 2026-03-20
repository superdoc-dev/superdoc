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
      const wHl = find(rPr, 'w:highlight');
      const wShd = find(rPr, 'w:shd');
      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      const hlVal = wHl?.attributes?.['w:val'];
      const hasHighlight =
        (wHl && typeof hlVal === 'string' && hlVal.toLowerCase() !== 'none') ||
        (!!wShd && (!wShd.attributes || wShd.attributes['w:fill'] !== undefined));
      let sourceTag = null;
      if (hasHighlight) {
        sourceTag = wHl && hlVal?.toLowerCase() !== 'none' ? 'w:highlight' : 'w:shd';
      }
      runs.push({
        text,
        hasHighlight,
        sourceTag,
      });
    });
  });
  return runs;
};

const collectFromExport = (doc) => {
  const body = doc.elements?.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];
  const runs = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');
      const wHl = find(rPr, 'w:highlight');
      const wShd = find(rPr, 'w:shd');
      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      const hlVal = wHl?.attributes?.['w:val'];
      const hasHighlight =
        (wHl && typeof hlVal === 'string' && hlVal.toLowerCase() !== 'none') ||
        (!!wShd && (!wShd.attributes || wShd.attributes['w:fill'] !== undefined));
      let highlightTag = null;
      if (hasHighlight) {
        highlightTag = wHl && hlVal?.toLowerCase() !== 'none' ? 'w:highlight' : 'w:shd';
      }
      runs.push({
        text,
        hasHighlight,
        highlightTag,
      });
    });
  });
  return runs;
};

describe('OOXML highlight + rStyle + linked combinations round-trip', async () => {
  const fileName = 'ooxml-highlight-rstyle-linked-combos-demo.docx';
  const sourceXmlMap = await getTestDataByFileName(fileName);
  const sourceRuns = collectExpectedFromSource(sourceXmlMap['word/document.xml']);

  const exported = await getExportedResult(fileName);
  const exportedRuns = collectFromExport(exported);

  it('preserves inline highlight on export; does not emit for style-only', () => {
    const tagOverrides = new Map([
      ["Styled yellow highlight|  - rStyle='SD_HighlightYellowChar': ", 'w:highlight'],
      ["Styled green shading|  - rStyle='SD_ShadingGreenChar': ", 'w:shd'],
      ["Styled lightGray highlight|  - rStyle='SD_HighlightLightGrayChar': ", 'w:highlight'],
      ["Linked Char style applied|  - rStyle='SD_LinkedHighlightHeadingChar' => yellow: ", 'w:highlight'],
      [
        "  - pStyle='SD_LinkedHighlightHeading' (lightGray) + inline 'red' on a run: |Linked Char style applied",
        'w:highlight',
      ],
    ]);

    const n = Math.min(sourceRuns.length, exportedRuns.length);
    for (let i = 0; i < n; i++) {
      expect(Boolean(exportedRuns[i].text)).toBe(true);
      const prevText = sourceRuns[i - 1]?.text || '';
      const key = `${sourceRuns[i].text}|${prevText}`;
      const expected = sourceRuns[i].hasHighlight;
      expect(exportedRuns[i].hasHighlight).toBe(expected);
      const expectedTag = tagOverrides.has(key) ? tagOverrides.get(key) : sourceRuns[i].sourceTag;
      expect(exportedRuns[i].highlightTag).toBe(expected ? expectedTag : null);
    }
  });
});
