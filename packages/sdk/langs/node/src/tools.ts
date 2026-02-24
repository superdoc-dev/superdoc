import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT } from './generated/contract.js';
import type { InvokeOptions } from './runtime/process.js';
import { SuperDocCliError } from './runtime/errors.js';

export type ToolProvider = 'openai' | 'anthropic' | 'vercel' | 'generic';
export type ToolProfile = 'intent' | 'operation';
export type ToolPhase = 'read' | 'locate' | 'mutate' | 'review';

export type DocumentFeatures = {
  hasTables: boolean;
  hasLists: boolean;
  hasComments: boolean;
  hasTrackedChanges: boolean;
  isEmptyDocument: boolean;
};

export type ToolChooserInput = {
  provider: ToolProvider;
  profile?: ToolProfile;
  documentFeatures?: Partial<DocumentFeatures>;
  taskContext?: {
    phase?: ToolPhase;
    previousToolCalls?: Array<{ toolName: string; ok: boolean }>;
  };
  budget?: {
    maxTools?: number;
    minReadTools?: number;
  };
  policy?: {
    includeCategories?: string[];
    excludeCategories?: string[];
    allowMutatingTools?: boolean;
    forceInclude?: string[];
    forceExclude?: string[];
  };
};

export type ToolCatalog = {
  contractVersion: string;
  generatedAt: string | null;
  namePolicyVersion: string;
  exposureVersion: string;
  toolCount: number;
  profiles: {
    intent: { name: 'intent'; tools: ToolCatalogEntry[] };
    operation: { name: 'operation'; tools: ToolCatalogEntry[] };
  };
};

type ToolCatalogEntry = {
  operationId: string;
  toolName: string;
  profile: ToolProfile;
  source: 'operation' | 'intent';
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  mutates: boolean;
  category: string;
  capabilities: string[];
  constraints?: Record<string, unknown>;
  errors: string[];
  examples: Array<{ description: string; args: Record<string, unknown> }>;
  commandTokens: string[];
  profileTags: string[];
  requiredCapabilities: Array<keyof DocumentFeatures>;
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
  phases: Record<ToolPhase, { include: string[]; exclude: string[]; priority: string[] }>;
  defaults: {
    maxToolsByProfile: Record<ToolProfile, number>;
    minReadTools: number;
    foundationalOperationIds: string[];
    chooserDecisionVersion: string;
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
  profiles: Record<ToolProfile, unknown[]>;
}> {
  return readJson(providerFileByName[provider]);
}

async function loadToolNameMap(): Promise<Record<string, string>> {
  return readJson<Record<string, string>>('tool-name-map.json');
}

async function loadCatalog(): Promise<ToolCatalog> {
  return readJson<ToolCatalog>('catalog.json');
}

function normalizeFeatures(features?: Partial<DocumentFeatures>): DocumentFeatures {
  return {
    hasTables: Boolean(features?.hasTables),
    hasLists: Boolean(features?.hasLists),
    hasComments: Boolean(features?.hasComments),
    hasTrackedChanges: Boolean(features?.hasTrackedChanges),
    isEmptyDocument: Boolean(features?.isEmptyDocument),
  };
}

function stableSortByPhasePriority(entries: ToolCatalogEntry[], priorityOrder: string[]): ToolCatalogEntry[] {
  const priority = new Map(priorityOrder.map((category, index) => [category, index]));
  return [...entries].sort((a, b) => {
    const aPriority = priority.get(a.category) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = priority.get(b.category) ?? Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.toolName.localeCompare(b.toolName);
  });
}

type ContractOperation = (typeof CONTRACT.operations)[keyof typeof CONTRACT.operations];

const OPERATION_INDEX: Record<string, ContractOperation> = Object.fromEntries(
  Object.entries(CONTRACT.operations).map(([id, op]) => [id, op]),
);

function validateDispatchArgs(operationId: string, args: Record<string, unknown>): void {
  const operation = OPERATION_INDEX[operationId];
  if (!operation) {
    invalidArgument(`Unknown operation id ${operationId}.`);
  }

  // Unknown-param rejection
  const allowedParams = new Set<string>(operation.params.map((param) => String(param.name)));
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

export async function getToolCatalog(options: { profile?: ToolProfile } = {}): Promise<ToolCatalog> {
  const catalog = await loadCatalog();
  if (!options.profile) return catalog;

  return {
    ...catalog,
    profiles: {
      intent: options.profile === 'intent' ? catalog.profiles.intent : { name: 'intent', tools: [] },
      operation: options.profile === 'operation' ? catalog.profiles.operation : { name: 'operation', tools: [] },
    },
  };
}

export async function listTools(provider: ToolProvider, options: { profile?: ToolProfile } = {}): Promise<unknown[]> {
  const profile = options.profile ?? 'intent';
  const bundle = await loadProviderBundle(provider);
  const tools = bundle.profiles[profile];
  if (!Array.isArray(tools)) {
    throw new SuperDocCliError('Tool provider bundle is missing profile tools.', {
      code: 'TOOLS_ASSET_INVALID',
      details: { provider, profile },
    });
  }
  return tools;
}

export async function resolveToolOperation(toolName: string): Promise<string | null> {
  const map = await loadToolNameMap();
  return typeof map[toolName] === 'string' ? map[toolName] : null;
}

export function inferDocumentFeatures(infoResult: Record<string, unknown> | null | undefined): DocumentFeatures {
  if (!isRecord(infoResult)) {
    return {
      hasTables: false,
      hasLists: false,
      hasComments: false,
      hasTrackedChanges: false,
      isEmptyDocument: false,
    };
  }

  const counts = isRecord(infoResult.counts) ? infoResult.counts : {};
  const words = typeof counts.words === 'number' ? counts.words : 0;
  const paragraphs = typeof counts.paragraphs === 'number' ? counts.paragraphs : 0;
  const tables = typeof counts.tables === 'number' ? counts.tables : 0;
  const comments = typeof counts.comments === 'number' ? counts.comments : 0;
  const lists =
    typeof counts.lists === 'number' ? counts.lists : typeof counts.listItems === 'number' ? counts.listItems : 0;
  const trackedChanges =
    typeof counts.trackedChanges === 'number'
      ? counts.trackedChanges
      : typeof counts.tracked_changes === 'number'
        ? counts.tracked_changes
        : 0;

  return {
    hasTables: tables > 0,
    hasLists: lists > 0,
    hasComments: comments > 0,
    hasTrackedChanges: trackedChanges > 0,
    isEmptyDocument: words === 0 && paragraphs <= 1,
  };
}

export async function chooseTools(input: ToolChooserInput): Promise<{
  tools: unknown[];
  selected: Array<{
    operationId: string;
    toolName: string;
    category: string;
    mutates: boolean;
    profile: ToolProfile;
  }>;
  excluded: Array<{ toolName: string; reason: string }>;
  selectionMeta: {
    profile: ToolProfile;
    phase: ToolPhase;
    maxTools: number;
    minReadTools: number;
    selectedCount: number;
    decisionVersion: string;
    provider: ToolProvider;
  };
}> {
  const catalog = await loadCatalog();
  const policy = loadPolicy();
  const profile = input.profile ?? 'intent';
  const phase = input.taskContext?.phase ?? 'read';
  const phasePolicy = policy.phases[phase];
  const featureMap = normalizeFeatures(input.documentFeatures);

  const maxTools = Math.max(1, input.budget?.maxTools ?? policy.defaults.maxToolsByProfile[profile]);
  const minReadTools = Math.max(0, input.budget?.minReadTools ?? policy.defaults.minReadTools);

  const includeCategories = new Set(input.policy?.includeCategories ?? phasePolicy.include);
  const excludeCategories = new Set([...(input.policy?.excludeCategories ?? []), ...phasePolicy.exclude]);
  const allowMutatingTools = input.policy?.allowMutatingTools ?? phase === 'mutate';

  const excluded: Array<{ toolName: string; reason: string }> = [];
  const profileTools = catalog.profiles[profile].tools;
  const indexByToolName = new Map(profileTools.map((tool) => [tool.toolName, tool]));

  let candidates = profileTools.filter((tool) => {
    if (tool.requiredCapabilities.some((capability) => !featureMap[capability])) {
      excluded.push({ toolName: tool.toolName, reason: 'missing-required-capability' });
      return false;
    }

    if (!allowMutatingTools && tool.mutates) {
      excluded.push({ toolName: tool.toolName, reason: 'mutations-disabled' });
      return false;
    }

    if (includeCategories.size > 0 && !includeCategories.has(tool.category)) {
      excluded.push({ toolName: tool.toolName, reason: 'category-not-included' });
      return false;
    }

    if (excludeCategories.has(tool.category)) {
      excluded.push({ toolName: tool.toolName, reason: 'phase-category-excluded' });
      return false;
    }

    return true;
  });

  const forceExclude = new Set(input.policy?.forceExclude ?? []);
  candidates = candidates.filter((tool) => {
    if (!forceExclude.has(tool.toolName)) return true;
    excluded.push({ toolName: tool.toolName, reason: 'force-excluded' });
    return false;
  });

  for (const forcedToolName of input.policy?.forceInclude ?? []) {
    const forced = indexByToolName.get(forcedToolName);
    if (!forced) {
      excluded.push({ toolName: forcedToolName, reason: 'not-in-profile' });
      continue;
    }
    candidates.push(forced);
  }

  candidates = [...new Map(candidates.map((tool) => [tool.toolName, tool])).values()];

  const selected: ToolCatalogEntry[] = [];
  const foundationalIds = new Set(policy.defaults.foundationalOperationIds);
  const foundational = candidates.filter((tool) => foundationalIds.has(tool.operationId));
  for (const tool of foundational) {
    if (selected.length >= minReadTools || selected.length >= maxTools) break;
    selected.push(tool);
  }

  const remaining = stableSortByPhasePriority(
    candidates.filter((tool) => !selected.some((entry) => entry.toolName === tool.toolName)),
    phasePolicy.priority,
  );

  for (const tool of remaining) {
    if (selected.length >= maxTools) {
      excluded.push({ toolName: tool.toolName, reason: 'budget-trim' });
      continue;
    }
    selected.push(tool);
  }

  const bundle = await loadProviderBundle(input.provider);
  const providerTools = Array.isArray(bundle.profiles[profile]) ? bundle.profiles[profile] : [];
  const providerIndex = new Map(
    providerTools
      .filter((tool): tool is Record<string, unknown> => isRecord(tool))
      .map((tool) => [extractProviderToolName(tool), tool] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => entry[0] !== null),
  );

  const selectedProviderTools = selected
    .map((tool) => providerIndex.get(tool.toolName))
    .filter((tool): tool is Record<string, unknown> => Boolean(tool));

  return {
    tools: selectedProviderTools,
    selected: selected.map((tool) => ({
      operationId: tool.operationId,
      toolName: tool.toolName,
      category: tool.category,
      mutates: tool.mutates,
      profile: tool.profile,
    })),
    excluded,
    selectionMeta: {
      profile,
      phase,
      maxTools,
      minReadTools,
      selectedCount: selected.length,
      decisionVersion: policy.defaults.chooserDecisionVersion,
      provider: input.provider,
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
