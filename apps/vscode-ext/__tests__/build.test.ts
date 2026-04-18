/**
 * Build verification tests for the VS Code extension.
 *
 * Verifies that the extension host (Node/CJS) can be bundled by esbuild.
 * The webview bundle depends on a full monorepo build (superdoc dist),
 * so it's verified in CI via `pnpm run compile` in the release workflow.
 *
 * This test catches TypeScript/import errors in the extension host code
 * without requiring the full monorepo build.
 */
import { describe, it, expect } from 'vitest';
import { build, type BuildResult } from 'esbuild';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

describe('extension build', () => {
  it('bundles extension host (Node/CJS) without errors', async () => {
    const result: BuildResult = await build({
      entryPoints: [resolve(ROOT, 'src/extension.ts')],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      external: ['vscode'],
      logLevel: 'silent',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles![0].text.length).toBeGreaterThan(0);
  });
});
