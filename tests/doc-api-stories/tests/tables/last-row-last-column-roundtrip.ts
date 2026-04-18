import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const FIXTURE_DOC = path.resolve(import.meta.dirname, 'fixtures', 'table-style-options-roundtrip.docx');

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

// ---------------------------------------------------------------------------
// tblLook XML extraction helpers
// ---------------------------------------------------------------------------

function extractFirstTableXml(documentXml: string): string {
  const match = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!match) throw new Error('No table markup found in word/document.xml.');
  return match[0];
}

function extractTblLookAttr(tableXml: string, attrName: string): string | null {
  const tblLookMatch = tableXml.match(/<w:tblLook\b([^>]*)\/?\s*>/);
  if (!tblLookMatch) return null;
  const attrMatch = tblLookMatch[1].match(new RegExp(`\\bw:${attrName}="([^"]+)"`));
  return attrMatch?.[1] ?? null;
}

function hasTblLookVal(tableXml: string): boolean {
  return extractTblLookAttr(tableXml, 'val') != null;
}

function isTruthy(value: string | null): boolean {
  if (value == null) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'on';
}

function isFalsy(value: string | null): boolean {
  if (value == null) return false;
  return value === '0' || value.toLowerCase() === 'false' || value.toLowerCase() === 'off';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('document-api story: lastRow / lastColumn style option roundtrip', () => {
  const { client, copyDoc, outPath } = useStoryHarness('tables/last-row-last-column-roundtrip', {
    preserveResults: true,
  });

  it('enables lastRow + lastColumn, saves, reopens, and verifies OOXML + API state', async () => {
    const sourceDoc = await copyDoc(FIXTURE_DOC, 'source.docx');
    const enableSessionId = sid('enable');
    const reopenEnableSessionId = sid('reopen-enable');
    const reopenDisableSessionId = sid('reopen-disable');

    // ── Enable path ──────────────────────────────────────────────────────

    await client.doc.open({ sessionId: enableSessionId, doc: sourceDoc });

    const firstTable = unwrap<any>(
      await client.doc.query.match({
        sessionId: enableSessionId,
        select: { type: 'node', nodeType: 'table' },
        require: 'first',
      }),
    );
    const tableNodeId = firstTable?.items?.[0]?.address?.nodeId;
    expect(typeof tableNodeId).toBe('string');

    // Set lastRow and lastColumn to true
    const setLastRow = unwrap<any>(
      await client.doc.tables.setStyleOption({
        sessionId: enableSessionId,
        nodeId: tableNodeId,
        flag: 'lastRow',
        enabled: true,
      }),
    );
    expect(setLastRow?.success).toBe(true);

    const setLastCol = unwrap<any>(
      await client.doc.tables.setStyleOption({
        sessionId: enableSessionId,
        nodeId: tableNodeId,
        flag: 'lastColumn',
        enabled: true,
      }),
    );
    expect(setLastCol?.success).toBe(true);

    // Save
    const enabledDocPath = outPath('enabled.docx');
    await client.doc.save({ sessionId: enableSessionId, out: enabledDocPath, force: true });

    // Inspect OOXML
    const enabledDocXml = await readDocxPart(enabledDocPath, 'word/document.xml');
    const enabledTableXml = extractFirstTableXml(enabledDocXml);

    expect(isTruthy(extractTblLookAttr(enabledTableXml, 'lastRow'))).toBe(true);
    expect(isTruthy(extractTblLookAttr(enabledTableXml, 'lastColumn'))).toBe(true);
    // Stale w:val must be deleted after mutation
    expect(hasTblLookVal(enabledTableXml)).toBe(false);

    // Reopen and verify via getProperties
    await client.doc.open({ sessionId: reopenEnableSessionId, doc: enabledDocPath });

    const reopenedTable = unwrap<any>(
      await client.doc.query.match({
        sessionId: reopenEnableSessionId,
        select: { type: 'node', nodeType: 'table' },
        require: 'first',
      }),
    );
    const reopenedNodeId = reopenedTable?.items?.[0]?.address?.nodeId;

    const enabledProps = unwrap<any>(
      await client.doc.tables.getProperties({
        sessionId: reopenEnableSessionId,
        nodeId: reopenedNodeId,
      }),
    );
    expect(enabledProps?.styleOptions?.lastRow).toBe(true);
    expect(enabledProps?.styleOptions?.lastColumn).toBe(true);

    // ── Disable path ─────────────────────────────────────────────────────

    // Disable lastRow and lastColumn
    const disableLastRow = unwrap<any>(
      await client.doc.tables.setStyleOption({
        sessionId: reopenEnableSessionId,
        nodeId: reopenedNodeId,
        flag: 'lastRow',
        enabled: false,
      }),
    );
    expect(disableLastRow?.success).toBe(true);

    const disableLastCol = unwrap<any>(
      await client.doc.tables.setStyleOption({
        sessionId: reopenEnableSessionId,
        nodeId: reopenedNodeId,
        flag: 'lastColumn',
        enabled: false,
      }),
    );
    expect(disableLastCol?.success).toBe(true);

    // Save disabled state
    const disabledDocPath = outPath('disabled.docx');
    await client.doc.save({ sessionId: reopenEnableSessionId, out: disabledDocPath, force: true });

    // Inspect OOXML — attrs must be present with false-equivalent value
    const disabledDocXml = await readDocxPart(disabledDocPath, 'word/document.xml');
    const disabledTableXml = extractFirstTableXml(disabledDocXml);

    const disabledLastRow = extractTblLookAttr(disabledTableXml, 'lastRow');
    const disabledLastCol = extractTblLookAttr(disabledTableXml, 'lastColumn');
    expect(disabledLastRow).not.toBeNull();
    expect(isFalsy(disabledLastRow)).toBe(true);
    expect(disabledLastCol).not.toBeNull();
    expect(isFalsy(disabledLastCol)).toBe(true);
    // w:val must still be absent
    expect(hasTblLookVal(disabledTableXml)).toBe(false);

    // Reopen and verify disable state via API
    await client.doc.open({ sessionId: reopenDisableSessionId, doc: disabledDocPath });

    const disabledTable = unwrap<any>(
      await client.doc.query.match({
        sessionId: reopenDisableSessionId,
        select: { type: 'node', nodeType: 'table' },
        require: 'first',
      }),
    );
    const disabledTableNodeId = disabledTable?.items?.[0]?.address?.nodeId;

    const disabledProps = unwrap<any>(
      await client.doc.tables.getProperties({
        sessionId: reopenDisableSessionId,
        nodeId: disabledTableNodeId,
      }),
    );
    expect(disabledProps?.styleOptions?.lastRow).toBe(false);
    expect(disabledProps?.styleOptions?.lastColumn).toBe(false);
  });

  it('materializes full Word-default baseline when tblLook is absent', async () => {
    // Create a new table (no tblLook) and set lastRow
    const sessionId = sid('materialize');

    // Open any doc — we'll create a new table in it
    const sourceDoc = await copyDoc(FIXTURE_DOC, 'materialize-source.docx');
    await client.doc.open({ sessionId, doc: sourceDoc });

    // Create a fresh table (no tblLook)
    const createResult = unwrap<any>(await client.doc.create.table({ sessionId, rows: 2, columns: 2 }));
    expect(createResult?.success).toBe(true);
    const newTableNodeId = createResult?.table?.nodeId;
    expect(typeof newTableNodeId).toBe('string');

    // Set lastRow on the new table
    const setResult = unwrap<any>(
      await client.doc.tables.setStyleOption({
        sessionId,
        nodeId: newTableNodeId,
        flag: 'lastRow',
        enabled: true,
      }),
    );
    expect(setResult?.success).toBe(true);

    // Save
    const savedPath = outPath('materialized.docx');
    await client.doc.save({ sessionId, out: savedPath, force: true });

    // Inspect OOXML — all flags should be present at Word-default values
    const docXml = await readDocxPart(savedPath, 'word/document.xml');
    // Find the LAST table (the created one is appended)
    const tables = docXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g);
    expect(tables).not.toBeNull();
    const createdTableXml = tables![tables!.length - 1];

    expect(isTruthy(extractTblLookAttr(createdTableXml, 'lastRow'))).toBe(true);
    expect(isTruthy(extractTblLookAttr(createdTableXml, 'firstRow'))).toBe(true);
    expect(isTruthy(extractTblLookAttr(createdTableXml, 'firstColumn'))).toBe(true);
    expect(isFalsy(extractTblLookAttr(createdTableXml, 'lastColumn'))).toBe(true);
    expect(isFalsy(extractTblLookAttr(createdTableXml, 'noHBand'))).toBe(true);
    expect(isTruthy(extractTblLookAttr(createdTableXml, 'noVBand'))).toBe(true);
    // w:val must be absent
    expect(hasTblLookVal(createdTableXml)).toBe(false);

    // Reopen and verify all six flags via getProperties
    const reopenSessionId = sid('materialize-reopen');
    await client.doc.open({ sessionId: reopenSessionId, doc: savedPath });

    // Find the second table
    const allTables = unwrap<any>(
      await client.doc.query.match({
        sessionId: reopenSessionId,
        select: { type: 'node', nodeType: 'table' },
      }),
    );
    const lastTableNodeId = allTables?.items?.[allTables.items.length - 1]?.address?.nodeId;

    const props = unwrap<any>(
      await client.doc.tables.getProperties({
        sessionId: reopenSessionId,
        nodeId: lastTableNodeId,
      }),
    );
    expect(props?.styleOptions).toEqual({
      headerRow: true,
      lastRow: true,
      firstColumn: true,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
    });
  });
});
