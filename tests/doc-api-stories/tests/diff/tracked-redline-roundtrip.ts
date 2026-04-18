import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const TEST_USER = { name: 'Review Bot', email: 'bot@example.com' };

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

describe('document-api story: diff tracked redline roundtrip', () => {
  const { client, outPath } = useStoryHarness('diff/tracked-redline-roundtrip', {
    preserveResults: true,
    clientOptions: {
      user: TEST_USER,
    },
  });

  async function listTrackedChanges(sessionId: string, type?: 'insert' | 'delete' | 'format') {
    return unwrap<any>(await client.doc.trackChanges.list(type ? { sessionId, type } : { sessionId }));
  }

  it('compares two docs and saves a third doc with tracked changes', async () => {
    const baseSessionId = sid('diff-base');
    const targetSessionId = sid('diff-target');
    const reopenedSessionId = sid('diff-reopen');

    const baseText = 'Section 1. Payment is due within thirty days.';
    const targetParagraph = 'Renewal requires written approval.';

    await client.doc.open({
      sessionId: baseSessionId,
      contentOverride: baseText,
      overrideType: 'text',
    });
    await client.doc.open({
      sessionId: targetSessionId,
      contentOverride: `${baseText}\n${targetParagraph}`,
      overrideType: 'text',
    });

    const targetSnapshot = unwrapNamed<any>(await client.doc.diff.capture({ sessionId: targetSessionId }), 'snapshot');
    expect(targetSnapshot.version).toBe('sd-diff-snapshot/v1');
    expect(targetSnapshot.engine).toBe('super-editor');

    await client.doc.close({ sessionId: targetSessionId, discard: true });

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
    expect(diff.summary.changedComponents).toContain('body');

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

    const trackedAfterApply = await listTrackedChanges(baseSessionId);
    const insertionsAfterApply = await listTrackedChanges(baseSessionId, 'insert');
    expect(trackedAfterApply.total).toBeGreaterThan(0);
    expect(insertionsAfterApply.total).toBeGreaterThan(0);

    const outputPath = outPath('tracked-redline.docx');
    await client.doc.save({
      sessionId: baseSessionId,
      out: outputPath,
      force: true,
    });

    const documentXml = await readDocxPart(outputPath, 'word/document.xml');
    expect(documentXml).toContain(targetParagraph);
    expect(documentXml).toMatch(/<w:ins\b[\s\S]*Renewal requires written approval\./);

    await client.doc.close({ sessionId: baseSessionId, discard: true });

    await client.doc.open({
      sessionId: reopenedSessionId,
      doc: outputPath,
    });

    const reopenedTracked = await listTrackedChanges(reopenedSessionId);
    const reopenedInsertions = await listTrackedChanges(reopenedSessionId, 'insert');
    expect(reopenedTracked.total).toBeGreaterThan(0);
    expect(reopenedInsertions.total).toBeGreaterThan(0);
  });
});
