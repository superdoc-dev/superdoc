import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const FIXTURE_DOC = path.resolve(import.meta.dirname, 'fixtures', 'sd-2086-header-row-shading-api.docx');

type TableSnapshot = {
  explicitTableStyleId: string | null;
  defaultTableStyleId: string | null;
  resolvedTableStyleId: string | null;
  styleFirstRowShadingFill: string | null;
  tblLookFirstRow: boolean | null;
  headerRowShadingFill: string | null;
  gridWidths: number[];
  cellWidths: number[];
  rowCount: number;
  cellCount: number;
};

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function extractDefaultTableStyleId(settingsXml: string): string | null {
  const match = settingsXml.match(/<w:defaultTableStyle\b[^>]*\bw:val="([^"]+)"/);
  return match?.[1] ?? null;
}

function extractFirstTableXml(documentXml: string): string {
  const match = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!match) {
    throw new Error('No table markup found in word/document.xml.');
  }
  return match[0];
}

function extractExplicitTableStyleId(tableXml: string): string | null {
  const match = tableXml.match(/<w:tblStyle\b[^>]*\bw:val="([^"]+)"/);
  return match?.[1] ?? null;
}

function extractTblLookFirstRow(tableXml: string): boolean | null {
  const tblLookMatch = tableXml.match(/<w:tblLook\b([^>]*)\/?\s*>/);
  if (!tblLookMatch) return null;

  const attrs = tblLookMatch[1] ?? '';
  const firstRowMatch = attrs.match(/\bw:firstRow="([^"]+)"/);
  if (!firstRowMatch) return null;

  const raw = firstRowMatch[1].toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return null;
}

function extractStyleFirstRowShadingFill(stylesXml: string, styleId: string | null): string | null {
  if (!styleId) return null;

  const styleRegex = new RegExp(
    `<w:style\\b[^>]*\\bw:type="table"[^>]*\\bw:styleId="${escapeForRegex(styleId)}"[^>]*>[\\s\\S]*?<\\/w:style>`,
  );
  const styleMatch = stylesXml.match(styleRegex);
  if (!styleMatch) return null;

  const firstRowMatch = styleMatch[0].match(/<w:tblStylePr\b[^>]*\bw:type="firstRow"[^>]*>([\s\S]*?)<\/w:tblStylePr>/);
  if (!firstRowMatch) return null;

  const shadingMatch = firstRowMatch[1].match(/<w:shd\b[^>]*\bw:fill="([^"]+)"/);
  return shadingMatch?.[1]?.toUpperCase() ?? null;
}

function extractWidths(tableXml: string): { gridWidths: number[]; cellWidths: number[] } {
  const gridWidths = Array.from(tableXml.matchAll(/<w:gridCol\b[^>]*\bw:w="(\d+)"/g), (match) => Number(match[1]));
  const cellWidths = Array.from(tableXml.matchAll(/<w:tcW\b[^>]*\bw:w="(\d+)"/g), (match) => Number(match[1]));
  return { gridWidths, cellWidths };
}

function buildTableSnapshot(documentXml: string, stylesXml: string, settingsXml: string): TableSnapshot {
  const tableXml = extractFirstTableXml(documentXml);
  const explicitTableStyleId = extractExplicitTableStyleId(tableXml);
  const defaultTableStyleId = extractDefaultTableStyleId(settingsXml);
  const resolvedTableStyleId = explicitTableStyleId ?? defaultTableStyleId;
  const tblLookFirstRow = extractTblLookFirstRow(tableXml);
  const styleFirstRowShadingFill = extractStyleFirstRowShadingFill(stylesXml, resolvedTableStyleId);
  const headerRowEnabled = tblLookFirstRow ?? true;
  const headerRowShadingFill = headerRowEnabled ? styleFirstRowShadingFill : null;
  const { gridWidths, cellWidths } = extractWidths(tableXml);
  const rowCount = (tableXml.match(/<w:tr\b/g) ?? []).length;
  const cellCount = (tableXml.match(/<w:tc\b/g) ?? []).length;

  return {
    explicitTableStyleId,
    defaultTableStyleId,
    resolvedTableStyleId,
    styleFirstRowShadingFill,
    tblLookFirstRow,
    headerRowShadingFill,
    gridWidths,
    cellWidths,
    rowCount,
    cellCount,
  };
}

async function captureSnapshot(docPath: string): Promise<TableSnapshot> {
  const [documentXml, stylesXml, settingsXml] = await Promise.all([
    readDocxPart(docPath, 'word/document.xml'),
    readDocxPart(docPath, 'word/styles.xml'),
    readDocxPart(docPath, 'word/settings.xml'),
  ]);

  return buildTableSnapshot(documentXml, stylesXml, settingsXml);
}

describe('document-api story: tables header row shading roundtrip', () => {
  const { client, copyDoc, outPath } = useStoryHarness('tables/header-row-shading-roundtrip', {
    preserveResults: true,
  });

  it('inserts a 2x2 table, preserves header-row shading semantics, and roundtrips widths', async () => {
    const sourceDoc = await copyDoc(FIXTURE_DOC, 'source.docx');
    const insertSessionId = sid('tables-header-shading-insert');
    const reopenSessionId = sid('tables-header-shading-reopen');

    await client.doc.open({ sessionId: insertSessionId, doc: sourceDoc });

    const createResult = unwrap<any>(
      await client.doc.create.table({
        sessionId: insertSessionId,
        rows: 2,
        columns: 2,
      }),
    );
    expect(createResult?.success).toBe(true);

    const createdTableNodeId = createResult?.table?.nodeId;
    expect(typeof createdTableNodeId).toBe('string');

    const tableInfoBeforeExport = unwrap<any>(
      await client.doc.tables.get({
        sessionId: insertSessionId,
        nodeId: createdTableNodeId,
      }),
    );
    expect(tableInfoBeforeExport?.rows).toBe(2);
    expect(tableInfoBeforeExport?.columns).toBe(2);

    const insertedDocPath = outPath('header-row-shading-inserted.docx');
    await client.doc.save({
      sessionId: insertSessionId,
      out: insertedDocPath,
      force: true,
    });

    const before = await captureSnapshot(insertedDocPath);

    // Header-row shading should resolve from the document's default table style.
    expect(before.defaultTableStyleId).toBe('CustomTableStyleA');
    expect(before.resolvedTableStyleId).toBe('CustomTableStyleA');
    expect(before.styleFirstRowShadingFill).toBe('F2F2F2');
    expect(before.headerRowShadingFill).toBe('F2F2F2');

    // Table dimensions and width metadata should reflect a 2x2 insertion.
    expect(before.rowCount).toBe(2);
    expect(before.cellCount).toBe(4);
    expect(before.gridWidths).toHaveLength(2);
    expect(before.cellWidths).toHaveLength(4);
    for (const width of before.gridWidths) {
      expect(width).toBeGreaterThan(0);
    }
    for (const width of before.cellWidths) {
      expect(width).toBeGreaterThan(0);
    }

    await client.doc.open({
      sessionId: reopenSessionId,
      doc: insertedDocPath,
    });

    const firstTableMatch = unwrap<any>(
      await client.doc.query.match({
        sessionId: reopenSessionId,
        select: { type: 'node', nodeType: 'table' },
        require: 'first',
      }),
    );

    const reopenedTableNodeId = firstTableMatch?.items?.[0]?.address?.nodeId;
    expect(typeof reopenedTableNodeId).toBe('string');

    const tableInfoAfterReimport = unwrap<any>(
      await client.doc.tables.get({
        sessionId: reopenSessionId,
        nodeId: reopenedTableNodeId,
      }),
    );
    expect(tableInfoAfterReimport?.rows).toBe(2);
    expect(tableInfoAfterReimport?.columns).toBe(2);

    const roundtripDocPath = outPath('header-row-shading-roundtrip.docx');
    await client.doc.save({
      sessionId: reopenSessionId,
      out: roundtripDocPath,
      force: true,
    });

    const after = await captureSnapshot(roundtripDocPath);

    expect(after.defaultTableStyleId).toBe(before.defaultTableStyleId);
    expect(after.resolvedTableStyleId).toBe(before.resolvedTableStyleId);
    expect(after.styleFirstRowShadingFill).toBe(before.styleFirstRowShadingFill);
    expect(after.headerRowShadingFill).toBe(before.headerRowShadingFill);

    // Width values should survive export -> import -> export.
    expect(after.gridWidths).toEqual(before.gridWidths);
    expect(after.cellWidths).toEqual(before.cellWidths);

    expect(after.rowCount).toBe(2);
    expect(after.cellCount).toBe(4);
  });
});
