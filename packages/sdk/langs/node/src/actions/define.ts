/**
 * Customer-extensible **custom actions** for the SuperDoc LLM-tools SDK. The
 * canonical ActionSpec has exactly ONE execution tier:
 *
 *   - `steps` — declarative composition of built-in core actions with
 *               {{arg}} templating; dispatches through the base preset and
 *               inherits its target resolution, receipts, and verification.
 *   - `run`   — a native function executed in the CALLER'S process against
 *               the typed session-bound doc handle, with synthesized
 *               truth-telling receipts (pre/post revision, partialMutation).
 *
 * NOTE: a third, IN-HOST tier — a JS function-expression run inside the
 * document host via `superdoc_execute_code` — is intentionally not part of the
 * kit yet. It lands together with the code-act execution path (and its safety
 * envelope); until then the kit exposes only `steps` and `run`.
 *
 * `extendPreset`/`composePreset` merge custom actions into the
 * superdoc_perform_action enum, tool description, system prompt, and dispatch
 * COHERENTLY — including excludeActions, which may name built-in actions
 * (forwarded to the base) or custom ones (handled by the wrapper). No CLI
 * host changes are required by either tier.
 *
 * Cross-runtime contract: templating semantics, input-schema defaults, and
 * receipt shapes are identical to the Python mirror
 * (`langs/python/superdoc/presets/custom.py`) for any JSON-serializable tool
 * input. (NaN/Infinity/lone-surrogates are out of scope: they cannot appear in
 * a JSON tool call.)
 *
 * @module
 */

import type { BoundDocApi } from '../generated/client.js';
import type { InvokeOptions } from '../runtime/process.js';
import { SuperDocCliError } from '../runtime/errors.js';
import {
  getPreset,
  type GetSystemPromptOptions,
  type GetToolsOptions,
  type GetToolsResult,
  type PresetDescriptor,
  type ToolCatalog,
  type ToolCatalogEntry,
  type ToolProvider,
} from '../presets.js';
import { ACTION_NAMES_LIST } from '../agent/actions.js';
import { AGENT_TOOL_NAMES, buildPerformActionDefinition } from '../agent/catalog.js';

// ---------------------------------------------------------------------------
// ActionSpec — the shared contract (identical fields in Node & Python)
// ---------------------------------------------------------------------------

/** Minimal JSON Schema object describing a action's flat args. */
export type JSONSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

/**
 * One step of a declarative (`steps`-tier) custom action: an existing built-in
 * core action plus its args. String values may reference the custom action's
 * own args with `{{name}}` templates — a whole-string `"{{x}}"` substitutes the
 * raw value (preserving arrays/objects/numbers), a partial `"...{{x}}..."`
 * interpolates as text.
 */
export type ActionStep = {
  action: string;
  args?: Record<string, unknown>;
};

/**
 * The shared, language-neutral custom-action contract — the canonical type.
 *
 * - `name` — namespaced "<ns>.<verb>" (e.g. "footnotes.add"). MUST NOT collide
 *   with a built-in core action name.
 * - `description` — shown to the model.
 * - `inputSchema` — JSON Schema for the FLAT args (NOT the `action`
 *   discriminator key). `properties.*.default` values are applied before
 *   execution on every tier.
 *
 * Exactly ONE execution tier is set:
 *
 * - `steps` — DECLARATIVE (recommended): a sequence of built-in core actions
 *   with `{{arg}}` templating. Dispatches through the base preset, so it
 *   inherits target resolution, placement handling, receipts, and
 *   verification. Pure data — serializable, cross-language by construction.
 * - `run` — NATIVE escape hatch: an async function executed in the caller's
 *   process against the typed session-bound doc handle. Receipts are
 *   synthesized (pre/post revision, partialMutation, recovery).
 */
export interface ActionSpec {
  name: string;
  description: string;
  inputSchema: JSONSchemaObject;
  steps?: readonly ActionStep[];
  run?: (doc: BoundDocApi, args: Record<string, unknown>) => unknown;
}

/** Which execution tier a spec uses. */
export function executionKindOf(spec: ActionSpec): 'steps' | 'run' {
  return Array.isArray(spec.steps) ? 'steps' : 'run';
}

const BUILTIN_ACTION_NAMES: ReadonlySet<string> = new Set<string>(ACTION_NAMES_LIST);

// ---------------------------------------------------------------------------
// defineAction — author a ActionSpec
// ---------------------------------------------------------------------------

type DefineActionInputBase = {
  name: string;
  description: string;
  /**
   * JSON Schema object describing the action's flat args. Pass a plain JSON
   * Schema (`{ type: 'object', properties: {...} }`). Zod (and other schema
   * libraries) are NOT accepted directly — convert first, e.g. with
   * `zod-to-json-schema` — otherwise `defineAction` throws a clear error rather
   * than silently dropping your types.
   */
  input?: JSONSchemaObject | Record<string, unknown>;
};

type DefineActionWithSteps = DefineActionInputBase & {
  /** Declarative tier: built-in core actions with {{arg}} templating. */
  steps: readonly ActionStep[];
  run?: never;
};

type DefineActionWithRun = DefineActionInputBase & {
  /**
   * Native tier: runs IN THE CALLER'S PROCESS against the typed session-bound
   * doc handle (async `doc.*` client API).
   */
  run: (doc: BoundDocApi, args: Record<string, unknown>) => unknown;
  steps?: never;
};

export type DefineActionInput = DefineActionWithSteps | DefineActionWithRun;

function isJsonSchemaObject(value: unknown): value is JSONSchemaObject {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'object'
  );
}

/**
 * Normalize the `input` field to a JSON Schema object. We take NO schema-library
 * dependency: a Zod (or Zod-like) schema is rejected with a clear, actionable
 * error instead of being silently accepted with its types dropped — the caller
 * converts it first (e.g. `zod-to-json-schema`). A plain JSON Schema object is
 * the primary path; a bare properties bag is wrapped for convenience.
 */
function coerceInputSchema(input: DefineActionInput['input']): JSONSchemaObject {
  if (input == null) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  // Zod / Zod-like schemas expose `_def` (and usually `.parse`/`.safeParse`).
  // Reject clearly rather than half-supporting them (dropping constraints).
  // Checked BEFORE isJsonSchemaObject so a library schema can never slip through.
  const duck = input as { _def?: unknown; parse?: unknown; safeParse?: unknown };
  if (duck._def != null || typeof duck.parse === 'function' || typeof duck.safeParse === 'function') {
    throw new SuperDocCliError(
      'defineAction `input` must be a JSON Schema object, not a Zod (or other library) schema. ' +
        'Convert it first, e.g. `import { zodToJsonSchema } from "zod-to-json-schema"; ' +
        'defineAction({ input: zodToJsonSchema(mySchema), ... })`.',
      { code: 'INVALID_ARGUMENT' },
    );
  }
  if (isJsonSchemaObject(input)) {
    // A valid object schema may legally omit `properties` (an open schema like
    // `{ type: 'object', additionalProperties: true }`). The declared type makes
    // `properties` required and every consumer (and the Python mirror) assumes
    // it exists, so normalize a missing/non-object bag to {}.
    return isRecord((input as { properties?: unknown }).properties) ? input : { ...input, properties: {} };
  }
  // A bare properties bag — wrap it.
  return { type: 'object', properties: input as Record<string, unknown>, additionalProperties: true };
}

/**
 * Author a {@link ActionSpec}. Pass exactly one execution tier: `steps`
 * (declarative — recommended) or `run` (native function in your process).
 */
export function defineAction(input: DefineActionInput): ActionSpec {
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new SuperDocCliError('defineAction requires a non-empty `name`.', {
      code: 'INVALID_ARGUMENT',
      details: { input: 'name' },
    });
  }
  if (typeof input.description !== 'string') {
    throw new SuperDocCliError(`defineAction "${input.name}" requires a string \`description\`.`, {
      code: 'INVALID_ARGUMENT',
      details: { name: input.name },
    });
  }
  const tiers: Array<'steps' | 'run'> = [];
  if (Array.isArray(input.steps)) tiers.push('steps');
  if (typeof input.run === 'function') tiers.push('run');
  if (tiers.length !== 1) {
    throw new SuperDocCliError(
      `defineAction "${input.name}" requires exactly one of \`steps\` or \`run\` (got ${tiers.length === 0 ? 'none' : tiers.join(' + ')}).`,
      { code: 'INVALID_ARGUMENT', details: { name: input.name, tiers } },
    );
  }
  const spec: ActionSpec = {
    name: input.name,
    description: input.description,
    inputSchema: coerceInputSchema(input.input),
  };
  if (tiers[0] === 'steps') {
    const steps = input.steps as readonly ActionStep[];
    if (steps.length === 0) {
      throw new SuperDocCliError(`defineAction "${input.name}": \`steps\` must be a non-empty array.`, {
        code: 'INVALID_ARGUMENT',
        details: { name: input.name },
      });
    }
    steps.forEach((step, index) => {
      if (step == null || typeof step.action !== 'string' || step.action.length === 0) {
        throw new SuperDocCliError(
          `defineAction "${input.name}": steps[${index}] needs a non-empty \`action\` string.`,
          { code: 'INVALID_ARGUMENT', details: { name: input.name, index } },
        );
      }
      if (!BUILTIN_ACTION_NAMES.has(step.action)) {
        throw new SuperDocCliError(
          `defineAction "${input.name}": steps[${index}].action "${step.action}" is not a built-in core action. Steps compose built-in actions only; use the \`run\` tier for anything else.`,
          { code: 'INVALID_ARGUMENT', details: { name: input.name, index, action: step.action } },
        );
      }
      if (step.args != null && !isRecord(step.args)) {
        throw new SuperDocCliError(`defineAction "${input.name}": steps[${index}].args must be an object.`, {
          code: 'INVALID_ARGUMENT',
          details: { name: input.name, index },
        });
      }
    });
    spec.steps = steps.map((step) => ({ action: step.action, args: { ...(step.args ?? {}) } }));
  } else {
    spec.run = (input as DefineActionWithRun).run;
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Codegen — identical to the Python mirror for JSON-serializable tool inputs
// (the only values a tool call can carry; NaN/Infinity/lone-surrogates are out
// of scope and serialize differently across Node and Python).

// ---------------------------------------------------------------------------
// Collision / duplicate validation
// ---------------------------------------------------------------------------

/**
 * Provider tool-name rule. OpenAI/Anthropic require tool names to match
 * `^[A-Za-z0-9_-]{1,64}$` — dots are invalid. This only matters in STANDALONE
 * mode, where the action name becomes a tool name; in MERGED mode the name is
 * an enum VALUE (dots are fine).
 */
const PROVIDER_SAFE_TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Tool names of the agent surface itself — a custom action must never shadow one. */
const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set<string>(AGENT_TOOL_NAMES);

/**
 * Shared by extendPreset and composePreset: excludeActions may name BUILT-IN
 * actions (forwarded to the base, which validates them) or CUSTOM actions
 * (handled by the wrapper — the base would reject names it doesn't know).
 * Both halves narrow tools, prompt, and dispatch together, preserving the
 * kit's coherence guarantee.
 */
function splitCustomExclusions(
  byName: ReadonlyMap<string, ActionSpec>,
  list: readonly string[] | undefined,
): { customExcluded: Set<string>; builtinExcluded: readonly string[] | undefined } {
  if (!list || list.length === 0) return { customExcluded: new Set(), builtinExcluded: undefined };
  const customExcluded = new Set<string>();
  const builtin: string[] = [];
  for (const name of list) {
    if (byName.has(name)) customExcluded.add(name);
    else builtin.push(name);
  }
  return { customExcluded, builtinExcluded: builtin.length > 0 ? builtin : undefined };
}

/** Defense-in-depth refusal shared by both wrappers' dispatchers. */
function throwExcludedAction(toolName: string, actionName: string, extra: Record<string, unknown> = {}): never {
  throw new SuperDocCliError(`Action ${actionName} is excluded by configuration.`, {
    code: 'INVALID_ARGUMENT',
    details: { toolName, action: actionName, excluded: true, ...extra },
  });
}

/**
 * Drop surface `excludeActions` from invoke options before INTERNAL step
 * dispatch. Those exclusions govern what the MODEL may call directly (the
 * top-level dispatch already enforced them); a steps-tier custom action is an
 * authored composition whose steps must run even when a built-in they compose
 * is hidden from the model. Everything else in invokeOptions passes through.
 */
function stripSurfaceExclusions(invokeOptions?: InvokeOptions): InvokeOptions | undefined {
  if (!invokeOptions || !('excludeActions' in (invokeOptions as Record<string, unknown>))) return invokeOptions;
  const { excludeActions: _dropped, ...rest } = invokeOptions as InvokeOptions & { excludeActions?: unknown };
  return rest as InvokeOptions;
}

function assertActionsValid(actions: readonly ActionSpec[], presetId: string, standalone = false): void {
  const seen = new Set<string>();
  for (const action of actions) {
    // Raw spec objects can bypass defineAction — re-validate the tier shape
    // here so a hand-rolled {steps: []} can't fabricate succeeded receipts.
    const tiers = [
      Array.isArray(action.steps) ? 'steps' : null,
      typeof action.run === 'function' ? 'run' : null,
    ].filter((tier): tier is string => tier != null);
    if (tiers.length !== 1) {
      throw new SuperDocCliError(
        `Custom action "${action.name}" must have exactly one of steps/run (got ${tiers.length === 0 ? 'none' : tiers.join(' + ')}).`,
        { code: 'INVALID_ARGUMENT', details: { presetId, name: action.name, tiers } },
      );
    }
    if (Array.isArray(action.steps)) {
      if (action.steps.length === 0) {
        throw new SuperDocCliError(`Custom action "${action.name}": steps must be non-empty.`, {
          code: 'INVALID_ARGUMENT',
          details: { presetId, name: action.name },
        });
      }
      for (const [index, step] of action.steps.entries()) {
        if (!step || typeof step.action !== 'string' || !BUILTIN_ACTION_NAMES.has(step.action)) {
          throw new SuperDocCliError(
            `Custom action "${action.name}": steps[${index}].action must be a built-in core action.`,
            { code: 'INVALID_ARGUMENT', details: { presetId, name: action.name, index } },
          );
        }
      }
    }
    if (BUILTIN_ACTION_NAMES.has(action.name)) {
      throw new SuperDocCliError(
        `Custom action "${action.name}" collides with a built-in core action name. Use a namespaced name like "superdoc.${action.name}".`,
        { code: 'INVALID_ARGUMENT', details: { presetId, name: action.name } },
      );
    }
    if (RESERVED_TOOL_NAMES.has(action.name)) {
      throw new SuperDocCliError(
        `Custom action "${action.name}" collides with a reserved tool name — it would shadow the agent surface itself.`,
        { code: 'INVALID_ARGUMENT', details: { presetId, name: action.name } },
      );
    }
    if (seen.has(action.name)) {
      throw new SuperDocCliError(`Duplicate custom action name "${action.name}" in preset "${presetId}".`, {
        code: 'INVALID_ARGUMENT',
        details: { presetId, name: action.name },
      });
    }
    // In standalone mode the action name becomes a provider tool name, which
    // OpenAI/Anthropic reject unless it matches ^[A-Za-z0-9_-]{1,64}$ (dotted
    // namespaced names are only valid as merged enum VALUES).
    if (standalone && !PROVIDER_SAFE_TOOL_NAME.test(action.name)) {
      throw new SuperDocCliError(
        `standalone action names must match ^[A-Za-z0-9_-]{1,64}$; "${action.name}" has invalid characters — use merged mode for dotted names.`,
        { code: 'INVALID_ARGUMENT', details: { presetId, name: action.name } },
      );
    }
    seen.add(action.name);
  }
}

// ---------------------------------------------------------------------------
// runCustomAction — validate, codegen, dispatch via superdoc_execute_code, map receipt
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Kit-level args every custom action accepts without declaring them. */
const IMPLICIT_ACTION_ARGS = new Set(['changeMode', 'rationale']);

function validateAgainstSchema(action: ActionSpec, args: Record<string, unknown>): void {
  const required = Array.isArray(action.inputSchema.required) ? action.inputSchema.required : [];
  const missing = required.filter((key) => args[key] == null);
  if (missing.length > 0) {
    throw new SuperDocCliError(`Missing required argument(s) for ${action.name}: ${missing.join(', ')}`, {
      code: 'INVALID_ARGUMENT',
      details: { action: action.name, missingKeys: missing },
    });
  }
  const properties = isRecord(action.inputSchema.properties) ? action.inputSchema.properties : {};
  if (action.inputSchema.additionalProperties === false) {
    const unknown = Object.keys(args).filter((key) => !(key in properties) && !IMPLICIT_ACTION_ARGS.has(key));
    if (unknown.length > 0) {
      throw new SuperDocCliError(`Unknown argument(s) for ${action.name}: ${unknown.join(', ')}`, {
        code: 'INVALID_ARGUMENT',
        details: { action: action.name, unknownKeys: unknown, knownKeys: Object.keys(properties) },
      });
    }
  }
  for (const [key, prop] of Object.entries(properties)) {
    const value = args[key];
    if (value !== undefined && isRecord(prop) && Array.isArray(prop.enum) && !prop.enum.includes(value)) {
      throw new SuperDocCliError(
        `Invalid value for ${action.name}.${key}: ${JSON.stringify(value)} (allowed: ${prop.enum.map((entry) => JSON.stringify(entry)).join(', ')})`,
        { code: 'INVALID_ARGUMENT', details: { action: action.name, key, allowed: prop.enum } },
      );
    }
  }
}

/** Fill in `inputSchema.properties.*.default` values for absent args. */
function applyInputDefaults(action: ActionSpec, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const [key, prop] of Object.entries(action.inputSchema.properties ?? {})) {
    if (out[key] === undefined && isRecord(prop) && 'default' in prop) out[key] = prop.default;
  }
  return out;
}

const WHOLE_TEMPLATE = /^\{\{(\w+)\}\}$/;

/**
 * Substitute `{{arg}}` templates in a step's args. A whole-string `"{{x}}"`
 * yields the RAW value (arrays/objects/numbers survive); partial templates
 * interpolate as text. Keys whose whole-string template resolves to undefined
 * are dropped, so optional args don't inject `undefined` into step args.
 */
function substituteTemplates(node: unknown, vars: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    const whole = WHOLE_TEMPLATE.exec(node);
    if (whole) return vars[whole[1]!];
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const value = vars[name];
      // Text interpolation must be byte-identical across Node and Python:
      // strings verbatim, null/undefined → '', everything else compact JSON
      // (true/[1,2]/{"a":1} — NOT String(), whose array/object/boolean forms
      // differ from Python's str()).
      if (value == null) return '';
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }
  if (Array.isArray(node)) {
    // Whole-string templates for ABSENT args are dropped from arrays too —
    // leaving undefined behind would serialize as null (and Python's sentinel
    // would crash the transport).
    return node.map((item) => substituteTemplates(item, vars)).filter((item) => item !== undefined);
  }
  if (isRecord(node)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const substituted = substituteTemplates(value, vars);
      if (substituted !== undefined) out[key] = substituted;
    }
    return out;
  }
  return node;
}

type StepReceiptRow = {
  step: number;
  action: string;
  status: unknown;
  verificationPassed?: unknown;
};

/**
 * `steps` tier — dispatch each built-in step through the base preset and
 * aggregate per-step receipts. Stops at the first failed step; the aggregate
 * status is `partial` when earlier steps landed, `failed` otherwise.
 */
async function runStepsAction(
  base: PresetDescriptor,
  action: ActionSpec,
  documentHandle: BoundDocApi,
  args: Record<string, unknown>,
  invokeOptions?: InvokeOptions,
): Promise<Record<string, unknown>> {
  const vars = args; // defaults already applied by the router
  const rows: StepReceiptRow[] = [];
  // Steps are the author's curated composition, not model calls — surface
  // exclusions must not refuse a built-in the action deliberately composes.
  const stepOptions = stripSurfaceExclusions(invokeOptions);
  for (const [index, step] of (action.steps ?? []).entries()) {
    let stepArgs = substituteTemplates(step.args ?? {}, vars) as Record<string, unknown>;
    // changeMode pass-through: a caller-level changeMode reaches every step
    // that doesn't pin its own.
    if (typeof vars.changeMode === 'string' && stepArgs.changeMode === undefined) {
      stepArgs = { ...stepArgs, changeMode: vars.changeMode };
    }
    let receipt: Record<string, unknown>;
    try {
      const dispatched = await base.dispatch(
        documentHandle,
        'superdoc_perform_action',
        { action: step.action, ...stepArgs },
        stepOptions,
      );
      receipt = isRecord(dispatched) ? dispatched : { status: 'ok', result: dispatched };
    } catch (error) {
      // Validation errors THROW from dispatch; runtime failures come back as
      // failed receipts. Normalize both into the per-step row.
      const err = error as { code?: string; message?: string };
      receipt = { status: 'failed', errors: [{ code: err.code ?? null, message: err.message ?? String(error) }] };
    }
    rows.push({
      step: index,
      action: step.action,
      status: receipt.status,
      ...(receipt.verificationPassed !== undefined ? { verificationPassed: receipt.verificationPassed } : {}),
    });
    if (receipt.status === 'failed') {
      const anyLanded = rows.some((row) => row.status !== 'failed');
      return {
        status: anyLanded ? 'partial' : 'failed',
        action: action.name,
        steps: rows,
        failedStep: { index, receipt },
      };
    }
    // Truthfulness: a step that only PARTIALLY landed (or whose verification
    // disagreed) must not roll up into a clean `succeeded`. Stop and report
    // partial with the evidence — later steps may depend on the missing part.
    if (receipt.status === 'partial' || receipt.verificationPassed === false) {
      return {
        status: 'partial',
        action: action.name,
        steps: rows,
        failedStep: { index, receipt },
      };
    }
  }
  return { status: 'succeeded', action: action.name, steps: rows };
}

/** Read the session revision off a client-side doc handle, if it can. */
async function readRevision(documentHandle: BoundDocApi): Promise<string | null> {
  const info = (documentHandle as { info?: (params: Record<string, unknown>) => Promise<unknown> }).info;
  if (typeof info !== 'function') return null;
  try {
    const result = (await info.call(documentHandle, {})) as { revision?: unknown };
    return result?.revision == null ? null : String(result.revision);
  } catch {
    return null;
  }
}

/**
 * `run` tier — execute the native function in the caller's process against the
 * typed doc handle, synthesizing a truth-telling receipt: pre/post revision,
 * and on failure whether a partial mutation was left behind + a recovery hint.
 */
async function runNativeAction(
  action: ActionSpec,
  documentHandle: BoundDocApi,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const vars = args; // defaults already applied by the router
  const preRevision = await readRevision(documentHandle);
  try {
    const result = await action.run!(documentHandle, vars);
    const postRevision = await readRevision(documentHandle);
    return { status: 'succeeded', action: action.name, result, preRevision, postRevision };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const postRevision = await readRevision(documentHandle);
    const partialMutation = preRevision != null && postRevision != null && preRevision !== postRevision;
    return {
      status: 'failed',
      action: action.name,
      errors: [{ code: err.code ?? null, message: err.message ?? String(error) }],
      preRevision,
      postRevision,
      partialMutation,
      recovery: partialMutation
        ? { kind: 'revert', call: 'superdoc_perform_action {action:"undo_changes"}' }
        : { kind: 'retry' },
    };
  }
}

/** Validate args, then route the custom action to its execution tier. */
async function runCustomAction(
  base: PresetDescriptor,
  action: ActionSpec,
  documentHandle: BoundDocApi,
  rawArgs: Record<string, unknown>,
  invokeOptions?: InvokeOptions,
  fromPerformAction = true,
): Promise<Record<string, unknown>> {
  // `action` is the superdoc_perform_action discriminator ONLY on that route;
  // in standalone mode the action is its own tool, so `action` may be a real
  // declared argument — strip it only when it came in as the discriminator.
  const rawRest: Record<string, unknown> = { ...rawArgs };
  if (fromPerformAction) delete rawRest.action;
  // Apply schema defaults, THEN validate — a required arg with a declared
  // default is satisfiable by the default.
  const args = applyInputDefaults(action, rawRest);
  validateAgainstSchema(action, args);
  return executionKindOf(action) === 'steps'
    ? runStepsAction(base, action, documentHandle, args, invokeOptions)
    : runNativeAction(action, documentHandle, args);
}

// ---------------------------------------------------------------------------
// Tool-list merging — mirror the provider shapes from agent/catalog.ts
// ---------------------------------------------------------------------------

function toolNameOf(tool: unknown): string {
  const t = tool as { name?: string; function?: { name?: string } };
  return t?.function?.name ?? t?.name ?? '';
}

/**
 * Re-apply the Anthropic prompt-cache marker after the tool list was mutated.
 *
 * The base preset places `cache_control: { type: 'ephemeral' }` on its LAST
 * tool. Appending (standalone) or removing tools (composePreset) can leave the
 * marker mid-list or drop it entirely. When the marker is meaningful — provider
 * is anthropic and cache was requested — strip any existing `cache_control` and
 * put it back on the final last tool so the cached prefix stays correct. No-op
 * for other providers / when cache was not requested / on an empty list.
 */
function renormalizeAnthropicCacheMarker(tools: unknown[], provider: ToolProvider, cacheRequested: boolean): unknown[] {
  if (provider !== 'anthropic' || !cacheRequested || tools.length === 0) return tools;
  const stripped = tools.map((tool) => {
    if (!isRecord(tool) || !('cache_control' in tool)) return tool;
    const { cache_control: _drop, ...rest } = tool as Record<string, unknown>;
    return rest;
  });
  const last = stripped[stripped.length - 1];
  stripped[stripped.length - 1] = isRecord(last) ? { ...last, cache_control: { type: 'ephemeral' } } : last;
  return stripped;
}

function customActionsDescription(actions: readonly ActionSpec[]): string {
  return ` Custom actions: ${actions.map((r) => `${r.name} (${r.description})`).join('; ')}.`;
}

/**
 * Merge custom actions into the existing `superdoc_perform_action` tool: append names to
 * the `action` enum, union inputSchema.properties into the tool's properties,
 * and extend the description.
 */
/**
 * Reject a custom arg whose name collides with an existing arg (built-in or an
 * earlier custom action) of a DIFFERENT shape. Merging into one flat
 * `superdoc_perform_action` schema means a single name → one schema; silently
 * keeping the first would advertise one shape for two meanings. Identical
 * re-declarations (same JSON Schema) are allowed — actions may share an arg.
 */
/** Order-insensitive JSON serialization: object keys sorted recursively (array
 *  order preserved — it is semantic for `enum`/`required`). So two schemas that
 *  differ ONLY in key order compare equal. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',');
  return `{${body}}`;
}

/** Documentation-only JSON Schema keywords — differences here never conflict. */
const METADATA_SCHEMA_KEYS: ReadonlySet<string> = new Set(['description', 'title', 'examples', '$comment']);

/** Drop doc-only keys (recursively) so comparison sees just the structural shape. */
function structuralSchema(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(structuralSchema);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (METADATA_SCHEMA_KEYS.has(k)) continue;
    out[k] = structuralSchema(v);
  }
  return out;
}

/** Two arg schemas CONFLICT when they differ in any way EXCEPT documentation
 *  (description/title/examples/$comment): reusing a built-in arg name with your
 *  own description is fine, but a different type, enum (incl. one-sided),
 *  default, limit, pattern, or nested shape is a real conflict — the merged
 *  surface advertises ONE schema per name. */
function argSchemasConflict(a: unknown, b: unknown): boolean {
  return canonicalJson(structuralSchema(a)) !== canonicalJson(structuralSchema(b));
}

function assertNoArgConflict(
  properties: Record<string, unknown>,
  key: string,
  value: unknown,
  actionName: string,
): void {
  if (key in properties && argSchemasConflict(properties[key], value)) {
    throw new SuperDocCliError(
      `Custom action "${actionName}" declares argument "${key}" with a schema that conflicts with an existing ` +
        `argument of the same name on the superdoc_perform_action surface (they differ beyond description). Rename the argument, or match the existing schema exactly.`,
      { code: 'INVALID_ARGUMENT', details: { action: actionName, arg: key } },
    );
  }
}

function mergeIntoAgentAction(tools: unknown[], actions: readonly ActionSpec[]): unknown[] {
  return tools.map((tool) => {
    if (toolNameOf(tool) !== 'superdoc_perform_action') return tool;
    const t = tool as Record<string, unknown>;
    // Provider dialects: openai nests under `function` (`parameters`);
    // anthropic is flat with `input_schema`; the core agent dialect for
    // vercel is flat with `inputSchema`; generic is flat with `parameters`.
    const fn = isRecord(t.function) ? (t.function as Record<string, unknown>) : null;
    const schemaContainer = fn ?? t;
    const schemaKey =
      'input_schema' in schemaContainer
        ? 'input_schema'
        : 'inputSchema' in schemaContainer
          ? 'inputSchema'
          : 'parameters';
    const schema = isRecord(schemaContainer[schemaKey]) ? (schemaContainer[schemaKey] as Record<string, unknown>) : {};
    const properties = isRecord(schema.properties) ? { ...(schema.properties as Record<string, unknown>) } : {};
    const actionProp = isRecord(properties.action) ? { ...(properties.action as Record<string, unknown>) } : {};
    const enumValues = Array.isArray(actionProp.enum) ? [...(actionProp.enum as unknown[])] : [];

    for (const action of actions) {
      if (!enumValues.includes(action.name)) enumValues.push(action.name);
      for (const [key, value] of Object.entries(action.inputSchema.properties ?? {})) {
        assertNoArgConflict(properties, key, value, action.name);
        if (!(key in properties)) properties[key] = value;
      }
    }
    const nextActionProp = { ...actionProp, enum: enumValues };
    const nextSchema = { ...schema, properties: { ...properties, action: nextActionProp } };
    const baseDescription =
      typeof schemaContainer.description === 'string' ? (schemaContainer.description as string) : '';
    const nextDescription = baseDescription + customActionsDescription(actions);
    const nextContainer = { ...schemaContainer, description: nextDescription, [schemaKey]: nextSchema };
    return fn ? { ...t, function: nextContainer } : nextContainer;
  });
}

/**
 * When the base dropped `superdoc_perform_action` entirely (all built-ins
 * excluded / an empty allowlist), active custom actions would be advertised in
 * the prompt and dispatchable — but carried by NO tool. Synthesize a
 * custom-only definition so a curated custom-only preset stays callable.
 */
function synthesizePerformAction(provider: ToolProvider, actions: readonly ActionSpec[]): unknown {
  const properties: Record<string, unknown> = {
    action: { type: 'string', enum: actions.map((action) => action.name) },
  };
  for (const action of actions) {
    for (const [key, value] of Object.entries(action.inputSchema.properties ?? {})) {
      assertNoArgConflict(properties, key, value, action.name);
      if (!(key in properties)) properties[key] = value;
    }
  }
  const schema = { type: 'object', additionalProperties: true, required: ['action'], properties };
  const description =
    "Perform one of this preset's custom document actions. Pick an action and pass its flat arguments." +
    customActionsDescription(actions);
  if (provider === 'anthropic') {
    return { name: 'superdoc_perform_action', description, input_schema: schema };
  }
  if (provider === 'vercel') {
    return { name: 'superdoc_perform_action', description, inputSchema: schema };
  }
  if (provider === 'openai') {
    return { type: 'function', function: { name: 'superdoc_perform_action', description, parameters: schema } };
  }
  return { name: 'superdoc_perform_action', description, parameters: schema };
}

/** Merge into an existing perform_action tool, or synthesize one if the base dropped it. */
function mergeOrSynthesizePerformAction(
  tools: unknown[],
  actions: readonly ActionSpec[],
  provider: ToolProvider,
): unknown[] {
  const hasPerformAction = tools.some((tool) => toolNameOf(tool) === 'superdoc_perform_action');
  if (hasPerformAction) return mergeIntoAgentAction(tools, actions);
  return [...tools, synthesizePerformAction(provider, actions)];
}

/** Build a single provider-shaped standalone tool for a custom action. */
function standaloneTool(provider: ToolProvider, action: ActionSpec): unknown {
  if (provider === 'anthropic') {
    return { name: action.name, description: action.description, input_schema: action.inputSchema };
  }
  // The core agent dialect for vercel is FLAT {name, description, inputSchema}
  // (agent/catalog.ts toVercelTool) — not the OpenAI nested function shape.
  if (provider === 'vercel') {
    return { name: action.name, description: action.description, inputSchema: action.inputSchema };
  }
  if (provider === 'openai') {
    return {
      type: 'function',
      function: { name: action.name, description: action.description, parameters: action.inputSchema },
    };
  }
  // generic
  return { name: action.name, description: action.description, parameters: action.inputSchema };
}

// ---------------------------------------------------------------------------
// extendPreset — wrap a base preset with custom actions
// ---------------------------------------------------------------------------

export interface ExtendPresetOptions {
  /** New preset id. */
  id: string;
  /** Optional description override. */
  description?: string;
  /** Custom actions to add. */
  actions: readonly ActionSpec[];
  /** Wholesale system-prompt addendum; defaults to an auto-generated bullet list. */
  systemPromptExtra?: string;
  /** When true, expose each action as its own tool instead of merging into superdoc_perform_action. */
  standalone?: boolean;
}

function autoSystemPromptSection(actions: readonly ActionSpec[]): string {
  if (actions.length === 0) return '';
  const bullets = actions.map((r) => `- ${r.name} — ${r.description}`).join('\n');
  return `\n\n## Custom actions\n${bullets}`;
}

/**
 * Wrap `getPreset(baseId)` with custom actions. Returns a new
 * {@link PresetDescriptor} that advertises and dispatches the custom actions
 * while delegating everything else to the base preset.
 */
export function extendPreset(baseId: string, options: ExtendPresetOptions): PresetDescriptor {
  const base = getPreset(baseId);
  // Snapshot the caller's array — the preset surface must stay immutable even
  // if discovery/hot-reload code mutates the original list after construction
  // (else getTools/prompt would drift from the byName dispatch map).
  const actions = options.actions ? [...options.actions] : [];
  const standalone = options.standalone === true;
  assertActionsValid(actions, options.id, standalone);
  const byName = new Map(actions.map((r) => [r.name, r] as const));

  const splitExclusions = (list: readonly string[] | undefined) => splitCustomExclusions(byName, list);

  async function getTools(provider: ToolProvider, toolOptions?: GetToolsOptions): Promise<GetToolsResult> {
    const { customExcluded, builtinExcluded } = splitExclusions(toolOptions?.excludeActions);
    const baseOptions = toolOptions ? { ...toolOptions, excludeActions: builtinExcluded } : undefined;
    const result = await base.getTools(provider, baseOptions);
    const activeActions = actions.filter((action) => !customExcluded.has(action.name));
    if (activeActions.length === 0) return result;
    // Only re-place the anthropic marker when the base actually applied one —
    // marking tools for a base that reported 'disabled' would make the marker
    // and the cacheStrategy metadata disagree.
    const cacheRequested = toolOptions?.cache === true && result.cacheStrategy !== 'disabled';
    if (standalone) {
      const extra = activeActions.map((action) => standaloneTool(provider, action));
      const tools = renormalizeAnthropicCacheMarker([...result.tools, ...extra], provider, cacheRequested);
      return { ...result, tools };
    }
    // Merge keeps the same tool count/order, so the marker is unaffected — but
    // re-normalize anyway to stay correct if a base ever reorders.
    const merged = renormalizeAnthropicCacheMarker(
      mergeOrSynthesizePerformAction(result.tools, activeActions, provider),
      provider,
      cacheRequested,
    );
    return { ...result, tools: merged };
  }

  async function getCatalog(): Promise<ToolCatalog> {
    const catalog = await base.getCatalog();
    const extraRows: ToolCatalogEntry[] = actions.map((action) => ({
      toolName: action.name,
      description: action.description,
      inputSchema: action.inputSchema as unknown as Record<string, unknown>,
      mutates: true,
      operations: [],
    }));
    const tools = [...catalog.tools, ...extraRows];
    return { ...catalog, toolCount: tools.length, tools };
  }

  async function getSystemPrompt(promptOptions?: GetSystemPromptOptions): Promise<string> {
    const { customExcluded, builtinExcluded } = splitExclusions(promptOptions?.excludeActions);
    const basePrompt = await base.getSystemPrompt(
      builtinExcluded ? { ...promptOptions, excludeActions: builtinExcluded } : undefined,
    );
    const activeActions = actions.filter((action) => !customExcluded.has(action.name));
    const extra = options.systemPromptExtra ?? autoSystemPromptSection(activeActions);
    return basePrompt + extra;
  }

  async function getMcpPrompt(): Promise<string> {
    const basePrompt = await base.getMcpPrompt();
    const extra = options.systemPromptExtra ?? autoSystemPromptSection(actions);
    return basePrompt + extra;
  }

  async function dispatch(
    documentHandle: BoundDocApi,
    toolName: string,
    args: Record<string, unknown>,
    invokeOptions?: InvokeOptions,
  ): Promise<unknown> {
    // Defense-in-depth parity with core: a host that narrowed the advertised
    // surface passes the same exclusions here, and an excluded CUSTOM action
    // must be refused before it runs (the base can only refuse built-ins).
    const exclusionOptions = invokeOptions as (InvokeOptions & { excludeActions?: readonly string[] }) | undefined;
    const excluded = new Set(exclusionOptions?.excludeActions ?? []);
    // Advertised surface == dispatchable surface: in standalone mode custom
    // actions are advertised as their own tools, so the (unadvertised)
    // perform_action route must not execute them — it falls through to the
    // base, which rejects the unknown action name.
    if (!standalone && toolName === 'superdoc_perform_action' && isRecord(args) && typeof args.action === 'string') {
      const action = byName.get(args.action);
      if (action) {
        if (excluded.has(action.name)) throwExcludedAction(toolName, action.name);
        return runCustomAction(base, action, documentHandle, args, invokeOptions);
      }
    }
    if (standalone && byName.has(toolName)) {
      if (excluded.has(toolName)) throwExcludedAction(toolName, toolName);
      const action = byName.get(toolName)!;
      return runCustomAction(base, action, documentHandle, args, invokeOptions, /* fromPerformAction */ false);
    }
    return base.dispatch(documentHandle, toolName, args, invokeOptions);
  }

  return {
    id: options.id,
    description: options.description ?? `${base.description} + ${actions.length} custom action(s).`,
    supportsCacheControl: base.supportsCacheControl,
    getTools,
    getCatalog,
    getSystemPrompt,
    getMcpPrompt,
    dispatch,
  };
}

// ---------------------------------------------------------------------------
// composePreset — build a preset over core, filtering its surface
// ---------------------------------------------------------------------------

export interface ComposePresetOptions {
  id: string;
  baseId?: string;
  /** When given, restrict the superdoc_perform_action enum to these built-in names ∪ custom names. */
  includeCoreActions?: readonly string[];
  /** When explicitly false, drop the superdoc_execute_code tool from the advertised tools. */
  includeExecuteCode?: boolean;
  actions?: readonly ActionSpec[];
  /** Wholesale system prompt; when omitted, base + custom is used. */
  systemPrompt?: string;
  description?: string;
}

/**
 * Compose a preset over `core` (or another base): optionally filter the
 * `superdoc_perform_action` enum to a subset of built-in actions (∪ custom names), and/or
 * drop `superdoc_execute_code` from the advertised surface. Custom actions still
 * dispatch via the superdoc_execute_code rewrite.
 */
export function composePreset(options: ComposePresetOptions): PresetDescriptor {
  const baseId = options.baseId ?? 'core';
  // Snapshot the caller's array — the preset surface must stay immutable even
  // if discovery/hot-reload code mutates the original list after construction
  // (else getTools/prompt would drift from the byName dispatch map).
  const actions = options.actions ? [...options.actions] : [];
  assertActionsValid(actions, options.id);
  const base = getPreset(baseId);
  const byName = new Map(actions.map((r) => [r.name, r] as const));
  const includeCore = options.includeCoreActions != null ? new Set(options.includeCoreActions) : null;
  if (includeCore) {
    for (const name of includeCore) {
      if (!BUILTIN_ACTION_NAMES.has(name)) {
        throw new SuperDocCliError(`includeCoreActions: unknown action "${name}".`, {
          code: 'INVALID_ARGUMENT',
          details: { presetId: options.id, unknownAction: name },
        });
      }
    }
  }
  const dropExecuteCode = options.includeExecuteCode === false;

  const splitExclusions = (list: readonly string[] | undefined) => splitCustomExclusions(byName, list);

  async function getTools(provider: ToolProvider, toolOptions?: GetToolsOptions): Promise<GetToolsResult> {
    const { customExcluded, builtinExcluded } = splitExclusions(toolOptions?.excludeActions);
    // The allowlist is implemented as a DERIVED exclusion forwarded to the
    // base, so core narrows the enum, the grouped description, AND the
    // advertised argument properties natively — no hand-rebuilt schemas here
    // (a second implementation of that narrowing is exactly what drifts).
    const derivedExcludes = includeCore ? ACTION_NAMES_LIST.filter((name) => !includeCore.has(name)) : [];
    const mergedExcludes = [...new Set([...derivedExcludes, ...(builtinExcluded ?? [])])];
    const baseOptions = {
      ...(toolOptions ?? {}),
      excludeActions: mergedExcludes.length > 0 ? mergedExcludes : undefined,
    };
    const result = await base.getTools(provider, baseOptions);
    let tools = result.tools;
    if (dropExecuteCode) tools = tools.filter((t) => toolNameOf(t) !== 'superdoc_execute_code');
    const activeActions = actions.filter((action) => !customExcluded.has(action.name));
    if (activeActions.length > 0) tools = mergeOrSynthesizePerformAction(tools, activeActions, provider);
    // Dropping superdoc_execute_code can strip the marker off the (former) last tool;
    // re-normalize so the anthropic cached prefix is still correct.
    tools = renormalizeAnthropicCacheMarker(
      tools,
      provider,
      toolOptions?.cache === true && result.cacheStrategy !== 'disabled',
    );
    return { ...result, tools };
  }

  async function getCatalog(): Promise<ToolCatalog> {
    const catalog = await base.getCatalog();
    let rows = catalog.tools;
    if (dropExecuteCode) rows = rows.filter((row) => row.toolName !== 'superdoc_execute_code');
    // Advertised == dispatchable, catalog included: when includeCoreActions
    // narrows the surface, the catalog's superdoc_perform_action row must narrow
    // WITH it — enum, description, AND argument properties — or getToolCatalog()
    // still advertises inputs for actions the preset refuses. Rebuild the row
    // from the SAME builder getTools drives through the base (buildPerform-
    // ActionDefinition), so there is one narrowing implementation, not a second
    // that drifts. Canonical ACTION_NAMES_LIST order matches the getTools row.
    if (includeCore != null) {
      const includedBuiltins = ACTION_NAMES_LIST.filter((name) => includeCore.has(name));
      if (includedBuiltins.length === 0) {
        rows = rows.filter((row) => row.toolName !== 'superdoc_perform_action');
      } else {
        const def = buildPerformActionDefinition(includedBuiltins);
        rows = rows.map((row) =>
          row.toolName === 'superdoc_perform_action'
            ? {
                ...row,
                description: def.description,
                inputSchema: def.inputSchema as unknown as Record<string, unknown>,
              }
            : row,
        );
      }
    }
    const extraRows: ToolCatalogEntry[] = actions.map((action) => ({
      toolName: action.name,
      description: action.description,
      inputSchema: action.inputSchema as unknown as Record<string, unknown>,
      mutates: true,
      operations: [],
    }));
    const tools = [...rows, ...extraRows];
    return { ...catalog, toolCount: tools.length, tools };
  }

  async function getSystemPrompt(promptOptions?: GetSystemPromptOptions): Promise<string> {
    if (typeof options.systemPrompt === 'string') return options.systemPrompt;
    // includeCoreActions narrows the ENUM; the prompt must narrow WITH it —
    // a per-action manual for an uncallable action teaches the model to call
    // it. Derive the excluded built-ins and let the base strip their lines;
    // requested exclusions may also name CUSTOM actions (handled here).
    const { customExcluded, builtinExcluded } = splitExclusions(promptOptions?.excludeActions);
    const derivedExcludes = includeCore ? ACTION_NAMES_LIST.filter((name) => !includeCore.has(name)) : [];
    const merged = [...new Set([...derivedExcludes, ...(builtinExcluded ?? [])])];
    const basePrompt = await base.getSystemPrompt(merged.length > 0 ? { excludeActions: merged } : undefined);
    const activeActions = actions.filter((action) => !customExcluded.has(action.name));
    return basePrompt + autoSystemPromptSection(activeActions);
  }

  async function getMcpPrompt(): Promise<string> {
    if (typeof options.systemPrompt === 'string') return options.systemPrompt;
    const basePrompt = await base.getMcpPrompt();
    return basePrompt + autoSystemPromptSection(actions);
  }

  async function dispatch(
    documentHandle: BoundDocApi,
    toolName: string,
    args: Record<string, unknown>,
    invokeOptions?: InvokeOptions,
  ): Promise<unknown> {
    if (toolName === 'superdoc_perform_action' && isRecord(args) && typeof args.action === 'string') {
      const action = byName.get(args.action);
      if (action) {
        const exclusionOptions = invokeOptions as (InvokeOptions & { excludeActions?: readonly string[] }) | undefined;
        if (exclusionOptions?.excludeActions?.includes(action.name)) {
          throwExcludedAction(toolName, action.name);
        }
        return runCustomAction(base, action, documentHandle, args, invokeOptions);
      }
      // Composition allowlist is a dispatch boundary too: a built-in outside
      // includeCoreActions is not advertised and must not execute on a
      // guessed/stale call (defense-in-depth parity with excludeActions).
      if (includeCore && BUILTIN_ACTION_NAMES.has(args.action) && !includeCore.has(args.action)) {
        throwExcludedAction(toolName, args.action, { excludedBy: 'includeCoreActions' });
      }
    }
    // superdoc_execute_code stays dispatchable internally even when not advertised
    // (mirrors core-actions.ts): the base dispatch still routes it.
    return base.dispatch(documentHandle, toolName, args, invokeOptions);
  }

  return {
    id: options.id,
    description: options.description ?? `Composed over ${baseId} with ${actions.length} custom action(s).`,
    supportsCacheControl: base.supportsCacheControl,
    getTools,
    getCatalog,
    getSystemPrompt,
    getMcpPrompt,
    dispatch,
  };
}
