import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const TEST_USER = { name: 'Review Bot', email: 'bot@example.com' };
const BASE_FIXTURE_DOC = path.resolve(import.meta.dirname, 'fixtures', 'diff-doc1.docx');
const TARGET_FIXTURE_DOC = path.resolve(import.meta.dirname, 'fixtures', 'diff-doc2.docx');

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function unwrapNamed<T>(payload: unknown, key?: string): T {
  if (key && payload && typeof payload === 'object' && key in payload) {
    return (payload as Record<string, unknown>)[key] as T;
  }
  return unwrap<T>(payload);
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function countImageDrawings(documentXml: string): number {
  return (documentXml.match(/<w:drawing\b/g) ?? []).length;
}

function summarizeTrackedChanges(changeList: any) {
  return changeList.items.map((item: any) => ({
    type: item.type,
    author: item.author,
    authorEmail: item.authorEmail,
    excerpt: item.excerpt,
  }));
}

describe('document-api story: diff fixture docx roundtrip', () => {
  const { client, copyDoc, outPath } = useStoryHarness('diff/fixture-docx-roundtrip', {
    preserveResults: true,
    clientOptions: {
      user: TEST_USER,
    },
  });

  async function listTrackedChanges(sessionId: string, type?: 'insert' | 'delete' | 'format') {
    return unwrap<any>(await client.doc.trackChanges.list(type ? { sessionId, type } : { sessionId }));
  }

  it('compares two fixture docs and saves a tracked redline output', async () => {
    const baseSessionId = sid('diff-base');
    const targetSessionId = sid('diff-target');
    const reopenedSessionId = sid('diff-reopen');

    const baseDocPath = await copyDoc(BASE_FIXTURE_DOC, 'diff-doc1.docx');
    const targetDocPath = await copyDoc(TARGET_FIXTURE_DOC, 'diff-doc2.docx');

    await client.doc.open({
      sessionId: targetSessionId,
      doc: targetDocPath,
    });

    const targetSnapshot = unwrapNamed<any>(await client.doc.diff.capture({ sessionId: targetSessionId }), 'snapshot');
    expect(targetSnapshot.version).toBe('sd-diff-snapshot/v1');
    expect(targetSnapshot.engine).toBe('super-editor');

    await client.doc.close({ sessionId: targetSessionId, discard: true });

    await client.doc.open({
      sessionId: baseSessionId,
      doc: baseDocPath,
    });

    const diff = unwrapNamed<any>(
      await client.doc.diff.compare({
        sessionId: baseSessionId,
        targetSnapshot,
      }),
      'diff',
    );

    expect(diff.version).toBe('sd-diff-payload/v1');
    expect(diff.engine).toBe('super-editor');
    expect(diff.summary.hasChanges).toBe(true);
    expect(diff.summary.body.hasChanges).toBe(true);
    expect(diff.summary.numbering.hasChanges).toBe(true);
    expect(diff.summary.changedComponents).toContain('body');
    expect(diff.summary.changedComponents).toContain('numbering');

    const applyResult = unwrapNamed<any>(
      await client.doc.diff.apply({
        sessionId: baseSessionId,
        diff,
        changeMode: 'tracked',
      }),
      'result',
    );

    expect(applyResult.appliedOperations).toBeGreaterThan(0);
    expect(applyResult.summary.hasChanges).toBe(true);
    expect(applyResult.summary.body.hasChanges).toBe(true);
    expect(applyResult.summary.numbering.hasChanges).toBe(true);

    const trackedAfterApply = await listTrackedChanges(baseSessionId);
    const insertionsAfterApply = await listTrackedChanges(baseSessionId, 'insert');
    const deletionsAfterApply = await listTrackedChanges(baseSessionId, 'delete');
    const formatsAfterApply = await listTrackedChanges(baseSessionId, 'format');
    expect(trackedAfterApply.total).toBeGreaterThan(0);
    expect(trackedAfterApply.total).toBe(6);
    expect(insertionsAfterApply.total).toBe(3);
    expect(deletionsAfterApply.total).toBe(2);
    expect(formatsAfterApply.total).toBe(1);
    expect(summarizeTrackedChanges(trackedAfterApply)).toEqual([
      {
        type: 'format',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'test doc',
      },
      {
        type: 'delete',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'wo',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'hree',
      },
      {
        type: 'delete',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'D',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'Changed',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'Another paragraph',
      },
    ]);

    const outputPath = outPath('fixture-docx-redline.docx');
    await client.doc.save({
      sessionId: baseSessionId,
      out: outputPath,
      force: true,
    });

    await client.doc.close({ sessionId: baseSessionId, discard: true });

    await client.doc.open({
      sessionId: reopenedSessionId,
      doc: outputPath,
    });

    const reopenedTracked = await listTrackedChanges(reopenedSessionId);
    const reopenedInsertions = await listTrackedChanges(reopenedSessionId, 'insert');
    const reopenedDeletions = await listTrackedChanges(reopenedSessionId, 'delete');
    const reopenedFormats = await listTrackedChanges(reopenedSessionId, 'format');
    expect(reopenedTracked.total).toBeGreaterThan(0);
    expect(reopenedTracked.total).toBe(4);
    expect(reopenedInsertions.total).toBe(3);
    expect(reopenedDeletions.total).toBe(0);
    expect(reopenedFormats.total).toBe(1);
    expect(summarizeTrackedChanges(reopenedTracked)).toEqual([
      {
        type: 'format',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'test doc',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'wohree',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'DChanged',
      },
      {
        type: 'insert',
        author: 'Review Bot',
        authorEmail: 'bot@example.com',
        excerpt: 'Another paragraph',
      },
    ]);

    const documentXml = await readDocxPart(outputPath, 'word/document.xml');
    expect(documentXml).toMatch(/<w:(ins|del)\b/);
    expect(countImageDrawings(documentXml)).toBe(1);
  });
});
