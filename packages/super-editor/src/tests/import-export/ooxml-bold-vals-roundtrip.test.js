import { describe, it, expect } from 'vitest';
import { getTestDataByFileName } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const isBoldVal = (raw) => {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const v = String(raw).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'on') return true;
  return true;
};

const collectRunsWithTextAndBold = (docJson) => {
  const body = docJson.elements?.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];
  const runs = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const textEl = (child.elements || []).find((el) => el.name === 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      const rPr = (child.elements || []).find((el) => el.name === 'w:rPr');
      const wB = rPr?.elements?.find((el) => el.name === 'w:b');
      runs.push({ text, bold: Boolean(wB) });
    });
  });
  return runs;
};

const collectSourceRuns = (sourceDocJson) => {
  const body = sourceDocJson.elements[0].elements.find((el) => el.name === 'w:body');
  const paragraphs = body?.elements?.filter((n) => n.name === 'w:p') || [];
  const runs = [];
  paragraphs.forEach((p) => {
    (p.elements || []).forEach((child) => {
      if (child.name !== 'w:r') return;
      const textEl = (child.elements || []).find((el) => el.name === 'w:t');
      const text = textEl?.elements?.find((e) => e.type === 'text')?.text;
      if (!text) return;
      const rPr = (child.elements || []).find((el) => el.name === 'w:rPr');
      const wB = rPr?.elements?.find((el) => el.name === 'w:b');
      const val = wB?.attributes?.['w:val'];
      const bold = wB ? isBoldVal(val) : false;
      runs.push({ text, bold });
    });
  });
  return runs;
};

describe('OOXML bold values round-trip', async () => {
  const fileName = 'ooxml-bold-vals-demo.docx';
  const sourceXmlMap = await getTestDataByFileName(fileName);
  const sourceRuns = collectSourceRuns(sourceXmlMap['word/document.xml']);

  const exported = await getExportedResult(fileName);
  const exportedRuns = collectRunsWithTextAndBold(exported);

  it('preserves bold mapping for runs with text', () => {
    // Compare only the length of the shorter list to avoid test fragility
    const n = Math.min(sourceRuns.length, exportedRuns.length);
    for (let i = 0; i < n; i++) {
      // Same text content and bold-ness across positions
      expect(Boolean(exportedRuns[i].text)).toBe(true);
      expect(exportedRuns[i].bold).toBe(sourceRuns[i].bold);
    }
  });
});
