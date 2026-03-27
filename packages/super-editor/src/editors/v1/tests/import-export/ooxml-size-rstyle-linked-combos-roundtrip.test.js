import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDataByFileName, loadTestDataForEditorTests, initTestEditor } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const find = (el, name) => (el?.elements || []).find((e) => e.name === name);

const halfPointToPt = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  const pts = num / 2;
  return Number.isInteger(pts) ? `${pts}pt` : `${pts}pt`;
};

const collectSizes = (doc) => {
  const runs = [];

  const processParagraph = (paragraph) => {
    (paragraph.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const rPr = find(child, 'w:rPr');
      let size = null;
      const inlineSz = find(rPr, 'w:sz');
      const inlineSize = halfPointToPt(inlineSz?.attributes?.['w:val']);
      if (inlineSize) size = inlineSize;

      const textEl = find(child, 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      runs.push({ text, size });
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

describe('OOXML size + rStyle + linked combinations round-trip', () => {
  const fileName = 'ooxml-size-rstyle-linked-combos-demo.docx';
  let sourceRuns = [];
  let exportedRuns = [];

  beforeAll(async () => {
    const sourceXmlMap = await getTestDataByFileName(fileName);
    sourceRuns = collectSizes(sourceXmlMap['word/document.xml']);

    const exported = await getExportedResult(fileName);
    exportedRuns = collectSizes(exported);
  });

  it('preserves font size across import/export, including style-driven and inline overrides', () => {
    expect(exportedRuns.length).toBe(sourceRuns.length);

    const n = sourceRuns.length;
    for (let i = 0; i < n; i++) {
      expect(Boolean(exportedRuns[i].text)).toBe(true);
      expect(exportedRuns[i].size).toBe(sourceRuns[i].size);
    }
  });
});
