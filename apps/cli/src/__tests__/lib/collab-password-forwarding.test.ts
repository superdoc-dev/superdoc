/**
 * Verifies that `openCollaborativeDocument` forwards
 * `editorOpenOptions.password` through to the inner `openDocument` → `Editor.open()` call
 * when seeding from an encrypted source document.
 *
 * This test runs in a subprocess to avoid `mock.module` side effects
 * contaminating other test files in the same bun process.
 */
import { describe, test, expect } from 'bun:test';
import { join } from 'path';

const WORKER_SCRIPT = join(import.meta.dir, '_collab-password-worker.ts');

describe('openCollaborativeDocument password forwarding', () => {
  test('password reaches Editor.open() through the collaboration seed path', async () => {
    const proc = Bun.spawn(['bun', 'run', WORKER_SCRIPT], {
      cwd: join(import.meta.dir, '../../..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      throw new Error(`Worker failed (code ${exitCode}):\n${stderr || stdout}`);
    }

    const result = JSON.parse(stdout.trim());
    expect(result.editorOpenCalled).toBe(true);
    expect(result.capturedPassword).toBe('collab-test-secret');
  });
});
