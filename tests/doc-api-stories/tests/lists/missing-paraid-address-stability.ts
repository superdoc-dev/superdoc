import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';

type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

type ListsListResult = {
  total: number;
  items: Array<{
    address: ListItemAddress;
    listId: string;
    marker?: string;
    ordinal?: number;
    level?: number;
    kind?: 'ordered' | 'bullet';
    text?: string;
  }>;
};

type ListsGetEnvelope = {
  data?: {
    item?: {
      address: ListItemAddress;
      listId: string;
      marker?: string;
      ordinal?: number;
      level?: number;
      kind?: 'ordered' | 'bullet';
      text?: string;
    };
  };
};

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const RESULTS_DIR = path.resolve(import.meta.dirname, '../../results/lists/missing-paraid-address-stability');
const CLI_SRC_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const LIST_FIXTURE_CANDIDATES = [
  path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/basic-list.docx'),
  path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/list_with_indents.docx'),
  path.join(REPO_ROOT, 'devtools/document-api-tests/fixtures/matrix-list.input.docx'),
  path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/lists-complex-items.docx'),
];
const ADDRESS_STABILITY_TIMEOUT_MS = 60_000;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

type JsZipConstructor = typeof import('jszip').default;

let jsZipPromise: Promise<JsZipConstructor> | null = null;
let resolvedListFixture: string | null = null;
let stateDir = '';

function sid(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function outPath(name: string): string {
  return path.join(RESULTS_DIR, name);
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
          // Keep scanning for the envelope.
        }
      }
    }
  }

  throw new Error(`Failed to parse CLI JSON envelope:\n${sources.join('\n')}`);
}

async function runCli(args: string[], options: { allowError?: boolean } = {}): Promise<any> {
  let stdout = '';
  let stderr = '';

  try {
    const executed = await execFileAsync('bun', [CLI_SRC_BIN, ...args, '--output', 'json'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        SUPERDOC_CLI_STATE_DIR: stateDir,
      },
    });
    stdout = executed.stdout;
    stderr = executed.stderr;
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    stdout = failed.stdout ?? '';
    stderr = failed.stderr ?? '';
  }

  const envelope = parseJsonEnvelope(stdout, stderr);
  if (envelope?.ok === false && options.allowError !== true) {
    const code = envelope.error?.code ?? 'UNKNOWN';
    const message = envelope.error?.message ?? 'Unknown CLI error';
    throw new Error(`${code}: ${message}`);
  }
  return envelope;
}

async function resolveFixture(candidates: string[], fixtureLabel: string): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`No ${fixtureLabel} fixture found. Tried: ${candidates.join(', ')}`);
}

async function resolveListFixture(): Promise<string> {
  if (resolvedListFixture) return resolvedListFixture;
  resolvedListFixture = await resolveFixture(LIST_FIXTURE_CANDIDATES, 'list');
  return resolvedListFixture;
}

async function loadJsZip(): Promise<JsZipConstructor> {
  if (jsZipPromise) return jsZipPromise;

  jsZipPromise = (async () => {
    const entry = require.resolve('jszip', {
      paths: [path.join(REPO_ROOT, 'packages/super-editor')],
    });
    const mod = await import(pathToFileURL(entry).href);
    return (mod.default ?? mod) as JsZipConstructor;
  })();

  return jsZipPromise;
}

async function writeListFixtureWithoutParaIds(outputPath: string): Promise<string> {
  const sourcePath = await resolveListFixture();
  const JSZip = await loadJsZip();
  const sourceBytes = await readFile(sourcePath);
  const zip = await JSZip.loadAsync(sourceBytes);
  const documentXmlFile = zip.file('word/document.xml');

  if (!documentXmlFile) {
    throw new Error(`Fixture doc is missing word/document.xml: ${sourcePath}`);
  }

  const documentXml = await documentXmlFile.async('string');
  const updatedXml = documentXml.replace(/\s+w14:paraId="[^"]*"/g, '').replace(/\s+w14:textId="[^"]*"/g, '');

  if (updatedXml === documentXml) {
    throw new Error(`Fixture doc did not contain paragraph ids to strip: ${sourcePath}`);
  }

  zip.file('word/document.xml', updatedXml);
  const outputBytes = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, outputBytes);
  return outputPath;
}

function expectFirstListItem(result: ListsListResult): ListItemAddress {
  expect(result.total).toBeGreaterThan(0);
  expect(result.items.length).toBeGreaterThan(0);

  const address = result.items[0]?.address;
  expect(address?.nodeType).toBe('listItem');
  expect(typeof address?.nodeId).toBe('string');
  expect(address?.nodeId.length).toBeGreaterThan(0);

  return address as ListItemAddress;
}

function extractListResult(envelope: any): ListsListResult {
  return envelope?.data?.result as ListsListResult;
}

function extractGetAddress(envelope: ListsGetEnvelope): ListItemAddress {
  const address = envelope.data?.item?.address;
  expect(address?.nodeType).toBe('listItem');
  expect(typeof address?.nodeId).toBe('string');
  expect(address?.nodeId.length).toBeGreaterThan(0);
  return address as ListItemAddress;
}

beforeEach(async () => {
  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });
  stateDir = outPath('.superdoc-cli-state');
});

describe('document-api story: lists missing paraId address stability', () => {
  it(
    'keeps list item addresses stable for docs without paraIds across repeated reads and reopen',
    async () => {
      const sourceDoc = await writeListFixtureWithoutParaIds(outPath('lists-without-paraids.docx'));
      const firstSessionId = sid('lists-no-paraid-first');
      const reopenedSessionId = sid('lists-no-paraid-reopened');

      try {
        const statelessFirstList = extractListResult(await runCli(['lists', 'list', sourceDoc, '--limit', '20']));
        const firstAddress = expectFirstListItem(statelessFirstList);

        const statelessGetAddress = extractGetAddress(
          await runCli(['lists', 'get', sourceDoc, '--address-json', JSON.stringify(firstAddress)]),
        );
        expect(statelessGetAddress).toEqual(firstAddress);

        const statelessSecondList = extractListResult(await runCli(['lists', 'list', sourceDoc, '--limit', '20']));
        const secondAddress = expectFirstListItem(statelessSecondList);
        expect(secondAddress).toEqual(firstAddress);

        await runCli(['open', sourceDoc, '--session', firstSessionId]);

        const sessionFirstList = extractListResult(
          await runCli(['lists', 'list', '--session', firstSessionId, '--limit', '20']),
        );
        const sessionFirstAddress = expectFirstListItem(sessionFirstList);
        expect(sessionFirstAddress).toEqual(firstAddress);

        const sessionGetAddress = extractGetAddress(
          await runCli(['lists', 'get', '--session', firstSessionId, '--address-json', JSON.stringify(firstAddress)]),
        );
        expect(sessionGetAddress).toEqual(firstAddress);

        await runCli(['close', '--session', firstSessionId, '--discard']);

        await runCli(['open', sourceDoc, '--session', reopenedSessionId]);

        const reopenedGetAddress = extractGetAddress(
          await runCli([
            'lists',
            'get',
            '--session',
            reopenedSessionId,
            '--address-json',
            JSON.stringify(firstAddress),
          ]),
        );
        expect(reopenedGetAddress).toEqual(firstAddress);

        const reopenedList = extractListResult(
          await runCli(['lists', 'list', '--session', reopenedSessionId, '--limit', '20']),
        );
        const reopenedAddress = expectFirstListItem(reopenedList);
        expect(reopenedAddress).toEqual(firstAddress);
      } finally {
        await runCli(['close', '--session', firstSessionId, '--discard'], { allowError: true });
        await runCli(['close', '--session', reopenedSessionId, '--discard'], { allowError: true });
      }
    },
    ADDRESS_STABILITY_TIMEOUT_MS,
  );
});
