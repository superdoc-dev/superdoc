import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const CONTRACT_PATH = path.join(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');
const CATALOG_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json');
const NAME_MAP_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/tool-name-map.json');

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

type Contract = {
  contractVersion: string;
  sourceHash: string;
  cli: { package: string; minVersion: string };
  protocol: { version: string; transport: string; features: string[] };
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
      intentName: string | null;
      outputSchema: Record<string, unknown>;
      inputSchema?: Record<string, unknown>;
      successSchema?: Record<string, unknown>;
      failureSchema?: Record<string, unknown>;
    }
  >;
};

type Catalog = {
  contractVersion: string;
  toolCount: number;
  tools: Array<{
    operationId: string;
    toolName: string;
    category?: string;
    essential?: boolean;
    requiredCapabilities?: string[];
    inputSchema?: Record<string, unknown>;
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
        // Doc-backed mutations should have success/failure schemas
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

describe('Tool catalog integrity', () => {
  test('tool counts match non-skipped contract operation count', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);
    const nonSkippedOps = Object.values(contract.operations).filter(
      (op) => !(op as Record<string, unknown>).skipAsATool,
    );

    expect(catalog.tools.length).toBe(nonSkippedOps.length);
    expect(catalog.toolCount).toBe(nonSkippedOps.length);
  });

  test('tool name map covers all non-skipped operations', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const nameMap = await loadJson<Record<string, string>>(NAME_MAP_PATH);
    const nonSkippedOps = new Set(
      Object.entries(contract.operations)
        .filter(([, op]) => !(op as Record<string, unknown>).skipAsATool)
        .map(([id]) => id),
    );
    const mappedOps = new Set(Object.values(nameMap));

    for (const opId of nonSkippedOps) {
      expect(mappedOps.has(opId)).toBe(true);
    }
  });

  test('all catalog entries have required fields', async () => {
    const catalog = await loadJson<Catalog>(CATALOG_PATH);

    for (const tool of catalog.tools) {
      expect(tool.operationId).toBeTruthy();
      expect(tool.toolName).toBeTruthy();
    }
  });

  test('provider bundles have correct structure', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const opCount = Object.keys(contract.operations).length;
    const providers = ['openai', 'anthropic', 'vercel', 'generic'];

    const nonSkippedCount = Object.values(contract.operations).filter(
      (op) => !(op as Record<string, unknown>).skipAsATool,
    ).length;

    for (const provider of providers) {
      const bundle = await loadJson<{ tools: unknown[] }>(
        path.join(REPO_ROOT, `packages/sdk/tools/tools.${provider}.json`),
      );
      expect(Array.isArray(bundle.tools)).toBe(true);
      // nonSkippedCount tools + discover_tools
      expect(bundle.tools.length).toBe(nonSkippedCount + 1);
    }
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

const POLICY_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/tools-policy.json');

type ToolsPolicy = {
  policyVersion: string;
  contractHash: string;
  groups: string[];
  groupDescriptions?: Record<string, string>;
  essentialTools?: string[];
  discoverTool?: { name: string; description: string; schema: Record<string, unknown> };
  defaults: {
    mode?: string;
    maxTools: number;
    alwaysInclude: string[];
    foundationalOperationIds: string[];
  };
  capabilityFeatures: Record<string, string[]>;
};

describe('Tools policy integrity', () => {
  test('loads and has required structure', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    expect(policy.policyVersion).toBeTruthy();
    expect(policy.contractHash).toBeTruthy();
    expect(Array.isArray(policy.groups)).toBe(true);
    expect(typeof policy.defaults).toBe('object');
    expect(typeof policy.capabilityFeatures).toBe('object');
  });

  test('has essential tools list', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    expect(Array.isArray(policy.essentialTools)).toBe(true);
    expect(policy.essentialTools!.length).toBeGreaterThan(0);
  });

  test('has discover_tools definition', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    expect(policy.discoverTool).toBeDefined();
    expect(policy.discoverTool!.name).toBe('discover_tools');
    expect(typeof policy.discoverTool!.description).toBe('string');
    expect(typeof policy.discoverTool!.schema).toBe('object');
  });

  test('default mode is essential', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    expect(policy.defaults.mode).toBe('essential');
  });

  test('group categories exist in catalog entries', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);
    const catalogCategories = new Set(catalog.tools.map((t) => t.category));

    for (const group of policy.groups) {
      expect(catalogCategories.has(group)).toBe(true);
    }
  });

  test('foundational operation IDs exist in contract', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const opId of policy.defaults.foundationalOperationIds) {
      expect(contract.operations[opId]).toBeDefined();
    }
  });

  test('contractHash matches contract sourceHash', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    expect(policy.contractHash).toBe(contract.sourceHash);
  });

  test('capabilityFeatures consistent with catalog entries', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);

    for (const [category, expectedFeatures] of Object.entries(policy.capabilityFeatures)) {
      const categoryTools = catalog.tools.filter((t) => t.category === category);
      for (const tool of categoryTools) {
        expect(tool.requiredCapabilities).toEqual(expectedFeatures);
      }
    }
  });

  test('essential tools exist in catalog', async () => {
    const policy = await loadJson<ToolsPolicy>(POLICY_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);
    const catalogToolNames = new Set(catalog.tools.map((t) => t.toolName));

    for (const toolName of policy.essentialTools ?? []) {
      expect(catalogToolNames.has(toolName)).toBe(true);
    }
  });
});

describe('Intent name integrity', () => {
  test('all operations have intentName in contract', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      expect(op.intentName).toBeTruthy();
    }
  });

  test('contract intentNames match catalog toolNames', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);

    const catalogIntentNames = new Map(catalog.tools.map((t) => [t.operationId, t.toolName]));

    for (const [id, op] of Object.entries(contract.operations)) {
      if ((op as Record<string, unknown>).skipAsATool) continue;
      const catalogName = catalogIntentNames.get(id);
      expect(catalogName).toBe(op.intentName);
    }
  });

  test('all intentNames are unique and match snake_case naming policy', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const seen = new Set<string>();
    for (const [id, op] of Object.entries(contract.operations)) {
      expect(op.intentName).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(seen.has(op.intentName!)).toBe(false);
      seen.add(op.intentName!);
    }
  });
});

describe('agentVisible param annotation integrity', () => {
  const EXPECTED_HIDDEN = new Set(['out', 'expectedRevision', 'dryRun']);

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

  test('agentVisible: false params are excluded from catalog inputSchema', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<Catalog>(CATALOG_PATH);

    for (const tool of catalog.tools) {
      const inputSchema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
      if (!inputSchema?.properties) continue;
      const op = contract.operations[tool.operationId];
      if (!op) continue;

      const hiddenParams = op.params.filter((p) => p.agentVisible === false).map((p) => p.name);
      for (const hidden of hiddenParams) {
        expect(inputSchema.properties[hidden]).toBeUndefined();
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
