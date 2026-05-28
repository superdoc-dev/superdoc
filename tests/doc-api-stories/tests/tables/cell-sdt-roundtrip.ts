import { execFile } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
type JsZipConstructor = typeof import('jszip').default;

const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const TEMPLATE_DOCX = path.join(REPO_ROOT, 'packages/super-editor/src/editors/v1/tests/data/basic-list.docx');

const DATE_TEXT = '18 January 2025';
const LABEL_TEXT = 'COMMENCEMENT DATE';
const DATE_FULL = '2025-01-18T00:00:00Z';

// Build a synthetic minimal document.xml carrying the IT-1119 OOXML shape:
// <w:tr> with a direct <w:tc> followed by a cell-level <w:sdt>
// (ECMA-376 §17.5.2.32, CT_SdtCell) whose <w:sdtContent> wraps a single <w:tc>.
// When `includeSdtEndPr` is true, the wrapper also carries <w:sdtEndPr/>
// (CT_SdtCell schema: sdtEndPr is 0..1 and Word emits it for end-marker
// formatting on some controls).
function buildSyntheticDocumentXml(options: { includeSdtEndPr: boolean }): string {
  const sdtEndPrFragment = options.includeSdtEndPr ? '<w:sdtEndPr><w:rPr><w:b/></w:rPr></w:sdtEndPr>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
    <w:p><w:r><w:t>Cell-level SDT round-trip fixture for SD-3289</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9180" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3260"/>
        <w:gridCol w:w="5920"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="3260" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>${LABEL_TEXT}</w:t></w:r></w:p>
        </w:tc>
        <w:sdt>
          <w:sdtPr>
            <w:id w:val="849213029"/>
            <w:date w:fullDate="${DATE_FULL}">
              <w:dateFormat w:val="d MMMM yyyy"/>
              <w:lid w:val="en-AU"/>
              <w:storeMappedDataAs w:val="dateTime"/>
              <w:calendar w:val="gregorian"/>
            </w:date>
          </w:sdtPr>
          ${sdtEndPrFragment}
          <w:sdtContent>
            <w:tc>
              <w:tcPr><w:tcW w:w="5920" w:type="dxa"/></w:tcPr>
              <w:p><w:r><w:t>${DATE_TEXT}</w:t></w:r></w:p>
            </w:tc>
          </w:sdtContent>
        </w:sdt>
      </w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// Synthetic docProps/core.xml so the generated fixture carries no third-party
// metadata from the base template. Public-repo safety net.
const SYNTHETIC_CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>SD-3289 cell-level SDT fixture</dc:title><dc:creator>SuperDoc tests</dc:creator><cp:lastModifiedBy>SuperDoc tests</cp:lastModifiedBy><cp:revision>1</cp:revision></cp:coreProperties>`;

let jsZipPromise: Promise<JsZipConstructor> | null = null;
async function loadJsZip(): Promise<JsZipConstructor> {
  if (jsZipPromise) return jsZipPromise;
  jsZipPromise = (async () => {
    const entry = require.resolve('jszip', { paths: [path.join(REPO_ROOT, 'packages/super-editor')] });
    const mod = await import(pathToFileURL(entry).href);
    return (mod.default ?? mod) as JsZipConstructor;
  })();
  return jsZipPromise;
}

async function buildFixture(outputPath: string, options: { includeSdtEndPr: boolean }): Promise<string> {
  const JSZip = await loadJsZip();
  const sourceBytes = await readFile(TEMPLATE_DOCX);
  const zip = await JSZip.loadAsync(sourceBytes);
  zip.file('word/document.xml', buildSyntheticDocumentXml(options));
  zip.file('docProps/core.xml', SYNTHETIC_CORE_XML);
  const outputBytes = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, outputBytes);
  return outputPath;
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('document-api story: cell-level SDT round-trip (SD-3289 / IT-1119)', () => {
  const { client, outPath } = useStoryHarness('tables/cell-sdt-roundtrip', { preserveResults: true });

  it('imports cell-level SDT, finds the date text, and preserves the wrapper on export', async () => {
    const fixturePath = outPath('cell-sdt-fixture.docx');
    await buildFixture(fixturePath, { includeSdtEndPr: false });

    const sessionId = sid('cell-sdt-roundtrip');
    await client.doc.open({ sessionId, doc: fixturePath });

    // 1. query.match finds the date text after open. Customer's primary symptom
    //    (IT-1119): before the fix, this returned 0 hits.
    const matchResult = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: DATE_TEXT, mode: 'contains', caseSensitive: false },
        require: 'any',
        mode: 'strict',
        limit: 5,
      }),
    );
    expect(matchResult?.total).toBeGreaterThanOrEqual(1);

    // 2. save/export succeeds.
    const exportedPath = outPath('cell-sdt-roundtrip.docx');
    const saveResult = unwrap<any>(await client.doc.save({ sessionId, out: exportedPath, force: true }));
    expect(saveResult?.saved).toBe(true);

    // 3. Exported document.xml has the row shape <w:tr> with a bare <w:tc>
    //    followed by a <w:sdt> wrapper (the SDT-wrapped cell).
    const documentXml = await readDocxPart(exportedPath, 'word/document.xml');
    expect(documentXml).toMatch(/<w:tr\b[^>]*>[\s\S]*?<w:tc\b[^>]*>[\s\S]*?<\/w:tc>[\s\S]*?<w:sdt\b/);

    // 4. <w:sdtPr><w:date w:fullDate="2025-01-18T00:00:00Z"> survives the round-trip.
    expect(documentXml).toMatch(
      /<w:sdt\b[^>]*>[\s\S]*?<w:sdtPr\b[^>]*>[\s\S]*?<w:date\b[^>]*\bw:fullDate="2025-01-18T00:00:00Z"/,
    );

    // 5. The inner <w:tc> inside <w:sdtContent> contains the date text exactly once.
    const sdtBlockMatch = documentXml.match(/<w:sdt\b[\s\S]*?<\/w:sdt>/);
    expect(sdtBlockMatch).not.toBeNull();
    const wrappedTcMatch = sdtBlockMatch![0].match(
      /<w:sdtContent\b[^>]*>[\s\S]*?<w:tc\b[\s\S]*?<\/w:tc>[\s\S]*?<\/w:sdtContent>/,
    );
    expect(wrappedTcMatch).not.toBeNull();
    const dateOccurrencesInWrappedCell = wrappedTcMatch![0].split(DATE_TEXT).length - 1;
    expect(dateOccurrencesInWrappedCell).toBe(1);
  });

  it('preserves every sdtPr child (id, full date subtree, sdtEndPr) on round-trip', async () => {
    const fixturePath = outPath('cell-sdt-fixture-full-fidelity.docx');
    await buildFixture(fixturePath, { includeSdtEndPr: true });

    const sessionId = sid('cell-sdt-full-fidelity');
    await client.doc.open({ sessionId, doc: fixturePath });

    const exportedPath = outPath('cell-sdt-roundtrip-full-fidelity.docx');
    const saveResult = unwrap<any>(await client.doc.save({ sessionId, out: exportedPath, force: true }));
    expect(saveResult?.saved).toBe(true);

    const documentXml = await readDocxPart(exportedPath, 'word/document.xml');
    const sdtBlockMatch = documentXml.match(/<w:sdt\b[\s\S]*?<\/w:sdt>/);
    expect(sdtBlockMatch).not.toBeNull();
    const sdtBlock = sdtBlockMatch![0];

    // Every sdtPr child from the source fixture must survive byte-equivalently
    // in the exported wrapper. Opaque sdtPr preservation is what the v1 fix
    // promises; this guards against any narrowing of that contract.
    expect(sdtBlock).toMatch(/<w:sdtPr\b/);
    expect(sdtBlock).toMatch(/<w:id\b[^>]*\bw:val="849213029"/);
    expect(sdtBlock).toMatch(/<w:date\b[^>]*\bw:fullDate="2025-01-18T00:00:00Z"/);
    expect(sdtBlock).toMatch(/<w:dateFormat\b[^>]*\bw:val="d MMMM yyyy"/);
    expect(sdtBlock).toMatch(/<w:lid\b[^>]*\bw:val="en-AU"/);
    expect(sdtBlock).toMatch(/<w:storeMappedDataAs\b[^>]*\bw:val="dateTime"/);
    expect(sdtBlock).toMatch(/<w:calendar\b[^>]*\bw:val="gregorian"/);

    // sdtEndPr from the source fixture must also survive (CT_SdtCell allows
    // 0..1 sdtEndPr; the fix preserves it opaquely).
    expect(sdtBlock).toMatch(/<w:sdtEndPr\b/);

    // sdtEndPr must appear in document order between sdtPr and sdtContent.
    const sdtPrEnd = sdtBlock.indexOf('</w:sdtPr>');
    const sdtEndPrStart = sdtBlock.indexOf('<w:sdtEndPr');
    const sdtContentStart = sdtBlock.indexOf('<w:sdtContent');
    expect(sdtPrEnd).toBeGreaterThan(-1);
    expect(sdtEndPrStart).toBeGreaterThan(sdtPrEnd);
    expect(sdtContentStart).toBeGreaterThan(sdtEndPrStart);
  });
});
