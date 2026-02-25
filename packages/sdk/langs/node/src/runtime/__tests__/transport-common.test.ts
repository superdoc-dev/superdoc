import { describe, expect, test } from 'bun:test';
import { buildOperationArgv, resolveInvocation, type OperationSpec } from '../transport-common.js';

const makeOp = (overrides: Partial<OperationSpec> = {}): OperationSpec => ({
  operationId: 'doc.test',
  commandTokens: ['test'],
  params: [],
  ...overrides,
});

describe('resolveInvocation', () => {
  test('returns bare binary for non-script paths', () => {
    const result = resolveInvocation('/usr/local/bin/superdoc');
    expect(result.command).toBe('/usr/local/bin/superdoc');
    expect(result.prefixArgs).toEqual([]);
  });

  test('wraps .js files with node', () => {
    const result = resolveInvocation('/path/to/cli.js');
    expect(result.command).toBe('node');
    expect(result.prefixArgs).toEqual(['/path/to/cli.js']);
  });

  test('wraps .ts files with bun', () => {
    const result = resolveInvocation('/path/to/cli.ts');
    expect(result.command).toBe('bun');
    expect(result.prefixArgs).toEqual(['/path/to/cli.ts']);
  });
});

describe('buildOperationArgv', () => {
  test('starts with commandTokens', () => {
    const op = makeOp({ commandTokens: ['format', 'bold'] });
    const argv = buildOperationArgv(op, {}, {}, undefined);
    expect(argv[0]).toBe('format');
    expect(argv[1]).toBe('bold');
  });

  test('appends --output json', () => {
    const argv = buildOperationArgv(makeOp(), {}, {}, undefined);
    expect(argv).toContain('--output');
    expect(argv[argv.indexOf('--output') + 1]).toBe('json');
  });

  test('encodes doc positional param', () => {
    const op = makeOp({
      params: [{ name: 'doc', kind: 'doc', type: 'string' }],
    });
    const argv = buildOperationArgv(op, { doc: 'report.docx' }, {}, undefined);
    expect(argv).toContain('report.docx');
  });

  test('encodes string flag param', () => {
    const op = makeOp({
      params: [{ name: 'pattern', kind: 'flag', flag: 'pattern', type: 'string' }],
    });
    const argv = buildOperationArgv(op, { pattern: 'hello' }, {}, undefined);
    expect(argv).toContain('--pattern');
    expect(argv[argv.indexOf('--pattern') + 1]).toBe('hello');
  });

  test('encodes boolean flag param as explicit true/false', () => {
    const op = makeOp({
      params: [{ name: 'caseSensitive', kind: 'flag', flag: 'case-sensitive', type: 'boolean' }],
    });

    const argvTrue = buildOperationArgv(op, { caseSensitive: true }, {}, undefined);
    expect(argvTrue).toContain('--case-sensitive');
    expect(argvTrue[argvTrue.indexOf('--case-sensitive') + 1]).toBe('true');

    const argvFalse = buildOperationArgv(op, { caseSensitive: false }, {}, undefined);
    expect(argvFalse).toContain('--case-sensitive');
    expect(argvFalse[argvFalse.indexOf('--case-sensitive') + 1]).toBe('false');
  });

  test('encodes string[] flag with repeated flags', () => {
    const op = makeOp({
      params: [{ name: 'tags', kind: 'flag', flag: 'tag', type: 'string[]' }],
    });
    const argv = buildOperationArgv(op, { tags: ['a', 'b', 'c'] }, {}, undefined);
    const tagIndices = argv.reduce<number[]>((acc, v, i) => (v === '--tag' ? [...acc, i] : acc), []);
    expect(tagIndices.length).toBe(3);
    expect(argv[tagIndices[0] + 1]).toBe('a');
    expect(argv[tagIndices[1] + 1]).toBe('b');
    expect(argv[tagIndices[2] + 1]).toBe('c');
  });

  test('encodes json flag as stringified JSON', () => {
    const op = makeOp({
      params: [{ name: 'query', kind: 'jsonFlag', flag: 'query-json', type: 'json' }],
    });
    const data = { select: { type: 'text' } };
    const argv = buildOperationArgv(op, { query: data }, {}, undefined);
    expect(argv).toContain('--query-json');
    expect(argv[argv.indexOf('--query-json') + 1]).toBe(JSON.stringify(data));
  });

  test('skips null/undefined params', () => {
    const op = makeOp({
      params: [
        { name: 'pattern', kind: 'flag', flag: 'pattern', type: 'string' },
        { name: 'mode', kind: 'flag', flag: 'mode', type: 'string' },
      ],
    });
    const argv = buildOperationArgv(op, { pattern: 'hello' }, {}, undefined);
    expect(argv).toContain('--pattern');
    expect(argv).not.toContain('--mode');
  });

  test('appends timeout-ms when specified in options', () => {
    const argv = buildOperationArgv(makeOp(), {}, { timeoutMs: 5000 }, undefined);
    expect(argv).toContain('--timeout-ms');
    expect(argv[argv.indexOf('--timeout-ms') + 1]).toBe('5000');
  });

  test('appends runtime timeout when no per-call override', () => {
    const argv = buildOperationArgv(makeOp(), {}, {}, 10000);
    expect(argv).toContain('--timeout-ms');
    expect(argv[argv.indexOf('--timeout-ms') + 1]).toBe('10000');
  });

  test('per-call timeout overrides runtime timeout', () => {
    const argv = buildOperationArgv(makeOp(), {}, { timeoutMs: 3000 }, 10000);
    expect(argv).toContain('--timeout-ms');
    expect(argv[argv.indexOf('--timeout-ms') + 1]).toBe('3000');
  });

  test('injects defaultChangeMode when operation supports it and user did not specify', () => {
    const op = makeOp({
      params: [
        { name: 'doc', kind: 'doc', type: 'string' },
        { name: 'changeMode', kind: 'flag', flag: 'change-mode', type: 'string' },
      ],
    });
    const argv = buildOperationArgv(op, { doc: 'test.docx' }, {}, undefined, 'tracked');
    expect(argv).toContain('--change-mode');
    expect(argv[argv.indexOf('--change-mode') + 1]).toBe('tracked');
  });

  test('does not inject defaultChangeMode when user explicitly passes changeMode', () => {
    const op = makeOp({
      params: [
        { name: 'doc', kind: 'doc', type: 'string' },
        { name: 'changeMode', kind: 'flag', flag: 'change-mode', type: 'string' },
      ],
    });
    const argv = buildOperationArgv(op, { doc: 'test.docx', changeMode: 'direct' }, {}, undefined, 'tracked');
    expect(argv).toContain('--change-mode');
    // Should use user's value, not the default
    expect(argv[argv.indexOf('--change-mode') + 1]).toBe('direct');
    // Should only appear once
    const count = argv.filter((v) => v === '--change-mode').length;
    expect(count).toBe(1);
  });

  test('does not inject defaultChangeMode when operation does not support it', () => {
    const op = makeOp({
      params: [{ name: 'doc', kind: 'doc', type: 'string' }],
    });
    const argv = buildOperationArgv(op, { doc: 'test.docx' }, {}, undefined, 'tracked');
    expect(argv).not.toContain('--change-mode');
  });
});
