/**
 * MCP_PRESET env var selects which LLM-tools preset the server registers
 * ('legacy' — grouped intent tools; 'core' — the actions surface). Unknown
 * preset ids must fail fast at startup so misconfiguration is visible instead
 * of silently falling back to the default.
 */

import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const MCP_ENTRY = path.join(REPO_ROOT, 'apps/mcp/src/server.ts');

type RunResult = { code: number | null; stderr: string };

function runServer(env: NodeJS.ProcessEnv, timeoutMs = 2000): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn('bun', ['run', MCP_ENTRY], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    // The MCP server runs forever waiting on stdio. We only care about whether
    // it exits fast (rejecting bad preset id) or stays alive (accepting preset).
    // For the success case we kill after a short window.
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

describe('MCP_PRESET env var', () => {
  test('unknown preset id fails fast with exit code 2', async () => {
    const result = await runServer({ MCP_PRESET: 'definitely-not-a-preset' });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('unknown preset');
    expect(result.stderr).toContain('definitely-not-a-preset');
    expect(result.stderr).toContain('legacy');
  });

  test('explicit MCP_PRESET=legacy is accepted (server stays alive)', async () => {
    const result = await runServer({ MCP_PRESET: 'legacy' });
    // Server should still be running when we kill it (SIGTERM → code is null
    // or signal-derived non-2). Either way, it must NOT exit with 2.
    expect(result.code).not.toBe(2);
  });

  test('explicit MCP_PRESET=core is accepted (server stays alive)', async () => {
    const result = await runServer({ MCP_PRESET: 'core' });
    expect(result.code).not.toBe(2);
  });
});
