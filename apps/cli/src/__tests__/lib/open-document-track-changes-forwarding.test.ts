/**
 * Verifies that `openDocument` forwards `editorOpenOptions.modules.trackChanges`
 * through to `Editor.open()`.
 *
 * This runs in a subprocess so `mock.module` cannot leak into other tests.
 */
import { describe, expect, test } from 'bun:test';
import { join } from 'path';

const WORKER_SCRIPT = join(import.meta.dir, '_open-document-track-changes-worker.ts');

describe('openDocument track changes forwarding', () => {
  test('trackChanges replacement mode reaches Editor.open()', async () => {
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
    expect(result.capturedTrackChanges).toEqual({ replacements: 'independent' });
  });
});
