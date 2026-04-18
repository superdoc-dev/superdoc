import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useStoryHarness } from '../harness';

const FIXTURE_DOC_A = path.resolve(import.meta.dirname, '../diff/fixtures/diff-doc1.docx');
const FIXTURE_DOC_B = path.resolve(import.meta.dirname, '../diff/fixtures/diff-doc2.docx');

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function expectParagraphWriteSuccess(result: any): void {
  const success = result?.success ?? result?.result?.success ?? result?.receipt?.success;
  expect(success).toBe(true);
}

describe('document-api story: two-client handle isolation roundtrip', () => {
  const { copyDoc, outPath, createHandleClient } = useStoryHarness('session/two-client-handle-isolation-roundtrip', {
    preserveResults: true,
  });

  it('keeps reads, writes, exports, and reopens isolated across two bound document handles', async () => {
    const sourceDocA = await copyDoc(FIXTURE_DOC_A, 'client-a-source.docx');
    const sourceDocB = await copyDoc(FIXTURE_DOC_B, 'client-b-source.docx');
    const exportedDocA = outPath('client-a-export.docx');
    const exportedDocB = outPath('client-b-export.docx');

    const sessionIdA = sid('client-a');
    const sessionIdB = sid('client-b');
    const reopenSessionIdA = sid('client-a-reopen');
    const reopenSessionIdB = sid('client-b-reopen');

    const clientA = await createHandleClient({ user: { name: 'Story Client A', email: 'client-a@example.com' } });
    const clientB = await createHandleClient({ user: { name: 'Story Client B', email: 'client-b@example.com' } });

    const docA = await clientA.open({ doc: sourceDocA, sessionId: sessionIdA });
    const docB = await clientB.open({ doc: sourceDocB, sessionId: sessionIdB });

    expect(docA).not.toBe(docB);
    expect(docA.sessionId).toBe(sessionIdA);
    expect(docB.sessionId).toBe(sessionIdB);
    expect(docA.sessionId).not.toBe(docB.sessionId);

    expect((docA.openResult as any).contextId).toBe(sessionIdA);
    expect((docB.openResult as any).contextId).toBe(sessionIdB);
    expect((docA.openResult as any).document?.path).toBe(sourceDocA);
    expect((docB.openResult as any).document?.path).toBe(sourceDocB);
    expect((docA.openResult as any).document?.path).not.toBe(sourceDocB);
    expect((docB.openResult as any).document?.path).not.toBe(sourceDocA);

    const [initialTextA, initialTextB, initialMarkdownA, initialMarkdownB] = await Promise.all([
      docA.getText(),
      docB.getText(),
      docA.getMarkdown(),
      docB.getMarkdown(),
    ]);

    expect(normalize(initialTextA)).toContain('This is a test doc.');
    expect(normalize(initialTextA)).toContain('It contains two paragraphs and a table');
    expect(normalize(initialTextA)).not.toContain('Another paragraph');
    expect(normalize(initialTextB)).toContain('This is a test doc.');
    expect(normalize(initialTextB)).toContain('It contains three paragraphs and a table');
    expect(normalize(initialTextB)).toContain('Another paragraph');
    expect(normalize(initialMarkdownA)).not.toBe(normalize(initialMarkdownB));

    const tokenA = `INSERTED_BY_CLIENT_A_${Date.now()}`;
    const tokenB = `INSERTED_BY_CLIENT_B_${Date.now()}`;

    const [writeA, writeB] = await Promise.all([
      docA.create.paragraph({
        at: { kind: 'documentEnd' },
        text: tokenA,
      }),
      docB.create.paragraph({
        at: { kind: 'documentEnd' },
        text: tokenB,
      }),
    ]);

    expectParagraphWriteSuccess(writeA);
    expectParagraphWriteSuccess(writeB);
    expect(writeA?.document?.path).toBe(sourceDocA);
    expect(writeB?.document?.path).toBe(sourceDocB);
    expect(writeA?.document?.path).not.toBe(sourceDocB);
    expect(writeB?.document?.path).not.toBe(sourceDocA);

    const [afterTextA, afterTextB, afterMarkdownA, afterMarkdownB] = await Promise.all([
      docA.getText(),
      docB.getText(),
      docA.getMarkdown(),
      docB.getMarkdown(),
    ]);

    expect(normalize(afterTextA)).toContain(tokenA);
    expect(normalize(afterTextA)).not.toContain(tokenB);
    expect(normalize(afterTextA)).toContain('It contains two paragraphs and a table');
    expect(normalize(afterTextB)).toContain(tokenB);
    expect(normalize(afterTextB)).not.toContain(tokenA);
    expect(normalize(afterTextB)).toContain('Another paragraph');

    const snapshotMarkdownA = normalize(afterMarkdownA);
    const snapshotMarkdownB = normalize(afterMarkdownB);

    const [saveA, saveB] = await Promise.all([
      docA.save({ out: exportedDocA, force: true }),
      docB.save({ out: exportedDocB, force: true }),
    ]);

    expect(saveA.contextId).toBe(sessionIdA);
    expect(saveB.contextId).toBe(sessionIdB);
    expect(saveA.saved).toBe(true);
    expect(saveB.saved).toBe(true);
    expect(saveA.output?.path).toBe(exportedDocA);
    expect(saveB.output?.path).toBe(exportedDocB);

    const [closeA, closeB] = await Promise.all([docA.close({ discard: true }), docB.close({ discard: true })]);
    expect(closeA.contextId).toBe(sessionIdA);
    expect(closeB.contextId).toBe(sessionIdB);
    expect(closeA.closed).toBe(true);
    expect(closeB.closed).toBe(true);

    await expect(docA.getMarkdown()).rejects.toThrow(/Document handle is closed/);
    await expect(docB.getMarkdown()).rejects.toThrow(/Document handle is closed/);

    const reopenClientA = await createHandleClient();
    const reopenClientB = await createHandleClient();
    const reopenedDocA = await reopenClientA.open({ doc: exportedDocA, sessionId: reopenSessionIdA });
    const reopenedDocB = await reopenClientB.open({ doc: exportedDocB, sessionId: reopenSessionIdB });

    expect(reopenedDocA.sessionId).toBe(reopenSessionIdA);
    expect(reopenedDocB.sessionId).toBe(reopenSessionIdB);
    expect((reopenedDocA.openResult as any).document?.path).toBe(exportedDocA);
    expect((reopenedDocB.openResult as any).document?.path).toBe(exportedDocB);

    const [reopenedTextA, reopenedTextB, reopenedMarkdownA, reopenedMarkdownB] = await Promise.all([
      reopenedDocA.getText(),
      reopenedDocB.getText(),
      reopenedDocA.getMarkdown(),
      reopenedDocB.getMarkdown(),
    ]);

    expect(normalize(reopenedTextA)).toContain(tokenA);
    expect(normalize(reopenedTextA)).not.toContain(tokenB);
    expect(normalize(reopenedTextA)).toContain('It contains two paragraphs and a table');
    expect(normalize(reopenedTextB)).toContain(tokenB);
    expect(normalize(reopenedTextB)).not.toContain(tokenA);
    expect(normalize(reopenedTextB)).toContain('Another paragraph');
    expect(normalize(reopenedMarkdownA)).toBe(snapshotMarkdownA);
    expect(normalize(reopenedMarkdownB)).toBe(snapshotMarkdownB);
  });
});
