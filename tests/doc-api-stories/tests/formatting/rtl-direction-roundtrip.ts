import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readDocxPart(docPath: string, partPath: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', docPath, partPath], {
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

function extractParagraphXmls(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]);
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function extractTextNodes(xml: string): string[] {
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]);
}

function makeSessionId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('document-api story: rtl paragraph direction roundtrip', () => {
  const { client, outPath } = useStoryHarness('formatting/rtl-direction-roundtrip', {
    preserveResults: true,
  });

  const api = client as any;

  async function openBlankWithText(sessionId: string, text: string): Promise<void> {
    await api.doc.open({ sessionId });

    const insertResult = unwrap<any>(await api.doc.insert({ sessionId, value: text }));
    expect(insertResult?.receipt?.success).toBe(true);
  }

  async function queryTextMatch(sessionId: string, pattern: string): Promise<any> {
    const result = unwrap<any>(
      await api.doc.query.match({
        sessionId,
        select: {
          type: 'text',
          pattern,
          caseSensitive: true,
        },
        require: 'first',
      }),
    );

    const item = result?.items?.[0];
    expect(item).toBeDefined();
    expect(item?.matchKind).toBe('text');
    return item;
  }

  async function paragraphTargetForText(sessionId: string, text: string) {
    const match = await queryTextMatch(sessionId, text);
    expect(match?.address?.kind).toBe('block');
    expect(match?.address?.nodeType).toBe('paragraph');
    return match.address;
  }

  async function selectionTargetForText(sessionId: string, text: string) {
    const match = await queryTextMatch(sessionId, text);
    expect(match?.target?.kind).toBe('selection');
    return match.target;
  }

  async function saveResult(sessionId: string, name: string): Promise<string> {
    const savePath = outPath(name);
    await api.doc.save({ sessionId, out: savePath, force: true });
    return savePath;
  }

  it('setDirection preserve: exports paragraph-level w:bidi without forcing alignment', async () => {
    const sessionId = makeSessionId('rtl-set-direction-preserve');
    const paragraphText = 'RTL paragraph preserve case';

    await openBlankWithText(sessionId, paragraphText);
    const target = await paragraphTargetForText(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setDirection({
        sessionId,
        target,
        direction: 'rtl',
        alignmentPolicy: 'preserve',
      }),
    );

    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'set-direction-preserve.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain(paragraphText);
    expect(paragraphs[0]).toContain('<w:pPr>');
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:rtl\b[^>]*\/>/g)).toBe(0);
    expect(extractTextNodes(paragraphs[0])).toEqual([paragraphText]);
  });

  it('setDirection matchDirection: exports paragraph-level w:bidi and right justification', async () => {
    const sessionId = makeSessionId('rtl-set-direction-match');
    const paragraphText = 'RTL paragraph matchDirection case';

    await openBlankWithText(sessionId, paragraphText);
    const target = await paragraphTargetForText(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setDirection({
        sessionId,
        target,
        direction: 'rtl',
        alignmentPolicy: 'matchDirection',
      }),
    );

    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'set-direction-match-direction.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain(paragraphText);
    expect(paragraphs[0]).toContain('<w:pPr>');
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:rtl\b[^>]*\/>/g)).toBe(0);
    expect(extractTextNodes(paragraphs[0])).toEqual([paragraphText]);
  });

  it('clearDirection: removes paragraph-level w:bidi after a preserve-direction mutation', async () => {
    const sessionId = makeSessionId('rtl-clear-direction');
    const paragraphText = 'RTL paragraph clearDirection case';

    await openBlankWithText(sessionId, paragraphText);
    const target = await paragraphTargetForText(sessionId, paragraphText);

    const setResult = unwrap<any>(
      await api.doc.format.paragraph.setDirection({
        sessionId,
        target,
        direction: 'rtl',
        alignmentPolicy: 'preserve',
      }),
    );
    expect(setResult?.success).toBe(true);

    const clearResult = unwrap<any>(
      await api.doc.format.paragraph.clearDirection({
        sessionId,
        target,
      }),
    );
    expect(clearResult?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'clear-direction.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain(paragraphText);
    expect(countMatches(paragraphs[0], /<w:pPr>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:rtl\b[^>]*\/>/g)).toBe(0);
    expect(extractTextNodes(paragraphs[0])).toEqual([paragraphText]);
  });

  it('format.rtl: exports run-level w:rtl without changing paragraph direction', async () => {
    const sessionId = makeSessionId('rtl-inline-run');
    const paragraphText = 'Inline RTL case: abc مرحبا xyz';
    const selectedText = 'مرحبا';

    await openBlankWithText(sessionId, paragraphText);
    const target = await selectionTargetForText(sessionId, selectedText);

    const result = unwrap<any>(
      await api.doc.format.rtl({
        sessionId,
        target,
        value: true,
      }),
    );

    expect(result?.receipt?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'inline-rtl.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);
    const rtlRunRegex = new RegExp(
      `<w:r\\b[\\s\\S]*?<w:rPr>[\\s\\S]*?<w:rtl\\b[^>]*\\/>[\\s\\S]*?<w:t[^>]*>${escapeForRegex(selectedText)}</w:t>[\\s\\S]*?<\\/w:r>`,
    );

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain(selectedText);
    expect(paragraphs[0]).not.toContain('<w:pPr>');
    expect(countMatches(paragraphs[0], /<w:rtl\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(0);
    expect(paragraphs[0]).toMatch(rtlRunRegex);
    expect(extractTextNodes(paragraphs[0])).toEqual(['Inline RTL case: abc ', selectedText, ' xyz']);
  });
});
