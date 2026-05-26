import type { ToolProvider } from '../tools.js';

export const AGENT_TOOL_NAMES = [
  'agent_inspect',
  'agent_recipe',
  'agent_apply',
  'agent_verify',
  'agent_operation',
] as const;

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

export type AgentProviderTool = AgentOpenAiTool | AgentAnthropicTool | AgentGenericTool;

const SELECTOR_SCHEMA = {
  type: 'object',
  description:
    'Deterministic selector. Examples: {kind:"nodeId",nodeId:"n12"}, {kind:"ordinal",ordinalKind:"bodyParagraphOrdinal",value:2}, {kind:"textSearch",terms:["Lender","Company"],match:"all"}, {kind:"placement",at:"document_end"}, {kind:"ref",ref:"selectedBlock"}.',
  additionalProperties: true,
  properties: {
    kind: { type: 'string' },
  },
} as const;

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

export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = [
  {
    name: 'agent_inspect',
    description:
      'Build a deterministic document snapshot. Prefer the narrowest inspect that answers the question: countsOnly for pure counts, includeDomains to limit which domains are returned, and blockNodeTypes when only specific block types matter.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        countsOnly: { type: 'boolean' },
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
  {
    name: 'agent_recipe',
    description:
      'High-level deterministic document edit. Pick a recipe and pass flat product-facing arguments. Recipes wrap the most common doc.* operations and return real pre/post evidence and verification. Text/structure recipes: insert_paragraph (text, placement?, changeMode?), insert_paragraphs (texts[], placement?, headingLevel?, changeMode?), insert_heading (text, level, placement?), replace_text (edits[{find,replace}], optional selector to scope replacements to one inspected block, caseSensitive?, changeMode?), delete_text (finds[], caseSensitive?), replace_top_date (date, changeMode?), append_list (items[], kind?: ordered|bullet, headingText?, headingLevel?), insert_list_items (items[], listOrdinal?), create_table (rows, columns, cellTexts?, placement?), rewrite_block (selector, text, changeMode?), fill_placeholders (values[] and/or fields[{label?,value}], changeMode?), move_section (sourceSection, destinationSection, position?, bottomNote?). Comment recipes: comment_paragraphs (commentText, scope?: all|body, excludeBlockQuotes?), add_comment (commentText, selector). Tracked-change review: accept_tracked_changes (author?), reject_tracked_changes (author?). Formatting recipes: normalize_body_font_size (fontSize, changeMode?), color_text (color, targetText? | selector?, caseSensitive?, changeMode?), apply_letter_spacing (selector, letterSpacing, changeMode?). Media / TOC: insert_toc (title?, placement?, changeMode?), insert_image_with_caption (src, alt?, caption?, width?, height?, sectionBreakBefore?, placement?, changeMode?). Table edits: set_table_shading (color, tableOrdinal?), insert_table_row (tableOrdinal?, rowIndex?, position?: before|after|above|below, cellTexts?, changeMode?, dryRun?), insert_table_column (tableOrdinal?, columnIndex?, position?, headerText?, changeMode?), delete_table_row (tableOrdinal?, rowIndex, changeMode?), delete_table_column (tableOrdinal?, columnIndex, changeMode?), split_table (tableOrdinal?, rowIndex, separatorText?, changeMode?). placement: {at:"document_end"|"document_start"|"after"|"before", selector?}. selector: {kind:"nodeId",nodeId} | {kind:"ordinal",ordinalKind:"bodyParagraphOrdinal"|"paragraphOrdinal"|"headingOrdinal"|"tableOrdinal"|"listOrdinal"|"sectionOrdinal"|"blockOrdinal",value:N} | {kind:"tableCell",tableOrdinal,rowIndex,columnIndex} | {kind:"textSearch",terms:[...],match?:"all"|"any",occurrence?:N,nodeTypes?:["paragraph"|"heading"|"listItem"]} | {kind:"placement",at:"document_end"|"document_start"} | {kind:"relative",position:"after"|"before",target:selector}.',
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['recipe'],
      properties: {
        recipe: {
          type: 'string',
          enum: [
            'insert_paragraph',
            'insert_paragraphs',
            'insert_heading',
            'replace_text',
            'delete_text',
            'replace_top_date',
            'append_list',
            'insert_list_items',
            'create_table',
            'comment_paragraphs',
            'add_comment',
            'rewrite_block',
            'accept_tracked_changes',
            'reject_tracked_changes',
            'normalize_body_font_size',
            'color_text',
            'apply_letter_spacing',
            'fill_placeholders',
            'move_section',
            'insert_toc',
            'insert_image_with_caption',
            'set_table_shading',
            'insert_table_row',
            'insert_table_column',
            'delete_table_row',
            'delete_table_column',
            'split_table',
          ],
        },
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
        date: { type: 'string' },
        placement: { type: 'object', additionalProperties: true, properties: {} },
        selector: SELECTOR_SCHEMA,
        commentText: { type: 'string' },
        scope: { type: 'string', enum: ['all', 'body'] },
        excludeBlockQuotes: { type: 'boolean' },
        author: { type: 'string' },
        fontSize: { type: 'number' },
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
        sourceSection: { type: 'number' },
        destinationSection: { type: 'number' },
        bottomNote: { type: 'string' },
        title: { type: 'string' },
        src: { type: 'string' },
        alt: { type: 'string' },
        caption: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        sectionBreakBefore: { type: 'boolean' },
        tableOrdinal: { type: 'number' },
        rowIndex: { type: 'number' },
        columnIndex: { type: 'number' },
        position: { type: 'string' },
        dryRun: { type: 'boolean' },
        headerText: { type: 'string' },
        separatorText: { type: 'string' },
      },
    },
  },
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

function toProviderTool(provider: ToolProvider, definition: AgentToolDefinition): AgentProviderTool {
  if (provider === 'anthropic') return toAnthropicTool(definition);
  if (provider === 'generic') return toGenericTool(definition);
  return toOpenAiTool(definition);
}

export function listAgentTools(provider: ToolProvider): AgentProviderTool[] {
  return AGENT_TOOL_DEFINITIONS.map((definition) => toProviderTool(provider, definition));
}

export function isAgentToolName(toolName: string): toolName is AgentToolName {
  return AGENT_TOOL_NAME_SET.has(toolName);
}
