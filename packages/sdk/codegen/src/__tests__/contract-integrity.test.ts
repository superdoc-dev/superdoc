import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const CONTRACT_PATH = path.join(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');
const CATALOG_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json');

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

type Contract = {
  contractVersion: string;
  sourceHash: string;
  cli: { package: string; minVersion: string };
  protocol: { version: string; transport: string; features: string[] };
  intentGroupMeta?: Record<string, { toolName: string; description: string }>;
  operations: Record<
    string,
    {
      operationId: string;
      command: string;
      commandTokens: string[];
      category: string;
      description: string;
      params: Array<{
        name: string;
        kind: string;
        flag?: string;
        type: string;
        required?: boolean;
        agentVisible?: boolean;
      }>;
      mutates: boolean;
      outputSchema: Record<string, unknown>;
      inputSchema?: Record<string, unknown>;
      successSchema?: Record<string, unknown>;
      failureSchema?: Record<string, unknown>;
      skipAsATool?: boolean;
      intentGroup?: string;
      intentAction?: string;
    }
  >;
};

type IntentCatalog = {
  contractVersion: string;
  toolCount: number;
  tools: Array<{
    toolName: string;
    description: string;
    inputSchema: Record<string, unknown>;
    mutates: boolean;
    operations: Array<{ operationId: string; intentAction: string }>;
  }>;
};

describe('Contract integrity', () => {
  let contract: Contract;

  test('loads and has required top-level fields', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    expect(contract.contractVersion).toBeTruthy();
    expect(contract.sourceHash).toBeTruthy();
    expect(contract.cli.package).toBe('@superdoc-dev/cli');
    expect(contract.protocol.version).toBe('1.0');
    expect(contract.protocol.features).toContain('cli.invoke');
  });

  test('all operations have required fields', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      expect(op.operationId).toBe(id);
      expect(op.commandTokens.length).toBeGreaterThan(0);
      expect(op.category).toBeTruthy();
      expect(op.description).toBeTruthy();
      expect(op.outputSchema).toBeTruthy();
      expect(Array.isArray(op.params)).toBe(true);
      expect(typeof op.mutates).toBe('boolean');
    }
  });

  test('all operations start with doc.', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const id of Object.keys(contract.operations)) {
      expect(id.startsWith('doc.')).toBe(true);
    }
  });

  test('mutations have successSchema and failureSchema', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.mutates && op.inputSchema) {
        expect(op.successSchema).toBeTruthy();
        expect(op.failureSchema).toBeTruthy();
      }
    }
  });

  test('doc-backed operations have inputSchema', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    const CLI_ONLY = new Set([
      'doc.open',
      'doc.save',
      'doc.close',
      'doc.status',
      'doc.describe',
      'doc.describeCommand',
      'doc.session.list',
      'doc.session.save',
      'doc.session.close',
      'doc.session.setDefault',
    ]);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!CLI_ONLY.has(id)) {
        expect(op.inputSchema).toBeTruthy();
      }
    }
  });

  test('param specs have valid shapes', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    const validKinds = new Set(['doc', 'flag', 'jsonFlag']);
    const validTypes = new Set(['string', 'number', 'boolean', 'json', 'string[]']);

    for (const [id, op] of Object.entries(contract.operations)) {
      for (const param of op.params) {
        expect(validKinds.has(param.kind)).toBe(true);
        expect(validTypes.has(param.type)).toBe(true);
        if (param.kind === 'doc') {
          expect(param.type).toBe('string');
        }
        if (param.kind === 'flag' || param.kind === 'jsonFlag') {
          expect(param.flag ?? param.name).toBeTruthy();
        }
      }
    }
  });
});

describe('Intent tool catalog integrity', () => {
  test('catalog has correct number of intent tools', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);

    // Count unique intentGroups with at least one annotated operation
    const intentGroups = new Set<string>();
    for (const op of Object.values(contract.operations)) {
      if (op.skipAsATool) continue;
      if (op.intentGroup) intentGroups.add(op.intentGroup);
    }

    expect(catalog.tools.length).toBe(intentGroups.size);
    expect(catalog.toolCount).toBe(intentGroups.size);
  });

  test('each provider bundle has same tool count as catalog', async () => {
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);
    const providers = ['openai', 'anthropic', 'vercel', 'generic'];

    for (const provider of providers) {
      const bundle = await loadJson<{ tools: unknown[] }>(
        path.join(REPO_ROOT, `packages/sdk/tools/tools.${provider}.json`),
      );
      expect(Array.isArray(bundle.tools)).toBe(true);
      expect(bundle.tools.length).toBe(catalog.tools.length);
    }
  });

  test('all tool names match superdoc_* pattern', async () => {
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);
    for (const tool of catalog.tools) {
      expect(tool.toolName).toMatch(/^superdoc_[a-z_]+$/);
    }
  });

  test('tool schemas are valid JSON Schema', async () => {
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);
    for (const tool of catalog.tools) {
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  });

  test('each tool action enum matches intentAction values of grouped operations', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);

    for (const tool of catalog.tools) {
      const catalogActions = tool.operations.map((op) => op.intentAction).sort();

      // Verify against contract
      for (const op of tool.operations) {
        const contractOp = contract.operations[op.operationId];
        expect(contractOp).toBeDefined();
        expect(contractOp.intentAction).toBe(op.intentAction);
      }

      // For multi-op tools, verify action enum exists
      if (tool.operations.length > 1) {
        const actionProp = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
        expect(actionProp.action).toBeDefined();
        expect(actionProp.action.enum).toBeTruthy();
        const schemaActions = [...(actionProp.action.enum as string[])].sort();
        expect(schemaActions).toEqual(catalogActions);
      }
    }
  });

  test('system prompt file exists and is non-empty', async () => {
    const promptPath = path.join(REPO_ROOT, 'packages/sdk/tools/system-prompt.md');
    const content = await readFile(promptPath, 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  test('OpenAI tools have required function shape', async () => {
    const bundle = await loadJson<{ tools: Array<Record<string, unknown>> }>(
      path.join(REPO_ROOT, 'packages/sdk/tools/tools.openai.json'),
    );

    for (const tool of bundle.tools) {
      expect(tool.type).toBe('function');
      const fn = tool.function as Record<string, unknown>;
      expect(typeof fn.name).toBe('string');
      expect(typeof fn.description).toBe('string');
      expect(typeof fn.parameters).toBe('object');
    }
  });

  test('Anthropic tools have required shape', async () => {
    const bundle = await loadJson<{ tools: Array<Record<string, unknown>> }>(
      path.join(REPO_ROOT, 'packages/sdk/tools/tools.anthropic.json'),
    );

    for (const tool of bundle.tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.input_schema).toBe('object');
    }
  });
});

describe('Intent annotation integrity', () => {
  test('intentGroup + intentAction consistency: no duplicate intentAction within a group', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);

    const groupActions = new Map<string, Set<string>>();
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!op.intentGroup || !op.intentAction) continue;
      if (!groupActions.has(op.intentGroup)) {
        groupActions.set(op.intentGroup, new Set());
      }
      const actions = groupActions.get(op.intentGroup)!;
      expect(actions.has(op.intentAction)).toBe(false);
      actions.add(op.intentAction);
    }
  });

  test('all annotated operations have valid intentGroup in intentGroupMeta', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const meta = contract.intentGroupMeta ?? {};

    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.intentGroup) {
        expect(meta[op.intentGroup]).toBeDefined();
      }
    }
  });

  test('annotated operations always have both intentGroup and intentAction', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.intentGroup) {
        expect(op.intentAction).toBeTruthy();
      }
      if (op.intentAction) {
        expect(op.intentGroup).toBeTruthy();
      }
    }
  });
});

const POLICY_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/tools-policy.json');

type ToolsPolicy = {
  policyVersion: string;
  contractHash: string;
  toolCount: number;
  tools: Array<{ toolName: string; mutates: boolean }>;
};

describe('Tools policy integrity', () => {
  test('loads and has required structure', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    expect(policy.policyVersion).toBeTruthy();
    expect(policy.contractHash).toBeTruthy();
    expect(typeof policy.toolCount).toBe('number');
    expect(Array.isArray(policy.tools)).toBe(true);
  });

  test('contractHash matches contract sourceHash', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    expect(policy.contractHash).toBe(contract.sourceHash);
  });

  test('policy tool count matches catalog', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);
    expect(policy.toolCount).toBe(catalog.toolCount);
  });
});

describe('agentVisible param annotation integrity', () => {
  const EXPECTED_HIDDEN = new Set(['out']);

  test('expected transport-envelope params are agentVisible: false', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [, op] of Object.entries(contract.operations)) {
      for (const param of op.params) {
        if (EXPECTED_HIDDEN.has(param.name)) {
          expect(param.agentVisible).toBe(false);
        }
      }
    }
  });

  test('no unexpected params are marked agentVisible: false', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [, op] of Object.entries(contract.operations)) {
      for (const param of op.params) {
        if (param.agentVisible === false) {
          expect(EXPECTED_HIDDEN.has(param.name)).toBe(true);
        }
      }
    }
  });
});
