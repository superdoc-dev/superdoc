import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const STORIES_ROOT = path.resolve(import.meta.dirname, '../..');
const CLI_SRC_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const BASIC_PARAGRAPH_FIXTURE = path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/basic-paragraph.docx');

const NUMBERING_PART = 'word/numbering.xml';
const CONTENT_TYPES_PART = '[Content_Types].xml';
const DOCUMENT_RELS_PART = 'word/_rels/document.xml.rels';
const NUMBERING_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml';
const NUMBERING_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering';

function unwrap<T>(payload: any): T {
  return payload?.result ?? payload?.undefined ?? payload;
}

function parseJsonEnvelope(stdout: string, stderr: string): any {
  const sources = [stdout.trim(), stderr.trim()].filter((source) => source.length > 0);
  if (sources.length === 0) {
    throw new Error('No CLI JSON envelope output found.');
  }

  for (const source of sources) {
    try {
      return JSON.parse(source);
    } catch {
      const lines = source.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const candidate = lines.slice(index).join('\n').trim();
        if (!candidate.startsWith('{')) continue;
        try {
          return JSON.parse(candidate);
        } catch {
          // continue scanning
        }
      }
    }
  }

  throw new Error(`Failed to parse CLI JSON envelope:\n${sources.join('\n')}`);
}

async function runCli(resultsDir: string, args: string[], options?: { allowError?: boolean }): Promise<any> {
  const stateDir = path.join(resultsDir, '.superdoc-cli-state');
  const executed = await execFileAsync('bun', [CLI_SRC_BIN, ...args, '--output', 'json'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SUPERDOC_CLI_STATE_DIR: stateDir,
    },
  }).catch((error) => error as { stdout?: string; stderr?: string });

  const envelope = parseJsonEnvelope(executed.stdout ?? '', executed.stderr ?? '');
  if (envelope?.ok === false && options?.allowError !== true) {
    const code = envelope.error?.code ?? 'UNKNOWN';
    const message = envelope.error?.message ?? 'Unknown CLI error';
    throw new Error(`${code}: ${message}`);
  }
  return envelope;
}

async function readZipEntry(docPath: string, zipPath: string): Promise<string | null> {
  const JSZipModule = await import('../../../../packages/superdoc/node_modules/jszip');
  const JSZip = JSZipModule.default;
  const buffer = await readFile(docPath);
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(zipPath);
  return file ? file.async('string') : null;
}

async function requireZipEntry(docPath: string, zipPath: string): Promise<string> {
  const content = await readZipEntry(docPath, zipPath);
  if (content == null) {
    throw new Error(`Missing zip entry "${zipPath}" in ${docPath}`);
  }
  return content;
}

async function callDocOperation<T>(
  resultsDir: string,
  operationId: string,
  input: Record<string, unknown>,
): Promise<T> {
  const normalizedInput = { ...input };
  if (typeof normalizedInput.out === 'string' && normalizedInput.out.length > 0 && normalizedInput.force == null) {
    normalizedInput.force = true;
  }

  const envelope = await runCli(resultsDir, [
    'call',
    `doc.${operationId}`,
    '--input-json',
    JSON.stringify(normalizedInput),
  ]);
  return unwrap<T>(unwrap<any>(envelope?.data));
}

async function discoverParagraph(
  resultsDir: string,
  docPath: string,
): Promise<{ kind: 'block'; nodeType: 'paragraph'; nodeId: string }> {
  const matchResult = await callDocOperation<any>(resultsDir, 'query.match', {
    doc: docPath,
    select: { type: 'node', nodeType: 'paragraph' },
    require: 'first',
  });

  const paragraph = matchResult?.items?.[0];
  const nodeId = paragraph?.address?.nodeId;

  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw new Error(`No paragraph address found in ${docPath}`);
  }

  return {
    kind: 'block',
    nodeType: 'paragraph',
    nodeId,
  };
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function getRootStartTag(xml: string, tagName: string): string {
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escapedTagName}\\b[^>]*>`));
  if (!match) {
    throw new Error(`Missing root start tag <${tagName}>.`);
  }
  return match[0];
}

describe('document-api story: lists.create numbering metadata regression', () => {
  it('registers numbering metadata when bullet list creation adds numbering to a numbering-less source docx', async () => {
    const resultsDir = path.join(STORIES_ROOT, 'results', 'lists', 'numbering-metadata-regression');
    await rm(resultsDir, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });

    const sourceDoc = path.join(resultsDir, 'basic-paragraph-source.docx');
    const resultDoc = path.join(resultsDir, 'basic-paragraph-bullet-list.docx');
    await copyFile(BASIC_PARAGRAPH_FIXTURE, sourceDoc);

    const sourceContentTypes = await requireZipEntry(sourceDoc, CONTENT_TYPES_PART);
    const sourceDocumentRels = await requireZipEntry(sourceDoc, DOCUMENT_RELS_PART);
    const sourceNumbering = await readZipEntry(sourceDoc, NUMBERING_PART);

    // This fixture only guards the regression if it starts without numbering metadata.
    expect(sourceNumbering).toBeNull();
    expect(sourceContentTypes).not.toContain('/word/numbering.xml');
    expect(sourceContentTypes).not.toContain(NUMBERING_CONTENT_TYPE);
    expect(sourceDocumentRels).not.toContain(NUMBERING_REL_TYPE);
    expect(sourceDocumentRels).not.toContain('Target="numbering.xml"');

    const paragraphAddress = await discoverParagraph(resultsDir, sourceDoc);
    const createResult = await callDocOperation<any>(resultsDir, 'lists.create', {
      doc: sourceDoc,
      out: resultDoc,
      mode: 'fromParagraphs',
      target: paragraphAddress,
      kind: 'bullet',
    });

    expect(createResult?.success).toBe(true);

    const listResult = await callDocOperation<any>(resultsDir, 'lists.list', { doc: resultDoc });
    expect(listResult?.total).toBe(1);
    expect(listResult?.items?.[0]?.kind).toBe('bullet');

    const resultNumbering = await requireZipEntry(resultDoc, NUMBERING_PART);
    const resultContentTypes = await requireZipEntry(resultDoc, CONTENT_TYPES_PART);
    const resultDocumentRels = await requireZipEntry(resultDoc, DOCUMENT_RELS_PART);

    expect(resultNumbering).toContain('<w:numbering');
    expect(countMatches(resultContentTypes, /PartName="\/word\/numbering\.xml"/g)).toBe(1);
    expect(countMatches(resultContentTypes, /numbering\+xml/g)).toBe(1);
    expect(
      countMatches(
        resultDocumentRels,
        /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/numbering"/g,
      ),
    ).toBe(1);
    expect(countMatches(resultDocumentRels, /Target="numbering\.xml"/g)).toBe(1);

    // SD-2252: every namespace prefix used in the numbering part must be
    // declared on the root element, otherwise Word flags the file as
    // unreadable. Check the actual <w:numbering ...> start tag so we do not
    // false-pass on an xmlns declaration that appears later or in a narrower scope.
    const numberingRootStartTag = getRootStartTag(resultNumbering, 'w:numbering');
    const usedPrefixes = new Set([...resultNumbering.matchAll(/(?:^|[\s<])(\w+):/g)].map((m) => m[1]));
    // xml and xmlns are built-in prefixes that never need an explicit declaration.
    usedPrefixes.delete('xml');
    usedPrefixes.delete('xmlns');

    for (const prefix of usedPrefixes) {
      expect(numberingRootStartTag, `missing xmlns:${prefix} declaration on <w:numbering>`).toMatch(
        new RegExp(`xmlns:${prefix}=`),
      );
    }
  });
});
