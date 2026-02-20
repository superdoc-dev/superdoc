import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../index';

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const TEST_DIR = join(import.meta.dir, 'fixtures-cli-legacy');
const SOURCE_DOC = join(import.meta.dir, '../../../../e2e-tests/test-data/basic-documents/advanced-text.docx');
const SAMPLE_DOC = join(TEST_DIR, 'sample.docx');
const REPLACE_DOC = join(TEST_DIR, 'replace-test.docx');

async function runCli(args: string[]): Promise<RunResult> {
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
      return new Uint8Array();
    },
  });

  return { code, stdout, stderr };
}

describe('legacy command compatibility', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await copyFile(SOURCE_DOC, SAMPLE_DOC);
  });

  test('search supports legacy pretty output by default', async () => {
    const result = await runCli(['search', 'Wilde', SAMPLE_DOC]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Found ');
    expect(result.stdout).toContain(`${SAMPLE_DOC}:`);
    expect(result.stdout).toContain('"');
  });

  test('search supports legacy --json output shape', async () => {
    const result = await runCli(['search', 'Wilde', SAMPLE_DOC, '--json']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
      pattern: string;
      files: Array<{ path: string; matches: unknown[] }>;
      totalMatches: number;
      ok?: boolean;
    };
    expect(payload.ok).toBeUndefined();
    expect(payload.pattern).toBe('Wilde');
    expect(payload.totalMatches).toBeGreaterThan(0);
    expect(payload.files.length).toBeGreaterThan(0);
  });

  test('read supports legacy pretty output by default', async () => {
    const result = await runCli(['read', SAMPLE_DOC]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stdout).toContain('Wilde');
  });

  test('read supports legacy --json output shape', async () => {
    const result = await runCli(['read', SAMPLE_DOC, '--json']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
      path: string;
      content: string;
      ok?: boolean;
    };
    expect(payload.ok).toBeUndefined();
    expect(payload.path).toBe(SAMPLE_DOC);
    expect(payload.content).toContain('Wilde');
  });

  test('global --help still prints CLI help for legacy commands', async () => {
    const result = await runCli(['search', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: superdoc <command> [options]');
  });

  describe('replace-legacy', () => {
    beforeEach(async () => {
      await copyFile(SOURCE_DOC, REPLACE_DOC);
    });

    test('replace-legacy supports legacy pretty output by default', async () => {
      const result = await runCli(['replace-legacy', 'Wilde', 'WILDE', REPLACE_DOC]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Replaced ');

      // Verify the replacement persisted
      const after = await runCli(['search', 'WILDE', REPLACE_DOC, '--json']);
      const payload = JSON.parse(after.stdout) as { totalMatches: number };
      expect(payload.totalMatches).toBeGreaterThan(0);
    });

    test('replace-legacy supports legacy --json output shape', async () => {
      const result = await runCli(['replace-legacy', 'Wilde', 'WILDE', REPLACE_DOC, '--json']);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');

      const payload = JSON.parse(result.stdout) as {
        find: string;
        replace: string;
        files: Array<{ path: string; replacements: number }>;
        totalReplacements: number;
        ok?: boolean;
      };
      expect(payload.ok).toBeUndefined();
      expect(payload.find).toBe('Wilde');
      expect(payload.replace).toBe('WILDE');
      expect(payload.totalReplacements).toBeGreaterThan(0);
      expect(payload.files.length).toBeGreaterThan(0);
      expect(payload.files[0].path).toBe(REPLACE_DOC);
    });

    test('replace-legacy prints usage when files arg is missing', async () => {
      const result = await runCli(['replace-legacy', 'Wilde', 'WILDE']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage: superdoc replace-legacy <find> <to> <files...>');
    });

    test('replace-legacy with no matches does not error', async () => {
      const result = await runCli(['replace-legacy', 'xyz123nonexistent', 'foo', REPLACE_DOC, '--json']);
      expect(result.code).toBe(0);

      const payload = JSON.parse(result.stdout) as { totalReplacements: number };
      expect(payload.totalReplacements).toBe(0);
    });
  });
});
