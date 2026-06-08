/**
 * Subprocess tests for the one-shot JSON protocol boundary.
 *
 * These spawn the real CLI executable (`src/main.ts`) rather than calling
 * `run()` in-process, because the process console policy that keeps the JSON
 * protocol channels clean lives in the executable bootstrap, not in `run()`.
 * The env deliberately unsets NODE_ENV so the super-editor telemetry-enabled
 * path runs (the path that previously logged to the console on document open).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveSourceDocFixture } from './fixtures';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/main.ts');
const ENCRYPTED_FIXTURE_SOURCE = path.join(
  REPO_ROOT,
  'packages/super-editor/src/editors/v1/core/ooxml-encryption/fixtures/encrypted-advanced-text.docx',
);
const SUBPROCESS_TIMEOUT_MS = 30_000;

type SpawnResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runCliBinary(args: string[], stateDir: string): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const env = { ...process.env, SUPERDOC_CLI_STATE_DIR: stateDir };
    // Exercise the telemetry-enabled path the way a real user run would.
    delete env.NODE_ENV;

    const child = spawn('bun', [CLI_BIN, ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('one-shot JSON subprocess boundary', () => {
  let stateDir = '';
  let sourceDoc = '';
  let encryptedDoc = '';

  beforeAll(async () => {
    stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-cli-oneshot-'));
    sourceDoc = await resolveSourceDocFixture();
    encryptedDoc = path.join(stateDir, 'encrypted.docx');
    await mkdir(stateDir, { recursive: true });
    await copyFile(ENCRYPTED_FIXTURE_SOURCE, encryptedDoc);
  });

  afterAll(async () => {
    if (stateDir) await rm(stateDir, { recursive: true, force: true });
  });

  test(
    'info --json emits parseable JSON on stdout with no telemetry leakage',
    async () => {
      const result = await runCliBinary(['info', sourceDoc, '--json'], stateDir);

      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain('Telemetry: enabled');
      expect(result.stderr).not.toContain('Telemetry: enabled');

      const envelope = JSON.parse(result.stdout.trim()) as { ok?: boolean; command?: string };
      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe('info');
    },
    SUBPROCESS_TIMEOUT_MS,
  );

  test(
    'info --json on an encrypted doc emits structured failure on stderr only',
    async () => {
      const result = await runCliBinary(['info', encryptedDoc, '--json'], stateDir);

      expect(result.code).not.toBe(0);
      // stdout is the success-envelope channel; a failed one-shot must not emit
      // diagnostic text there.
      expect(result.stdout.trim()).toBe('');

      const envelope = JSON.parse(result.stderr.trim()) as {
        ok?: boolean;
        error?: { code?: string };
      };
      expect(envelope.ok).toBe(false);
      expect(envelope.error?.code).toBe('DOCX_PASSWORD_REQUIRED');
    },
    SUBPROCESS_TIMEOUT_MS,
  );
});
