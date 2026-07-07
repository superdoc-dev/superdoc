/**
 * `core` preset — actions-only LLM-facing surface.
 *
 * Two advertised tools: superdoc_inspect (read-only deterministic snapshots)
 * and superdoc_perform_action (named, statically validated, deterministic edit
 * verbs — the action registry in agent/actions.ts).
 *
 * superdoc_execute_code (model-authored JS against a synchronous in-host doc)
 * is WIP: dispatchable for SDK callers, NOT advertised and NOT in the served
 * system prompt until it ships behind a safety flag. The agent_apply /
 * agent_verify / agent_operation tools are likewise dispatchable but never
 * advertised.
 *
 * @internal
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundDocApi } from '../generated/client.js';
import type { InvokeOptions, OperationSpec } from '../runtime/process.js';
import { SuperDocCliError } from '../runtime/errors.js';
import {
  AGENT_TOOL_DEFINITIONS,
  isAgentToolName,
  listAgentTools,
  validateExclusions,
  PUBLIC_AGENT_TOOL_NAMES,
  type AgentToolName,
} from '../agent/catalog.js';
import { agentApply, agentInspect, agentOperation, agentVerify, type AgentReceipt } from '../agent/runtime.js';
import { superdocPerformAction } from '../agent/actions.js';
import type {
  CacheStrategy,
  GetSystemPromptOptions,
  GetToolsOptions,
  GetToolsResult,
  PresetDescriptor,
  ToolCatalog,
  ToolCatalogEntry,
  ToolProvider,
} from '../presets.js';
import { EMBEDDED_PROMPTS } from '../embedded-prompts.generated.js';

// Prompts ship as <dist>/prompts/*.md. Resolve relative to the compiled
// module, but the module's depth differs by build: in the SDK package this
// file is dist/presets/core.js (so prompts are at ../prompts), while the
// bundled CLI inlines it into dist/index.js (so prompts are at ./prompts).
// Try both so getSystemPrompt works through the SDK AND the CLI host (the
// path the Python SDK proxies through).
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR_CANDIDATES = [path.resolve(MODULE_DIR, '..', 'prompts'), path.resolve(MODULE_DIR, 'prompts')];

let _actionsOnlyPromptCache: string | null = null;
let _mcpPromptCache: string | null = null;

/** Exported for unit tests; production callers use the default candidates. */
export async function readPromptFile(
  fileName: string,
  label: string,
  candidateDirs: readonly string[] = PROMPT_DIR_CANDIDATES,
): Promise<string> {
  const tried: string[] = [];
  let lastIoError: NodeJS.ErrnoException | undefined;
  for (const dir of candidateDirs) {
    const promptPath = path.join(dir, fileName);
    tried.push(promptPath);
    try {
      return await readFile(promptPath, 'utf8');
    } catch (err) {
      const ioError = err as NodeJS.ErrnoException;
      if (ioError?.code !== 'ENOENT') {
        // Permission/IO failures are not "asset missing" — remember the real
        // cause, but still try the other layout candidate.
        lastIoError = ioError;
      }
    }
  }
  // Filesystem candidates exhausted. Native binaries (bun --compile) resolve
  // MODULE_DIR inside bun's virtual filesystem where the .md assets don't
  // exist — fall back to the compiled-in copies (identical content by
  // construction; a drift test enforces it).
  const embedded = EMBEDDED_PROMPTS[fileName];
  if (typeof embedded === 'string') {
    return embedded;
  }
  if (lastIoError) {
    throw new SuperDocCliError(`${label} could not be read: ${lastIoError.message}`, {
      code: 'TOOLS_ASSET_UNREADABLE',
      details: { triedPaths: tried, cause: `${lastIoError.code ?? lastIoError.name}: ${lastIoError.message}` },
    });
  }
  throw new SuperDocCliError(`${label} not found.`, {
    code: 'TOOLS_ASSET_NOT_FOUND',
    details: { triedPaths: tried },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isObviouslyCorruptedToolArgKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length === 0 || !/[\p{L}\p{N}]/u.test(trimmed);
}

function stripCorruptedToolArgKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripCorruptedToolArgKeys(item));
  }
  if (!isRecord(value)) return value;
  const clean: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (isObviouslyCorruptedToolArgKey(key)) continue;
    clean[key] = stripCorruptedToolArgKeys(entryValue);
  }
  return clean;
}

function validateAgentToolArgs(toolName: AgentToolName, args: Record<string, unknown>): void {
  const definition = AGENT_TOOL_DEFINITIONS.find((entry) => entry.name === toolName);
  if (definition == null) return;
  const schema = definition.inputSchema;
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const knownKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new SuperDocCliError(`Unknown argument(s) for ${toolName}: ${unknownKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, unknownKeys, knownKeys: [...knownKeys] },
    });
  }
  const missingKeys = (required as string[]).filter((key) => args[key] == null);
  if (missingKeys.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${toolName}: ${missingKeys.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, missingKeys },
    });
  }
}

// ---------------------------------------------------------------------------
// Compaction helpers — keep agent receipts tight in the tool-result payload
// ---------------------------------------------------------------------------

/**
 * Max entries for per-item receipt lists (executedOperations, selectedTargets).
 * Receipts live in the conversation and are re-billed as prompt tokens on every
 * subsequent turn; unbounded lists (one op per formatted range/paragraph) made
 * single receipts cost thousands of tokens. 8 keeps enough shape to audit while
 * the accompanying *Count field preserves the true total.
 */
const RECEIPT_LIST_CAP = 8;

function compactCountMap(counts: Record<string, unknown>): Record<string, number> {
  const compact: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === 'number' && value !== 0) compact[key] = value;
  }
  if (Object.keys(compact).length === 0 && typeof counts.blocks === 'number') {
    compact.blocks = counts.blocks;
  }
  return compact;
}

function pickScalarFields(
  value: unknown,
  keys?: readonly string[],
  limit = 6,
): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return {};
  const entries = keys
    ? keys.filter((key) => key in value).map((key) => [key, value[key]] as const)
    : Object.entries(value);
  const compact: Record<string, string | number | boolean | null> = {};
  for (const [key, entryValue] of entries) {
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean' ||
      entryValue == null
    ) {
      compact[key] = entryValue ?? null;
    }
    if (Object.keys(compact).length >= limit) break;
  }
  return compact;
}

function compactOperationResult(result: unknown): unknown {
  if (result == null || typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
    return result;
  }
  if (Array.isArray(result)) return { itemCount: result.length };
  if (!isRecord(result)) return { kind: typeof result };
  const compact: Record<string, unknown> = {
    ...pickScalarFields(result, ['success', 'status', 'count', 'total', 'applied', 'created', 'deleted']),
  };
  if (isRecord(result.revision)) {
    const revision = pickScalarFields(result.revision, ['before', 'after', 'current']);
    if (Object.keys(revision).length > 0) compact.revision = revision;
  }
  if (Array.isArray(result.steps)) {
    compact.stepCount = result.steps.length;
    compact.steps = result.steps
      .slice(0, 4)
      .map((step) => (isRecord(step) ? pickScalarFields(step, ['stepId', 'op', 'effect', 'matchCount'], 4) : {}));
  }
  if (Array.isArray(result.items)) compact.itemCount = result.items.length;
  if (Array.isArray(result.changes)) compact.changeCount = result.changes.length;
  if (Array.isArray(result.matches)) compact.matchCount = result.matches.length;
  if (Object.keys(compact).length === 0) return { kind: 'object' };
  return compact;
}

function compactAgentReceipt(receipt: AgentReceipt): Record<string, unknown> {
  // Compact the known heavy fields; pass every action-specific evidence field
  // (editsApplied, marker, placement, revertHint, recovery, …) through
  // verbatim — truth-telling receipts are only useful if the model sees them.
  const {
    status,
    intent,
    preSnapshot,
    postSnapshot,
    selectedTargets,
    executedOperations,
    verification,
    saveReopen,
    errors,
    ...evidence
  } = receipt;
  return {
    status,
    intent,
    ...(preSnapshot
      ? {
          preSnapshot: {
            revision: preSnapshot.revision,
            ...(preSnapshot.counts ? { counts: compactCountMap(preSnapshot.counts as Record<string, unknown>) } : {}),
          },
        }
      : {}),
    ...(postSnapshot
      ? {
          postSnapshot: {
            revision: postSnapshot.revision,
            ...(postSnapshot.counts ? { counts: compactCountMap(postSnapshot.counts as Record<string, unknown>) } : {}),
          },
        }
      : {}),
    ...(selectedTargets
      ? {
          // Cap per-item lists: batch actions (add_comments selectors[],
          // whole-body formatting) can select hundreds of targets, and the
          // receipt is re-sent in conversation history on EVERY later turn.
          // The count carries the evidence; the head carries the shape.
          selectedTargets: selectedTargets.slice(0, RECEIPT_LIST_CAP).map((target) => ({
            selector: target.selector,
            matchedCount: target.matched.length,
          })),
          ...(selectedTargets.length > RECEIPT_LIST_CAP ? { selectedTargetCount: selectedTargets.length } : {}),
        }
      : {}),
    ...(executedOperations
      ? {
          // Same cap: per-range/per-item actions (format_text on every
          // occurrence, whole-body set_font_family) execute one op per item —
          // an uncapped list dominates the token cost of the receipt.
          executedOperations: executedOperations.slice(0, RECEIPT_LIST_CAP).map((operation) => ({
            operationId: operation.operationId,
            ...(operation.rationale ? { rationale: operation.rationale } : {}),
            ...(operation.result !== undefined ? { result: compactOperationResult(operation.result) } : {}),
          })),
          ...(executedOperations.length > RECEIPT_LIST_CAP
            ? { executedOperationCount: executedOperations.length }
            : {}),
        }
      : {}),
    ...(verification
      ? {
          verificationPassed: verification.every((entry) => entry.passed),
          verification: verification.map((entry) => ({
            check: pickScalarFields(entry.check, undefined, 6),
            passed: entry.passed,
            ...(entry.detail ? { detail: entry.detail } : {}),
          })),
        }
      : {}),
    ...(saveReopen ? { saveReopen } : {}),
    ...(errors ? { errors } : {}),
    ...evidence,
  };
}

// ---------------------------------------------------------------------------
// superdoc_execute_code — in-host dispatch for the CLI/SDK-only `doc.executeCode` op
// ---------------------------------------------------------------------------

const EXECUTE_CODE_SPEC: OperationSpec = {
  operationId: 'doc.executeCode',
  commandTokens: ['execute', 'code'],
  params: [
    { name: 'sessionId', kind: 'flag', flag: 'session', type: 'string' },
    { name: 'code', kind: 'flag', flag: 'code', type: 'string' },
  ],
};

type RawOperationCapable = {
  invokeRawOperation: <TData = unknown>(
    operation: OperationSpec,
    params?: Record<string, unknown>,
    options?: InvokeOptions,
  ) => Promise<TData>;
};

function asRawOperationCapable(documentHandle: BoundDocApi): RawOperationCapable {
  const candidate = documentHandle as unknown as Partial<RawOperationCapable>;
  if (typeof candidate.invokeRawOperation !== 'function') {
    throw new SuperDocCliError(
      'superdoc_execute_code requires a session-bound document handle from client.open(); the provided handle cannot dispatch CLI/SDK-only operations.',
      {
        code: 'TOOL_DISPATCH_NOT_FOUND',
        details: { toolName: 'superdoc_execute_code' },
      },
    );
  }
  return candidate as RawOperationCapable;
}

async function dispatchExecuteCode(
  documentHandle: BoundDocApi,
  args: Record<string, unknown>,
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  const code = typeof args.code === 'string' ? args.code : '';
  // The generated bound client exposes doc.executeCode directly — use it.
  // The invokeRawOperation path predates that binding and no handle produced
  // by client.open() implements it; it remains only for callers that inject
  // their own raw-capable handle.
  const direct = (
    documentHandle as {
      executeCode?: (params: { code: string }, options?: InvokeOptions) => Promise<unknown>;
    }
  ).executeCode;
  if (typeof direct === 'function') {
    return direct.call(documentHandle, { code }, invokeOptions);
  }
  const runner = asRawOperationCapable(documentHandle);
  return runner.invokeRawOperation(EXECUTE_CODE_SPEC, { code }, invokeOptions);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function dispatchAgentTool(
  documentHandle: BoundDocApi,
  toolName: AgentToolName,
  args: Record<string, unknown>,
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  switch (toolName) {
    case 'superdoc_inspect':
      return agentInspect(documentHandle, args);
    case 'agent_apply':
      return compactAgentReceipt(await agentApply(documentHandle, args as Parameters<typeof agentApply>[1]));
    case 'agent_verify':
      return compactAgentReceipt(await agentVerify(documentHandle, args as Parameters<typeof agentVerify>[1]));
    case 'agent_operation':
      return agentOperation(documentHandle, args as Parameters<typeof agentOperation>[1]);
    case 'superdoc_perform_action':
      return compactAgentReceipt(await superdocPerformAction(documentHandle, args));
    case 'superdoc_execute_code':
      return dispatchExecuteCode(documentHandle, args, invokeOptions);
  }
  throw new SuperDocCliError(`Unknown agent tool: ${toolName}`, {
    code: 'TOOL_DISPATCH_NOT_FOUND',
    details: { toolName },
  });
}

// ---------------------------------------------------------------------------
// Provider cache markers — mirrors the legacy preset
// ---------------------------------------------------------------------------

function applyCacheMarkers(tools: unknown[], provider: ToolProvider, cacheRequested: boolean): GetToolsResult {
  if (!cacheRequested) return { tools, cacheStrategy: 'disabled' };
  if (provider === 'anthropic') {
    if (tools.length === 0) return { tools, cacheStrategy: 'explicit' };
    const next = tools.slice(0, -1);
    const last = {
      ...(tools[tools.length - 1] as Record<string, unknown>),
      cache_control: { type: 'ephemeral' },
    };
    next.push(last);
    return { tools: next, cacheStrategy: 'explicit' as CacheStrategy };
  }
  if (provider === 'openai') return { tools, cacheStrategy: 'automatic' };
  return { tools, cacheStrategy: 'unsupported' };
}

// ---------------------------------------------------------------------------
// PresetDescriptor surface
// ---------------------------------------------------------------------------

async function coreGetTools(provider: ToolProvider, options?: GetToolsOptions): Promise<GetToolsResult> {
  const tools = listAgentTools(provider, { excludeActions: options?.excludeActions });
  return applyCacheMarkers(tools, provider, options?.cache === true);
}

async function coreGetCatalog(): Promise<ToolCatalog> {
  // Synthetic catalog — describes the advertised LLM-facing tools.
  const publicSet = new Set<string>(PUBLIC_AGENT_TOOL_NAMES);
  const tools: ToolCatalogEntry[] = AGENT_TOOL_DEFINITIONS.filter((d) => publicSet.has(d.name)).map((d) => ({
    toolName: d.name,
    description: d.description,
    inputSchema: d.inputSchema as unknown as Record<string, unknown>,
    mutates: d.name !== 'superdoc_inspect',
    operations: [],
  }));
  return {
    contractVersion: 'core/v2',
    generatedAt: null,
    toolCount: tools.length,
    tools,
  };
}

/**
 * Drop the per-action documentation lines for excluded actions. Entries render
 * as single "- name: ..." lines (the drift-guard test enforces the format), so
 * line-level filtering is deterministic. Prose cross-references elsewhere in
 * the prompt are left alone — a mention costs a few tokens; a full per-action
 * manual for an uncallable action teaches the model to call it.
 */
function stripExcludedActionLines(prompt: string, excludedActions: ReadonlySet<string>): string {
  if (excludedActions.size === 0) return prompt;
  return prompt
    .split('\n')
    .filter((line) => {
      const match = /^- ([a-z_]+)(?: \/ ([a-z_]+))?:/.exec(line);
      if (!match) return true;
      const names = [match[1], match[2]].filter((n): n is string => Boolean(n));
      // Drop the line only when EVERY action it documents is excluded (the
      // paired accept/reject line survives if one side remains callable).
      return !names.every((name) => excludedActions.has(name));
    })
    .join('\n');
}

async function coreGetSystemPrompt(options?: GetSystemPromptOptions): Promise<string> {
  const { excludedActions } = validateExclusions({ excludeActions: options?.excludeActions });
  // The core preset is ACTIONS-ONLY: superdoc_execute_code is WIP and not
  // advertised, and the prompt documents only the action surface (this exact
  // prompt is what the eval suite validates). Code-execution guidance will be
  // added when the safety-flag work ships that tool.
  if (_actionsOnlyPromptCache == null) {
    _actionsOnlyPromptCache = await readPromptFile('system-prompt.md', 'Core system prompt');
  }
  return stripExcludedActionLines(_actionsOnlyPromptCache, excludedActions);
}

async function coreGetMcpPrompt(): Promise<string> {
  if (_mcpPromptCache == null) {
    _mcpPromptCache = await readPromptFile('mcp-prompt.md', 'MCP system prompt');
  }
  return _mcpPromptCache;
}

async function coreDispatch(
  documentHandle: BoundDocApi,
  toolName: string,
  args: Record<string, unknown>,
  invokeOptions?: InvokeOptions,
): Promise<unknown> {
  if (!isRecord(args)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }
  const sanitizedArgs = stripCorruptedToolArgKeys(args);
  if (!isRecord(sanitizedArgs)) {
    throw new SuperDocCliError(`Tool arguments for ${toolName} must be an object.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName },
    });
  }
  // Defense-in-depth for exclusion configs: a host that narrowed the advertised
  // surface (getTools excludeActions) can pass the same list here so a
  // guessed/injected call to an excluded action is refused, not run.
  const exclusionOptions = invokeOptions as (InvokeOptions & { excludeActions?: readonly string[] }) | undefined;
  if (
    toolName === 'superdoc_perform_action' &&
    typeof sanitizedArgs.action === 'string' &&
    exclusionOptions?.excludeActions?.includes(sanitizedArgs.action)
  ) {
    throw new SuperDocCliError(`Action ${sanitizedArgs.action} is excluded by configuration.`, {
      code: 'INVALID_ARGUMENT',
      details: { toolName, action: sanitizedArgs.action, excluded: true },
    });
  }
  let forwardOptions = invokeOptions;
  if (exclusionOptions && 'excludeActions' in exclusionOptions) {
    const { excludeActions: _ea, ...rest } = exclusionOptions;
    forwardOptions = rest as InvokeOptions;
  }
  if (isAgentToolName(toolName)) {
    validateAgentToolArgs(toolName, sanitizedArgs);
    return dispatchAgentTool(documentHandle, toolName, sanitizedArgs, forwardOptions);
  }
  throw new SuperDocCliError(`Unknown tool: ${toolName}`, {
    code: 'TOOL_DISPATCH_NOT_FOUND',
    details: { toolName, preset: 'core' },
  });
}

export const corePreset: PresetDescriptor = {
  id: 'core',
  description:
    'Actions-only LLM surface: superdoc_inspect (reads) and superdoc_perform_action (named, deterministic edit verbs). superdoc_execute_code exists but is WIP — dispatchable, not advertised.',
  supportsCacheControl: true,

  getTools: coreGetTools,
  getCatalog: coreGetCatalog,
  getSystemPrompt: coreGetSystemPrompt,
  getMcpPrompt: coreGetMcpPrompt,
  dispatch: coreDispatch,
};
