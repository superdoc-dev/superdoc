import { beforeAll, describe, expect, it } from 'vitest';
import { getTestDataByFileName } from '../helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index.js';

const find = (el, name) => (el?.elements || []).find((child) => child.name === name);

const getDocumentNode = (doc) => {
  if (!doc) return null;
  if (doc.name === 'w:document') return doc;
  if (Array.isArray(doc.elements)) {
    return doc.elements.find((el) => el.name === 'w:document') || doc.elements[0];
  }
  return null;
};

const getTextFromRun = (run) => {
  const textEl = find(run, 'w:t');
  return textEl?.elements?.find((el) => el.type === 'text')?.text || '';
};

const collectRunFormatting = (doc) => {
  const documentNode = getDocumentNode(doc);
  if (!documentNode) return [];

  const body = documentNode.elements?.find((el) => el.name === 'w:body');
  if (!body) return [];

  const runs = [];
  (body.elements || []).forEach((para) => {
    if (para.name !== 'w:p') return;

    (para.elements || []).forEach((node) => {
      if (node.name !== 'w:r') return;
      const text = getTextFromRun(node);
      const rPr = find(node, 'w:rPr');
      const colorEl = find(rPr, 'w:color');
      const highlightEl = find(rPr, 'w:highlight');
      runs.push({
        text,
        color: colorEl?.attributes?.['w:val'],
        highlight: highlightEl?.attributes?.['w:val'],
      });
    });
  });

  return runs;
};

describe('[text-color-highlight.docx] retains inline colors and highlight on export', () => {
  const fileName = 'text-color-highlight.docx';
  const interestingTexts = ['purple', 'BLUE', 'green', 'text with highlight'];

  let sourceRuns = [];
  let exportedRuns = [];

  beforeAll(async () => {
    const sourceXmlMap = await getTestDataByFileName(fileName);
    sourceRuns = collectRunFormatting(sourceXmlMap['word/document.xml']);

    const exported = await getExportedResult(fileName);
    exportedRuns = collectRunFormatting(exported);
  });

  interestingTexts.forEach((sampleText) => {
    it(`preserves formatting for "${sampleText}"`, () => {
      const sourceRun = sourceRuns.find((run) => run.text === sampleText);
      const exportedRun = exportedRuns.find((run) => run.text === sampleText);

      expect(sourceRun).toBeDefined();
      expect(exportedRun).toBeDefined();

      expect(exportedRun.color).toBe(sourceRun.color);
      expect(exportedRun.highlight).toBe(sourceRun.highlight);
    });
  });
});
