import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT, type ContractOperationEntry } from './generated/contract.js';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';

export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';

export type ToolGroup =
  | 'core'
  | 'format'
  | 'create'
  | 'tables'
  | 'sections'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'toc'
  | 'images'
  | 'history'
  | 'session';

export type ToolChooserMode = 'essential' | 'all';

export type ToolChooserInput = {
  provider: ToolProvider;
  groups?: ToolGroup[];
  /** Default: 'essential'. When 'essential', only essential tools are returned (plus any from `groups`). */
  mode?: ToolChooserMode;
  /** Whether to include the discover_tools meta-tool. Default: true when mode='essential', false when mode='all'. */
  includeDiscoverTool?: boolean;
};

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  namePolicyVersion: string;
  exposureVersion: string;
  toolCount: number;
  tools: ToolCatalogEntry[];
};

type ToolCatalogEntry = {
  operationId: string;
  toolName: string;
  profile: string;
  source: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  mutates: boolean;
  category: string;
  essential?: boolean;
  capabilities: string[];
  constraints?: Record<string, unknown>;
  errors: string[];
  examples: unknown[];
  commandTokens: string[];
  profileTags: string[];
  requiredCapabilities: string[];
  sessionRequirements: {
    requiresOpenContext: boolean;
    supportsSessionTargeting: boolean;
  };
  intentId?: string;
};

// Resolve tools directory relative to package root (works from both src/ and dist/)
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
const providerFileByName: Record<ToolProvider, string> = {
  openai: 'tools.openai.json',
  anthropic: 'tools.anthropic.json',
  vercel: 'tools.vercel.json',
  generic: 'tools.generic.json',
};

// Policy is loaded from the generated tools-policy.json artifact.
type ToolsPolicy = {
  policyVersion: string;
  contractHash: string;
  groups: string[];
  groupDescriptions?: Record<string, string>;
  essentialTools?: string[];
  discoverTool?: {
    name: string;
    description: string;
    schema: Record<string, unknown>;
  };
  defaults: {
    mode?: string;
    maxTools: number;
    alwaysInclude: string[];
    foundationalOperationIds: string[];
  };
  capabilityFeatures: Record<string, string[]>;
};

let _policyCache: ToolsPolicy | null = null;
function loadPolicy(): ToolsPolicy {
  if (_policyCache) return _policyCache;
  const raw = readFileSync(path.join(toolsDir, 'tools-policy.json'), 'utf8');
  _policyCache = JSON.parse(raw) as ToolsPolicy;
  return _policyCache;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function extractProviderToolName(tool: Record<string, unknown>): string | null {
  // Anthropic / Generic: top-level name
  if (typeof tool.name === 'string') return tool.name;
  // OpenAI / Vercel: nested under function.name
  if (isRecord(tool.function) && typeof (tool.function as Record<string, unknown>).name === 'string') {
    return (tool.function as Record<string, unknown>).name as string;
  }
  return null;
}

function invalidArgument(message: string, details?: Record<string, unknown>): never {
  throw new SuperDocCliError(message, { code: 'INVALID_ARGUMENT', details });
}

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(toolsDir, fileName);
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new SuperDocCliError('Unable to load packaged tool artifact.', {
      code: 'TOOLS_ASSET_NOT_FOUND',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SuperDocCliError('Packaged tool artifact is invalid JSON.', {
      code: 'TOOLS_ASSET_INVALID',
      details: {
        filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function loadProviderBundle(provider: ToolProvider): Promise<{
  contractVersion: string;
  tools: unknown[];
}> {
  return readJson(providerFileByName[provider]);
}

async function loadToolNameMap(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>('tool-name-map.json');
}

async function loadCatalog(): Promise<ToolCatalog> {
  return readJson<ToolCatalog>('catalog.json');
}

/** All available tool groups from the policy. */
export function getAvailableGroups(): ToolGroup[] {
  const policy = loadPolicy();
  return policy.groups as ToolGroup[];
}

const OPERATION_INDEX: Record<string, ContractOperationEntry> = Object.fromEntries(
  Object.entries(CONTRACT.operations).map(([id, op]) => [id, op]),
);

function validateDispatchArgs(operationId: string, args: Record<string, unknown>): void {
  const operation = OPERATION_INDEX[operationId];
  if (!operation) {
    invalidArgument(`Unknown operation id ${operationId}.`);
  }

  // Unknown-param rejection
  const allowedParams = new Set<string>(operation.params.map((param: { name: string }) => String(param.name)));
  for (const key of Object.keys(args)) {
    if (!allowedParams.has(key)) {
      invalidArgument(`Unexpected parameter ${key} for ${operationId}.`);
    }
  }

  // Required-param enforcement
  for (const param of operation.params) {
    if ('required' in param && Boolean(param.required) && args[param.name] == null) {
      invalidArgument(`Missing required parameter ${param.name} for ${operationId}.`);
    }
  }

  // Constraint validation (CLI handles schema-level type validation authoritatively)
  const constraints = 'constraints' in operation ? (operation as Record<string, unknown>).constraints : undefined;
  if (!constraints || !isRecord(constraints)) return;

  const mutuallyExclusive = Array.isArray(constraints.mutuallyExclusive) ? constraints.mutuallyExclusive : [];
  const requiresOneOf = Array.isArray(constraints.requiresOneOf) ? constraints.requiresOneOf : [];
  const requiredWhen = Array.isArray(constraints.requiredWhen) ? constraints.requiredWhen : [];

  for (const group of mutuallyExclusive) {
    if (!Array.isArray(group)) continue;
    const present = group.filter((name: string) => isPresent(args[name]));
    if (present.length > 1) {
      invalidArgument(`Arguments are mutually exclusive for ${operationId}: ${group.join(', ')}`, {
        operationId,
        group,
      });
    }
  }

  for (const group of requiresOneOf) {
    if (!Array.isArray(group)) continue;
    const hasAny = group.some((name: string) => isPresent(args[name]));
    if (!hasAny) {
      invalidArgument(`One of the following arguments is required for ${operationId}: ${group.join(', ')}`, {
        operationId,
        group,
      });
    }
  }

  for (const rule of requiredWhen) {
    if (!isRecord(rule)) continue;
    const whenValue = args[rule.whenParam as string];
    let shouldRequire = false;
    if (Object.prototype.hasOwnProperty.call(rule, 'equals')) {
      shouldRequire = whenValue === rule.equals;
    } else if (Object.prototype.hasOwnProperty.call(rule, 'present')) {
      const present = rule.present === true;
      shouldRequire = present ? isPresent(whenValue) : !isPresent(whenValue);
    } else {
      shouldRequire = isPresent(whenValue);
    }

    if (shouldRequire && !isPresent(args[rule.param as string])) {
      invalidArgument(`Argument ${rule.param} is required by constraints for ${operationId}.`, {
        operationId,
        rule,
      });
    }
  }
}

function resolveDocApiMethod(
  client: { doc: Record<string, unknown> },
  operationId: string,
): (args: unknown, options?: InvokeOptions) => Promise<unknown> {
  const tokens = operationId.split('.').slice(1);
  let cursor: unknown = client.doc;

  for (const token of tokens) {
    if (!isRecord(cursor) || !(token in cursor)) {
      throw new SuperDocCliError(`No SDK doc method found for operation ${operationId}.`, {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { operationId, token },
      });
    }
    cursor = cursor[token];
  }

  if (typeof cursor !== 'function') {
    throw new SuperDocCliError(`Resolved member for ${operationId} is not callable.`, {
      code: 'TOOL_DISPATCH_NOT_FOUND',
      details: { operationId },
    });
  }

  return cursor as (args: unknown, options?: InvokeOptions) => Promise<unknown>;
}

export async function getToolCatalog(): Promise<ToolCatalog> {
  return loadCatalog();
}

export async function listTools(provider: ToolProvider): Promise<unknown[]> {
  const bundle = await loadProviderBundle(provider);
  const tools = bundle.tools;
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing tools array.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider },
    });
  }
  return tools;
}

export async function resolveToolOperation(toolName: string): Promise<string | null> {
  const map = await loadToolNameMap();
  return typeof map[toolName] === 'string' ? map[toolName] : null;
}

/**
 * Select tools for a specific provider.
 *
 * **mode='essential'** (default): Returns only essential tools + discover_tools.
 * Pass `groups` to additionally load all tools from those categories.
 *
 * **mode='all'**: Returns all tools from requested groups (or all groups if
 * `groups` is omitted). No discover_tools included by default.
 *
 * @example
 * ```ts
 * // Default: 5 essential tools + discover_tools
 * const { tools } = await chooseTools({ provider: 'openai' });
 *
 * // Essential + all comment tools
 * const { tools } = await chooseTools({ provider: 'openai', groups: ['comments'] });
 *
 * // All tools (old behavior)
 * const { tools } = await chooseTools({ provider: 'openai', mode: 'all' });
 * ```
 */
export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  selected: Array<{
    operationId: string;
    toolName: string;
    category: string;
    mutates: boolean;
  }>;
  meta: {
    provider: ToolProvider;
    mode: string;
    groups: string[];
    selectedCount: number;
  };
}> {
  const catalog = await loadCatalog();
  const policy = loadPolicy();

  const mode = input.mode ?? (policy.defaults.mode as ToolChooserMode) ?? 'essential';
  const includeDiscover = input.includeDiscoverTool ?? mode === 'essential';

  let selected: ToolCatalogEntry[];

  if (mode === 'essential') {
    // Essential tools + any explicitly requested groups
    const essentialNames = new Set(policy.essentialTools ?? []);
    const requestedGroups = input.groups ? new Set<string>(input.groups) : null;

    selected = catalog.tools.filter((tool) => {
      if (essentialNames.has(tool.toolName)) return true;
      if (requestedGroups && requestedGroups.has(tool.category)) return true;
      return false;
    });
  } else {
    // mode='all': original behavior — filter by groups
    const alwaysInclude = new Set(policy.defaults.alwaysInclude ?? ['core']);
    let groups: Set<string>;
    if (input.groups) {
      groups = new Set([...input.groups, ...alwaysInclude]);
    } else {
      groups = new Set(policy.groups);
    }
    selected = catalog.tools.filter((tool) => groups.has(tool.category));
  }

  // Build provider-formatted tools from the provider bundle
  const bundle = await loadProviderBundle(input.provider);
  const providerTools = Array.isArray(bundle.tools) ? bundle.tools : [];
  const providerIndex = new Map(
    providerTools
      .filter((tool): tool is Record<string, unknown> => isRecord(tool))
      .map((tool) => [extractProviderToolName(tool), tool] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => entry[0] !== null),
  );

  const selectedProviderTools = selected
    .map((tool) => providerIndex.get(tool.toolName))
    .filter((tool): tool is Record<string, unknown> => Boolean(tool));

  // Append discover_tools if requested
  if (includeDiscover) {
    const discoverTool = providerIndex.get('discover_tools');
    if (discoverTool) {
      selectedProviderTools.push(discoverTool);
    }
  }

  const resolvedGroups = mode === 'essential' ? (input.groups ?? []) : (input.groups ?? policy.groups);

  return {
    tools: selectedProviderTools,
    selected: selected.map((tool) => ({
      operationId: tool.operationId,
      toolName: tool.toolName,
      category: tool.category,
      mutates: tool.mutates,
    })),
    meta: {
      provider: input.provider,
      mode,
      groups: [...resolvedGroups],
      selectedCount: selectedProviderTools.length,
    },
  };
}

export async function dispatchSuperDocTool(
  client: { doc: Record<string, unknown> },
  toolName: string,
  args: Record<string, unknown> = {},
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  const operationId = await resolveToolOperation(toolName);
  if (!operationId) {
    throw new SuperDocCliError(`Unknown SuperDoc tool: ${toolName}`, {
      code: 'TOOL_NOT_FOUND',
      details: { toolName },
    });
  }

  if (!isRecord(args)) {
    invalidArgument(`Tool arguments for ${toolName} must be an object.`);
  }

  validateDispatchArgs(operationId, args);
  const method = resolveDocApiMethod(client, operationId);
  return method(args, invokeOptions);
}
