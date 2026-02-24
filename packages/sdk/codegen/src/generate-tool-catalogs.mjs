import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadContract, REPO_ROOT, sanitizeOperationId, writeGeneratedFile } from './shared.mjs';

const TOOLS_OUTPUT_DIR = path.join(REPO_ROOT, 'packages/sdk/tools');
const DOCAPI_TOOLS_PATH = path.join(
  REPO_ROOT,
  'packages/document-api/generated/manifests/document-api-tools.json',
);

const NAME_POLICY_VERSION = 'v1';
const EXPOSURE_VERSION = 'v1';

// ---------------------------------------------------------------------------
// Intent naming — read from contract's intentName field, fallback to derivation
// ---------------------------------------------------------------------------

function toIntentName(operationId, operation) {
  if (operation.intentName) {
    return operation.intentName;
  }
  // Fallback: strip 'doc.' prefix and convert dots/camelCase to snake_case
  return sanitizeOperationId(operationId)
    .replace(/\./g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

// Operation name is simpler: just replace dots with underscores
function toOperationToolName(operationId) {
  return operationId.replace(/\./g, '_');
}

// ---------------------------------------------------------------------------
// Tools policy — shared data that both runtimes consume from tools-policy.json
// ---------------------------------------------------------------------------

const TOOLS_POLICY = {
  policyVersion: 'v1',
  phases: {
    read: {
      include: ['introspection', 'query'],
      exclude: ['mutation', 'trackChanges', 'session', 'create', 'comments', 'format'],
      priority: ['query', 'introspection'],
    },
    locate: {
      include: ['query'],
      exclude: ['mutation', 'trackChanges', 'session', 'create', 'comments', 'format'],
      priority: ['query'],
    },
    mutate: {
      include: ['query', 'mutation', 'format', 'comments', 'create'],
      exclude: ['session'],
      priority: ['query', 'mutation', 'create', 'format', 'comments'],
    },
    review: {
      include: ['query', 'trackChanges', 'comments'],
      exclude: ['mutation', 'create', 'session', 'format'],
      priority: ['trackChanges', 'comments', 'query'],
    },
  },
  defaults: {
    maxToolsByProfile: { intent: 12, operation: 16 },
    minReadTools: 2,
    foundationalOperationIds: ['doc.info', 'doc.find'],
    chooserDecisionVersion: 'v1',
  },
  capabilityFeatures: {
    comments: ['hasComments'],
    trackChanges: ['hasTrackedChanges'],
    lists: ['hasLists'],
  },
};

// ---------------------------------------------------------------------------
// Category inference for capabilities
// ---------------------------------------------------------------------------

const CAPABILITY_FEATURES = TOOLS_POLICY.capabilityFeatures;

function inferRequiredCapabilities(category) {
  return CAPABILITY_FEATURES[category] ?? [];
}

function inferCapabilities(operation) {
  const capabilities = new Set();
  const params = operation.params ?? [];
  const paramNames = new Set(params.map((p) => p.name));

  if (paramNames.has('doc')) capabilities.add('stateless-doc');
  if (paramNames.has('sessionId')) capabilities.add('session-targeting');
  if (paramNames.has('expectedRevision')) capabilities.add('optimistic-concurrency');
  if (paramNames.has('changeMode')) capabilities.add('tracked-change-mode');
  if (paramNames.has('dryRun')) capabilities.add('dry-run');
  if (paramNames.has('out')) capabilities.add('output-path');
  if (operation.category === 'comments') capabilities.add('comments');
  if (operation.category === 'trackChanges') capabilities.add('track-changes');
  if (operation.category === 'session') capabilities.add('session-management');
  if (operation.category === 'create') capabilities.add('structural-create');
  if (operation.category === 'query') capabilities.add('search');
  if (operation.category === 'introspection') capabilities.add('introspection');

  return Array.from(capabilities).sort();
}

function inferSessionRequirements(operation) {
  const params = operation.params ?? [];
  const paramNames = new Set(params.map((p) => p.name));
  return {
    requiresOpenContext: paramNames.has('doc') || paramNames.has('sessionId'),
    supportsSessionTargeting: paramNames.has('sessionId'),
  };
}

// ---------------------------------------------------------------------------
// Build input schema from CLI params (for CLI-only ops or as fallback)
// ---------------------------------------------------------------------------

function buildInputSchemaFromParams(operation) {
  const properties = {};
  const required = [];

  for (const param of operation.params ?? []) {
    // Skip params annotated as not agent-visible (transport-envelope details).
    if (param.agentVisible === false) {
      continue;
    }

    let schema;
    if (param.type === 'string') schema = { type: 'string' };
    else if (param.type === 'number') schema = { type: 'number' };
    else if (param.type === 'boolean') schema = { type: 'boolean' };
    else if (param.type === 'string[]') schema = { type: 'array', items: { type: 'string' } };
    else if (param.type === 'json' && param.schema) schema = param.schema;
    else schema = {};

    if (param.description) schema.description = param.description;
    properties[param.name] = schema;
    if (param.required) required.push(param.name);
  }

  const result = { type: 'object', properties };
  if (required.length > 0) result.required = required;
  result.additionalProperties = false;
  return result;
}

// ---------------------------------------------------------------------------
// Load document-api tools indexed by name
// ---------------------------------------------------------------------------

async function loadDocApiTools() {
  const raw = await readFile(DOCAPI_TOOLS_PATH, 'utf8');
  const manifest = JSON.parse(raw);
  const index = new Map();
  for (const tool of manifest.tools ?? []) {
    index.set(tool.name, tool);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Build unified catalog entry
// ---------------------------------------------------------------------------

function buildCatalogEntry(operationId, operation, docApiTool, profile) {
  const toolName = profile === 'intent' ? toIntentName(operationId, operation) : toOperationToolName(operationId);

  // Input schema: always derive from CLI params so field names match the dispatcher
  // contract (doc-api inputSchema uses different names e.g. commentId vs id).
  const inputSchema = buildInputSchemaFromParams(operation);

  // Output schema from contract
  const outputSchema = operation.successSchema ?? operation.outputSchema ?? {};

  return {
    operationId,
    toolName,
    profile,
    source: profile === 'intent' ? 'intent' : 'operation',
    description: operation.description ?? '',
    inputSchema,
    outputSchema,
    mutates: operation.mutates ?? false,
    category: operation.category ?? 'misc',
    capabilities: inferCapabilities(operation),
    constraints: operation.constraints ?? undefined,
    errors: docApiTool?.possibleFailureCodes ?? [],
    examples: [],
    commandTokens: operation.commandTokens ?? [],
    profileTags: [],
    requiredCapabilities: inferRequiredCapabilities(operation.category),
    sessionRequirements: inferSessionRequirements(operation),
    intentId: profile === 'intent' ? toIntentName(operationId, operation) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Provider formatters
// ---------------------------------------------------------------------------

function toOpenAiTool(entry) {
  return {
    type: 'function',
    function: {
      name: entry.toolName,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  };
}

function toAnthropicTool(entry) {
  return {
    name: entry.toolName,
    description: entry.description,
    input_schema: entry.inputSchema,
  };
}

function toVercelTool(entry) {
  return {
    type: 'function',
    function: {
      name: entry.toolName,
      description: entry.description,
      parameters: entry.inputSchema,
    },
  };
}

function toGenericTool(entry) {
  return {
    name: entry.toolName,
    description: entry.description,
    parameters: entry.inputSchema,
    returns: entry.outputSchema,
    metadata: {
      operationId: entry.operationId,
      profile: entry.profile,
      mutates: entry.mutates,
      category: entry.category,
      capabilities: entry.capabilities,
      constraints: entry.constraints,
      requiredCapabilities: entry.requiredCapabilities,
      profileTags: entry.profileTags,
      examples: entry.examples,
      commandTokens: entry.commandTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

export async function generateToolCatalogs(contract) {
  const docApiTools = await loadDocApiTools();

  const intentTools = [];
  const operationTools = [];

  for (const [operationId, operation] of Object.entries(contract.operations)) {
    // Map to doc-api tool by stripping 'doc.' prefix
    const docApiName = operationId.replace(/^doc\./, '');
    const docApiTool = docApiTools.get(docApiName);

    intentTools.push(buildCatalogEntry(operationId, operation, docApiTool, 'intent'));
    operationTools.push(buildCatalogEntry(operationId, operation, docApiTool, 'operation'));
  }

  // Full catalog
  const catalog = {
    contractVersion: contract.contractVersion,
    generatedAt: null,
    namePolicyVersion: NAME_POLICY_VERSION,
    exposureVersion: EXPOSURE_VERSION,
    toolCount: intentTools.length + operationTools.length,
    profiles: {
      intent: { name: 'intent', tools: intentTools },
      operation: { name: 'operation', tools: operationTools },
    },
  };

  // Tool name -> operation ID map
  const toolNameMap = {};
  for (const tool of intentTools) {
    toolNameMap[tool.toolName] = tool.operationId;
  }
  for (const tool of operationTools) {
    toolNameMap[tool.toolName] = tool.operationId;
  }

  // Provider bundles
  const providers = {
    openai: { formatter: toOpenAiTool, file: 'tools.openai.json' },
    anthropic: { formatter: toAnthropicTool, file: 'tools.anthropic.json' },
    vercel: { formatter: toVercelTool, file: 'tools.vercel.json' },
    generic: { formatter: toGenericTool, file: 'tools.generic.json' },
  };

  // Tools policy with contract hash
  const policy = {
    ...TOOLS_POLICY,
    contractHash: contract.sourceHash,
  };

  const writes = [
    writeGeneratedFile(path.join(TOOLS_OUTPUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n'),
    writeGeneratedFile(
      path.join(TOOLS_OUTPUT_DIR, 'tool-name-map.json'),
      JSON.stringify(toolNameMap, null, 2) + '\n',
    ),
    writeGeneratedFile(
      path.join(TOOLS_OUTPUT_DIR, 'tools-policy.json'),
      JSON.stringify(policy, null, 2) + '\n',
    ),
  ];

  for (const [, { formatter, file }] of Object.entries(providers)) {
    const bundle = {
      contractVersion: contract.contractVersion,
      profiles: {
        intent: intentTools.map(formatter),
        operation: operationTools.map(formatter),
      },
    };
    writes.push(writeGeneratedFile(path.join(TOOLS_OUTPUT_DIR, file), JSON.stringify(bundle, null, 2) + '\n'));
  }

  await Promise.all(writes);
}

if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') ?? '')) {
  const contract = await loadContract();
  await generateToolCatalogs(contract);
  console.log('Generated tool catalog files.');
}
