import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

type SectionAddress = {
  kind: 'section';
  sectionId: string;
};

type HeaderFooterKind = 'header' | 'footer';
type HeaderFooterVariant = 'default' | 'first' | 'even';

type HeaderFooterSlotTarget = {
  kind: 'headerFooterSlot';
  section: SectionAddress;
  headerFooterKind: HeaderFooterKind;
  variant: HeaderFooterVariant;
};

type HeaderFooterStoryLocator = {
  kind: 'story';
  storyType: 'headerFooterSlot';
  section: SectionAddress;
  headerFooterKind: HeaderFooterKind;
  variant: HeaderFooterVariant;
  onWrite: 'materializeIfInherited';
};

type HeaderFooterResolveResult =
  | {
      status: 'explicit';
      refId: string;
    }
  | {
      status: 'inherited';
      refId: string;
    }
  | {
      status: 'none';
    };

function makeSessionId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRelationshipTarget(target: string): string {
  const trimmedTarget = target.replace(/^\/+/, '');
  return trimmedTarget.startsWith('word/') ? trimmedTarget : `word/${trimmedTarget}`;
}

function extractRelationshipTarget(relsXml: string, refId: string): string {
  const relationshipPattern = new RegExp(
    `<Relationship\\b[^>]*Id="${escapeForRegex(refId)}"[^>]*Target="([^"]+)"`,
    'i',
  );
  const match = relsXml.match(relationshipPattern);
  if (!match?.[1]) {
    throw new Error(`Unable to resolve relationship target for refId "${refId}".`);
  }
  return normalizeRelationshipTarget(match[1]);
}

function expectMutationSuccess(operationId: string, result: any): void {
  if (result?.success === true || result?.receipt?.success === true) {
    return;
  }

  const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
  throw new Error(`${operationId} did not report success (code: ${code}).`);
}

async function unwrapResult<T>(promise: Promise<unknown>): Promise<T> {
  return unwrap<T>(await promise);
}

function requireFirstSectionAddress(sectionsResult: any): SectionAddress {
  const section = sectionsResult?.items?.[0]?.address;
  if (section?.kind !== 'section' || typeof section.sectionId !== 'string') {
    throw new Error('Unable to resolve the first section address from sections.list.');
  }
  return section as SectionAddress;
}

function createHeaderFooterTargets(
  section: SectionAddress,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant = 'default',
): {
  slot: HeaderFooterSlotTarget;
  story: HeaderFooterStoryLocator;
} {
  return {
    slot: {
      kind: 'headerFooterSlot',
      section,
      headerFooterKind: kind,
      variant,
    },
    story: {
      kind: 'story',
      storyType: 'headerFooterSlot',
      section,
      headerFooterKind: kind,
      variant,
      onWrite: 'materializeIfInherited',
    },
  };
}

function expectExplicitRef(
  operationId: string,
  result: HeaderFooterResolveResult,
): { status: 'explicit'; refId: string } {
  if (result.status !== 'explicit' || typeof result.refId !== 'string' || result.refId.length === 0) {
    throw new Error(`${operationId} did not resolve to an explicit header/footer ref.`);
  }
  return result;
}

describe('document-api story: blank doc body/header/footer write roundtrip', () => {
  const { client, outPath } = useStoryHarness('header-footers/blank-doc-write-roundtrip', {
    preserveResults: true,
  });

  it('writes body, header, and footer content from a blank doc and roundtrips it through save + reopen', async () => {
    const sessionId = makeSessionId('blank-doc-hf-roundtrip');
    const reopenSessionId = makeSessionId('blank-doc-hf-roundtrip-reopen');

    const bodyTextBefore = 'Body text inserted before header and footer creation.';
    const bodyTextAfter = 'Body text inserted after header and footer creation.';
    const headerText = 'Header text inserted by blank-doc story.';
    const footerText = 'Footer text inserted by blank-doc story.';

    await client.doc.open({ sessionId });

    const sectionsResult = await unwrapResult<any>(client.doc.sections.list({ sessionId }));
    const firstSection = requireFirstSectionAddress(sectionsResult);

    const header = createHeaderFooterTargets(firstSection, 'header');
    const footer = createHeaderFooterTargets(firstSection, 'footer');

    const initialHeaderResolution = (await unwrapResult<HeaderFooterResolveResult>(
      client.doc.headerFooters.resolve({
        sessionId,
        target: header.slot,
      }),
    )) as HeaderFooterResolveResult;
    const initialFooterResolution = (await unwrapResult<HeaderFooterResolveResult>(
      client.doc.headerFooters.resolve({
        sessionId,
        target: footer.slot,
      }),
    )) as HeaderFooterResolveResult;

    expect(initialHeaderResolution.status).toBe('none');
    expect(initialFooterResolution.status).toBe('none');

    expectMutationSuccess(
      'insert body (before)',
      await unwrapResult<any>(
        client.doc.insert({
          sessionId,
          value: bodyTextBefore,
        }),
      ),
    );

    expectMutationSuccess(
      'insert header text',
      await unwrapResult<any>(
        client.doc.insert({
          sessionId,
          in: header.story,
          value: headerText,
        }),
      ),
    );

    expectMutationSuccess(
      'insert footer text',
      await unwrapResult<any>(
        client.doc.insert({
          sessionId,
          in: footer.story,
          value: footerText,
        }),
      ),
    );

    expectMutationSuccess(
      'insert body (after)',
      await unwrapResult<any>(
        client.doc.insert({
          sessionId,
          value: bodyTextAfter,
        }),
      ),
    );

    const headerResolution = expectExplicitRef(
      'headerFooters.resolve(header)',
      (await unwrapResult<HeaderFooterResolveResult>(
        client.doc.headerFooters.resolve({
          sessionId,
          target: header.slot,
        }),
      )) as HeaderFooterResolveResult,
    );
    const footerResolution = expectExplicitRef(
      'headerFooters.resolve(footer)',
      (await unwrapResult<HeaderFooterResolveResult>(
        client.doc.headerFooters.resolve({
          sessionId,
          target: footer.slot,
        }),
      )) as HeaderFooterResolveResult,
    );

    const liveBodyText = await client.doc.getText({ sessionId });
    const liveHeaderText = await client.doc.getText({ sessionId, in: header.story });
    const liveFooterText = await client.doc.getText({ sessionId, in: footer.story });

    expect(liveBodyText).toContain(bodyTextBefore);
    expect(liveBodyText).toContain(bodyTextAfter);
    expect(liveHeaderText).toContain(headerText);
    expect(liveFooterText).toContain(footerText);

    const headerParts = await unwrapResult<any>(client.doc.headerFooters.parts.list({ sessionId, kind: 'header' }));
    const footerParts = await unwrapResult<any>(client.doc.headerFooters.parts.list({ sessionId, kind: 'footer' }));

    expect(headerParts.items.some((item) => item.refId === headerResolution.refId)).toBe(true);
    expect(footerParts.items.some((item) => item.refId === footerResolution.refId)).toBe(true);

    const outputDocPath = outPath('blank-doc-body-header-footer-roundtrip.docx');
    await client.doc.save({
      sessionId,
      out: outputDocPath,
      force: true,
    });

    const documentXml = await readDocxPart(outputDocPath, 'word/document.xml');
    const relationshipsXml = await readDocxPart(outputDocPath, 'word/_rels/document.xml.rels');

    expect(documentXml).toContain(bodyTextBefore);
    expect(documentXml).toContain(bodyTextAfter);
    expect(documentXml).toContain(`r:id="${headerResolution.refId}"`);
    expect(documentXml).toContain(`r:id="${footerResolution.refId}"`);

    const headerPartPath = extractRelationshipTarget(relationshipsXml, headerResolution.refId);
    const footerPartPath = extractRelationshipTarget(relationshipsXml, footerResolution.refId);

    const headerXml = await readDocxPart(outputDocPath, headerPartPath);
    const footerXml = await readDocxPart(outputDocPath, footerPartPath);

    expect(headerXml).toContain(headerText);
    expect(footerXml).toContain(footerText);

    await client.doc.open({
      doc: outputDocPath,
      sessionId: reopenSessionId,
    });

    const reopenedSectionsResult = await unwrapResult<any>(client.doc.sections.list({ sessionId: reopenSessionId }));
    const reopenedFirstSection = requireFirstSectionAddress(reopenedSectionsResult);

    const reopenedHeader = createHeaderFooterTargets(reopenedFirstSection, 'header');
    const reopenedFooter = createHeaderFooterTargets(reopenedFirstSection, 'footer');

    const reopenedBodyText = await client.doc.getText({ sessionId: reopenSessionId });
    const reopenedHeaderText = await client.doc.getText({
      sessionId: reopenSessionId,
      in: reopenedHeader.story,
    });
    const reopenedFooterText = await client.doc.getText({
      sessionId: reopenSessionId,
      in: reopenedFooter.story,
    });

    expect(reopenedBodyText).toContain(bodyTextBefore);
    expect(reopenedBodyText).toContain(bodyTextAfter);
    expect(reopenedHeaderText).toContain(headerText);
    expect(reopenedFooterText).toContain(footerText);
  });
});
