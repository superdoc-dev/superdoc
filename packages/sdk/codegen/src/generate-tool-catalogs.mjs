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

const GROUP_DESCRIPTIONS = {
  core: 'Core operations: read nodes, get text, insert/replace/delete content, mutations',
  format: 'Text formatting, paragraph styles, alignment, spacing, borders, shading',
  create: 'Create structural elements: headings, paragraphs, tables, sections, TOC',
  tables: 'Table creation, manipulation, formatting, borders, and cell operations',
  sections: 'Page layout, margins, columns, headers/footers, page numbering',
  lists: 'Bullet and numbered lists, indentation, list types',
  comments: 'Comment threads — create, edit, delete, list',
  trackChanges: 'Track changes — list, inspect, accept/reject',
  toc: 'Table of contents — create, configure, update, manage entries',
  history: 'Undo, redo, history inspection',
  session: 'Session management — open, close, save, list sessions',
};

const TOOLS_POLICY = {
  policyVersion: 'v3',
  groups: [
    'core', 'format', 'create', 'tables', 'sections',
    'lists', 'comments', 'trackChanges', 'toc', 'history', 'session',
  ],
  groupDescriptions: GROUP_DESCRIPTIONS,
  defaults: {
    mode: 'essential',
    maxTools: 20,
    alwaysInclude: ['core'],
    foundationalOperationIds: ['doc.info', 'doc.query.match'],
  },
  capabilityFeatures: {
    comments: ['hasComments'],
    trackChanges: ['hasTrackedChanges'],
    lists: ['hasLists'],
    tables: ['hasTables'],
    toc: ['hasToc'],
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
// Schema sanitization — ensure JSON Schema 2020-12 compliance
// ---------------------------------------------------------------------------

/**
 * Recursively fix bare `{ const: value }` nodes to include `type`.
 * Anthropic requires `const` to be accompanied by a `type` field.
 */
function sanitizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

  const result = { ...schema };

  // "type": "json" is a SuperDoc contract sentinel for "any JSON value".
  // It's not valid in JSON Schema draft 2020-12 — replace with empty schema.
  if (result.type === 'json') {
    delete result.type;
    return result;
  }

  // Fix bare const: add type based on the const value
  if ('const' in result && !result.type) {
    const val = result.const;
    if (typeof val === 'string') result.type = 'string';
    else if (typeof val === 'number') result.type = 'number';
    else if (typeof val === 'boolean') result.type = 'boolean';
  }

  // Recurse into nested structures
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([k, v]) => [k, sanitizeSchema(v)]),
    );
  }
  if (Array.isArray(result.oneOf)) {
    // Convert oneOf where every variant is { const: value } into { enum: [...] }
    const allConst = result.oneOf.every((v) => v && typeof v === 'object' && 'const' in v && Object.keys(v).length <= 2);
    if (allConst && result.oneOf.length > 0) {
      const values = result.oneOf.map((v) => v.const);
      delete result.oneOf;
      result.enum = values;
    } else {
      result.oneOf = result.oneOf.map(sanitizeSchema);
    }
  }
  if (Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map(sanitizeSchema);
  }
  if (Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map(sanitizeSchema);
  }
  if (result.items) {
    result.items = sanitizeSchema(result.items);
  }
  if (result.additionalProperties && typeof result.additionalProperties === 'object') {
    result.additionalProperties = sanitizeSchema(result.additionalProperties);
  }

  return result;
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
    if (param.type === 'string' && param.schema) schema = { type: 'string', ...param.schema };
    else if (param.type === 'string') schema = { type: 'string' };
    else if (param.type === 'number') schema = { type: 'number' };
    else if (param.type === 'boolean') schema = { type: 'boolean' };
    else if (param.type === 'string[]') schema = { type: 'array', items: { type: 'string' } };
    else if (param.type === 'json' && param.schema && param.schema.type !== 'json') schema = param.schema;
    else schema = { type: 'object' };

    schema = sanitizeSchema(schema);
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
    category: operation.category ?? 'core',
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

  for (const [operationId, operation] of Object.entries(contract.operations)) {
    // Skip operations explicitly excluded from LLM tool catalogs
    if (operation.skipAsATool) continue;

    // Map to doc-api tool by stripping 'doc.' prefix
    const docApiName = operationId.replace(/^doc\./, '');
    const docApiTool = docApiTools.get(docApiName);

    const entry = buildCatalogEntry(operationId, operation, docApiTool, 'intent');
    if (operation.essential) entry.essential = true;
    intentTools.push(entry);
  }

  // Collect essential tool names
  const essentialToolNames = intentTools
    .filter((t) => t.essential)
    .map((t) => t.toolName);

  // Full catalog
  const catalog = {
    contractVersion: contract.contractVersion,
    generatedAt: null,
    namePolicyVersion: NAME_POLICY_VERSION,
    exposureVersion: EXPOSURE_VERSION,
    toolCount: intentTools.length,
    tools: intentTools,
  };

  // Tool name -> operation ID map
  const toolNameMap = {};
  for (const tool of intentTools) {
    toolNameMap[tool.toolName] = tool.operationId;
  }

  // Build discover_tools schema: lists available groups with descriptions
  const discoverToolSchema = {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'string',
          enum: TOOLS_POLICY.groups,
        },
        description: 'Which tool groups to load. You can request multiple at once.',
      },
    },
    required: ['groups'],
  };

  const discoverToolDescription =
    'Load additional tool groups when you need capabilities beyond the essential set. ' +
    'Call this BEFORE attempting to use tools from a specific group.\n\nAvailable groups:\n' +
    TOOLS_POLICY.groups.map((g) => `  - ${g}: ${GROUP_DESCRIPTIONS[g]}`).join('\n');

  // Provider bundles (with discover_tools appended)
  const providers = {
    openai: { formatter: toOpenAiTool, file: 'tools.openai.json' },
    anthropic: { formatter: toAnthropicTool, file: 'tools.anthropic.json' },
    vercel: { formatter: toVercelTool, file: 'tools.vercel.json' },
    generic: { formatter: toGenericTool, file: 'tools.generic.json' },
  };

  // Build discover_tools in each provider format
  const discoverToolByProvider = {
    openai: {
      type: 'function',
      function: { name: 'discover_tools', description: discoverToolDescription, parameters: discoverToolSchema },
    },
    anthropic: {
      name: 'discover_tools', description: discoverToolDescription, input_schema: discoverToolSchema,
    },
    vercel: {
      type: 'function',
      function: { name: 'discover_tools', description: discoverToolDescription, parameters: discoverToolSchema },
    },
    generic: {
      name: 'discover_tools', description: discoverToolDescription, parameters: discoverToolSchema,
    },
  };

  // Tools policy with contract hash and essential tool list
  const policy = {
    ...TOOLS_POLICY,
    essentialTools: essentialToolNames,
    discoverTool: {
      name: 'discover_tools',
      description: discoverToolDescription,
      schema: discoverToolSchema,
    },
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

  for (const [providerName, { formatter, file }] of Object.entries(providers)) {
    const providerTools = intentTools.map(formatter);
    // Append discover_tools as the last tool in the bundle
    providerTools.push(discoverToolByProvider[providerName]);
    const bundle = {
      contractVersion: contract.contractVersion,
      tools: providerTools,
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
