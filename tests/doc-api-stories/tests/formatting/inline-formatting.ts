import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

type InlineDirective = 'on' | 'off' | 'clear';

type InlinePatch = {
  bold?: InlineDirective;
  italic?: InlineDirective;
  underline?: InlineDirective;
  strike?: InlineDirective;
};

type TextTarget = {
  kind: 'text';
  blockId: string;
  range: { start: number; end: number };
};

type RunStyles = {
  direct: {
    bold: InlineDirective;
    italic: InlineDirective;
    underline: InlineDirective;
    strike: InlineDirective;
  };
  effective: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
  };
};

const SOURCE_FIXTURE = 'basic/first-arial.docx';

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function mutationSuccess(payload: any): boolean {
  return payload?.receipt?.success ?? payload?.success ?? false;
}

function assertMutationSuccess(payload: any): void {
  expect(mutationSuccess(payload)).toBe(true);
}

function buildTextTarget(blockId: string, text: string): TextTarget {
  return {
    kind: 'text',
    blockId,
    range: { start: 0, end: text.length },
  };
}

describe('document-api story: inline formatting', () => {
  const { client, copyDoc, outPath, runCli } = useStoryHarness('formatting/inline-formatting', {
    preserveResults: true,
  });

  async function saveResult(sessionId: string, docName: string): Promise<void> {
    await client.doc.save({ sessionId, out: outPath(docName) });
  }

  async function seedBlankFormattableRange(
    sessionId: string,
    sourceDocName: string,
    text: string,
  ): Promise<{ text: string; pattern: string; target: TextTarget }> {
    await client.doc.open({ sessionId });

    const insertResult = unwrap<any>(await client.doc.insert({ sessionId, value: text }));
    assertMutationSuccess(insertResult);

    const blockId = insertResult?.target?.blockId as string | undefined;
    expect(typeof blockId).toBe('string');
    if (!blockId) {
      throw new Error('insert did not return target.blockId');
    }

    await saveResult(sessionId, sourceDocName);

    return {
      text,
      pattern: text,
      target: buildTextTarget(blockId, text),
    };
  }

  async function openFixtureDoc(sessionId: string, sourceDocName: string): Promise<void> {
    const sourceDoc = await copyDoc(corpusDoc(SOURCE_FIXTURE), sourceDocName);
    await client.doc.open({ doc: sourceDoc, sessionId });
  }

  async function firstLinePattern(sessionId: string): Promise<string> {
    const textResult = unwrap<any>(await client.doc.getText({ sessionId }));
    const firstLine = String(textResult?.text ?? '').split('\n')[0] ?? '';
    expect(firstLine.length).toBeGreaterThan(1);
    return firstLine;
  }

  async function queryFirstTextMatch(sessionId: string, pattern: string): Promise<any> {
    const match = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern, caseSensitive: true },
        require: 'first',
      }),
    );

    expect(Array.isArray(match?.items)).toBe(true);
    expect(match.items.length).toBeGreaterThan(0);
    expect(match.items[0]?.matchKind).toBe('text');
    return match;
  }

  async function findFirstTextTarget(sessionId: string, pattern: string): Promise<TextTarget> {
    const findResult = unwrap<any>(
      await client.doc.find({
        sessionId,
        type: 'text',
        pattern,
        require: 'first',
      }),
    );

    const target = findResult?.items?.[0]?.context?.textRanges?.[0] as TextTarget | undefined;
    expect(target?.kind).toBe('text');
    expect(typeof target?.blockId).toBe('string');
    return target as TextTarget;
  }

  function firstRunStyles(match: any): RunStyles {
    const styles = match?.items?.[0]?.blocks?.[0]?.runs?.[0]?.styles;
    expect(styles).toBeDefined();
    expect(styles.direct).toBeDefined();
    expect(styles.effective).toBeDefined();
    return styles as RunStyles;
  }

  async function applyInline(sessionId: string, target: TextTarget, inline: InlinePatch): Promise<any> {
    const result = unwrap<any>(await client.doc.format.apply({ sessionId, target, inline }));
    assertMutationSuccess(result);
    return result;
  }

  async function applyRunDocDefaultsPatch(
    sourceDoc: string,
    patch: Record<string, unknown>,
    outDoc: string,
  ): Promise<any> {
    const envelope = await runCli([
      'styles',
      'apply',
      sourceDoc,
      '--target-json',
      JSON.stringify({ scope: 'docDefaults', channel: 'run' }),
      '--patch-json',
      JSON.stringify(patch),
      '--out',
      outDoc,
    ]);

    const payload = envelope?.data ?? envelope;
    const receipt = payload?.receipt ?? payload;
    expect(receipt).toBeDefined();
    expect(receipt.success).toBe(true);
    return receipt;
  }

  it('bold on: applies bold to inserted text', async () => {
    const sessionId = sid('bold-on');
    const { target } = await seedBlankFormattableRange(sessionId, 'bold-on-source.docx', 'This text should be bold.');
    await applyInline(sessionId, target, { bold: 'on' });
    await saveResult(sessionId, 'bold-on.docx');
  });

  it('italic on: applies italic to inserted text', async () => {
    const sessionId = sid('italic-on');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'italic-on-source.docx',
      'This text should be italic.',
    );
    await applyInline(sessionId, target, { italic: 'on' });
    await saveResult(sessionId, 'italic-on.docx');
  });

  it('underline on: applies underline to inserted text', async () => {
    const sessionId = sid('underline-on');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'underline-on-source.docx',
      'This text should be underlined.',
    );
    await applyInline(sessionId, target, { underline: 'on' });
    await saveResult(sessionId, 'underline-on.docx');
  });

  it('strike on: applies strike to inserted text', async () => {
    const sessionId = sid('strike-on');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'strike-on-source.docx',
      'This text should be struck through.',
    );
    await applyInline(sessionId, target, { strike: 'on' });
    await saveResult(sessionId, 'strike-on.docx');
  });

  it('multi-mark on: applies bold + italic in one call', async () => {
    const sessionId = sid('multi-mark-on');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'multi-mark-on-source.docx',
      'This text should be bold and italic.',
    );
    await applyInline(sessionId, target, { bold: 'on', italic: 'on' });
    await saveResult(sessionId, 'multi-mark-on.docx');
  });

  it('fontSize numeric: sets point size', async () => {
    const sessionId = sid('font-size-num');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'font-size-num-source.docx',
      'This text should be 24pt.',
    );

    const result = unwrap<any>(await client.doc.format.fontSize({ sessionId, target, value: 24 }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'font-size-num.docx');
  });

  it('fontSize string: sets point size from string', async () => {
    const sessionId = sid('font-size-str');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'font-size-str-source.docx',
      'This text should be 14pt.',
    );

    const result = unwrap<any>(await client.doc.format.fontSize({ sessionId, target, value: '14pt' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'font-size-str.docx');
  });

  it('fontFamily: sets font family', async () => {
    const sessionId = sid('font-family');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'font-family-source.docx',
      'This text should be Courier New.',
    );

    const result = unwrap<any>(await client.doc.format.fontFamily({ sessionId, target, value: 'Courier New' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'font-family.docx');
  });

  it('color: sets text color', async () => {
    const sessionId = sid('color');
    const { target } = await seedBlankFormattableRange(sessionId, 'color-source.docx', 'This text should be red.');

    const result = unwrap<any>(await client.doc.format.color({ sessionId, target, value: '#FF0000' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'color.docx');
  });

  it('align center: centers paragraph', async () => {
    const sessionId = sid('align-center');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'align-center-source.docx',
      'This paragraph should be centered.',
    );

    const result = unwrap<any>(await client.doc.format.align({ sessionId, target, alignment: 'center' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'align-center.docx');
  });

  it('align right: right-aligns paragraph', async () => {
    const sessionId = sid('align-right');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'align-right-source.docx',
      'This paragraph should be right aligned.',
    );

    const result = unwrap<any>(await client.doc.format.align({ sessionId, target, alignment: 'right' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'align-right.docx');
  });

  it('align justify: justifies paragraph', async () => {
    const sessionId = sid('align-justify');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'align-justify-source.docx',
      'This paragraph should be fully justified across multiple wrapped lines so the alignment difference is visually obvious in exported output.',
    );

    const result = unwrap<any>(await client.doc.format.align({ sessionId, target, alignment: 'justify' }));
    assertMutationSuccess(result);

    await saveResult(sessionId, 'align-justify.docx');
  });

  it('combined value formats: fontSize + fontFamily + color on same range', async () => {
    const sessionId = sid('combined-values');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'combined-values-source.docx',
      'This text should be 18pt Georgia in blue.',
    );

    const sizeResult = unwrap<any>(await client.doc.format.fontSize({ sessionId, target, value: 18 }));
    assertMutationSuccess(sizeResult);

    const familyResult = unwrap<any>(await client.doc.format.fontFamily({ sessionId, target, value: 'Georgia' }));
    assertMutationSuccess(familyResult);

    const colorResult = unwrap<any>(await client.doc.format.color({ sessionId, target, value: '#0000FF' }));
    assertMutationSuccess(colorResult);

    await saveResult(sessionId, 'combined-values.docx');
  });

  it('dryRun format.apply: reports success without mutating', async () => {
    const sessionId = sid('dry-run');
    const { target } = await seedBlankFormattableRange(
      sessionId,
      'dry-run-source.docx',
      'This text should remain unchanged.',
    );

    const result = unwrap<any>(
      await client.doc.format.apply({
        sessionId,
        target,
        inline: { bold: 'on' },
        dryRun: true,
      }),
    );
    assertMutationSuccess(result);
    await saveResult(sessionId, 'dry-run.docx');
  });

  it('directive cycle: source inherits bold ON, then off -> clear -> on', async () => {
    const seedSessionId = sid('directive-cycle-seed');
    const probe = 'Directive cycle probe text.';
    const { pattern } = await seedBlankFormattableRange(seedSessionId, '.directive-cycle-base.docx', probe);

    const sourceDoc = outPath('directive-cycle-source.docx');
    const stylesReceipt = await applyRunDocDefaultsPatch(
      outPath('.directive-cycle-base.docx'),
      { bold: true },
      sourceDoc,
    );
    expect(stylesReceipt.after?.bold).toBe('on');

    const sessionId = sid('directive-cycle');
    await client.doc.open({ doc: sourceDoc, sessionId });

    const sourceMatch = await queryFirstTextMatch(sessionId, pattern);
    const sourceStyles = firstRunStyles(sourceMatch);
    expect(['on', 'clear']).toContain(sourceStyles.direct.bold);
    expect(sourceStyles.effective.bold).toBe(true);
    const target = await findFirstTextTarget(sessionId, pattern);

    await applyInline(sessionId, target, { bold: 'off' });
    const offMatch = await queryFirstTextMatch(sessionId, pattern);
    const offStyles = firstRunStyles(offMatch);
    expect(typeof offStyles.effective.bold).toBe('boolean');
    await saveResult(sessionId, 'directive-cycle-off.docx');

    await applyInline(sessionId, target, { bold: 'clear' });
    const clearMatch = await queryFirstTextMatch(sessionId, pattern);
    const clearStyles = firstRunStyles(clearMatch);
    expect(typeof clearStyles.effective.bold).toBe('boolean');
    await saveResult(sessionId, 'directive-cycle-clear.docx');

    await applyInline(sessionId, target, { bold: 'on' });
    const onMatch = await queryFirstTextMatch(sessionId, pattern);
    const onStyles = firstRunStyles(onMatch);
    expect(onStyles.direct.bold).toBe('on');
    expect(onStyles.effective.bold).toBe(true);
    await saveResult(sessionId, 'directive-cycle-on.docx');
  });

  it('query.match meta: text selector sets effectiveResolved=true', async () => {
    const sessionId = sid('meta-text');
    await openFixtureDoc(sessionId, 'meta-text-source.docx');

    const pattern = await firstLinePattern(sessionId);
    const match = await queryFirstTextMatch(sessionId, pattern);
    expect(match.meta?.effectiveResolved).toBe(true);
  });

  it('query.match meta: node selector sets effectiveResolved=false', async () => {
    const sessionId = sid('meta-node');
    await openFixtureDoc(sessionId, 'meta-node-source.docx');

    const nodeMatch = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'node', nodeType: 'paragraph' },
        require: 'first',
      }),
    );

    expect(Array.isArray(nodeMatch?.items)).toBe(true);
    expect(nodeMatch.items.length).toBeGreaterThan(0);
    expect(nodeMatch.items[0]?.matchKind).toBe('node');
    expect(nodeMatch.meta?.effectiveResolved).toBe(false);
  });

  it('node-ref mutation: mutations.apply format.apply bold on', async () => {
    const sessionId = sid('node-ref-bold-on');
    await openFixtureDoc(sessionId, 'node-ref-source.docx');

    const nodeMatch = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'node', nodeType: 'paragraph' },
        require: 'first',
      }),
    );

    const paragraphRef = nodeMatch?.items?.[0]?.handle?.ref as string | undefined;
    expect(typeof paragraphRef).toBe('string');
    if (!paragraphRef) {
      throw new Error('Could not resolve paragraph ref from node selector.');
    }

    const applyResult = unwrap<any>(
      await client.doc.mutations.apply({
        sessionId,
        expectedRevision: nodeMatch.evaluatedRevision,
        atomic: true,
        changeMode: 'direct',
        steps: [
          {
            id: `node-ref-bold-on-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
            op: 'format.apply',
            where: { by: 'ref', ref: paragraphRef },
            args: { inline: { bold: 'on' } },
          },
        ],
      }),
    );
    expect(applyResult?.success).toBe(true);

    const pattern = await firstLinePattern(sessionId);
    const updatedMatch = await queryFirstTextMatch(sessionId, pattern);
    const updatedStyles = firstRunStyles(updatedMatch);
    expect(updatedStyles.direct.bold).toBe('on');
    expect(updatedStyles.effective.bold).toBe(true);

    await saveResult(sessionId, 'node-ref-bold-on.docx');
  });
});
