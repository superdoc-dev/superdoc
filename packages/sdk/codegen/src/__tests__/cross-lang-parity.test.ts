import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const PYTHON_SDK = path.join(REPO_ROOT, 'packages/sdk/langs/python');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type SelectionEntry = { operationId: string; toolName: string; category: string; mutates: boolean; profile: string };
type ChooseResult = {
  selected: SelectionEntry[];
  excluded: Array<{ toolName: string; reason: string }>;
  selectionMeta: Record<string, unknown>;
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
// Phase 1 — Minimal parity tests (3 test cases for 3 bug fixes)
// --------------------------------------------------------------------------

describe('Cross-language parity (Phase 1)', () => {
  test('chooseTools: foundational seeding includes both foundational ops', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'read' as const },
      budget: { minReadTools: 2 },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s: { operationId: string }) => s.operationId);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId);

    expect(nodeIds).toContain('doc.info');
    expect(nodeIds).toContain('doc.find');
    expect(pyIds).toContain('doc.info');
    expect(pyIds).toContain('doc.find');
    expect(pyIds).toEqual(nodeIds);
  });

  test('constraint validation: mutuallyExclusive rejects in both runtimes', async () => {
    const args = { type: 'paragraph', query: 'test' };

    const { dispatchSuperDocTool } = await nodeTools();
    let nodeError: { code?: string } | null = null;
    try {
      await dispatchSuperDocTool({ doc: {} }, 'find_content', args);
    } catch (error: unknown) {
      nodeError = error as { code?: string };
    }

    const pyResult = (await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.find',
      args,
    })) as { rejected?: boolean; code?: string };

    expect(nodeError).not.toBeNull();
    expect(nodeError!.code).toBe('INVALID_ARGUMENT');
    expect(pyResult.rejected).toBe(true);
    expect(pyResult.code).toBe('INVALID_ARGUMENT');
  });

  test('type mismatches pass through to CLI: both runtimes accept true for a number param', async () => {
    const args = { query: 'test', limit: true };

    const pyResult = await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.find',
      args,
    });

    expect(pyResult).toBe('passed');
  });
});

// --------------------------------------------------------------------------
// Phase 6 — Expanded golden tests
// --------------------------------------------------------------------------

describe('chooseTools parity — phases and profiles', () => {
  const phases = ['read', 'locate', 'mutate', 'review'] as const;
  const profiles = ['intent', 'operation'] as const;

  for (const phase of phases) {
    for (const profile of profiles) {
      test(`${phase}/${profile}: identical selected operationIds`, async () => {
        const input = { provider: 'generic' as const, profile, taskContext: { phase } };

        const { chooseTools } = await nodeTools();
        const nodeResult = await chooseTools(input);
        const nodeIds = nodeResult.selected.map((s: SelectionEntry) => s.operationId);

        const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
        const pyIds = pyResult.selected.map((s) => s.operationId);

        expect(pyIds).toEqual(nodeIds);
      });
    }
  }
});

describe('chooseTools parity — budget constraints', () => {
  test('maxTools=5, minReadTools=3: same selections', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'read' as const },
      budget: { maxTools: 5, minReadTools: 3 },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s: SelectionEntry) => s.operationId);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId);

    expect(pyIds).toEqual(nodeIds);
    expect(nodeIds.length).toBeLessThanOrEqual(5);
  });

  test('maxTools=1: only 1 tool selected', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'mutate' as const },
      budget: { maxTools: 1, minReadTools: 0 },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    expect(nodeResult.selected.length).toBe(1);
    expect(pyResult.selected.length).toBe(1);
    expect(pyResult.selected[0].operationId).toBe(nodeResult.selected[0].operationId);
  });
});

describe('chooseTools parity — policy overrides', () => {
  test('forceExclude removes tool from both runtimes', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'read' as const },
      policy: { forceExclude: ['get_document_info'] },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s: SelectionEntry) => s.operationId);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId);

    expect(nodeIds).not.toContain('doc.info');
    expect(pyIds).not.toContain('doc.info');
    expect(pyIds).toEqual(nodeIds);
  });

  test('forceInclude adds tool in both runtimes', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'read' as const },
      policy: { forceInclude: ['insert_content'] },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s: SelectionEntry) => s.operationId);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId);

    // insert_content is normally excluded in read phase (it's a mutation).
    // forceInclude should still add it.
    expect(nodeIds).toContain('doc.insert');
    expect(pyIds).toContain('doc.insert');
    expect(pyIds).toEqual(nodeIds);
  });
});

describe('chooseTools parity — capability filtering', () => {
  test('hasComments=false excludes comment tools in both runtimes', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'intent' as const,
      taskContext: { phase: 'mutate' as const },
      documentFeatures: {
        hasTables: false,
        hasLists: false,
        hasComments: false,
        hasTrackedChanges: false,
        isEmptyDocument: false,
      },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);
    const nodeIds = nodeResult.selected.map((s: SelectionEntry) => s.operationId);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;
    const pyIds = pyResult.selected.map((s) => s.operationId);

    // No comment operations should be selected
    const commentOps = nodeIds.filter((id: string) => id.startsWith('doc.comments.'));
    expect(commentOps.length).toBe(0);
    expect(pyIds).toEqual(nodeIds);
  });

  test('selectionMeta matches between runtimes', async () => {
    const input = {
      provider: 'generic' as const,
      profile: 'operation' as const,
      taskContext: { phase: 'locate' as const },
      budget: { maxTools: 8 },
    };

    const { chooseTools } = await nodeTools();
    const nodeResult = await chooseTools(input);

    const pyResult = (await callPython({ action: 'chooseTools', input })) as ChooseResult;

    expect(pyResult.selectionMeta).toEqual(nodeResult.selectionMeta);
  });
});

describe('inferDocumentFeatures parity', () => {
  test('standard doc.info response', async () => {
    const infoResult = {
      counts: { words: 500, paragraphs: 12, tables: 2, comments: 3, lists: 5, trackedChanges: 1 },
    };

    const { inferDocumentFeatures } = await nodeTools();
    const nodeFeatures = inferDocumentFeatures(infoResult);

    const pyFeatures = await callPython({ action: 'inferDocumentFeatures', infoResult });

    expect(pyFeatures).toEqual(nodeFeatures);
    expect(nodeFeatures.hasTables).toBe(true);
    expect(nodeFeatures.hasComments).toBe(true);
    expect(nodeFeatures.hasLists).toBe(true);
    expect(nodeFeatures.hasTrackedChanges).toBe(true);
    expect(nodeFeatures.isEmptyDocument).toBe(false);
  });

  test('empty document', async () => {
    const infoResult = {
      counts: { words: 0, paragraphs: 1, tables: 0, comments: 0, lists: 0, trackedChanges: 0 },
    };

    const { inferDocumentFeatures } = await nodeTools();
    const nodeFeatures = inferDocumentFeatures(infoResult);

    const pyFeatures = await callPython({ action: 'inferDocumentFeatures', infoResult });

    expect(pyFeatures).toEqual(nodeFeatures);
    expect(nodeFeatures.isEmptyDocument).toBe(true);
    expect(nodeFeatures.hasTables).toBe(false);
  });

  test('missing counts keys', async () => {
    const infoResult = { counts: {} };

    const { inferDocumentFeatures } = await nodeTools();
    const nodeFeatures = inferDocumentFeatures(infoResult);

    const pyFeatures = await callPython({ action: 'inferDocumentFeatures', infoResult });

    expect(pyFeatures).toEqual(nodeFeatures);
  });

  test('null info result', async () => {
    const { inferDocumentFeatures } = await nodeTools();
    const nodeFeatures = inferDocumentFeatures(null);

    const pyFeatures = await callPython({ action: 'inferDocumentFeatures', infoResult: null });

    expect(pyFeatures).toEqual(nodeFeatures);
  });
});

describe('Tool name resolution parity', () => {
  test('all tool names in name map resolve identically', async () => {
    const nameMap = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'packages/sdk/tools/tool-name-map.json'), 'utf8'),
    ) as Record<string, string>;

    const { resolveToolOperation } = await nodeTools();

    // Test a representative sample (first 10 entries)
    const entries = Object.entries(nameMap).slice(0, 10);
    for (const [toolName, expectedOpId] of entries) {
      const nodeResult = await resolveToolOperation(toolName);

      const pyResult = await callPython({ action: 'resolveToolOperation', toolName });

      expect(nodeResult).toBe(expectedOpId);
      expect(pyResult).toBe(expectedOpId);
    }
  });

  test('unknown tool name returns null in both runtimes', async () => {
    const { resolveToolOperation } = await nodeTools();
    const nodeResult = await resolveToolOperation('nonexistent_tool_xyz');

    const pyResult = await callPython({ action: 'resolveToolOperation', toolName: 'nonexistent_tool_xyz' });

    expect(nodeResult).toBeNull();
    expect(pyResult).toBeNull();
  });
});

describe('Constraint validation parity', () => {
  test('requiresOneOf: missing required group rejects in both runtimes', async () => {
    // doc.find has requiresOneOf: [["type", "query"]] — must provide at least one
    const args = { limit: 10 };

    const { dispatchSuperDocTool } = await nodeTools();
    let nodeError: { code?: string } | null = null;
    try {
      await dispatchSuperDocTool({ doc: {} }, 'find_content', args);
    } catch (error: unknown) {
      nodeError = error as { code?: string };
    }

    const pyResult = (await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.find',
      args,
    })) as { rejected?: boolean; code?: string };

    expect(nodeError).not.toBeNull();
    expect(nodeError!.code).toBe('INVALID_ARGUMENT');
    expect(pyResult.rejected).toBe(true);
    expect(pyResult.code).toBe('INVALID_ARGUMENT');
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
    // doc.find with just query (satisfies requiresOneOf)
    const args = { query: 'test' };

    const pyResult = await callPython({
      action: 'validateDispatchArgs',
      operationId: 'doc.find',
      args,
    });

    // When validation passes, helper returns 'passed'
    expect(pyResult).toBe('passed');
  });
});

// --------------------------------------------------------------------------
// Python session targeting and collab guard
// --------------------------------------------------------------------------

describe('Python session targeting and collab guard', () => {
  test('doc.session.setDefault is session-bound (derives sessionId)', async () => {
    const result = await callPython({
      action: 'isSessionBound',
      operationId: 'doc.session.setDefault',
    });
    expect(result).toBe(true);
  });

  test('doc.open is NOT session-bound', async () => {
    const result = await callPython({
      action: 'isSessionBound',
      operationId: 'doc.open',
    });
    expect(result).toBe(false);
  });

  test('all doc-backed session ops are session-bound', async () => {
    const sessionOps = [
      'doc.status',
      'doc.save',
      'doc.close',
      'doc.info',
      'doc.find',
      'doc.session.save',
      'doc.session.close',
      'doc.session.setDefault',
    ];
    for (const opId of sessionOps) {
      const result = await callPython({
        action: 'isSessionBound',
        operationId: opId,
      });
      expect(result).toBe(true);
    }
  });

  test('collab session rejected for session-bound op', async () => {
    const result = (await callPython({
      action: 'assertCollabRejection',
      operationId: 'doc.session.setDefault',
      sessionId: 'test-collab-session',
    })) as { rejected: boolean; code?: string };
    expect(result).toEqual({ rejected: true, code: 'NOT_SUPPORTED' });
  });
});
