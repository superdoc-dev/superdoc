import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { unwrap, useStoryHarness } from '../harness';

const execFileAsync = promisify(execFile);
const ZIP_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

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

function makeSessionId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// SD-3094 / SD-3093: When a paragraph is RTL (w:bidi), the doc-api
// `format.paragraph.setAlignment` takes a *display* alignment (what the user
// sees) and must write the spec-correct *stored* w:jc value per ECMA-376
// §17.3.1.13 (left = leading edge, right = trailing edge).
describe('document-api story: rtl paragraph alignment write', () => {
  const { client, outPath } = useStoryHarness('formatting/rtl-alignment-api', {
    preserveResults: true,
  });

  const api = client as any;

  async function openBlankWithText(sessionId: string, text: string): Promise<void> {
    await api.doc.open({ sessionId });
    const insertResult = unwrap<any>(await api.doc.insert({ sessionId, value: text }));
    expect(insertResult?.receipt?.success).toBe(true);
  }

  async function paragraphTargetForText(sessionId: string, text: string) {
    const result = unwrap<any>(
      await api.doc.query.match({
        sessionId,
        select: { type: 'text', pattern: text, caseSensitive: true },
        require: 'first',
      }),
    );
    const item = result?.items?.[0];
    expect(item?.address?.kind).toBe('block');
    expect(item?.address?.nodeType).toBe('paragraph');
    return item.address;
  }

  async function makeRtlParagraph(sessionId: string, text: string) {
    await openBlankWithText(sessionId, text);
    const target = await paragraphTargetForText(sessionId, text);
    const result = unwrap<any>(
      await api.doc.format.paragraph.setDirection({
        sessionId,
        target,
        direction: 'rtl',
        alignmentPolicy: 'preserve',
      }),
    );
    expect(result?.success).toBe(true);
    return target;
  }

  async function saveResult(sessionId: string, name: string): Promise<string> {
    const savePath = outPath(name);
    await api.doc.save({ sessionId, out: savePath, force: true });
    return savePath;
  }

  it('setAlignment(left) on RTL paragraph exports w:jc=right (mirrored to trailing-edge stored value)', async () => {
    const sessionId = makeSessionId('rtl-align-left');
    const paragraphText = 'RTL paragraph align-left case';

    const target = await makeRtlParagraph(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setAlignment({
        sessionId,
        target,
        alignment: 'left',
      }),
    );
    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'rtl-align-left.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="left"[^>]*\/>/g)).toBe(0);
  });

  it('setAlignment(right) on RTL paragraph exports w:jc=left (mirrored to leading-edge stored value)', async () => {
    const sessionId = makeSessionId('rtl-align-right');
    const paragraphText = 'RTL paragraph align-right case';

    const target = await makeRtlParagraph(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setAlignment({
        sessionId,
        target,
        alignment: 'right',
      }),
    );
    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'rtl-align-right.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="left"[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="right"[^>]*\/>/g)).toBe(0);
  });

  it('setAlignment(center) on RTL paragraph exports w:jc=center (no mirror)', async () => {
    const sessionId = makeSessionId('rtl-align-center');
    const paragraphText = 'RTL paragraph align-center case';

    const target = await makeRtlParagraph(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setAlignment({
        sessionId,
        target,
        alignment: 'center',
      }),
    );
    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'rtl-align-center.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="center"[^>]*\/>/g)).toBe(1);
  });

  it('setAlignment(justify) on RTL paragraph exports w:jc=both (justify normalizes to both, no mirror)', async () => {
    const sessionId = makeSessionId('rtl-align-justify');
    const paragraphText = 'RTL paragraph align-justify case';

    const target = await makeRtlParagraph(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setAlignment({
        sessionId,
        target,
        alignment: 'justify',
      }),
    );
    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'rtl-align-justify.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(1);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="both"[^>]*\/>/g)).toBe(1);
  });

  it('setAlignment on LTR paragraph still writes display value unchanged', async () => {
    const sessionId = makeSessionId('ltr-align-baseline');
    const paragraphText = 'LTR paragraph baseline case';

    await openBlankWithText(sessionId, paragraphText);
    const target = await paragraphTargetForText(sessionId, paragraphText);

    const result = unwrap<any>(
      await api.doc.format.paragraph.setAlignment({
        sessionId,
        target,
        alignment: 'left',
      }),
    );
    expect(result?.success).toBe(true);

    const docPath = await saveResult(sessionId, 'ltr-align-left.docx');
    const documentXml = await readDocxPart(docPath, 'word/document.xml');
    const paragraphs = extractParagraphXmls(documentXml);

    expect(paragraphs).toHaveLength(1);
    expect(countMatches(paragraphs[0], /<w:bidi\b[^>]*\/>/g)).toBe(0);
    expect(countMatches(paragraphs[0], /<w:jc\b[^>]*w:val="left"[^>]*\/>/g)).toBe(1);
  });
});
