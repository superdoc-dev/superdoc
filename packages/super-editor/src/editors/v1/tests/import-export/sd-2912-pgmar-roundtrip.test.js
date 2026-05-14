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

/**
 * Parse every <w:pgMar.../> in the given XML string into a list of attribute maps.
 * The fixture's pgMar elements are all self-closing single-line tags, so a regex is
 * adequate here and avoids pulling in a full XML parser for the assertion.
 */
const extractPgMarAttrs = (xml) => {
  const result = [];
  const tagRe = /<w:pgMar\s+([^>]*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = {};
    const attrRe = /([\w:]+)="([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(m[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    result.push(attrs);
  }
  return result;
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
      pgMar: extractPgMarAttrs(inputDocXml),
      raw: inputDocXml,
    },
    output: {
      bCs: countOccurrences(exportDocXml, '<w:bCs'),
      iCs: countOccurrences(exportDocXml, '<w:iCs'),
      highlight: countOccurrences(exportDocXml, '<w:highlight'),
      pgMar: extractPgMarAttrs(exportDocXml),
      raw: exportDocXml,
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

  // SD-2912 customer ask: source has float-valued <w:pgMar> attributes like
  // `w:top="168.160400390625"` that are schema-invalid per ECMA-376 §17.6.11
  // (ST_TwipsMeasure must be a non-negative whole number when expressed as
  // raw twips). Strict consumers reject the document. On export we must
  // normalize every pgMar twips attribute to an integer regardless of which
  // path it reached the export tree through (body sectPr → pageMargins →
  // inchesToTwips, or paragraph-level passthrough sectPr).
  describe('SD-2912 pgMar integer-twips normalization', () => {
    it('every <w:pgMar> attribute in the exported document.xml is an integer twips value', async () => {
      const { output } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
      expect(output.pgMar.length).toBeGreaterThan(0);
      for (const attrs of output.pgMar) {
        for (const [key, value] of Object.entries(attrs)) {
          const num = Number(value);
          expect(Number.isFinite(num), `pgMar attr ${key}="${value}" is not numeric`).toBe(true);
          expect(Number.isInteger(num), `pgMar attr ${key}="${value}" is not an integer`).toBe(true);
        }
      }
    });

    it('the exported document.xml contains no decimal-valued pgMar attribute', async () => {
      const { output } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
      // Regex sanity check on raw XML — catches any pgMar attr value with a `.`
      // followed by a digit, which is the symptom strict consumers reject.
      expect(output.raw).not.toMatch(/<w:pgMar[^>]*"\d+\.\d/);
    });

    it('source fixture confirmed to carry decimal-valued pgMar attrs (otherwise the assertion is vacuous)', async () => {
      const { input } = await roundTripCounts('sd-2912-pgmar-roundtrip.docx');
      const decimalSourceAttrs = input.pgMar.flatMap((attrs) =>
        Object.entries(attrs).filter(([, v]) => /\d+\.\d/.test(v)),
      );
      expect(decimalSourceAttrs.length).toBeGreaterThan(0);
    });
  });
});
