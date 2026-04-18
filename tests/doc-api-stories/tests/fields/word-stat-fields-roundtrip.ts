import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const FIXTURE_DOC = path.resolve(import.meta.dirname, 'fixtures', 'numwords.docx');

// ---------------------------------------------------------------------------
// OOXML inspection helpers (local to this story)
// ---------------------------------------------------------------------------

type ExportedComplexField = {
  fieldType: string;
  instruction: string;
  cachedText: string;
  dirty: boolean;
};

type StoryField = {
  address?: unknown;
  fieldType?: string;
  resolvedText?: string;
};

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function extractExportedComplexFields(documentXml: string): ExportedComplexField[] {
  const complexFieldPattern =
    /<w:fldChar[^>]*w:fldCharType="begin"([^>]*)\/?>[\s\S]*?<w:instrText[^>]*>([^<]*)<\/w:instrText>[\s\S]*?<w:fldChar[^>]*w:fldCharType="separate"[^>]*\/?>([\s\S]*?)<w:fldChar[^>]*w:fldCharType="end"/g;
  const exportedFields: ExportedComplexField[] = [];

  for (const match of documentXml.matchAll(complexFieldPattern)) {
    const beginAttributes = match[1] ?? '';
    const instruction = (match[2] ?? '').trim();
    const cachedSegment = match[3] ?? '';
    const cachedText = [...cachedSegment.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map((textMatch) => textMatch[1])
      .join('');
    const fieldType = instruction.split(/\s+/)[0]?.toUpperCase() ?? '';

    exportedFields.push({
      fieldType,
      instruction,
      cachedText,
      dirty: beginAttributes.includes('w:dirty="true"'),
    });
  }

  return exportedFields;
}

/** Extracts a simple element's text value from app.xml. */
function extractAppStat(appXml: string, tagName: string): string | null {
  const match = appXml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`));
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

// ---------------------------------------------------------------------------
// Story tests
// ---------------------------------------------------------------------------

describe('word-stat-fields roundtrip', () => {
  const { client, copyDoc, outPath } = useStoryHarness('fields/word-stat-fields-roundtrip', {
    preserveResults: true,
  });

  const api = client as any;

  async function openSession(docPath: string, sessionId: string) {
    await api.doc.open({ doc: docPath, sessionId });
  }

  async function saveSession(sessionId: string, savePath: string) {
    await api.doc.save({ sessionId, out: savePath, force: true });
  }

  function toStoryField(item: any): StoryField {
    return (item?.domain ?? item ?? {}) as StoryField;
  }

  async function listFields(sessionId: string): Promise<StoryField[]> {
    const listResult = unwrap<any>(await api.doc.fields.list({ sessionId }));
    return Array.isArray(listResult?.items) ? listResult.items.map(toStoryField) : [];
  }

  function listFieldTypes(items: StoryField[]): string[] {
    return items.map((item) => item.fieldType ?? '');
  }

  function findFieldByType(items: StoryField[], fieldType: string): StoryField | undefined {
    return items.find((item) => item.fieldType === fieldType);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase A & B — Import baseline + field discovery
  // ─────────────────────────────────────────────────────────────────────────

  it('imports NUMWORDS and NUMCHARS as semantic fields via fields.list', async () => {
    const docPath = await copyDoc(FIXTURE_DOC, 'phase-a-source.docx');
    const sessionId = sid('phase-a');
    await openSession(docPath, sessionId);

    const fieldTypes = listFieldTypes(await listFields(sessionId));

    expect(fieldTypes).toContain('NUMWORDS');
    expect(fieldTypes).toContain('NUMCHARS');
    expect(fieldTypes).toContain('NUMPAGES');

    await api.doc.close({ sessionId, discard: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase C — OOXML export baseline
  // ─────────────────────────────────────────────────────────────────────────

  it('exports stat fields as native OOXML complex fields with cached results', async () => {
    const docPath = await copyDoc(FIXTURE_DOC, 'phase-c-source.docx');
    const sessionId = sid('phase-c');
    const savedPath = outPath('phase-c-exported.docx');

    await openSession(docPath, sessionId);
    await saveSession(sessionId, savedPath);

    // Inspect exported document.xml
    const documentXml = await readDocxPart(savedPath, 'word/document.xml');
    const exportedFields = extractExportedComplexFields(documentXml);
    const exportedFieldByType = new Map(exportedFields.map((field) => [field.fieldType, field]));

    expect(exportedFieldByType.has('NUMWORDS')).toBe(true);
    expect(exportedFieldByType.has('NUMCHARS')).toBe(true);
    expect(exportedFieldByType.has('NUMPAGES')).toBe(true);

    // Should have fldChar structure (complex fields, not fldSimple)
    expect(documentXml).toContain('w:fldCharType="begin"');
    expect(documentXml).toContain('w:fldCharType="separate"');
    expect(documentXml).toContain('w:fldCharType="end"');

    expect(exportedFields).toHaveLength(3);

    // Inspect docProps/app.xml — stat values should be present and consistent
    const appXml = await readDocxPart(savedPath, 'docProps/app.xml');
    const wordsValue = extractAppStat(appXml, 'Words');
    const charsValue = extractAppStat(appXml, 'Characters');
    const charsWithSpaces = extractAppStat(appXml, 'CharactersWithSpaces');

    // All stat values must be numeric and positive
    expect(wordsValue).toBeTruthy();
    expect(Number(wordsValue)).toBeGreaterThan(0);
    expect(charsValue).toBeTruthy();
    expect(Number(charsValue)).toBeGreaterThan(0);
    expect(charsWithSpaces).toBeTruthy();
    expect(Number(charsWithSpaces)).toBeGreaterThan(0);

    // Characters (no spaces) must be ≤ CharactersWithSpaces (internal consistency)
    expect(Number(charsValue)).toBeLessThanOrEqual(Number(charsWithSpaces));

    expect(exportedFieldByType.get('NUMWORDS')?.cachedText).toBe(wordsValue);
    expect(exportedFieldByType.get('NUMCHARS')?.cachedText).toBe(charsValue);
    expect(exportedFieldByType.get('NUMPAGES')?.cachedText).toBe(extractAppStat(appXml, 'Pages'));

    // Dirty-flag policy: NUMWORDS and NUMCHARS should NOT be dirty (no
    // uninterpreted switches). NUMPAGES may or may not be dirty depending
    // on whether pagination was available in the test environment.
    // We verify the structural invariant rather than a blanket dirty check.
    expect(exportedFieldByType.get('NUMWORDS')?.dirty).toBe(false);
    expect(exportedFieldByType.get('NUMCHARS')?.dirty).toBe(false);
    const settingsXml = await readDocxPart(savedPath, 'word/settings.xml').catch(() => '');
    if (settingsXml) {
      expect(settingsXml).toContain('w:settings');
    }

    await api.doc.close({ sessionId, discard: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase D — Update after edit
  // ─────────────────────────────────────────────────────────────────────────

  it('rebuilds stat field values after inserting text', async () => {
    const docPath = await copyDoc(FIXTURE_DOC, 'phase-d-source.docx');
    const sessionId = sid('phase-d');

    await openSession(docPath, sessionId);

    const initialItems = await listFields(sessionId);
    const numwordsField = findFieldByType(initialItems, 'NUMWORDS');

    expect(numwordsField).toBeTruthy();

    const initialResolvedText = numwordsField?.resolvedText ?? '';

    // Append text to change the word count
    await api.doc.create.paragraph({
      sessionId,
      at: { kind: 'documentEnd' },
      text: 'These extra words change the count significantly',
    });

    const address = numwordsField?.address;
    expect(address).toBeTruthy();

    await api.doc.fields.rebuild({ sessionId, target: address });

    const updatedItems = await listFields(sessionId);
    const updatedNumwords = findFieldByType(updatedItems, 'NUMWORDS');
    const updatedResolvedText = updatedNumwords?.resolvedText ?? '';

    // After adding words, the count should be different from the original
    expect(updatedResolvedText).not.toBe(initialResolvedText);

    // Save and re-inspect OOXML
    const savedPath = outPath('phase-d-exported.docx');
    await saveSession(sessionId, savedPath);

    const documentXml = await readDocxPart(savedPath, 'word/document.xml');
    const exportedFields = extractExportedComplexFields(documentXml);
    expect(exportedFields.some((field) => field.fieldType === 'NUMWORDS')).toBe(true);

    await api.doc.close({ sessionId, discard: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase E — Reopen roundtrip
  // ─────────────────────────────────────────────────────────────────────────

  it('reimports exported fields semantically on reopen', async () => {
    const docPath = await copyDoc(FIXTURE_DOC, 'phase-e-source.docx');
    const firstSessionId = sid('phase-e-first');
    const firstSavedPath = outPath('phase-e-first-export.docx');

    await openSession(docPath, firstSessionId);
    await saveSession(firstSessionId, firstSavedPath);
    await api.doc.close({ sessionId: firstSessionId, discard: true });

    // Reopen the exported file
    const secondSessionId = sid('phase-e-second');
    await openSession(firstSavedPath, secondSessionId);
    const fieldTypes = listFieldTypes(await listFields(secondSessionId));

    // Fields should still be discoverable after roundtrip
    expect(fieldTypes).toContain('NUMWORDS');
    expect(fieldTypes).toContain('NUMCHARS');
    expect(fieldTypes).toContain('NUMPAGES');

    await api.doc.close({ sessionId: secondSessionId, discard: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Targeted semantic tests
  // ─────────────────────────────────────────────────────────────────────────

  it('preserves unrelated docProps/app.xml elements across export', async () => {
    const docPath = await copyDoc(FIXTURE_DOC, 'appxml-preservation-source.docx');
    const sessionId = sid('appxml-pres');
    const savedPath = outPath('appxml-preservation-exported.docx');

    await openSession(docPath, sessionId);
    await saveSession(sessionId, savedPath);

    const appXml = await readDocxPart(savedPath, 'docProps/app.xml');

    // The original fixture has Application, Template, TotalTime, etc.
    // These should survive export.
    expect(appXml).toContain('Application');
    expect(appXml).toContain('Template');

    await api.doc.close({ sessionId, discard: true });
  });
});
