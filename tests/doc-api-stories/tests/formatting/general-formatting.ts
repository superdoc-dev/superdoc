import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

describe('document-api story: basic formatting', () => {
  const { client, copyDoc, outPath } = useStoryHarness('formatting/general-formatting', {
    preserveResults: true,
  });
  const TARGET_TEXT = 'This Agreement shall commence on the date first written above';

  async function queryFirstTextMatch(sessionId: string) {
    const result = unwrap<any>(
      await client.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: TARGET_TEXT, caseSensitive: true },
        require: 'first',
        includeStyle: true,
      }),
    );
    return result.matches[0];
  }

  async function applyFormat(
    command: 'bold' | 'italic' | 'underline' | 'strikethrough',
    sessionId: string,
    target: any,
  ) {
    if (command === 'bold') return client.doc.format.bold({ sessionId, target });
    if (command === 'italic') return client.doc.format.italic({ sessionId, target });
    if (command === 'underline') return client.doc.format.underline({ sessionId, target });
    return client.doc.format.strikethrough({ sessionId, target });
  }

  async function runFormattingCase(
    command: 'bold' | 'italic' | 'underline' | 'strikethrough',
    expectedMark: 'bold' | 'italic' | 'underline' | 'strike',
  ) {
    const sourceDocPath = await copyDoc(corpusDoc('basic/longer-header.docx'));
    const outputDocPath = outPath(`format-${command}-result.docx`);

    const sessionId = `basic-formatting-${command}-${Date.now()}`;
    await client.doc.open({ doc: sourceDocPath, sessionId });

    const matchBefore = await queryFirstTextMatch(sessionId);
    const target = matchBefore?.textRanges?.[0];
    expect(target).toBeDefined();

    const mutation = unwrap<any>(await applyFormat(command, sessionId, target));
    expect(mutation.receipt?.success).toBe(true);
    expect(mutation.resolvedRange).toBeDefined();

    const matchAfter = await queryFirstTextMatch(sessionId);
    expect(matchAfter?.style?.marks?.[expectedMark]).toBe(true);

    await client.doc.save({ sessionId, out: outputDocPath, force: true });
    await expect(access(outputDocPath)).resolves.toBeUndefined();
  }

  it('tests formatting.bold', async () => {
    await runFormattingCase('bold', 'bold');
  });

  it('tests formatting.italic', async () => {
    await runFormattingCase('italic', 'italic');
  });

  it('tests formatting.underline', async () => {
    await runFormattingCase('underline', 'underline');
  });

  it('tests formatting.strikethrough', async () => {
    await runFormattingCase('strikethrough', 'strike');
  });
});
