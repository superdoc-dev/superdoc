import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../../../');
const CONTRACT_PATH = path.join(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');
const CATALOG_PATH = path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json');
const CLI_ONLY_OPERATIONS = new Set([
  'doc.open',
  'doc.save',
  'doc.close',
  'doc.status',
  'doc.describe',
  'doc.describeCommand',
  'doc.insertTab',
  'doc.insertLineBreak',
  'doc.session.list',
  'doc.session.save',
  'doc.session.close',
  'doc.session.setDefault',
]);

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
      sdkSurface?: 'client' | 'document' | 'internal' | string;
      responseEnvelopeKey?: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractToolSchema(tool: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(tool.inputSchema)) return tool.inputSchema;
  if (isRecord(tool.parameters)) return tool.parameters;
  if (isRecord(tool.input_schema)) return tool.input_schema;
  if (isRecord(tool.function) && isRecord(tool.function.parameters)) return tool.function.parameters;

  throw new Error(`Unable to extract tool schema from ${JSON.stringify(tool).slice(0, 200)}`);
}

function collectForbiddenSchemaKeys(
  node: unknown,
  forbiddenKeys: ReadonlySet<string>,
  path: string[] = [],
  matches: string[] = [],
): string[] {
  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      collectForbiddenSchemaKeys(value, forbiddenKeys, [...path, String(index)], matches);
    });
    return matches;
  }

  if (!isRecord(node)) return matches;

  for (const [key, value] of Object.entries(node)) {
    if (forbiddenKeys.has(key)) {
      matches.push([...path, key].join('.'));
    }
    collectForbiddenSchemaKeys(value, forbiddenKeys, [...path, key], matches);
  }

  return matches;
}

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

  test('doc-backed mutations have successSchema and failureSchema', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!CLI_ONLY_OPERATIONS.has(id) && op.mutates && op.inputSchema) {
        expect(op.successSchema).toBeTruthy();
        expect(op.failureSchema).toBeTruthy();
      }
    }
  });

  test('doc-backed operations have inputSchema', async () => {
    contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!CLI_ONLY_OPERATIONS.has(id)) {
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

  test('all catalog operations are document-surface operations', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);

    for (const tool of catalog.tools) {
      for (const op of tool.operations) {
        expect(contract.operations[op.operationId]?.sdkSurface).toBe('document');
      }
    }
  });

  test('tool schemas exclude doc and sessionId in catalog and provider bundles', async () => {
    const forbiddenKeys = new Set(['doc', 'sessionId']);
    const providers = ['openai', 'anthropic', 'vercel', 'generic'];
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);

    for (const tool of catalog.tools) {
      expect(collectForbiddenSchemaKeys(tool.inputSchema, forbiddenKeys)).toEqual([]);
    }

    for (const provider of providers) {
      const bundle = await loadJson<{ tools: Array<Record<string, unknown>> }>(
        path.join(REPO_ROOT, `packages/sdk/tools/tools.${provider}.json`),
      );
      for (const tool of bundle.tools) {
        expect(collectForbiddenSchemaKeys(extractToolSchema(tool), forbiddenKeys)).toEqual([]);
      }
    }
  });

  test('client/internal intent-annotated operations never reach the catalog', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const catalog = await loadJson<IntentCatalog>(CATALOG_PATH);
    const catalogOperationIds = new Set(catalog.tools.flatMap((tool) => tool.operations.map((op) => op.operationId)));

    for (const op of Object.values(contract.operations)) {
      if (!op.intentGroup) continue;
      if (op.sdkSurface === 'document') continue;
      expect(catalogOperationIds.has(op.operationId)).toBe(false);
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
  // Global params hidden across all operations that define them.
  const GLOBALLY_HIDDEN_PARAMS = new Set(['out', 'expectedRevision', 'in', 'blockId', 'start', 'end', 'offset']);

  // Per-operation params hidden only on specific operations (generic names
  // like "type" or "kind" must be scoped to avoid masking accidental hiding).
  const OPERATION_SCOPED_HIDDEN: Record<string, Set<string>> = {
    'doc.find': new Set(['type', 'nodeType', 'kind', 'pattern', 'mode', 'caseSensitive']),
    'doc.open': new Set(['password']),
  };

  function isExpectedHidden(operationId: string, paramName: string): boolean {
    if (GLOBALLY_HIDDEN_PARAMS.has(paramName)) return true;
    return OPERATION_SCOPED_HIDDEN[operationId]?.has(paramName) ?? false;
  }

  test('expected transport-envelope params are agentVisible: false when present', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      for (const param of op.params) {
        if (isExpectedHidden(id, param.name) && 'agentVisible' in param) {
          expect(param.agentVisible).toBe(false);
        }
      }
    }
  });

  test('no unexpected params are marked agentVisible: false', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      for (const param of op.params) {
        if (param.agentVisible === false) {
          expect(isExpectedHidden(id, param.name)).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Response envelope key integrity
// ---------------------------------------------------------------------------

describe('Response envelope key integrity', () => {
  const NODE_CLIENT_PATH = path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated/client.ts');
  const PYTHON_CLIENT_PATH = path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/generated/client.py');

  test('every document-surface operation has a responseEnvelopeKey field', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.sdkSurface !== 'document') continue;
      expect('responseEnvelopeKey' in op).toBe(true);
    }
  });

  test('responseEnvelopeKey is either a non-empty string or null', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!('responseEnvelopeKey' in op)) continue;
      const key = op.responseEnvelopeKey;
      if (key !== null) {
        expect(typeof key).toBe('string');
        expect(key!.length).toBeGreaterThan(0);
      }
    }
  });

  test('generated Node client unwraps every operation that has a non-null envelope key', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const clientSource = await readFile(NODE_CLIENT_PATH, 'utf8');

    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.sdkSurface !== 'document') continue;
      const key = op.responseEnvelopeKey;
      if (key == null) continue;

      // The generated client should call unwrapEnvelope or unwrapStringEnvelope
      // with this operation's ID and the correct key.
      const opPattern = `CONTRACT.operations["${id}"]`;
      const unwrapPattern = `unwrapEnvelope`;
      const stringUnwrapPattern = `unwrapStringEnvelope`;
      const keyPattern = `"${key}"`;

      // Find lines referencing this operation
      const opLines = clientSource.split('\n').filter((line) => line.includes(opPattern));
      expect(opLines.length).toBeGreaterThan(0);

      // Every reference to this operation should use unwrapping with the correct key
      for (const line of opLines) {
        const hasUnwrap = line.includes(unwrapPattern) || line.includes(stringUnwrapPattern);
        const hasKey = line.includes(keyPattern);
        expect(hasUnwrap).toBe(true);
        expect(hasKey).toBe(true);
      }
    }
  });

  test('generated Node client does NOT unwrap operations with null envelope key', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const clientSource = await readFile(NODE_CLIENT_PATH, 'utf8');

    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.sdkSurface !== 'document') continue;
      if (op.responseEnvelopeKey !== null) continue;

      const opPattern = `CONTRACT.operations["${id}"]`;
      const opLines = clientSource.split('\n').filter((line) => line.includes(opPattern));
      if (opLines.length === 0) continue; // operation may not be in the client tree

      for (const line of opLines) {
        expect(line.includes('unwrapEnvelope')).toBe(false);
        expect(line.includes('unwrapStringEnvelope')).toBe(false);
      }
    }
  });

  test('generated Python client unwraps every operation that has a non-null envelope key', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    const clientSource = await readFile(PYTHON_CLIENT_PATH, 'utf8');

    for (const [id, op] of Object.entries(contract.operations)) {
      if (op.sdkSurface !== 'document') continue;
      const key = op.responseEnvelopeKey;
      if (key == null) continue;

      const opPattern = `"${id}"`;
      const opLines = clientSource.split('\n').filter((line) => line.includes(opPattern) && line.includes('invoke'));
      if (opLines.length === 0) continue;

      for (const line of opLines) {
        // Next line should have unwrap — check the method body
        const idx = clientSource.indexOf(line);
        const nextLines = clientSource.slice(idx).split('\n').slice(1, 3).join('\n');
        const hasUnwrap = nextLines.includes('_unwrap_envelope') || nextLines.includes('_unwrap_string_envelope');
        expect(hasUnwrap).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// SDK param / inputSchema alignment
// ---------------------------------------------------------------------------

describe('SDK param alignment with inputSchema', () => {
  test('operations with inputSchema expose matching params for all required schema fields', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);
    // Transport-only params that are not in inputSchema
    const TRANSPORT_ONLY_PARAMS = new Set(['doc', 'sessionId']);

    for (const [id, op] of Object.entries(contract.operations)) {
      if (!op.inputSchema) continue;
      const schema = op.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
      if (!schema.required || !schema.properties) continue;

      const paramNames = new Set(op.params.map((p) => p.name));

      for (const requiredField of schema.required) {
        // The required field should either be a param or be covered by a json param
        // that encompasses it (e.g., query-json covers the full query).
        // At minimum, it should be accessible somehow.
        if (TRANSPORT_ONLY_PARAMS.has(requiredField)) continue;

        // Check if the field exists as a param (direct or via jsonFlag)
        const hasDirectParam = paramNames.has(requiredField);
        const hasJsonParam = op.params.some((p) => p.kind === 'jsonFlag' && p.name === requiredField);
        const hasFlatExpansion = op.params.some((p) => p.kind === 'flag' && !TRANSPORT_ONLY_PARAMS.has(p.name));

        // Required schema fields should be reachable via SDK params
        expect(hasDirectParam || hasJsonParam || hasFlatExpansion).toBe(true);
      }
    }
  });

  test('operations with a select field in inputSchema expose select as a param', async () => {
    const contract = await loadJson<Contract>(CONTRACT_PATH);

    for (const [id, op] of Object.entries(contract.operations)) {
      if (!op.inputSchema) continue;
      const schema = op.inputSchema as { properties?: Record<string, unknown> };
      if (!schema.properties?.select) continue;

      const hasSelectParam = op.params.some((p) => p.name === 'select');
      expect(hasSelectParam).toBe(true);
    }
  });
});
