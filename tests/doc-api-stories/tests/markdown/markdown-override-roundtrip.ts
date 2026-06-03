import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

type MarkdownStructureMetrics = {
  headingsTotal: number;
  listsTotal: number;
  bulletsTotal: number;
  orderedTotal: number;
  hasPurposeItem: boolean;
  hasNdaSignedItem: boolean;
  hasNestedLevel3: boolean;
  endOfAgreementMatches: number;
  tablesTotal: number;
  /** Sentinel text patterns that confirm table cell content was parsed correctly. */
  tableContentSignals: {
    hasConfidentialityTerm: boolean;
    hasPressRelease: boolean;
    hasSignatureField: boolean;
  };
};

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

describe('document-api story: markdown override roundtrip', () => {
  const { client, outPath, runCli } = useStoryHarness('markdown/override-roundtrip', {
    preserveResults: true,
  });

  const fixturePath = path.resolve(import.meta.dirname, 'multi-page-nda-test-document.md');

  async function collectStructure(sessionId: string): Promise<MarkdownStructureMetrics> {
    const headingResult = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'node',
        nodeType: 'heading',
        limit: 200,
      }),
    );

    const listAll = unwrap<any>(
      await client.doc.lists.list({
        sessionId,
        limit: 200,
      }),
    );

    const listBullets = unwrap<any>(
      await client.doc.lists.list({
        sessionId,
        kind: 'bullet',
        limit: 200,
      }),
    );

    const listOrdered = unwrap<any>(
      await client.doc.lists.list({
        sessionId,
        kind: 'ordered',
        limit: 200,
      }),
    );

    const endOfAgreement = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'text',
        pattern: 'END OF AGREEMENT',
      }),
    );

    const tablesResult = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'node',
        nodeType: 'table',
        limit: 100,
      }),
    );

    const listItems: any[] = Array.isArray(listAll.items) ? listAll.items : [];
    const hasPurposeItem = listItems.some((item) => item.text === 'Purpose');
    const hasNdaSignedItem = listItems.some((item) => item.text === 'NDA signed');
    const hasNestedLevel3 = listItems.some(
      (item) => item.text === 'Level 3' && item.level === 2 && Array.isArray(item.path) && item.path.length === 3,
    );

    // Verify table cell content was parsed correctly via text search.
    // These sentinels confirm specific tables exist with correct content:
    //   - "Confidentiality Term": Section 5 data row (proves table has ≥1 data row)
    //   - "Press release": Appendix A continuation-merged cell (proves multi-line merge works)
    //   - "Signature:": Signatures table cell (unique to table rows, not in fixture header)
    const [confidentialityTerm, pressRelease, signatureField] = await Promise.all([
      client.doc.find({ sessionId, type: 'text', pattern: 'Confidentiality Term' }),
      client.doc.find({ sessionId, type: 'text', pattern: 'Press release' }),
      client.doc.find({ sessionId, type: 'text', pattern: 'Signature:' }),
    ]);
    const tableContentSignals = {
      hasConfidentialityTerm: unwrap<any>(confidentialityTerm).total >= 1,
      hasPressRelease: unwrap<any>(pressRelease).total >= 1,
      hasSignatureField: unwrap<any>(signatureField).total >= 1,
    };

    return {
      headingsTotal: headingResult.total,
      listsTotal: listAll.total,
      bulletsTotal: listBullets.total,
      orderedTotal: listOrdered.total,
      hasPurposeItem,
      hasNdaSignedItem,
      hasNestedLevel3,
      endOfAgreementMatches: endOfAgreement.total,
      tablesTotal: tablesResult.total,
      tableContentSignals,
    };
  }

  async function applyStylesPatch(
    doc: string,
    channel: 'run' | 'paragraph',
    patch: Record<string, unknown>,
    out: string,
  ): Promise<any> {
    const envelope = await runCli([
      'styles',
      'apply',
      doc,
      '--target-json',
      JSON.stringify({ scope: 'docDefaults', channel }),
      '--patch-json',
      JSON.stringify(patch),
      '--out',
      out,
    ]);

    const payload = envelope?.data ?? envelope;
    const receipt = payload?.receipt ?? payload;
    expect(receipt).toBeDefined();
    return receipt;
  }

  it('initializes from markdown override and preserves structure after save + reopen', async () => {
    const markdown = await readFile(fixturePath, 'utf8');
    const sourceSessionId = sid('markdown-source');
    const roundtripSessionId = sid('markdown-roundtrip');
    const outputDocPath = outPath('nda-markdown-override.docx');

    await client.doc.open({
      sessionId: sourceSessionId,
      contentOverride: markdown,
      overrideType: 'markdown',
    });

    const before = await collectStructure(sourceSessionId);

    // Sanity checks ensure this story fails loudly if markdown parsing regresses.
    expect(before.headingsTotal).toBeGreaterThanOrEqual(20);
    expect(before.listsTotal).toBeGreaterThanOrEqual(50);
    expect(before.bulletsTotal).toBeGreaterThanOrEqual(30);
    expect(before.orderedTotal).toBeGreaterThanOrEqual(15);
    expect(before.hasPurposeItem).toBe(true);
    expect(before.hasNdaSignedItem).toBe(true);
    expect(before.hasNestedLevel3).toBe(true);
    expect(before.endOfAgreementMatches).toBe(1);

    // Fixed-width ASCII tables must normalize to real table nodes.
    // The NDA fixture contains 3 tables: Section 5 (3col), Appendix A (4col), Signatures (2col).
    expect(before.tablesTotal).toBe(3);

    // Verify table cell content confirms correct parsing — not just node count.
    // "Confidentiality Term" = Section 5 data row exists
    // "Press release" = Appendix A continuation-merged cell was joined correctly
    // "Signature:" = Signatures table cell (unique to table, not in fixture header)
    expect(before.tableContentSignals.hasConfidentialityTerm).toBe(true);
    expect(before.tableContentSignals.hasPressRelease).toBe(true);
    expect(before.tableContentSignals.hasSignatureField).toBe(true);

    await client.doc.save({
      sessionId: sourceSessionId,
      out: outputDocPath,
    });

    await client.doc.close({
      sessionId: sourceSessionId,
      discard: true,
    });

    await client.doc.open({
      doc: outputDocPath,
      sessionId: roundtripSessionId,
    });

    const after = await collectStructure(roundtripSessionId);

    // Roundtrip invariant: structure metrics should remain identical after DOCX save/reopen.
    expect(after).toEqual(before);
  });

  it('applies visible docDefaults styles to markdown-seeded content before final export', async () => {
    const markdown = await readFile(fixturePath, 'utf8');
    const sourceSessionId = sid('markdown-styled-source');
    const styledSessionId = sid('markdown-styled');
    const verifySessionId = sid('markdown-styled-verify');
    const markdownSeedDoc = outPath('nda-markdown-seeded.docx');
    const runStyledDoc = outPath('nda-markdown-styled-run.docx');
    const styledTemplateDoc = outPath('nda-markdown-styled-template.docx');
    const exportedDoc = outPath('nda-markdown-on-styled-template-export.docx');

    await client.doc.open({
      sessionId: sourceSessionId,
      contentOverride: markdown,
      overrideType: 'markdown',
    });

    const before = await collectStructure(sourceSessionId);
    expect(before.headingsTotal).toBeGreaterThanOrEqual(20);
    expect(before.listsTotal).toBeGreaterThanOrEqual(50);
    expect(before.endOfAgreementMatches).toBe(1);

    await client.doc.save({
      sessionId: sourceSessionId,
      out: markdownSeedDoc,
    });

    await client.doc.close({
      sessionId: sourceSessionId,
      discard: true,
    });

    const runPatch = {
      bold: true,
      italic: true,
      fontSize: 30,
      letterSpacing: 24,
      color: { val: 'C00000' },
      fontFamily: { ascii: 'Courier New', hAnsi: 'Courier New' },
    };

    const runReceipt = await applyStylesPatch(markdownSeedDoc, 'run', runPatch, runStyledDoc);
    expect(runReceipt.success).toBe(true);
    expect(runReceipt.changed).toBe(true);
    expect(runReceipt.after.bold).toBe('on');
    expect(runReceipt.after.italic).toBe('on');
    expect(runReceipt.after.fontSize).toBe(30);
    expect(runReceipt.after.letterSpacing).toBe(24);
    expect(runReceipt.after.color).toEqual({ val: 'C00000' });

    const paragraphPatch = {
      justification: 'justify',
      spacing: { before: 240, after: 240, line: 420, lineRule: 'auto' },
      indent: { left: 720, firstLine: 360 },
    };

    const paragraphReceipt = await applyStylesPatch(runStyledDoc, 'paragraph', paragraphPatch, styledTemplateDoc);
    expect(paragraphReceipt.success).toBe(true);
    expect(paragraphReceipt.changed).toBe(true);
    expect(paragraphReceipt.after.justification).toBe('justify');
    expect(paragraphReceipt.after.spacing).toEqual(paragraphPatch.spacing);
    expect(paragraphReceipt.after.indent).toEqual(paragraphPatch.indent);

    await client.doc.open({
      doc: styledTemplateDoc,
      sessionId: styledSessionId,
    });

    await client.doc.save({
      sessionId: styledSessionId,
      out: exportedDoc,
    });

    await client.doc.close({
      sessionId: styledSessionId,
      discard: true,
    });

    await client.doc.open({
      doc: exportedDoc,
      sessionId: verifySessionId,
    });

    const after = await collectStructure(verifySessionId);
    expect(after).toEqual(before);
  });
});
