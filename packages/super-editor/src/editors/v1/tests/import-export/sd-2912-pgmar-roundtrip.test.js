import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { initTestEditor } from '../helpers/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const countOccurrences = (haystack, needle) => {
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
};

async function roundTripCounts(fixtureFileName) {
  const docxPath = join(__dirname, '../data', fixtureFileName);
  const docxBuffer = await fs.readFile(docxPath);

  const inputZipper = new DocxZipper();
  const inputEntries = await inputZipper.getDocxData(docxBuffer, true);
  const inputDocXml = inputEntries.find((e) => e.name === 'word/document.xml').content;

  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(docxBuffer, true);
  const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

  const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
  const exportedZipper = new DocxZipper();
  const exportedEntries = await exportedZipper.getDocxData(exportedBuffer, true);
  const exportDocXml = exportedEntries.find((e) => e.name === 'word/document.xml').content;

  return {
    input: {
      bCs: countOccurrences(inputDocXml, '<w:bCs'),
      iCs: countOccurrences(inputDocXml, '<w:iCs'),
      highlight: countOccurrences(inputDocXml, '<w:highlight'),
    },
    output: {
      bCs: countOccurrences(exportDocXml, '<w:bCs'),
      iCs: countOccurrences(exportDocXml, '<w:iCs'),
      highlight: countOccurrences(exportDocXml, '<w:highlight'),
    },
  };
}

describe('SD-2912 — DOCX round-trip does not inject redundant default rPr elements', () => {
  it('does not add `<w:bCs/>` elements that were not in the source document.xml', async () => {
    const { input, output } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
    expect(input.bCs).toBe(0);
    expect(output.bCs).toBe(0);
  });

  it('does not add `<w:iCs/>` elements that were not in the source document.xml', async () => {
    const { input, output } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
    expect(input.iCs).toBe(0);
    expect(output.iCs).toBe(0);
  });

  it('does not add `<w:highlight w:val="none"/>` elements that were not in the source document.xml', async () => {
    const { input, output } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
    expect(input.highlight).toBe(0);
    expect(output.highlight).toBe(0);
  });
});
