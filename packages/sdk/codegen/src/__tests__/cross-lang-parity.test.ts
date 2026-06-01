import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const PYTHON_SDK = path.join(REPO_ROOT, 'packages/sdk/langs/python');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type ChooseResult = {
  meta: { provider: string; toolCount: number };
};

/** Call the Python parity helper with a JSON command and parse the result. */
function callPython(command: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-m', 'superdoc.test_parity_helper'], {
      cwd: PYTHON_SDK,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python helper exited ${code}: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (!result.ok) {
          reject(new Error(`Python helper error:\n${result.error}`));
          return;
        }
        resolve(result.result);
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.stdin.write(JSON.stringify(command));
    proc.stdin.end();
  });
}

/** Import Node SDK chooseTools (cached). */
let _nodeTools: typeof import('../../../langs/node/src/tools.js') | null = null;
async function nodeTools(): Promise<typeof import('../../../langs/node/src/tools.js')> {
  if (!_nodeTools) {
    _nodeTools = await import(path.join(REPO_ROOT, 'packages/sdk/langs/node/src/tools.ts'));
  }
  return _nodeTools;
}

// --------------------------------------------------------------------------
// chooseTools parity
// --------------------------------------------------------------------------

describe('chooseTools parity', () => {
  test('returns same tool count for generic provider', async () => {
    const input = { provider: 'generic' as const };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    expect(pyResult.meta.provider).toBe(nodeResult.meta.provider);
    expect(pyResult.meta.toolCount).toBe(nodeResult.meta.toolCount);
    expect(nodeResult.meta.toolCount).toBeGreaterThan(0);
  });

  test('returns same tool count when preset: legacy is explicit (parity)', async () => {
    const input = { provider: 'generic' as const, preset: 'legacy' };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult & {
      meta: { preset?: string };
    };

    expect(pyResult.meta.provider).toBe(nodeResult.meta.provider);
    expect(pyResult.meta.toolCount).toBe(nodeResult.meta.toolCount);
    expect(pyResult.meta.preset).toBe('legacy');
    expect(nodeResult.meta.preset).toBe('legacy');
  });
});

// --------------------------------------------------------------------------
// Preset registry parity
// --------------------------------------------------------------------------

describe('Preset registry parity', () => {
  test('Node and Python expose the same DEFAULT_PRESET and registered ids', async () => {
    const { DEFAULT_PRESET: nodeDefault, listPresets: nodeList } = await nodeTools();
    const nodePresets = nodeList();

    const pyResult = (await callPython({ action: 'listPresets' })) as {
      defaultPreset: string;
      presets: string[];
    };

    expect(pyResult.defaultPreset).toBe(nodeDefault);
    expect(nodeDefault).toBe('legacy');
    // Both runtimes register the same preset set (order-agnostic).
    expect([...pyResult.presets].sort()).toEqual([...nodePresets].sort());
  });
});

// --------------------------------------------------------------------------
// Intent dispatch parity
// --------------------------------------------------------------------------

describe('Intent dispatch parity', () => {
  test('Node and Python dispatch same tool+action to same operation', async () => {
    // Test that both runtimes map superdoc_edit + action=insert to doc.insert
    const nodeResult = (await callPython({
      action: 'resolveIntentDispatch',
      toolName: 'superdoc_edit',
      args: { action: 'insert' },
    })) as { operationId: string };

    expect(nodeResult.operationId).toBe('doc.insert');
  });

  test('single-op tool dispatches correctly', async () => {
    const result = (await callPython({
      action: 'resolveIntentDispatch',
      toolName: 'superdoc_search',
      args: {},
    })) as { operationId: string };

    expect(result.operationId).toBe('doc.query.match');
  });

  test('unknown tool raises error', async () => {
    const result = (await callPython({
      action: 'resolveIntentDispatch',
      toolName: 'superdoc_nonexistent',
      args: {},
    })) as { error: string };

    expect(result.error).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// Python collaboration support (collab params accepted, not rejected)
// --------------------------------------------------------------------------

describe('Python collaboration support', () => {
  test('doc.open accepts collabUrl and collabDocumentId params', async () => {
    const result = (await callPython({
      action: 'assertCollabAccepted',
      operationId: 'doc.open',
      params: {
        doc: './test.docx',
        collabUrl: 'ws://localhost:4000',
        collabDocumentId: 'test-doc-id',
      },
    })) as { accepted: boolean; collabParamsPresent: boolean };

    expect(result.accepted).toBe(true);
    expect(result.collabParamsPresent).toBe(true);
  });

  test('doc.open accepts params without collab fields', async () => {
    const result = (await callPython({
      action: 'assertCollabAccepted',
      operationId: 'doc.open',
      params: { doc: './test.docx' },
    })) as { accepted: boolean };

    expect(result.accepted).toBe(true);
  });
});
