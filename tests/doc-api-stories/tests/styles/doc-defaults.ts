import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

/**
 * End-to-end story tests for `styles.apply` (docDefaults mutation).
 *
 * Each test starts from a blank document, inserts visible sample text, applies a
 * stylesheet patch, and saves the output DOCX under `tests/doc-api-stories/results`.
 * This keeps every case visually inspectable while still asserting receipt
 * semantics (`before`/`after`, `changed`, and resolution metadata).
 */
describe('document-api story: styles.apply docDefaults', () => {
  const { client, outPath, runCli } = useStoryHarness('styles/doc-defaults', {
    preserveResults: true,
  });

  function sid(label: string): string {
    return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function seedBlankDoc(sessionId: string, text: string, docName: string): Promise<string> {
    await client.doc.open({ sessionId });
    const insertResult = unwrap<any>(await client.doc.insert({ sessionId, value: text }));
    expect(insertResult.receipt?.success).toBe(true);
    const sourceDoc = outPath(docName);
    await client.doc.save({ sessionId, out: sourceDoc });
    return sourceDoc;
  }

  async function seedBlankDocWithParagraphs(sessionId: string, paragraphs: string[], docName: string): Promise<string> {
    if (paragraphs.length === 0) {
      throw new Error('seedBlankDocWithParagraphs requires at least one paragraph.');
    }

    await client.doc.open({ sessionId });
    const firstInsert = unwrap<any>(await client.doc.insert({ sessionId, value: paragraphs[0] }));
    expect(firstInsert.receipt?.success).toBe(true);

    for (const paragraphText of paragraphs.slice(1)) {
      const createResult = unwrap<any>(
        await client.doc.create.paragraph({
          sessionId,
          at: { kind: 'documentEnd' },
          text: paragraphText,
        }),
      );
      expect(createResult.success).toBe(true);
    }

    const sourceDoc = outPath(docName);
    await client.doc.save({ sessionId, out: sourceDoc });
    return sourceDoc;
  }

  async function applyStylesPatch(
    doc: string,
    channel: 'run' | 'paragraph',
    patch: Record<string, unknown>,
    options?: { dryRun?: boolean; out?: string },
  ): Promise<any> {
    const args = [
      'styles',
      'apply',
      doc,
      '--target-json',
      JSON.stringify({ scope: 'docDefaults', channel }),
      '--patch-json',
      JSON.stringify(patch),
    ];

    if (options?.dryRun) {
      args.push('--dry-run', 'true');
    }
    if (options?.out) {
      args.push('--out', options.out);
    }

    const envelope = await runCli(args);
    const payload = envelope?.data ?? envelope;
    const receipt = payload?.receipt ?? payload;
    expect(receipt).toBeDefined();
    return receipt;
  }

  it('run channel: bold + italic on', async () => {
    const sessionId = sid('styles-run-bold-italic');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should render this text bold and italic.',
      'run-bold-italic-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      { bold: true, italic: true },
      {
        out: outPath('run-bold-italic.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.after.bold).toBe('on');
    expect(receipt.after.italic).toBe('on');
    expect(receipt.resolution.xmlPath).toBe('w:styles/w:docDefaults/w:rPrDefault/w:rPr');
  });

  it('run channel: bold off state', async () => {
    const sessionId = sid('styles-run-bold-off');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should explicitly disable bold for this text.',
      'run-bold-off-source.docx',
    );

    const receipt = await applyStylesPatch(sourceDoc, 'run', { bold: false }, { out: outPath('run-bold-off.docx') });
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.bold).toBe('inherit');
    expect(receipt.after.bold).toBe('off');
  });

  it('run channel: fontSize + fontSizeCs', async () => {
    const sessionId = sid('styles-run-font-size');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should set this text to 14pt for latin and cs scripts.',
      'run-font-size-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      { fontSize: 28, fontSizeCs: 28 },
      {
        out: outPath('run-font-size.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.fontSize === 'inherit' || typeof receipt.before.fontSize === 'number').toBe(true);
    expect(receipt.after.fontSize).toBe(28);
    expect(receipt.after.fontSizeCs).toBe(28);
  });

  it('run channel: fontFamily object patch', async () => {
    const sessionId = sid('styles-run-font-family');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should use Courier New as the primary family.',
      'run-font-family-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      {
        fontFamily: { ascii: 'Courier New', hAnsi: 'Courier New' },
      },
      { out: outPath('run-font-family.docx') },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.fontFamily === 'inherit' || typeof receipt.before.fontFamily === 'object').toBe(true);
    expect(receipt.after.fontFamily).toMatchObject({ ascii: 'Courier New', hAnsi: 'Courier New' });
  });

  it('run channel: color object patch', async () => {
    const sessionId = sid('styles-run-color');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should render this text in red.',
      'run-color-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      { color: { val: 'FF0000' } },
      { out: outPath('run-color.docx') },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.color).toBe('inherit');
    expect(receipt.after.color).toEqual({ val: 'FF0000' });
  });

  it('run channel: letterSpacing', async () => {
    const sessionId = sid('styles-run-letter-spacing');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should apply extra tracking to this text.',
      'run-letter-spacing-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      { letterSpacing: 20 },
      {
        out: outPath('run-letter-spacing.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.letterSpacing).toBe('inherit');
    expect(receipt.after.letterSpacing).toBe(20);
  });

  it('paragraph channel: justification center', async () => {
    const sessionId = sid('styles-paragraph-justification');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should center this paragraph by default.',
      'paragraph-justification-center-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'paragraph',
      { justification: 'center' },
      {
        out: outPath('paragraph-justification-center.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.justification).toBe('inherit');
    expect(receipt.after.justification).toBe('center');
    expect(receipt.resolution.xmlPath).toBe('w:styles/w:docDefaults/w:pPrDefault/w:pPr');
  });

  it('paragraph channel: spacing object patch', async () => {
    const sessionId = sid('styles-paragraph-spacing');
    const sourceDoc = await seedBlankDocWithParagraphs(
      sessionId,
      [
        'Paragraph 1: spacing should be visible above and below this paragraph.',
        'Paragraph 2: this paragraph exists to make the inter-paragraph spacing obvious.',
        'Paragraph 3: another paragraph to confirm spacing repeats consistently.',
      ],
      'paragraph-spacing-source.docx',
    );

    const spacingPatch = { before: 240, after: 240, line: 360, lineRule: 'auto' };
    const receipt = await applyStylesPatch(
      sourceDoc,
      'paragraph',
      { spacing: spacingPatch },
      {
        out: outPath('paragraph-spacing.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.spacing).toBe('inherit');
    expect(receipt.after.spacing).toEqual(spacingPatch);
  });

  it('paragraph channel: indent object patch', async () => {
    const sessionId = sid('styles-paragraph-indent');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should indent this paragraph.',
      'paragraph-indent-source.docx',
    );

    const indentPatch = { left: 720, firstLine: 360 };
    const receipt = await applyStylesPatch(
      sourceDoc,
      'paragraph',
      { indent: indentPatch },
      {
        out: outPath('paragraph-indent.docx'),
      },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.before.indent).toBe('inherit');
    expect(receipt.after.indent).toEqual(indentPatch);
  });

  it('run channel: multi-property patch in one call', async () => {
    const sessionId = sid('styles-run-multi');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should combine bold, font size, color, and font family for this text.',
      'run-multi-property-source.docx',
    );

    const receipt = await applyStylesPatch(
      sourceDoc,
      'run',
      {
        bold: true,
        fontSize: 30,
        color: { val: '0000FF' },
        fontFamily: { ascii: 'Georgia' },
      },
      { out: outPath('run-multi-property.docx') },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.after.bold).toBe('on');
    expect(receipt.after.fontSize).toBe(30);
    expect(receipt.after.color).toEqual({ val: '0000FF' });
    expect(receipt.after.fontFamily).toMatchObject({ ascii: 'Georgia' });
  });

  it('paragraph channel: multi-property patch in one call', async () => {
    const sessionId = sid('styles-paragraph-multi');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should combine paragraph justification, spacing, and indent.',
      'paragraph-multi-property-source.docx',
    );

    const spacingPatch = { before: 120 };
    const indentPatch = { left: 720 };
    const receipt = await applyStylesPatch(
      sourceDoc,
      'paragraph',
      {
        justification: 'justify',
        spacing: spacingPatch,
        indent: indentPatch,
      },
      { out: outPath('paragraph-multi-property.docx') },
    );
    expect(receipt.success).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.after.justification).toBe('justify');
    expect(receipt.after.spacing).toEqual(spacingPatch);
    expect(receipt.after.indent).toEqual(indentPatch);
  });

  it('roundtrip persistence: saved docDefaults report changed=false on dryRun re-apply', async () => {
    const sessionId = sid('styles-persist');
    const sourceDoc = await seedBlankDoc(
      sessionId,
      'Doc defaults should persist across save and reopen.',
      'run-persistence-source.docx',
    );

    const runPatch = { bold: true, fontSize: 28 };
    const persistedDoc = outPath('run-persistence-applied.docx');
    const applyReceipt = await applyStylesPatch(sourceDoc, 'run', runPatch, { out: persistedDoc });
    expect(applyReceipt.success).toBe(true);
    expect(applyReceipt.changed).toBe(true);

    const dryRunReceipt = await applyStylesPatch(persistedDoc, 'run', runPatch, { dryRun: true });
    expect(dryRunReceipt.success).toBe(true);
    expect(dryRunReceipt.dryRun).toBe(true);
    expect(dryRunReceipt.changed).toBe(false);
    expect(dryRunReceipt.before.bold).toBe('on');
    expect(dryRunReceipt.after.bold).toBe('on');
    expect(dryRunReceipt.before.fontSize).toBe(28);
    expect(dryRunReceipt.after.fontSize).toBe(28);
  });
});
