import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../index';

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type TextRange = {
  kind: 'text';
  blockId: string;
  range: {
    start: number;
    end: number;
  };
};

type ListItemAddress = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

type SuccessEnvelope<TData> = {
  ok: true;
  command: string;
  data: TData;
  meta: {
    elapsedMs: number;
  };
};

type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

const TEST_DIR = join(import.meta.dir, 'fixtures-cli');
const STATE_DIR = join(TEST_DIR, 'state');
const SOURCE_DOC = join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/advanced-text.docx');
const LIST_SOURCE_DOC_CANDIDATES = [
  join(import.meta.dir, '../../../../devtools/document-api-tests/fixtures/matrix-list.input.docx'),
  join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/lists-complex-items.docx'),
];
const SAMPLE_DOC = join(TEST_DIR, 'sample.docx');
const LIST_SAMPLE_DOC = join(TEST_DIR, 'lists-sample.docx');

async function resolveListSourceDoc(): Promise<string> {
  for (const candidate of LIST_SOURCE_DOC_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`No list fixture found. Tried: ${LIST_SOURCE_DOC_CANDIDATES.join(', ')}`);
}

async function runCli(args: string[], stdinBytes?: Uint8Array): Promise<RunResult> {
  let stdout = '';
  let stderr = '';

  const code = await run(args, {
    stdout(message: string) {
      stdout += message;
    },
    stderr(message: string) {
      stderr += message;
    },
    async readStdinBytes() {
      return stdinBytes ?? new Uint8Array();
    },
  });

  return { code, stdout, stderr };
}

function parseJsonOutput<T>(result: RunResult): T {
  const source = result.stdout.trim() || result.stderr.trim();
  if (!source) {
    throw new Error('No JSON output found.');
  }

  return JSON.parse(source) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasPrettyProperties(node: unknown): boolean {
  const record = asRecord(node);
  if (!record) return false;
  const properties = asRecord(record.properties);
  if (!properties) return false;
  return Object.values(properties).some((value) => value != null && value !== '' && value !== false);
}

async function firstTextRange(args: string[]): Promise<TextRange> {
  const result = await runCli(args);
  expect(result.code).toBe(0);

  const envelope = parseJsonOutput<
    SuccessEnvelope<{
      result: {
        context?: Array<{ textRanges?: TextRange[] }>;
      };
    }>
  >(result);

  const range = envelope.data.result.context?.[0]?.textRanges?.[0];
  if (!range) {
    throw new Error('Expected at least one text range from find result.');
  }

  return range;
}

function firstInsertedEntityId(result: RunResult): string {
  const envelope = parseJsonOutput<
    SuccessEnvelope<{
      receipt?: {
        inserted?: Array<{ entityId?: string }>;
      };
    }>
  >(result);
  const entityId = envelope.data.receipt?.inserted?.[0]?.entityId;
  if (!entityId) {
    throw new Error('Expected inserted entity id in receipt.');
  }
  return entityId;
}

async function firstListItemAddress(args: string[]): Promise<ListItemAddress> {
  const result = await runCli(args);
  expect(result.code).toBe(0);

  const envelope = parseJsonOutput<
    SuccessEnvelope<{
      result: {
        matches: ListItemAddress[];
      };
    }>
  >(result);

  const address = envelope.data.result.matches[0];
  if (!address) {
    throw new Error('Expected at least one list item address from lists.list result.');
  }

  return address;
}

describe('superdoc CLI', () => {
  beforeAll(async () => {
    process.env.SUPERDOC_CLI_STATE_DIR = STATE_DIR;
    await mkdir(TEST_DIR, { recursive: true });
    await copyFile(SOURCE_DOC, SAMPLE_DOC);
    await copyFile(await resolveListSourceDoc(), LIST_SAMPLE_DOC);
  });

  beforeEach(async () => {
    await rm(STATE_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.SUPERDOC_CLI_STATE_DIR;
  });

  test('status returns inactive when no document is open', async () => {
    const result = await runCli(['status']);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<SuccessEnvelope<{ active: boolean }>>(result);
    expect(envelope.command).toBe('status');
    expect(envelope.data.active).toBe(false);
  });

  test('commands without <doc> require an active context', async () => {
    const result = await runCli(['find', '--type', 'text', '--pattern', 'Wilde']);
    expect(result.code).toBe(1);

    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('NO_ACTIVE_DOCUMENT');
  });

  test('info returns required contract fields', async () => {
    const result = await runCli(['info', SAMPLE_DOC]);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        document: { source: string; revision: number };
        counts: { words: number; paragraphs: number };
        capabilities: { canFind: boolean };
      }>
    >(result);

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('info');
    expect(envelope.data.document.source).toBe('path');
    expect(envelope.data.document.revision).toBe(0);
    expect(envelope.data.counts.words).toBeGreaterThan(0);
    expect(envelope.data.counts.paragraphs).toBeGreaterThan(0);
    expect(envelope.data.capabilities.canFind).toBe(true);
    expect(envelope.meta.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test('info pretty includes revision summary and outline section when available', async () => {
    const jsonResult = await runCli(['info', SAMPLE_DOC]);
    expect(jsonResult.code).toBe(0);

    const jsonEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        outline: Array<{ level: number; text: string; nodeId: string }>;
      }>
    >(jsonResult);

    const prettyResult = await runCli(['info', SAMPLE_DOC, '--output', 'pretty']);
    expect(prettyResult.code).toBe(0);
    expect(prettyResult.stdout).toContain('Revision 0:');
    expect(prettyResult.stdout).toContain('words');
    if (jsonEnvelope.data.outline.length > 0) {
      expect(prettyResult.stdout).toContain('Outline:');
    }
  });

  test('describe returns contract overview', async () => {
    const result = await runCli(['describe']);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        contractVersion: string;
        operationCount: number;
        operations: Array<{ id: string; command: string[] }>;
      }>
    >(result);

    expect(envelope.command).toBe('describe');
    expect(envelope.data.contractVersion.length).toBeGreaterThan(0);
    expect(envelope.data.operationCount).toBeGreaterThan(0);
    expect(envelope.data.operations.some((operation) => operation.id === 'doc.find')).toBe(true);
  });

  test('describe command returns one operation by id', async () => {
    const result = await runCli(['describe', 'command', 'doc.find']);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        contractVersion: string;
        operation: {
          id: string;
          command: string[];
        };
      }>
    >(result);

    expect(envelope.command).toBe('describe command');
    expect(envelope.data.contractVersion.length).toBeGreaterThan(0);
    expect(envelope.data.operation.id).toBe('doc.find');
    expect(envelope.data.operation.command).toEqual(['find']);
  });

  test('describe command pretty prints parameters and constraints', async () => {
    const result = await runCli(['describe', 'command', 'doc.find', '--output', 'pretty']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Parameters:');
    expect(result.stdout).toContain('--session');
    expect(result.stdout).toContain('--include-nodes');
    expect(result.stdout).toContain('Constraints:');
  });

  test('describe command pretty labels operation positional args by name', async () => {
    const result = await runCli(['describe', 'command', 'doc.describeCommand', '--output', 'pretty']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('<operationId>');
    expect(result.stdout).not.toContain('<doc>  Document path or stdin');
  });

  test('describe command pretty labels session ids as positional ids', async () => {
    const result = await runCli(['describe', 'command', 'doc.session.save', '--output', 'pretty']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('<sessionId>');
    expect(result.stdout).not.toContain('<doc>  Document path or stdin');
  });

  test('call executes an operation from canonical input payload', async () => {
    const result = await runCli([
      'call',
      'doc.find',
      '--input-json',
      JSON.stringify({
        doc: SAMPLE_DOC,
        query: {
          select: {
            type: 'text',
            pattern: 'Wilde',
            mode: 'contains',
          },
          limit: 1,
        },
      }),
    ]);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
        result: {
          query: {
            select: {
              type: string;
            };
          };
          document: {
            source: string;
          };
        };
      }>
    >(result);

    expect(envelope.command).toBe('call');
    expect(envelope.data.operationId).toBe('doc.find');
    expect(envelope.data.result.query.select.type).toBe('text');
    expect(envelope.data.result.document.source).toBe('path');
  });

  test('call resolves operation ids from command-key shorthand', async () => {
    const result = await runCli([
      'call',
      'find',
      '--input-json',
      JSON.stringify({
        doc: SAMPLE_DOC,
        query: {
          select: {
            type: 'text',
            pattern: 'Wilde',
          },
        },
      }),
    ]);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
      }>
    >(result);
    expect(envelope.data.operationId).toBe('doc.find');
  });

  test('call supports operations with non-doc positional kind:"doc" params', async () => {
    const result = await runCli([
      'call',
      'doc.describeCommand',
      '--input-json',
      JSON.stringify({
        operationId: 'doc.find',
      }),
    ]);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
        result: {
          operation: {
            id: string;
          };
        };
      }>
    >(result);
    expect(envelope.data.operationId).toBe('doc.describeCommand');
    expect(envelope.data.result.operation.id).toBe('doc.find');
  });

  test('call supports alias command keys with spaces', async () => {
    const sessionId = 'call-session-use-alias';
    const openResult = await runCli(['open', SAMPLE_DOC, '--session', sessionId]);
    expect(openResult.code).toBe(0);

    const callResult = await runCli([
      'call',
      'session',
      'use',
      '--input-json',
      JSON.stringify({
        sessionId,
      }),
    ]);
    expect(callResult.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
        result: {
          activeSessionId: string;
        };
      }>
    >(callResult);
    expect(envelope.data.operationId).toBe('doc.session.setDefault');
    expect(envelope.data.result.activeSessionId).toBe(sessionId);

    const closeResult = await runCli(['close', '--session', sessionId, '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('call doc.open accepts doc + sessionId in input payload', async () => {
    const sessionId = 'call-open-with-session-id';

    const openCall = await runCli([
      'call',
      'doc.open',
      '--input-json',
      JSON.stringify({
        doc: SAMPLE_DOC,
        sessionId,
      }),
    ]);
    expect(openCall.code).toBe(0);

    const openEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
        result: {
          contextId: string;
          active: boolean;
        };
      }>
    >(openCall);
    expect(openEnvelope.data.operationId).toBe('doc.open');
    expect(openEnvelope.data.result.contextId).toBe(sessionId);
    expect(openEnvelope.data.result.active).toBe(true);

    const closeResult = await runCli(['close', '--session', sessionId, '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('call doc.save and doc.close use active session when input.sessionId is omitted', async () => {
    const sessionId = 'call-save-close-active-session';
    const savedOut = join(TEST_DIR, 'call-save-close-active-session.docx');

    const openResult = await runCli(['open', SAMPLE_DOC, '--session', sessionId]);
    expect(openResult.code).toBe(0);

    const saveCall = await runCli([
      'call',
      'doc.save',
      '--input-json',
      JSON.stringify({
        out: savedOut,
        force: true,
      }),
    ]);
    expect(saveCall.code).toBe(0);

    const closeCall = await runCli([
      'call',
      'doc.close',
      '--input-json',
      JSON.stringify({
        discard: true,
      }),
    ]);
    expect(closeCall.code).toBe(0);
  });

  test('call rejects mixing stateless doc input with session targets', async () => {
    const result = await runCli([
      'call',
      'doc.find',
      '--input-json',
      JSON.stringify({
        doc: SAMPLE_DOC,
        sessionId: 'mixed-mode-session',
        query: {
          select: {
            type: 'text',
            pattern: 'Wilde',
          },
        },
      }),
    ]);
    expect(result.code).toBe(1);
    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('INVALID_ARGUMENT');
    expect(envelope.error.message).toContain('stateless input.doc cannot be combined');
  });

  test('call executes direct text-mutation operations without token round-trip semantics drift', async () => {
    const source = join(TEST_DIR, 'call-insert-source.docx');
    const out = join(TEST_DIR, 'call-insert-out.docx');
    await copyFile(SAMPLE_DOC, source);

    const callResult = await runCli([
      'call',
      'doc.insert',
      '--input-json',
      JSON.stringify({
        doc: source,
        text: 'CALL_INSERT_TOKEN_1597',
        out,
      }),
    ]);
    expect(callResult.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        operationId: string;
        result: {
          document: { source: string };
          target: TextRange;
        };
      }>
    >(callResult);
    expect(envelope.data.operationId).toBe('doc.insert');
    expect(envelope.data.result.document.source).toBe('path');
    expect(envelope.data.result.target.range.start).toBe(0);

    const verifyResult = await runCli(['find', out, '--type', 'text', '--pattern', 'CALL_INSERT_TOKEN_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('call only supports JSON output mode', async () => {
    const result = await runCli([
      'call',
      'doc.find',
      '--input-json',
      JSON.stringify({
        doc: SAMPLE_DOC,
        query: {
          select: {
            type: 'text',
            pattern: 'Wilde',
          },
        },
      }),
      '--output',
      'pretty',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('INVALID_ARGUMENT');
    expect(result.stderr).toContain('call: only --output json is supported.');
  });

  test('describe command returns TARGET_NOT_FOUND for unknown operation', async () => {
    const result = await runCli(['describe', 'command', 'doc.missing']);
    expect(result.code).toBe(1);

    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('TARGET_NOT_FOUND');
  });

  test('find supports run node type', async () => {
    const result = await runCli(['find', SAMPLE_DOC, '--type', 'run', '--limit', '1']);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          total: number;
          matches: Array<{ kind: string; nodeType: string }>;
        };
      }>
    >(result);

    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('find');
    expect(envelope.data.result.total).toBeGreaterThan(0);
    expect(envelope.data.result.matches[0].kind).toBe('inline');
    expect(envelope.data.result.matches[0].nodeType).toBe('run');
  });

  test('find rejects legacy query.include payloads', async () => {
    const result = await runCli([
      'find',
      SAMPLE_DOC,
      '--query-json',
      JSON.stringify({
        select: { type: 'text', pattern: 'Wilde' },
        include: ['context'],
      }),
    ]);
    expect(result.code).toBe(1);

    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
    expect(envelope.error.message).toContain('query.include');
  });

  test('find text queries return context and textRanges without includeNodes', async () => {
    const result = await runCli([
      'find',
      SAMPLE_DOC,
      '--query-json',
      JSON.stringify({
        select: { type: 'text', pattern: 'Wilde' },
        limit: 1,
      }),
    ]);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          context?: Array<{
            textRanges?: Array<{ kind: 'text'; blockId: string; range: { start: number; end: number } }>;
          }>;
        };
      }>
    >(result);

    const firstContext = envelope.data.result.context?.[0];
    expect(firstContext).toBeDefined();
    expect(firstContext?.textRanges?.length).toBeGreaterThan(0);
  });

  test('get-node resolves address returned by find', async () => {
    const findResult = await runCli(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde', '--limit', '1']);
    expect(findResult.code).toBe(0);

    const findEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          matches: Array<Record<string, unknown>>;
        };
      }>
    >(findResult);

    const address = findEnvelope.data.result.matches[0];
    expect(address).toBeDefined();

    const getNodeResult = await runCli(['get-node', SAMPLE_DOC, '--address-json', JSON.stringify(address)]);
    expect(getNodeResult.code).toBe(0);

    const nodeEnvelope = parseJsonOutput<SuccessEnvelope<{ node: unknown }>>(getNodeResult);
    expect(nodeEnvelope.ok).toBe(true);
    expect(nodeEnvelope.command).toBe('get-node');
    expect(nodeEnvelope.data.node).toBeDefined();
  });

  test('get-node pretty includes resolved identity and optional node details', async () => {
    const findResult = await runCli(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde', '--limit', '1']);
    expect(findResult.code).toBe(0);

    const findEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          matches: Array<Record<string, unknown>>;
        };
      }>
    >(findResult);
    const address = findEnvelope.data.result.matches[0];
    expect(address).toBeDefined();
    if (!address) return;

    const prettyResult = await runCli([
      'get-node',
      SAMPLE_DOC,
      '--address-json',
      JSON.stringify(address),
      '--output',
      'pretty',
    ]);
    expect(prettyResult.code).toBe(0);
    expect(prettyResult.stdout).toContain('Revision 0:');

    const jsonResult = await runCli(['get-node', SAMPLE_DOC, '--address-json', JSON.stringify(address)]);
    expect(jsonResult.code).toBe(0);
    const jsonEnvelope = parseJsonOutput<SuccessEnvelope<{ node: unknown }>>(jsonResult);
    const node = asRecord(jsonEnvelope.data.node);
    if (typeof node?.text === 'string' && node.text.length > 0) {
      expect(prettyResult.stdout).toContain('Text:');
    }
    if (hasPrettyProperties(jsonEnvelope.data.node)) {
      expect(prettyResult.stdout).toContain('Properties:');
    }
  });

  test('get-node-by-id resolves block ID returned by find', async () => {
    const findResult = await runCli(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde', '--limit', '1']);
    expect(findResult.code).toBe(0);

    const findEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          matches: Array<{ kind: string; nodeType: string; nodeId: string }>;
        };
      }>
    >(findResult);

    const firstMatch = findEnvelope.data.result.matches[0];
    expect(firstMatch.kind).toBe('block');

    const getByIdResult = await runCli([
      'get-node-by-id',
      SAMPLE_DOC,
      '--id',
      firstMatch.nodeId,
      '--node-type',
      firstMatch.nodeType,
    ]);
    expect(getByIdResult.code).toBe(0);

    const envelope = parseJsonOutput<SuccessEnvelope<{ node: unknown }>>(getByIdResult);
    expect(envelope.command).toBe('get-node-by-id');
    expect(envelope.data.node).toBeDefined();
  });

  test('get-node-by-id pretty includes resolved identity and optional node details', async () => {
    const findResult = await runCli(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde', '--limit', '1']);
    expect(findResult.code).toBe(0);

    const findEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          matches: Array<{ kind: string; nodeType: string; nodeId: string }>;
        };
      }>
    >(findResult);

    const firstMatch = findEnvelope.data.result.matches[0];
    expect(firstMatch.kind).toBe('block');

    const prettyResult = await runCli([
      'get-node-by-id',
      SAMPLE_DOC,
      '--id',
      firstMatch.nodeId,
      '--node-type',
      firstMatch.nodeType,
      '--output',
      'pretty',
    ]);
    expect(prettyResult.code).toBe(0);
    expect(prettyResult.stdout).toContain('Revision 0:');
    expect(prettyResult.stdout).toContain(firstMatch.nodeId);

    const jsonResult = await runCli([
      'get-node-by-id',
      SAMPLE_DOC,
      '--id',
      firstMatch.nodeId,
      '--node-type',
      firstMatch.nodeType,
    ]);
    expect(jsonResult.code).toBe(0);
    const jsonEnvelope = parseJsonOutput<SuccessEnvelope<{ node: unknown }>>(jsonResult);
    const node = asRecord(jsonEnvelope.data.node);
    if (typeof node?.text === 'string' && node.text.length > 0) {
      expect(prettyResult.stdout).toContain('Text:');
    }
    if (hasPrettyProperties(jsonEnvelope.data.node)) {
      expect(prettyResult.stdout).toContain('Properties:');
    }
  });

  test('replace dry-run does not write output file', async () => {
    const target = await firstTextRange(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde']);
    const dryRunOut = join(TEST_DIR, 'dry-run.docx');

    const result = await runCli([
      'replace',
      SAMPLE_DOC,
      '--target-json',
      JSON.stringify(target),
      '--text',
      'WILDE_DRY_RUN',
      '--out',
      dryRunOut,
      '--dry-run',
    ]);

    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<SuccessEnvelope<{ dryRun: boolean }>>(result);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dryRun).toBe(true);

    await expect(access(dryRunOut)).rejects.toThrow();
  });

  test('replace writes output and updates text target', async () => {
    const replaceSource = join(TEST_DIR, 'replace-source.docx');
    const replaceOut = join(TEST_DIR, 'replace-out.docx');
    await copyFile(SAMPLE_DOC, replaceSource);

    const target = await firstTextRange(['find', replaceSource, '--type', 'text', '--pattern', 'Wilde']);

    const replaceResult = await runCli([
      'replace',
      replaceSource,
      '--target-json',
      JSON.stringify(target),
      '--text',
      'WILDE_CLI',
      '--out',
      replaceOut,
    ]);

    expect(replaceResult.code).toBe(0);

    const verifyResult = await runCli(['find', replaceOut, '--type', 'text', '--pattern', 'WILDE_CLI']);
    expect(verifyResult.code).toBe(0);

    const verifyEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: { total: number };
      }>
    >(verifyResult);

    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('insert writes output and adds text at target', async () => {
    const insertSource = join(TEST_DIR, 'insert-source.docx');
    const insertOut = join(TEST_DIR, 'insert-out.docx');
    await copyFile(SAMPLE_DOC, insertSource);

    const target = await firstTextRange(['find', insertSource, '--type', 'text', '--pattern', 'Wilde']);
    const collapsedTarget: TextRange = {
      ...target,
      range: {
        start: target.range.start,
        end: target.range.start,
      },
    };

    const insertResult = await runCli([
      'insert',
      insertSource,
      '--target-json',
      JSON.stringify(collapsedTarget),
      '--text',
      'CLI_INSERT_TOKEN_1597',
      '--out',
      insertOut,
    ]);

    expect(insertResult.code).toBe(0);

    const verifyResult = await runCli(['find', insertOut, '--type', 'text', '--pattern', 'CLI_INSERT_TOKEN_1597']);
    expect(verifyResult.code).toBe(0);

    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('insert without target defaults to document-start insertion', async () => {
    const insertSource = join(TEST_DIR, 'insert-default-source.docx');
    const insertOut = join(TEST_DIR, 'insert-default-out.docx');
    await copyFile(SAMPLE_DOC, insertSource);

    const insertResult = await runCli([
      'insert',
      insertSource,
      '--text',
      'CLI_DEFAULT_INSERT_TOKEN_1597',
      '--out',
      insertOut,
    ]);

    expect(insertResult.code).toBe(0);

    const insertEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        target: TextRange;
      }>
    >(insertResult);
    expect(insertEnvelope.data.target.range.start).toBe(0);
    expect(insertEnvelope.data.target.range.end).toBe(0);

    const verifyResult = await runCli([
      'find',
      insertOut,
      '--type',
      'text',
      '--pattern',
      'CLI_DEFAULT_INSERT_TOKEN_1597',
    ]);
    expect(verifyResult.code).toBe(0);

    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('insert without target resolves blank first paragraphs deterministically', async () => {
    const source = join(TEST_DIR, 'insert-blank-first-source.docx');
    const blankFirstOut = join(TEST_DIR, 'insert-blank-first.docx');
    const insertOut = join(TEST_DIR, 'insert-blank-first-result.docx');
    await copyFile(SAMPLE_DOC, source);

    const createResult = await runCli([
      'create',
      'paragraph',
      source,
      '--at',
      'document-start',
      '--out',
      blankFirstOut,
    ]);
    expect(createResult.code).toBe(0);

    const insertResult = await runCli([
      'insert',
      blankFirstOut,
      '--text',
      'CLI_BLANK_INSERT_TOKEN_1597',
      '--out',
      insertOut,
    ]);
    expect(insertResult.code).toBe(0);

    const insertEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        target: TextRange;
        resolvedRange: { from: number; to: number };
      }>
    >(insertResult);

    expect(insertEnvelope.data.target.range).toEqual({ start: 0, end: 0 });
    expect(insertEnvelope.data.resolvedRange.from).toBe(insertEnvelope.data.resolvedRange.to);

    const verifyResult = await runCli([
      'find',
      insertOut,
      '--type',
      'text',
      '--pattern',
      'CLI_BLANK_INSERT_TOKEN_1597',
    ]);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('create paragraph writes output and adds a new paragraph with seed text', async () => {
    const createSource = join(TEST_DIR, 'create-paragraph-source.docx');
    const createOut = join(TEST_DIR, 'create-paragraph-out.docx');
    await copyFile(SAMPLE_DOC, createSource);

    const createResult = await runCli([
      'create',
      'paragraph',
      createSource,
      '--text',
      'CLI_CREATE_PARAGRAPH_TOKEN_1597',
      '--at',
      'document-end',
      '--out',
      createOut,
    ]);

    expect(createResult.code).toBe(0);

    const createEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          success: boolean;
          paragraph: { kind: string; nodeType: string };
          insertionPoint: TextRange;
        };
      }>
    >(createResult);

    expect(createEnvelope.data.result.success).toBe(true);
    expect(createEnvelope.data.result.paragraph.kind).toBe('block');
    expect(createEnvelope.data.result.paragraph.nodeType).toBe('paragraph');
    expect(createEnvelope.data.result.insertionPoint.kind).toBe('text');

    const verifyResult = await runCli([
      'find',
      createOut,
      '--type',
      'text',
      '--pattern',
      'CLI_CREATE_PARAGRAPH_TOKEN_1597',
    ]);
    expect(verifyResult.code).toBe(0);

    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('lists list/get resolve list items in stateless mode', async () => {
    const listResult = await runCli(['lists', 'list', LIST_SAMPLE_DOC, '--limit', '2']);
    expect(listResult.code).toBe(0);

    const listEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          total: number;
          matches: ListItemAddress[];
        };
      }>
    >(listResult);
    expect(listEnvelope.data.result.total).toBeGreaterThan(0);

    const address = listEnvelope.data.result.matches[0];
    expect(address).toBeDefined();
    if (!address) return;

    const getResult = await runCli(['lists', 'get', LIST_SAMPLE_DOC, '--address-json', JSON.stringify(address)]);
    expect(getResult.code).toBe(0);

    const getEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        address: ListItemAddress;
        item: { address: ListItemAddress };
      }>
    >(getResult);
    expect(getEnvelope.data.item.address.nodeId).toBe(address.nodeId);
  });

  test('lists list pretty prints list rows', async () => {
    const result = await runCli(['lists', 'list', LIST_SAMPLE_DOC, '--limit', '2', '--output', 'pretty']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Revision 0:');
    expect(result.stdout).toContain('list items');
    expect(result.stdout.trim().split('\n').length).toBeGreaterThan(1);
  });

  test('lists insert writes output and returns deterministic insertionPoint', async () => {
    const source = join(TEST_DIR, 'lists-insert-source.docx');
    const out = join(TEST_DIR, 'lists-insert-out.docx');
    await copyFile(LIST_SAMPLE_DOC, source);

    const target = await firstListItemAddress(['lists', 'list', source, '--limit', '1']);
    const insertResult = await runCli([
      'lists',
      'insert',
      source,
      '--target-json',
      JSON.stringify(target),
      '--position',
      'after',
      '--text',
      'CLI_LIST_INSERT_TOKEN_1597',
      '--out',
      out,
    ]);

    expect(insertResult.code).toBe(0);

    const insertEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          success: boolean;
          item: ListItemAddress;
          insertionPoint: TextRange;
        };
      }>
    >(insertResult);
    expect(insertEnvelope.data.result.success).toBe(true);
    expect(insertEnvelope.data.result.insertionPoint.range).toEqual({ start: 0, end: 0 });

    const verifyResult = await runCli(['find', out, '--type', 'text', '--pattern', 'CLI_LIST_INSERT_TOKEN_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('lists exit updates stateful document and invalidates list-item target', async () => {
    const openResult = await runCli(['open', LIST_SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const target = await firstListItemAddress(['lists', 'list', '--limit', '1']);
    const exitResult = await runCli(['lists', 'exit', '--target-json', JSON.stringify(target)]);
    expect(exitResult.code).toBe(0);

    const staleGet = await runCli(['lists', 'get', '--address-json', JSON.stringify(target)]);
    expect(staleGet.code).toBe(1);
    const staleEnvelope = parseJsonOutput<ErrorEnvelope>(staleGet);
    expect(staleEnvelope.error.code).toBe('TARGET_NOT_FOUND');

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('lists set-type tracked mode maps to TRACK_CHANGE_COMMAND_UNAVAILABLE', async () => {
    const source = join(TEST_DIR, 'lists-set-type-source.docx');
    const out = join(TEST_DIR, 'lists-set-type-out.docx');
    await copyFile(LIST_SAMPLE_DOC, source);

    const target = await firstListItemAddress(['lists', 'list', source, '--limit', '1']);
    const setTypeResult = await runCli([
      'lists',
      'set-type',
      source,
      '--target-json',
      JSON.stringify(target),
      '--kind',
      'bullet',
      '--change-mode',
      'tracked',
      '--out',
      out,
    ]);

    expect(setTypeResult.code).toBe(1);
    const envelope = parseJsonOutput<ErrorEnvelope>(setTypeResult);
    expect(envelope.error.code).toBe('TRACK_CHANGE_COMMAND_UNAVAILABLE');
  });

  test('delete writes output and removes inserted text target', async () => {
    const deleteSource = join(TEST_DIR, 'delete-source.docx');
    const insertedOut = join(TEST_DIR, 'delete-inserted.docx');
    const deletedOut = join(TEST_DIR, 'delete-out.docx');
    await copyFile(SAMPLE_DOC, deleteSource);

    const baseTarget = await firstTextRange(['find', deleteSource, '--type', 'text', '--pattern', 'Wilde']);
    const collapsedTarget: TextRange = {
      ...baseTarget,
      range: {
        start: baseTarget.range.start,
        end: baseTarget.range.start,
      },
    };

    const insertResult = await runCli([
      'insert',
      deleteSource,
      '--target-json',
      JSON.stringify(collapsedTarget),
      '--text',
      'CLI_DELETE_TOKEN_1597',
      '--out',
      insertedOut,
    ]);
    expect(insertResult.code).toBe(0);

    const deleteTarget = await firstTextRange([
      'find',
      insertedOut,
      '--type',
      'text',
      '--pattern',
      'CLI_DELETE_TOKEN_1597',
    ]);
    const deleteResult = await runCli([
      'delete',
      insertedOut,
      '--target-json',
      JSON.stringify(deleteTarget),
      '--out',
      deletedOut,
    ]);
    expect(deleteResult.code).toBe(0);

    const verifyResult = await runCli(['find', deletedOut, '--type', 'text', '--pattern', 'CLI_DELETE_TOKEN_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBe(0);
  });

  test('format bold writes output for a valid text target', async () => {
    const formatSource = join(TEST_DIR, 'format-source.docx');
    const formatOut = join(TEST_DIR, 'format-out.docx');
    await copyFile(SAMPLE_DOC, formatSource);

    const target = await firstTextRange(['find', formatSource, '--type', 'text', '--pattern', 'Wilde']);

    const result = await runCli([
      'format',
      'bold',
      formatSource,
      '--target-json',
      JSON.stringify(target),
      '--out',
      formatOut,
    ]);

    expect(result.code).toBe(0);
    await access(formatOut);
  });

  test('format bold rejects collapsed target ranges', async () => {
    const formatSource = join(TEST_DIR, 'format-invalid-source.docx');
    const formatOut = join(TEST_DIR, 'format-invalid-out.docx');
    await copyFile(SAMPLE_DOC, formatSource);

    const baseTarget = await firstTextRange(['find', formatSource, '--type', 'text', '--pattern', 'Wilde']);
    const collapsedTarget: TextRange = {
      ...baseTarget,
      range: {
        start: baseTarget.range.start,
        end: baseTarget.range.start,
      },
    };

    const result = await runCli([
      'format',
      'bold',
      formatSource,
      '--target-json',
      JSON.stringify(collapsedTarget),
      '--out',
      formatOut,
    ]);

    expect(result.code).toBe(1);
    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('INVALID_ARGUMENT');
  });

  test('track-changes list is capability-aware', async () => {
    const result = await runCli(['track-changes', 'list', SAMPLE_DOC]);
    if (result.code === 0) {
      const envelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(result);
      expect(envelope.data.result.total).toBeGreaterThanOrEqual(0);
      return;
    }

    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('TRACK_CHANGE_COMMAND_UNAVAILABLE');
  });

  test('track-changes list pretty includes an actionable id when data is available', async () => {
    const jsonResult = await runCli(['track-changes', 'list', SAMPLE_DOC]);
    if (jsonResult.code !== 0) {
      const envelope = parseJsonOutput<ErrorEnvelope>(jsonResult);
      expect(envelope.error.code).toBe('TRACK_CHANGE_COMMAND_UNAVAILABLE');
      return;
    }

    const jsonEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: {
          changes?: Array<{ id?: string }>;
          matches?: Array<{ entityId?: string }>;
        };
      }>
    >(jsonResult);

    const prettyResult = await runCli(['track-changes', 'list', SAMPLE_DOC, '--output', 'pretty']);
    expect(prettyResult.code).toBe(0);
    expect(prettyResult.stdout).toContain('Revision 0:');
    expect(prettyResult.stdout).toContain('tracked changes');

    const firstChangeId = jsonEnvelope.data.result.changes?.[0]?.id;
    const firstMatchId = jsonEnvelope.data.result.matches?.[0]?.entityId;
    if (firstChangeId) {
      expect(prettyResult.stdout).toContain(firstChangeId);
    } else if (firstMatchId) {
      expect(prettyResult.stdout).toContain(firstMatchId);
    }
  });

  test('track-changes get maps missing ids to TRACK_CHANGE_NOT_FOUND when capability is available', async () => {
    const listResult = await runCli(['track-changes', 'list', SAMPLE_DOC]);
    if (listResult.code !== 0) {
      const envelope = parseJsonOutput<ErrorEnvelope>(listResult);
      expect(envelope.error.code).toBe('TRACK_CHANGE_COMMAND_UNAVAILABLE');
      return;
    }

    const getResult = await runCli(['track-changes', 'get', SAMPLE_DOC, '--id', 'missing-track-change-id']);
    expect(getResult.code).toBe(1);

    const envelope = parseJsonOutput<ErrorEnvelope>(getResult);
    expect(envelope.error.code).toBe('TRACK_CHANGE_NOT_FOUND');
  });

  test('track-changes accept/reject map missing ids to TRACK_CHANGE_NOT_FOUND when capability is available', async () => {
    const listResult = await runCli(['track-changes', 'list', SAMPLE_DOC]);
    if (listResult.code !== 0) {
      const envelope = parseJsonOutput<ErrorEnvelope>(listResult);
      expect(envelope.error.code).toBe('TRACK_CHANGE_COMMAND_UNAVAILABLE');
      return;
    }

    const acceptResult = await runCli([
      'track-changes',
      'accept',
      SAMPLE_DOC,
      '--id',
      'missing-track-change-id',
      '--out',
      join(TEST_DIR, 'track-changes-accept-missing-id.docx'),
    ]);
    expect(acceptResult.code).toBe(1);
    const acceptEnvelope = parseJsonOutput<ErrorEnvelope>(acceptResult);
    expect(acceptEnvelope.error.code).toBe('TRACK_CHANGE_NOT_FOUND');

    const rejectResult = await runCli([
      'track-changes',
      'reject',
      SAMPLE_DOC,
      '--id',
      'missing-track-change-id',
      '--out',
      join(TEST_DIR, 'track-changes-reject-missing-id.docx'),
    ]);
    expect(rejectResult.code).toBe(1);
    const rejectEnvelope = parseJsonOutput<ErrorEnvelope>(rejectResult);
    expect(rejectEnvelope.error.code).toBe('TRACK_CHANGE_NOT_FOUND');
  });

  test('comments add writes output file', async () => {
    const commentsSource = join(TEST_DIR, 'comments-source.docx');
    const commentsOut = join(TEST_DIR, 'comments-out.docx');
    await copyFile(SAMPLE_DOC, commentsSource);

    const target = await firstTextRange(['find', commentsSource, '--type', 'text', '--pattern', 'Wilde']);

    const result = await runCli([
      'comments',
      'add',
      commentsSource,
      '--target-json',
      JSON.stringify(target),
      '--text',
      'CLI comment',
      '--out',
      commentsOut,
    ]);

    expect(result.code).toBe(0);
    await access(commentsOut);
  });

  test('comments add returns TARGET_NOT_FOUND for missing block targets', async () => {
    const commentsSource = join(TEST_DIR, 'comments-missing-target-source.docx');
    const commentsOut = join(TEST_DIR, 'comments-missing-target-out.docx');
    await copyFile(SAMPLE_DOC, commentsSource);

    const target = await firstTextRange(['find', commentsSource, '--type', 'text', '--pattern', 'Wilde']);
    const missingTarget: TextRange = {
      ...target,
      blockId: 'missing-block-id',
    };

    const result = await runCli([
      'comments',
      'add',
      commentsSource,
      '--target-json',
      JSON.stringify(missingTarget),
      '--text',
      'CLI comment',
      '--out',
      commentsOut,
    ]);

    expect(result.code).toBe(1);
    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('TARGET_NOT_FOUND');
  });

  test('comments add without --out returns MISSING_REQUIRED in stateless mode', async () => {
    const commentsSource = join(TEST_DIR, 'comments-no-out-source.docx');
    await copyFile(SAMPLE_DOC, commentsSource);

    const target = await firstTextRange(['find', commentsSource, '--type', 'text', '--pattern', 'Wilde']);

    const result = await runCli([
      'comments',
      'add',
      commentsSource,
      '--target-json',
      JSON.stringify(target),
      '--text',
      'CLI comment without out',
    ]);

    expect(result.code).toBe(1);
    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.error.code).toBe('MISSING_REQUIRED');
  });

  test('comments set-active without --out succeeds in stateless mode', async () => {
    const source = join(TEST_DIR, 'comments-set-active-no-out-source.docx');
    const addOut = join(TEST_DIR, 'comments-set-active-no-out-added.docx');
    await copyFile(SAMPLE_DOC, source);

    const target = await firstTextRange(['find', source, '--type', 'text', '--pattern', 'Wilde']);
    const addResult = await runCli([
      'comments',
      'add',
      source,
      '--target-json',
      JSON.stringify(target),
      '--text',
      'anchor for set-active',
      '--out',
      addOut,
    ]);
    expect(addResult.code).toBe(0);
    const commentId = firstInsertedEntityId(addResult);

    const setActiveResult = await runCli(['comments', 'set-active', addOut, '--clear']);
    expect(setActiveResult.code).toBe(0);
  });

  test('comments list pretty includes comment ids for actionable output', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const target = await firstTextRange(['find', '--type', 'text', '--pattern', 'Wilde']);
    const addResult = await runCli([
      'comments',
      'add',
      '--target-json',
      JSON.stringify(target),
      '--text',
      'Pretty comments output',
    ]);
    expect(addResult.code).toBe(0);
    const commentId = firstInsertedEntityId(addResult);

    const listPrettyResult = await runCli(['comments', 'list', '--include-resolved', 'false', '--output', 'pretty']);
    expect(listPrettyResult.code).toBe(0);
    expect(listPrettyResult.stdout).toContain('Revision ');
    expect(listPrettyResult.stdout).toContain(commentId);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('comments lifecycle commands work in stateful mode', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const initialTarget = await firstTextRange(['find', '--type', 'text', '--pattern', 'Wilde']);

    const addResult = await runCli([
      'comments',
      'add',
      '--target-json',
      JSON.stringify(initialTarget),
      '--text',
      'Lifecycle comment',
    ]);
    expect(addResult.code).toBe(0);
    const commentId = firstInsertedEntityId(addResult);

    const editResult = await runCli(['comments', 'edit', '--id', commentId, '--text', 'Lifecycle comment (edited)']);
    expect(editResult.code).toBe(0);

    const replyResult = await runCli(['comments', 'reply', '--parent-id', commentId, '--text', 'Reply from CLI test']);
    expect(replyResult.code).toBe(0);

    const moveTarget = await firstTextRange(['find', '--type', 'text', '--pattern', 'overflow']);
    const moveResult = await runCli([
      'comments',
      'move',
      '--id',
      commentId,
      '--target-json',
      JSON.stringify(moveTarget),
    ]);
    expect(moveResult.code).toBe(0);

    const getResult = await runCli(['comments', 'get', '--id', commentId]);
    expect(getResult.code).toBe(0);
    const getEnvelope = parseJsonOutput<SuccessEnvelope<{ comment: { commentId: string } }>>(getResult);
    expect(getEnvelope.data.comment.commentId).toBe(commentId);

    const listResult = await runCli(['comments', 'list', '--include-resolved', 'false']);
    expect(listResult.code).toBe(0);
    const listEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(listResult);
    expect(listEnvelope.data.result.total).toBeGreaterThanOrEqual(1);

    const setActiveResult = await runCli(['comments', 'set-active', '--id', commentId]);
    expect(setActiveResult.code).toBe(0);

    const goToResult = await runCli(['comments', 'go-to', '--id', commentId]);
    expect(goToResult.code).toBe(0);

    const resolveResult = await runCli(['comments', 'resolve', '--id', commentId]);
    expect(resolveResult.code).toBe(0);

    const secondaryTarget = initialTarget;
    const addSecondResult = await runCli([
      'comments',
      'add',
      '--target-json',
      JSON.stringify(secondaryTarget),
      '--text',
      'Comment to remove',
    ]);
    expect(addSecondResult.code).toBe(0);
    const removableCommentId = firstInsertedEntityId(addSecondResult);

    const removeResult = await runCli(['comments', 'remove', '--id', removableCommentId]);
    expect(removeResult.code).toBe(0);

    const missingGetResult = await runCli(['comments', 'get', '--id', removableCommentId]);
    expect(missingGetResult.code).toBe(1);
    const missingGetEnvelope = parseJsonOutput<ErrorEnvelope>(missingGetResult);
    expect(missingGetEnvelope.error.code).toBe('TARGET_NOT_FOUND');

    const clearActiveResult = await runCli(['comments', 'set-active', '--clear']);
    expect(clearActiveResult.code).toBe(0);

    const setInternalResult = await runCli(['comments', 'set-internal', '--id', commentId, '--is-internal', 'true']);
    expect(setInternalResult.code).toBe(0);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('stdin doc source is supported', async () => {
    const bytes = new Uint8Array(await readFile(SAMPLE_DOC));

    const result = await runCli(['info', '-'], bytes);
    expect(result.code).toBe(0);

    const envelope = parseJsonOutput<
      SuccessEnvelope<{
        document: { source: string };
      }>
    >(result);

    expect(envelope.ok).toBe(true);
    expect(envelope.data.document.source).toBe('stdin');
  });

  test('open from stdin and save to out path keeps the session active', async () => {
    const bytes = new Uint8Array(await readFile(SAMPLE_DOC));

    const openResult = await runCli(['open', '-'], bytes);
    expect(openResult.code).toBe(0);

    const outPath = join(TEST_DIR, 'stdin-open-close.docx');
    const saveResult = await runCli(['save', '--out', outPath]);
    expect(saveResult.code).toBe(0);
    await access(outPath);

    const statusResult = await runCli(['status']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<SuccessEnvelope<{ active: boolean }>>(statusResult);
    expect(statusEnvelope.data.active).toBe(true);
  });

  test('validation errors use structured JSON error envelope', async () => {
    const result = await runCli(['find', SAMPLE_DOC, '--query-json', '{"foo":"bar"}']);
    expect(result.code).toBe(1);

    const envelope = parseJsonOutput<ErrorEnvelope>(result);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('VALIDATION_ERROR');
    expect(typeof envelope.error.message).toBe('string');
  });

  test('global output flag works when passed after command args', async () => {
    const result = await runCli(['find', SAMPLE_DOC, '--type', 'text', '--pattern', 'Wilde', '--output', 'pretty']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Revision 0:');
    expect(result.stdout).toContain('matches');
    expect(result.stdout).toContain('[');
    expect(result.stderr).toBe('');
  });

  test('stateful open/find/replace/save/close flow works without explicit doc', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const target = await firstTextRange(['find', '--type', 'text', '--pattern', 'Wilde']);

    const replaceResult = await runCli(['replace', '--target-json', JSON.stringify(target), '--text', 'WILDE_CONTEXT']);
    expect(replaceResult.code).toBe(0);

    const statusResult = await runCli(['status']);
    expect(statusResult.code).toBe(0);

    const statusEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        active: boolean;
        dirty: boolean;
        document: { revision: number };
      }>
    >(statusResult);

    expect(statusEnvelope.data.active).toBe(true);
    expect(statusEnvelope.data.dirty).toBe(true);
    expect(statusEnvelope.data.document.revision).toBe(1);

    const savedOut = join(TEST_DIR, 'stateful-saved.docx');
    const saveResult = await runCli(['save', '--out', savedOut]);
    expect(saveResult.code).toBe(0);

    const statusAfterSave = await runCli(['status']);
    expect(statusAfterSave.code).toBe(0);
    const statusAfterSaveEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        active: boolean;
        dirty: boolean;
      }>
    >(statusAfterSave);
    expect(statusAfterSaveEnvelope.data.active).toBe(true);
    expect(statusAfterSaveEnvelope.data.dirty).toBe(false);

    const verifyResult = await runCli(['find', savedOut, '--type', 'text', '--pattern', 'WILDE_CONTEXT']);
    expect(verifyResult.code).toBe(0);

    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);

    const closeResult = await runCli(['close']);
    expect(closeResult.code).toBe(0);
  });

  test('stateful insert without target uses document-start default', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const insertResult = await runCli(['insert', '--text', 'STATEFUL_DEFAULT_INSERT_1597']);
    expect(insertResult.code).toBe(0);

    const insertEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        target: TextRange;
      }>
    >(insertResult);
    expect(insertEnvelope.data.target.range.start).toBe(0);
    expect(insertEnvelope.data.target.range.end).toBe(0);

    const verifyResult = await runCli(['find', '--type', 'text', '--pattern', 'STATEFUL_DEFAULT_INSERT_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('stateful insert keeps success semantics when optional --out export fails', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const blockedOutPath = join(TEST_DIR, 'stateful-insert-blocked-output.docx');
    await writeFile(blockedOutPath, 'already-exists');

    const insertResult = await runCli([
      'insert',
      '--text',
      'STATEFUL_INSERT_EXPORT_FAILURE_1597',
      '--out',
      blockedOutPath,
    ]);
    expect(insertResult.code).toBe(0);

    const insertEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        receipt: { success: boolean };
        output?: { path: string; byteLength: number };
      }>
    >(insertResult);
    expect(insertEnvelope.data.receipt.success).toBe(true);
    expect(insertEnvelope.data.output).toBeUndefined();

    const verifyResult = await runCli(['find', '--type', 'text', '--pattern', 'STATEFUL_INSERT_EXPORT_FAILURE_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);

    const statusResult = await runCli(['status']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<SuccessEnvelope<{ document: { revision: number } }>>(statusResult);
    expect(statusEnvelope.data.document.revision).toBe(1);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('stateful create paragraph keeps success semantics when optional --out export fails', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const blockedOutPath = join(TEST_DIR, 'stateful-create-blocked-output.docx');
    await writeFile(blockedOutPath, 'already-exists');

    const createResult = await runCli([
      'create',
      'paragraph',
      '--input-json',
      JSON.stringify({ text: 'STATEFUL_CREATE_EXPORT_FAILURE_1597' }),
      '--out',
      blockedOutPath,
    ]);
    expect(createResult.code).toBe(0);

    const createEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        result: { success: boolean };
        output?: { path: string; byteLength: number };
      }>
    >(createResult);
    expect(createEnvelope.data.result.success).toBe(true);
    expect(createEnvelope.data.output).toBeUndefined();

    const verifyResult = await runCli(['find', '--type', 'text', '--pattern', 'STATEFUL_CREATE_EXPORT_FAILURE_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);

    const statusResult = await runCli(['status']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<SuccessEnvelope<{ document: { revision: number } }>>(statusResult);
    expect(statusEnvelope.data.document.revision).toBe(1);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('close requires explicit save or discard when context is dirty', async () => {
    await runCli(['open', SAMPLE_DOC]);

    const target = await firstTextRange(['find', '--type', 'text', '--pattern', 'Wilde']);
    await runCli(['replace', '--target-json', JSON.stringify(target), '--text', 'WILDE_DIRTY']);

    const closeResult = await runCli(['close']);
    expect(closeResult.code).toBe(1);

    const closeEnvelope = parseJsonOutput<ErrorEnvelope>(closeResult);
    expect(closeEnvelope.error.code).toBe('DIRTY_CLOSE_REQUIRES_DECISION');

    const discardResult = await runCli(['close', '--discard']);
    expect(discardResult.code).toBe(0);
  });

  test('open without --session creates new session ids', async () => {
    const firstOpen = await runCli(['open', SAMPLE_DOC]);
    expect(firstOpen.code).toBe(0);

    const firstEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(firstOpen);
    const firstContextId = firstEnvelope.data.contextId;
    expect(firstContextId.length).toBeGreaterThan(0);

    const secondOpen = await runCli(['open', SAMPLE_DOC]);
    expect(secondOpen.code).toBe(0);

    const secondEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(secondOpen);
    const secondContextId = secondEnvelope.data.contextId;
    expect(secondContextId.length).toBeGreaterThan(0);
    expect(secondContextId).not.toBe(firstContextId);

    const listResult = await runCli(['session', 'list']);
    expect(listResult.code).toBe(0);
    const listEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        sessions: Array<{ sessionId: string }>;
      }>
    >(listResult);
    expect(listEnvelope.data.sessions.map((item) => item.sessionId)).toEqual(
      expect.arrayContaining([firstContextId, secondContextId]),
    );
  });

  test('status and session list include sessionType metadata', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC, '--session', 'local-a']);
    expect(openResult.code).toBe(0);

    const statusResult = await runCli(['status', '--session', 'local-a']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        sessionType: string;
      }>
    >(statusResult);
    expect(statusEnvelope.data.sessionType).toBe('local');

    const listResult = await runCli(['session', 'list']);
    expect(listResult.code).toBe(0);
    const listEnvelope = parseJsonOutput<
      SuccessEnvelope<{
        sessions: Array<{ sessionId: string; sessionType: string }>;
      }>
    >(listResult);

    const localSession = listEnvelope.data.sessions.find((session) => session.sessionId === 'local-a');
    expect(localSession?.sessionType).toBe('local');
  });

  test('open rejects unsupported collaboration payload fields', async () => {
    const invalidProvider = await runCli([
      'open',
      SAMPLE_DOC,
      '--collaboration-json',
      JSON.stringify({ providerType: 'invalid', url: 'ws://localhost:1234' }),
    ]);
    expect(invalidProvider.code).toBe(1);
    const invalidProviderEnvelope = parseJsonOutput<ErrorEnvelope>(invalidProvider);
    expect(invalidProviderEnvelope.error.code).toBe('VALIDATION_ERROR');

    const unsupportedToken = await runCli([
      'open',
      SAMPLE_DOC,
      '--collaboration-json',
      JSON.stringify({ providerType: 'hocuspocus', url: 'ws://localhost:1234', token: 'raw-secret' }),
    ]);
    expect(unsupportedToken.code).toBe(1);
    const unsupportedTokenEnvelope = parseJsonOutput<ErrorEnvelope>(unsupportedToken);
    expect(unsupportedTokenEnvelope.error.code).toBe('VALIDATION_ERROR');
  });

  test('open with --session is idempotent for the same session id', async () => {
    const firstOpen = await runCli(['open', SAMPLE_DOC, '--session', 'draft-a']);
    expect(firstOpen.code).toBe(0);

    const secondOpen = await runCli(['open', SAMPLE_DOC, '--session', 'draft-a']);
    expect(secondOpen.code).toBe(0);

    const closeResult = await runCli(['close', '--discard', '--session', 'draft-a']);
    expect(closeResult.code).toBe(0);
  });

  test('expected revision protects stateful mutate commands', async () => {
    await runCli(['open', SAMPLE_DOC]);

    const target = await firstTextRange(['find', '--type', 'text', '--pattern', 'Wilde']);

    const mismatch = await runCli([
      'replace',
      '--target-json',
      JSON.stringify(target),
      '--text',
      'WILDE_REV',
      '--expected-revision',
      '1',
    ]);
    expect(mismatch.code).toBe(1);

    const mismatchEnvelope = parseJsonOutput<ErrorEnvelope>(mismatch);
    expect(mismatchEnvelope.error.code).toBe('REVISION_MISMATCH');

    const success = await runCli([
      'replace',
      '--target-json',
      JSON.stringify(target),
      '--text',
      'WILDE_REV',
      '--expected-revision',
      '0',
    ]);
    expect(success.code).toBe(0);

    const closeResult = await runCli(['close', '--discard']);
    expect(closeResult.code).toBe(0);
  });

  test('session use switches default session', async () => {
    const alphaOpen = await runCli(['open', SAMPLE_DOC, '--session', 'alpha']);
    expect(alphaOpen.code).toBe(0);

    const betaOpen = await runCli(['open', SAMPLE_DOC, '--session', 'beta']);
    expect(betaOpen.code).toBe(0);

    const statusBefore = await runCli(['status']);
    expect(statusBefore.code).toBe(0);
    const statusBeforeEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(statusBefore);
    expect(statusBeforeEnvelope.data.contextId).toBe('beta');

    const useResult = await runCli(['session', 'use', 'alpha']);
    expect(useResult.code).toBe(0);

    const statusAfter = await runCli(['status']);
    expect(statusAfter.code).toBe(0);
    const statusAfterEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(statusAfter);
    expect(statusAfterEnvelope.data.contextId).toBe('alpha');
  });

  test('session close closes a specific non-default session', async () => {
    await runCli(['open', SAMPLE_DOC, '--session', 'alpha']);
    await runCli(['open', SAMPLE_DOC, '--session', 'beta']);

    const closeAlpha = await runCli(['session', 'close', 'alpha', '--discard']);
    expect(closeAlpha.code).toBe(0);

    const statusResult = await runCli(['status']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(statusResult);
    expect(statusEnvelope.data.contextId).toBe('beta');

    const useAlpha = await runCli(['session', 'use', 'alpha']);
    expect(useAlpha.code).toBe(1);
    const useAlphaEnvelope = parseJsonOutput<ErrorEnvelope>(useAlpha);
    expect(useAlphaEnvelope.error.code).toBe('SESSION_NOT_FOUND');
  });

  test('session save persists a specific session and keeps it open', async () => {
    await runCli(['open', SAMPLE_DOC, '--session', 'alpha']);

    const insertResult = await runCli(['insert', '--session', 'alpha', '--text', 'SESSION_SAVE_TOKEN_1597']);
    expect(insertResult.code).toBe(0);

    const savedOut = join(TEST_DIR, 'session-save-alpha.docx');
    const sessionSaveResult = await runCli(['session', 'save', 'alpha', '--out', savedOut]);
    expect(sessionSaveResult.code).toBe(0);
    await access(savedOut);

    const statusResult = await runCli(['status', '--session', 'alpha']);
    expect(statusResult.code).toBe(0);
    const statusEnvelope = parseJsonOutput<SuccessEnvelope<{ active: boolean; dirty: boolean }>>(statusResult);
    expect(statusEnvelope.data.active).toBe(true);
    expect(statusEnvelope.data.dirty).toBe(false);

    const verifyResult = await runCli(['find', savedOut, '--type', 'text', '--pattern', 'SESSION_SAVE_TOKEN_1597']);
    expect(verifyResult.code).toBe(0);
    const verifyEnvelope = parseJsonOutput<SuccessEnvelope<{ result: { total: number } }>>(verifyResult);
    expect(verifyEnvelope.data.result.total).toBeGreaterThan(0);
  });

  test('save --in-place detects source drift unless forced', async () => {
    const driftSource = join(TEST_DIR, 'drift-source.docx');
    await copyFile(SAMPLE_DOC, driftSource);

    const openResult = await runCli(['open', driftSource]);
    expect(openResult.code).toBe(0);

    const sourceBytes = new Uint8Array(await readFile(driftSource));
    sourceBytes[0] = sourceBytes[0] === 0 ? 1 : 0;
    await writeFile(driftSource, sourceBytes);

    const saveResult = await runCli(['save', '--in-place']);
    expect(saveResult.code).toBe(1);

    const saveEnvelope = parseJsonOutput<ErrorEnvelope>(saveResult);
    expect(saveEnvelope.error.code).toBe('SOURCE_DRIFT_DETECTED');

    const forcedSave = await runCli(['save', '--in-place', '--force']);
    expect(forcedSave.code).toBe(0);
  });

  test('project context mismatch is enforced', async () => {
    const openResult = await runCli(['open', SAMPLE_DOC]);
    expect(openResult.code).toBe(0);

    const openEnvelope = parseJsonOutput<SuccessEnvelope<{ contextId: string }>>(openResult);
    const metadataPath = join(STATE_DIR, 'contexts', openEnvelope.data.contextId, 'metadata.json');

    const metadataRaw = await readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    metadata.projectRoot = '/tmp/not-this-project';
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    const findResult = await runCli(['find', '--type', 'text', '--pattern', 'Wilde']);
    expect(findResult.code).toBe(1);

    const findEnvelope = parseJsonOutput<ErrorEnvelope>(findResult);
    expect(findEnvelope.error.code).toBe('PROJECT_CONTEXT_MISMATCH');
  });
});
