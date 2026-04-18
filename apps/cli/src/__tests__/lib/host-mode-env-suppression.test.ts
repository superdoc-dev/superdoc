/**
 * Verifies that host mode (SDK-driven) suppresses the SUPERDOC_DOC_PASSWORD
 * env fallback. Uses `invokeCommand()` — the real programmatic entry point
 * with proper stateDir and executionMode wiring.
 */
import { describe, test, expect, afterEach, beforeAll } from 'bun:test';
import { invokeCommand } from '../../index';
import { CliError } from '../../lib/errors';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const REPO_ROOT = join(import.meta.dir, '../../../../..');
const ENCRYPTED_DOC = join(
  REPO_ROOT,
  'packages/super-editor/src/editors/v1/core/ooxml-encryption/fixtures/encrypted-advanced-text.docx',
);

const silentIo = {
  stdout: () => {},
  stderr: () => {},
  readStdinBytes: async () => new Uint8Array(),
};

let testStateDir: string;

beforeAll(async () => {
  testStateDir = await mkdtemp(join(tmpdir(), 'superdoc-host-test-'));
});

afterEach(async () => {
  await rm(testStateDir, { recursive: true, force: true });
  testStateDir = await mkdtemp(join(tmpdir(), 'superdoc-host-test-'));
});

/** Call invokeCommand, catching CliErrors into a result object. */
async function invokeExpectingResult(argv: string[], executionMode: 'oneshot' | 'host', stateDir: string) {
  try {
    const result = await invokeCommand(argv, {
      stateDir,
      executionMode,
      ioOverrides: silentIo,
    });
    return { code: result.execution?.code ?? 0, error: null };
  } catch (e) {
    if (e instanceof CliError) {
      return { code: 1, error: { code: e.code, message: e.message } };
    }
    throw e;
  }
}

describe('host-mode env-fallback suppression', () => {
  const prevEnv = process.env.SUPERDOC_DOC_PASSWORD;

  afterEach(() => {
    if (prevEnv != null) process.env.SUPERDOC_DOC_PASSWORD = prevEnv;
    else delete process.env.SUPERDOC_DOC_PASSWORD;
  });

  test('env password is suppressed in host mode, returning DOCX_PASSWORD_REQUIRED', async () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'test123';

    const result = await invokeExpectingResult(['open', ENCRYPTED_DOC], 'host', testStateDir);

    expect(result.code).toBe(1);
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe('DOCX_PASSWORD_REQUIRED');
  }, 30_000);

  test('env password IS used in direct CLI mode (oneshot)', async () => {
    process.env.SUPERDOC_DOC_PASSWORD = 'test123';

    const result = await invokeExpectingResult(['open', ENCRYPTED_DOC], 'oneshot', testStateDir);

    // If it failed, the error must NOT be a password error.
    if (result.code !== 0) {
      expect(result.error?.code).not.toBe('DOCX_PASSWORD_REQUIRED');
      expect(result.error?.code).not.toBe('DOCX_PASSWORD_INVALID');
    }

    // Clean up if open succeeded
    if (result.code === 0) {
      await invokeExpectingResult(['close', '--discard'], 'oneshot', testStateDir);
    }
  }, 30_000);
});
