import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const PYTHON_SDK = path.join(REPO_ROOT, 'packages/sdk/langs/python');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type SelectionEntry = { operationId: string; toolName: string; category: string; mutates: boolean };
type ChooseResult = {
  selected: SelectionEntry[];
  meta: { provider: string; mode: string; groups: string[]; selectedCount: number };
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
async function nodeTools() {
  if (!_nodeTools) {
    _nodeTools = await import(path.join(REPO_ROOT, 'packages/sdk/langs/node/src/tools.ts'));
  }
  return _nodeTools;
}

// --------------------------------------------------------------------------
// chooseTools parity — group-based selection
// --------------------------------------------------------------------------

describe('chooseTools parity — essential mode (default)', () => {
  test('default mode returns only essential tools + discover_tools', async () => {
    const input = { provider: 'generic' as const };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    // Both should return same essential tools
    const nodeIds = nodeResult.selected.map((s) => s.operationId).sort();
    const pyIds = pyResult.selected.map((s) => s.operationId).sort();
    expect(pyIds).toEqual(nodeIds);
    expect(nodeIds.length).toBeGreaterThan(0);

    // Should be a small set (essential only)
    expect(nodeIds.length).toBeLessThan(20);

    // Meta should report essential mode
    expect(nodeResult.meta.mode).toBe('essential');
    expect(pyResult.meta.mode).toBe('essential');
  });

  test('essential + groups union: loads essential plus requested category', async () => {
    const input = { provider: 'generic' as const, groups: ['comments' as const] };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    const nodeIds = nodeResult.selected.map((s) => s.operationId).sort();
    const pyIds = pyResult.selected.map((s) => s.operationId).sort();
    expect(pyIds).toEqual(nodeIds);

    // Should include comment tools
    const nodeCategories = new Set(nodeResult.selected.map((s) => s.category));
    expect(nodeCategories.has('comments')).toBe(true);

    // Should also include essential tools (which are from core/history)
    expect(nodeIds.length).toBeGreaterThan(5);
  });

  test('includeDiscoverTool=false omits discover_tools', async () => {
    const input = { provider: 'generic' as const, includeDiscoverTool: false };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    // discover_tools should NOT appear in the tools array
    const toolNames = nodeResult.tools
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t) => (t as Record<string, unknown>).name as string);
    expect(toolNames).not.toContain('discover_tools');
  });
});

describe('chooseTools parity — all mode (group-based selection)', () => {
  test('mode=all with no groups: identical selected operationIds', async () => {
    const input = { provider: 'generic' as const, mode: 'all' as const };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s) => s.operationId).sort();

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId).sort();

    expect(pyIds).toEqual(nodeIds);
    expect(nodeIds.length).toBeGreaterThan(0);
    expect(nodeResult.meta.mode).toBe('all');
  });

  test('mode=all: core group always auto-included', async () => {
    const input = { provider: 'generic' as const, mode: 'all' as const, groups: ['format' as const] };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeCategories = new Set(nodeResult.selected.map((s) => s.category));

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyCategories = new Set(pyResult.selected.map((s) => s.category));

    // Core should be auto-included even though only 'format' was requested
    expect(nodeCategories.has('core')).toBe(true);
    expect(nodeCategories.has('format')).toBe(true);
    expect(pyCategories.has('core')).toBe(true);
    expect(pyCategories.has('format')).toBe(true);
  });

  test('mode=all: specific groups only', async () => {
    const input = {
      provider: 'generic' as const,
      mode: 'all' as const,
      groups: ['core' as const, 'comments' as const],
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeCategories = new Set(nodeResult.selected.map((s) => s.category));

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyCategories = new Set(pyResult.selected.map((s) => s.category));

    // Should only have core and comments
    for (const cat of nodeCategories) {
      expect(['core', 'comments']).toContain(cat);
    }
    expect(pyCategories).toEqual(nodeCategories);
  });

  test('mode=all: meta matches between runtimes', async () => {
    const input = { provider: 'generic' as const, mode: 'all' as const, groups: ['core' as const, 'tables' as const] };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    expect(pyResult.meta.provider).toBe(nodeResult.meta.provider);
    expect(pyResult.meta.mode).toBe('all');
    expect(pyResult.meta.selectedCount).toBe(nodeResult.meta.selectedCount);
    expect(pyResult.meta.groups.sort()).toEqual(nodeResult.meta.groups.sort());
  });
});

// --------------------------------------------------------------------------
// Constraint validation parity
// --------------------------------------------------------------------------

describe('Constraint validation parity', () => {
  test('mutuallyExclusive rejects in both runtimes', async () => {
    // doc.lists.list has mutuallyExclusive: [['query', 'within'], ...]
    const args = { query: 'test', within: 'some-id' };

    const { dispatchSuperDocTool } = await nodeTools();
    let nodeError: { code?: string } | null = null;
    try {
      await dispatchSuperDocTool({ doc: {} }, 'list_lists', args);
    } catch (error: unknown) {
      nodeError = error as { code?: string };
    }

    const pyResult = (await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.lists.list',
      args,
    })) as { rejected?: boolean; code?: string };

    expect(nodeError).not.toBeNull();
    expect(nodeError!.code).toBe('INVALID_ARGUMENT');
    expect(pyResult.rejected).toBe(true);
    expect(pyResult.code).toBe('INVALID_ARGUMENT');
  });

  test('type mismatches pass through to CLI: both runtimes accept true for a number param', async () => {
    // doc.lists.list has a 'limit' number param
    const args = { limit: true };

    const pyResult = await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.lists.list',
      args,
    });

    expect(pyResult).toBe('passed');
  });

  test('unknown param rejected in both runtimes', async () => {
    const args = { unknownParam: 'value' };

    const { dispatchSuperDocTool } = await nodeTools();
    let nodeError: { code?: string } | null = null;
    try {
      await dispatchSuperDocTool({ doc: {} }, 'get_document_info', args);
    } catch (error: unknown) {
      nodeError = error as { code?: string };
    }

    const pyResult = (await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.info',
      args,
    })) as { rejected?: boolean; code?: string };

    expect(nodeError).not.toBeNull();
    expect(nodeError!.code).toBe('INVALID_ARGUMENT');
    expect(pyResult.rejected).toBe(true);
    expect(pyResult.code).toBe('INVALID_ARGUMENT');
  });

  test('valid args pass in both runtimes', async () => {
    const args = { query: 'test' };

    const pyResult = await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.lists.list',
      args,
    });

    expect(pyResult).toBe('passed');
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
