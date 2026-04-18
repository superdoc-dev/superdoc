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

type SectionAddress = { kind: 'section'; sectionId: string };

function requireFirstSectionAddress(sectionsResult: any): SectionAddress {
  const section = sectionsResult?.items?.[0]?.address;
  if (section?.kind !== 'section' || typeof section.sectionId !== 'string') {
    throw new Error('Unable to resolve the first section address from sections.list.');
  }
  return section as SectionAddress;
}

function createHeaderStoryLocator(section: SectionAddress) {
  return {
    kind: 'story' as const,
    storyType: 'headerFooterSlot' as const,
    section,
    headerFooterKind: 'header' as const,
    variant: 'default' as const,
    onWrite: 'materializeIfInherited' as const,
  };
}

describe('document-api story: header/footer diff roundtrip', () => {
  const { client, outPath } = useStoryHarness('diff/header-footer-diff-roundtrip', {
    preserveResults: true,
    clientOptions: {
      user: TEST_USER,
    },
  });

  it('diffs two docs with different headers and applies header changes to the base doc', async () => {
    const baseSessionId = sid('hf-diff-base');
    const targetSessionId = sid('hf-diff-target');
    const reopenSessionId = sid('hf-diff-reopen');

    const bodyText = 'Shared body text across both documents.';
    const headerText = 'Header added by diff target.';

    // Open base doc (no header)
    await client.doc.open({
      sessionId: baseSessionId,
      contentOverride: bodyText,
      overrideType: 'text',
    });

    // Open target doc with same body text, then add a header
    await client.doc.open({
      sessionId: targetSessionId,
      contentOverride: bodyText,
      overrideType: 'text',
    });

    const sectionsResult = unwrapNamed<any>(await client.doc.sections.list({ sessionId: targetSessionId }), 'result');
    const firstSection = requireFirstSectionAddress(sectionsResult);
    const headerStory = createHeaderStoryLocator(firstSection);

    await client.doc.insert({
      sessionId: targetSessionId,
      in: headerStory,
      value: headerText,
    });

    // Capture snapshot from target (has header)
    const snapshot = unwrapNamed<any>(await client.doc.diff.capture({ sessionId: targetSessionId }), 'snapshot');
    expect(snapshot.version).toMatch(/^sd-diff-snapshot\/v[12]$/);

    await client.doc.close({ sessionId: targetSessionId, discard: true });

    // Compare base against target snapshot
    const diff = unwrapNamed<any>(
      await client.doc.diff.compare({
        sessionId: baseSessionId,
        targetSnapshot: snapshot,
      }),
      'diff',
    );
    expect(diff.summary.hasChanges).toBe(true);
    expect(diff.summary.headerFooters.hasChanges).toBe(true);
    expect(diff.summary.changedComponents).toContain('headerFooters');

    // Apply diff — header-only changes go through the adapter dispatch path
    const applyResult = unwrapNamed<any>(
      await client.doc.diff.apply({
        sessionId: baseSessionId,
        diff,
        changeMode: 'direct',
      }),
      'result',
    );
    expect(applyResult.appliedOperations).toBeGreaterThan(0);
    expect(applyResult.summary.headerFooters.hasChanges).toBe(true);

    // Save and verify header is in the exported DOCX
    const outputPath = outPath('header-footer-diff-roundtrip.docx');
    await client.doc.save({
      sessionId: baseSessionId,
      out: outputPath,
      force: true,
    });

    const documentXml = await readDocxPart(outputPath, 'word/document.xml');
    expect(documentXml).toContain(bodyText);
    expect(documentXml).toMatch(/<w:headerReference\b/);

    const relsXml = await readDocxPart(outputPath, 'word/_rels/document.xml.rels');
    expect(relsXml).toMatch(/Type="[^"]*\/header"/);

    // Reopen saved doc and verify header content persists
    await client.doc.close({ sessionId: baseSessionId, discard: true });
    await client.doc.open({
      sessionId: reopenSessionId,
      doc: outputPath,
    });

    const reopenSections = unwrapNamed<any>(await client.doc.sections.list({ sessionId: reopenSessionId }), 'result');
    const reopenSection = requireFirstSectionAddress(reopenSections);
    const reopenHeaderStory = createHeaderStoryLocator(reopenSection);

    const reopenHeaderText = await client.doc.getText({
      sessionId: reopenSessionId,
      in: reopenHeaderStory,
    });
    expect(reopenHeaderText).toContain(headerText);
  });
});
