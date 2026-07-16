import type { ToolProvider } from '../tools.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { ACTION_NAMES_LIST, ACTION_HINTS, ACTION_GROUPS, ACTION_ARGS } from './actions.js';

export const AGENT_TOOL_NAMES = [
  'superdoc_inspect',
  'superdoc_perform_action',
  'agent_apply',
  'agent_verify',
  'agent_operation',
  'superdoc_execute_code',
] as const;

/**
 * The LLM-facing tool surface — exactly the tools shown to the model in
 * `chooseTools(...)` / `listTools(...)`. All other `AGENT_TOOL_NAMES` remain
 * dispatchable via `dispatchSuperDocTool` for SDK callers but are NOT
 * advertised to the LLM.
 */
export const PUBLIC_AGENT_TOOL_NAMES = [
  'superdoc_inspect',
  'superdoc_perform_action',
  // superdoc_execute_code is deliberately NOT advertised: code execution is
  // WIP and will return behind a safety flag. It remains dispatchable for SDK
  // callers via dispatchSuperDocTool / preset.dispatch.
] as const;
export type PublicAgentToolName = (typeof PUBLIC_AGENT_TOOL_NAMES)[number];

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

type AgentInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: boolean;
};

export type AgentToolDefinition = {
  name: AgentToolName;
  description: string;
  inputSchema: AgentInputSchema;
};

export type AgentOpenAiTool = {
  type: 'function';
  function: {
    name: AgentToolName;
    description: string;
    parameters: AgentInputSchema;
  };
};

export type AgentAnthropicTool = {
  name: AgentToolName;
  description: string;
  input_schema: AgentInputSchema;
};

export type AgentGenericTool = {
  name: AgentToolName;
  description: string;
  parameters: AgentInputSchema;
};

/**
 * Vercel AI SDK dialect: flat `{name, description, inputSchema}` — the field
 * names `tool({ description, inputSchema })` expects. `inputSchema` is a raw
 * JSON Schema; wrap it with the AI SDK's `jsonSchema()` helper:
 *
 * ```ts
 * import { tool, jsonSchema } from 'ai';
 * const aiTools = Object.fromEntries(tools.map((t) => [
 *   t.name,
 *   tool({ description: t.description, inputSchema: jsonSchema(t.inputSchema), execute: ... }),
 * ]));
 * ```
 */
export type AgentVercelTool = {
  name: AgentToolName;
  description: string;
  inputSchema: AgentInputSchema;
};

export type AgentProviderTool = AgentOpenAiTool | AgentAnthropicTool | AgentGenericTool | AgentVercelTool;

export const SELECTOR_SCHEMA = {
  type: 'object',
  description:
    'Deterministic selector. Examples: {kind:"nodeId",nodeId:"n12"}, {kind:"ordinal",ordinalKind:"bodyParagraphOrdinal",value:2}, {kind:"textSearch",terms:["Lender","Company"],match:"all"}, {kind:"placement",at:"document_end"}, {kind:"ref",ref:"selectedBlock"}.',
  additionalProperties: true,
  properties: {
    kind: { type: 'string' },
  },
} as const;

/**
 * Per-argument JSON schema for every `superdoc_perform_action` argument EXCEPT `action`.
 * The single source of truth for each arg's JSON schema. ACTION_ARG_PROPERTIES
 * selects the entries some action declares in ACTION_ARGS; the `superdoc_perform_action`
 * tool advertises those after `action`.
 */
export const ACTION_ARG_SCHEMA: Record<string, unknown> = {
  text: { type: 'string' },
  texts: { type: 'array', items: { type: 'string' } },
  level: { type: 'number' },
  headingText: { type: 'string' },
  headingLevel: { type: 'number' },
  kind: { type: 'string', enum: ['ordered', 'bullet'] },
  items: { type: 'array', items: { type: 'string' } },
  listOrdinal: { type: 'number' },
  rows: { type: 'number' },
  columns: { type: 'number' },
  cellTexts: { type: 'array', items: {} },
  edits: {
    type: 'array',
    items: {
      type: 'object',
      properties: { find: { type: 'string' }, replace: { type: 'string' } },
      required: ['find'],
    },
  },
  finds: { type: 'array', items: { type: 'string' } },
  caseSensitive: { type: 'boolean' },
  changeMode: { type: 'string', enum: ['direct', 'tracked'] },
  placement: { type: 'object', additionalProperties: true, properties: {} },
  selector: SELECTOR_SCHEMA,
  selectors: { type: 'array', items: SELECTOR_SCHEMA },
  commentText: { type: 'string' },
  scope: { type: 'string', enum: ['all', 'body'] },
  excludeBlockQuotes: { type: 'boolean' },
  author: { type: 'string' },
  changeType: { type: 'string', enum: ['insert', 'delete', 'replacement', 'format'] },
  fontSize: { type: 'number' },
  fontFamily: { type: 'string' },
  color: { type: 'string' },
  targetText: { type: 'string' },
  letterSpacing: { type: 'number' },
  values: { type: 'array', items: { type: 'string' } },
  fields: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['value'],
    },
  },
  title: { type: 'string' },
  tableOrdinal: { type: 'number' },
  rowIndex: { type: 'number' },
  columnIndex: { type: 'number' },
  position: { type: 'string' },
  dryRun: { type: 'boolean' },
  headerText: { type: 'string' },
  separatorText: { type: 'string' },
  anchorText: { type: 'string' },
  targetTexts: { type: 'array', items: { type: 'string' } },
  bold: { type: 'boolean' },
  italic: { type: 'boolean' },
  underline: { type: 'boolean' },
  strike: { type: 'boolean' },
  highlight: { type: 'string' },
  styleId: { type: 'string' },
  likeText: { type: 'string' },
  fromMarker: { type: 'string' },
  toMarker: { type: 'string' },
  fromText: { type: 'string' },
  toText: { type: 'string' },
  untilMarker: { type: 'string' },
  steps: { type: 'number' },
  likeMarker: { type: 'string' },
  nodeId: { type: 'string' },
  alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
  afterText: { type: 'string' },
  beforeText: { type: 'string' },
  accentColor: { type: 'string' },
  entries: {
    type: 'array',
    items: {
      type: 'object',
      properties: { text: { type: 'string' }, level: { type: 'number' } },
      required: ['text'],
    },
  },
  lineSpacing: { type: 'number' },
  spaceBefore: { type: 'number' },
  spaceAfter: { type: 'number' },
  url: { type: 'string' },
  tooltip: { type: 'string' },
  reopen: { type: 'boolean' },
  commentId: { type: 'string' },
  restartNumbering: { type: 'boolean' },
};

/**
 * The args the `superdoc_perform_action` tool advertises for a given action
 * set, GENERATED from the registry: a property appears iff some INCLUDED
 * action declares it in `ACTION_ARGS`. This makes `ACTION_ARGS` the authority
 * (the schema can no longer drift from what actions actually accept) and
 * guards both directions:
 *   - a declared arg with no schema entry throws (caught in CI/build),
 *   - a schema entry no included action uses is pruned (dead args can't
 *     accumulate, and excluding actions also drops their private args).
 * Order follows ACTION_ARG_SCHEMA so the advertised tool stays stable.
 */
function buildActionArgProperties(includedActions: readonly string[]): Record<string, unknown> {
  const declared = new Set<string>(
    includedActions.flatMap((name) => ACTION_ARGS[name as keyof typeof ACTION_ARGS] ?? []),
  );
  for (const arg of declared) {
    if (!(arg in ACTION_ARG_SCHEMA)) {
      throw new Error(`ACTION_ARGS declares "${arg}" but ACTION_ARG_SCHEMA has no schema for it.`);
    }
  }
  const props: Record<string, unknown> = {};
  for (const [arg, schema] of Object.entries(ACTION_ARG_SCHEMA)) {
    if (declared.has(arg)) props[arg] = schema;
  }
  return props;
}

const VERIFICATION_CHECK_SCHEMA = {
  type: 'object',
  description:
    'Verification check. Examples: {kind:"revision-changed"}, {kind:"block-text-contains",nodeId:"n12",text:"Hello"}, {kind:"table-shape",nodeId:"tbl-1",rows:2,columns:2}.',
  additionalProperties: true,
  properties: {
    kind: { type: 'string' },
  },
} as const;

const PLAN_STEP_SCHEMA = {
  type: 'object',
  description:
    'IR step. Supported kinds: inspect, select, apply, verify. Apply steps use a generated doc.* operation id in operationId plus args.',
  additionalProperties: true,
  properties: {
    kind: { type: 'string' },
    operationId: { type: 'string' },
    args: {
      type: 'object',
      additionalProperties: true,
      properties: {},
      description:
        'Operation arguments. Do not include doc or sessionId. Use exact generated operation arguments for doc.* calls.',
    },
    selector: SELECTOR_SCHEMA,
    checks: {
      type: 'array',
      items: VERIFICATION_CHECK_SCHEMA,
    },
    bind: { type: 'string' },
    requireUnique: { type: 'boolean' },
    rationale: { type: 'string' },
    changeMode: { type: 'string', enum: ['direct', 'tracked'] },
    atomic: { type: 'boolean' },
    saveReopen: { type: 'boolean' },
  },
} as const;

/**
 * Render the superdoc_perform_action description from the action registry
 * (ACTION_NAMES_LIST + ACTION_HINTS + ACTION_GROUPS in actions.ts). The
 * registry is the single source of truth — adding a action there is the whole
 * job; this string and the schema enum follow automatically.
 *
 * `included` (optional) narrows the description to a subset of actions —
 * groups whose actions are all excluded disappear entirely.
 */
function buildActionDescription(included?: ReadonlySet<string>): string {
  const grouped = ACTION_GROUPS.map((group) => {
    const actions = included ? group.actions.filter((name) => included.has(name)) : [...group.actions];
    if (actions.length === 0) return null;
    return `${group.label}: ${actions.map((name) => `${name} (${ACTION_HINTS[name]})`).join(', ')}.`;
  })
    .filter((entry): entry is string => entry != null)
    .join(' ');
  return (
    'High-level deterministic document edit. Pick a action and pass flat product-facing arguments. ' +
    'Actions wrap the most common doc.* operations and return real pre/post evidence and verification. ' +
    grouped +
    ' placement: {at:"document_end"|"document_start"|"after"|"before", selector?}.' +
    ' selector: {kind:"nodeId",nodeId} | {kind:"ordinal",ordinalKind:"bodyParagraphOrdinal"|"paragraphOrdinal"|"headingOrdinal"|"tableOrdinal"|"listOrdinal"|"sectionOrdinal"|"blockOrdinal",value:N} | {kind:"tableCell",tableOrdinal,rowIndex,columnIndex} | {kind:"textSearch",terms:[...],match?:"all"|"any",occurrence?:N,nodeTypes?:["paragraph"|"heading"|"listItem"]} | {kind:"placement",at:"document_end"|"document_start"} | {kind:"relative",position:"after"|"before",target:selector}.'
  );
}

/**
 * Build the `superdoc_perform_action` tool definition for a given action set.
 * The default (all actions) is what `AGENT_TOOL_DEFINITIONS` carries; callers
 * excluding actions get a coherently narrowed definition: enum, grouped
 * description, AND the advertised argument properties all shrink together
 * (an arg no remaining action declares is not advertised).
 */
export function buildPerformActionDefinition(includedActions: readonly string[]): AgentToolDefinition {
  const included = new Set(includedActions);
  return {
    name: 'superdoc_perform_action',
    description: buildActionDescription(included.size === ACTION_NAMES_LIST.length ? undefined : included),
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: [...includedActions],
        },
        ...buildActionArgProperties(includedActions),
      },
    },
  };
}

export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = [
  {
    name: 'superdoc_inspect',
    description:
      'Build a deterministic document snapshot. Prefer the narrowest inspect that answers the question: countsOnly for pure counts, includeDomains to limit which domains are returned, and blockNodeTypes when only specific block types matter. For LARGE documents, read in windows: blockOffset/blockLimit return a contiguous slice of blocks (ordinals are absolute, so windows line up), and omitEmptyBlocks/dropTextPreview trim payload for a reading pass.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        countsOnly: { type: 'boolean' },
        blockOffset: { type: 'number', minimum: 0 },
        blockLimit: { type: 'number', minimum: 1 },
        omitEmptyBlocks: { type: 'boolean' },
        dropTextPreview: { type: 'boolean' },
        includeDomains: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'blocks',
              'lists',
              'tables',
              'comments',
              'trackedChanges',
              'sections',
              'headerFooters',
              'styles',
              'contentControls',
              'fields',
              'hyperlinks',
              'bookmarks',
              'permissionRanges',
              'images',
            ],
          },
        },
        blockNodeTypes: {
          type: 'array',
          items: { type: 'string' },
        },
        blockTextLimit: { type: 'number', minimum: 1 },
        listLimit: { type: 'number', minimum: 1 },
        tableLimit: { type: 'number', minimum: 1 },
        commentLimit: { type: 'number', minimum: 1 },
        trackedChangeLimit: { type: 'number', minimum: 1 },
      },
    },
  },
  // Generated from the action registry (ACTION_NAMES_LIST + ACTION_ARGS):
  // enum, description, and advertised args all derive from the same source,
  // so the schema can no longer drift from what actions accept.
  buildPerformActionDefinition(ACTION_NAMES_LIST),
  {
    name: 'agent_apply',
    description:
      'Execute a validated inspect/select/apply/verify IR plan. Use this for most document edits. Returns pre/post evidence, selected targets, executed operations, verification results, and save evidence when required.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['plan'],
      properties: {
        plan: {
          type: 'object',
          additionalProperties: false,
          required: ['intent', 'steps'],
          properties: {
            intent: { type: 'string' },
            steps: {
              type: 'array',
              minItems: 1,
              items: PLAN_STEP_SCHEMA,
            },
            preconditions: { type: 'array', items: { type: 'string' } },
            postconditions: { type: 'array', items: { type: 'string' } },
            atomic: { type: 'boolean' },
            expectedDiff: {
              type: 'object',
              additionalProperties: false,
              properties: {
                blocksAdded: { type: 'number' },
                blocksRemoved: { type: 'number' },
                textReplacements: { type: 'number' },
                commentsAdded: { type: 'number' },
                trackedChangesAdded: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'agent_verify',
    description:
      'Run verification checks against the current document state. Use for explicit postcondition proof or save/reopen verification.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['checks'],
      properties: {
        checks: {
          type: 'array',
          minItems: 1,
          items: VERIFICATION_CHECK_SCHEMA,
        },
        saveReopen: { type: 'boolean' },
      },
    },
  },
  {
    name: 'agent_operation',
    description:
      'Controlled escape hatch for a single generated doc.* operation. Prefer agent_apply first; use this when you need an exact generated operation id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operationId'],
      properties: {
        operationId: {
          type: 'string',
          description: 'Exact generated operation id such as doc.replace or doc.comments.create.',
        },
        args: {
          type: 'object',
          additionalProperties: true,
          properties: {},
          description: 'Operation arguments. Do not include doc or sessionId.',
        },
        readOnly: { type: 'boolean' },
      },
    },
  },
  {
    // superdoc_execute_code: in-host JS escape hatch for COMPLEX / MULTI-STEP workflows
    // (loops, per-item branching, extract-then-generate). Dispatches to the
    // CLI/SDK-only `doc.executeCode` session op, which runs the model's code
    // against the live SYNCHRONOUS editor.doc. Schema mirrors the hybrid-agent
    // EXECUTE_CODE_TOOL ({ code: string }, required). See dispatchSuperDocTool.
    name: 'superdoc_execute_code',
    description:
      'Run a JavaScript snippet against the live SuperDoc Document API for a complex or multi-step workflow (loops, per-item branching, extract-then-generate). Use this instead of unrolling many action calls. The code runs IN-HOST against a SYNCHRONOUS `doc` — do NOT await doc.* calls; they return their receipt directly. Two globals are injected: `doc` (synchronous Document API) and `console`. `return` a short summary. Do NOT call doc.save/close.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript body executed as an async function IN-HOST. Has access to `doc` (SYNCHRONOUS — do NOT await doc.* calls) and `console`. Return a short summary value.',
        },
      },
    },
  },
] as const;

const AGENT_TOOL_NAME_SET = new Set<string>(AGENT_TOOL_NAMES);

function toOpenAiTool(definition: AgentToolDefinition): AgentOpenAiTool {
  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.inputSchema,
    },
  };
}

function toAnthropicTool(definition: AgentToolDefinition): AgentAnthropicTool {
  return {
    name: definition.name,
    description: definition.description,
    input_schema: definition.inputSchema,
  };
}

function toGenericTool(definition: AgentToolDefinition): AgentGenericTool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
  };
}

function toVercelTool(definition: AgentToolDefinition): AgentVercelTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
  };
}

function toProviderTool(provider: ToolProvider, definition: AgentToolDefinition): AgentProviderTool {
  if (provider === 'anthropic') return toAnthropicTool(definition);
  if (provider === 'generic') return toGenericTool(definition);
  // AI SDK dialect: flat {name, description, inputSchema} for tool()/jsonSchema().
  if (provider === 'vercel') return toVercelTool(definition);
  return toOpenAiTool(definition);
}

/** Customer-facing narrowing of the advertised tool surface. */
export interface ListAgentToolsOptions {
  /**
   * Action names to REMOVE from `superdoc_perform_action` — the enum, the
   * grouped description, and any argument properties only those actions use
   * all shrink together. Unknown names throw (typo protection). Excluding
   * every action drops the tool entirely.
   */
  excludeActions?: readonly string[];
}

export function validateExclusions(options?: ListAgentToolsOptions): {
  excludedActions: Set<string>;
} {
  const excludedActions = new Set(options?.excludeActions ?? []);
  const knownActions = new Set<string>(ACTION_NAMES_LIST);
  for (const name of excludedActions) {
    if (!knownActions.has(name)) {
      throw new SuperDocCliError(`excludeActions: unknown action "${name}".`, {
        code: 'INVALID_ARGUMENT',
        details: { unknownAction: name, knownActions: [...knownActions] },
      });
    }
  }
  return { excludedActions };
}

/**
 * Tools advertised to the LLM. Only PUBLIC_AGENT_TOOL_NAMES (currently
 * superdoc_inspect + superdoc_perform_action) are returned; the remaining
 * AGENT_TOOL_NAMES (agent_apply, agent_verify, agent_operation,
 * superdoc_execute_code) stay dispatchable but invisible to the model.
 *
 * `options.excludeActions` narrows the action surface for customers who
 * don't want the model to see certain capabilities.
 */
export function listAgentTools(provider: ToolProvider, options?: ListAgentToolsOptions): AgentProviderTool[] {
  const { excludedActions } = validateExclusions(options);
  const publicSet: Set<string> = new Set(PUBLIC_AGENT_TOOL_NAMES);
  const includedActions = ACTION_NAMES_LIST.filter((name) => !excludedActions.has(name));
  return AGENT_TOOL_DEFINITIONS.filter((d) => publicSet.has(d.name))
    .flatMap((definition) => {
      if (definition.name !== 'superdoc_perform_action' || excludedActions.size === 0) return [definition];
      // Every action excluded → the tool has nothing to offer; drop it.
      if (includedActions.length === 0) return [];
      return [buildPerformActionDefinition(includedActions)];
    })
    .map((definition) => toProviderTool(provider, definition));
}

export function isAgentToolName(toolName: string): toolName is AgentToolName {
  return AGENT_TOOL_NAME_SET.has(toolName);
}
