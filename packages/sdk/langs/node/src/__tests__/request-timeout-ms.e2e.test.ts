import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSuperDocClient } from '../index.ts';
import { SuperDocCliError } from '../runtime/errors.js';

// Repo root: packages/sdk/langs/node/src/__tests__ → ../../../../../../
const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../..');
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const FIXTURE_DOC = path.join(REPO_ROOT, 'packages/super-editor/src/editors/v1/tests/data/advanced-text.docx');

const E2E_TIMEOUT_MS = 30_000;

describe('SDK requestTimeoutMs propagation (e2e)', () => {
  const cleanup: string[] = [];

  beforeAll(() => {
    // Sanity-check the workspace layout once so test failures are clear when
    // the fixture moves or the CLI source is renamed.
    expect(CLI_BIN.endsWith('apps/cli/src/index.ts')).toBe(true);
  });

  afterEach(async () => {
    while (cleanup.length > 0) {
      const dir = cleanup.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  test(
    'client.requestTimeoutMs is honored by the spawned host on a real cli.invoke',
    async () => {
      const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-sdk-timeout-e2e-'));
      cleanup.push(stateDir);
      await mkdir(stateDir, { recursive: true });

      // 1ms is well below any real `open` wall time. With the fix, the host
      // receives `--request-timeout-ms 1` at spawn and kills the invoke;
      // before the fix the SDK option never reached the host and the
      // operation would run to completion against the host's 30s default.
      const client = createSuperDocClient({
        env: {
          SUPERDOC_CLI_BIN: CLI_BIN,
          SUPERDOC_CLI_STATE_DIR: stateDir,
        },
        // 1ms host ceiling. The JS watchdog defaults to 30s, and
        // `resolveWatchdogTimeout` widens it above `requestTimeoutMs` anyway,
        // so the host's structured RequestTimeout error wins the race.
        requestTimeoutMs: 1,
      });

      try {
        await client.connect();

        let caught: unknown;
        try {
          await client.open({ doc: FIXTURE_DOC });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(SuperDocCliError);
        const err = caught as SuperDocCliError;
        expect(err.code).toBe('TIMEOUT');
        const details = err.details as { timeoutMs?: number } | undefined;
        expect(details?.timeoutMs).toBe(1);
      } finally {
        await client.dispose();
      }
    },
    E2E_TIMEOUT_MS,
  );
});
