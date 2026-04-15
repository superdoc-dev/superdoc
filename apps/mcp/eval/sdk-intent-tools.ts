/**
 * The 9 shipped SDK intent tools — manually defined to match what the MCP server
 * registers via registerIntentTools. These are the actual tools LLMs see.
 *
 * Source: https://docs.superdoc.dev/document-engine/ai-agents/llm-tools
 */

import type Anthropic from '@anthropic-ai/sdk';

const obj = { type: 'object' as const };
const str = { type: 'string' as const };
const num = { type: 'number' as const };
const bool = { type: 'boolean' as const };

export function getSDKIntentTools(): Anthropic.Tool[] {
  return [
    {
      name: 'superdoc_search',
      description: 'Find text or nodes in the document. Returns handles and addresses for targeting edits.',
      input_schema: {
        ...obj,
        properties: {
          type: { ...str, enum: ['text', 'node'], description: 'Search type.' },
          pattern: { ...str, description: 'Text to search for (when type=text).' },
          mode: { ...str, enum: ['contains', 'regex'], description: 'Search mode. Default: contains.' },
          caseSensitive: { ...bool, description: 'Case sensitive. Default: false.' },
          nodeType: { ...str, description: 'Node type to find (when type=node).' },
          limit: { ...num, description: 'Max results.' },
          offset: { ...num, description: 'Pagination offset.' },
          require: { ...str, enum: ['first', 'exactlyOne', 'any', 'all'], description: 'Cardinality requirement.' },
        },
      },
    },
    {
      name: 'superdoc_get_content',
      description:
        'Read document content. Use action "info" for structure and styles, "blocks" for all block IDs and types, "text" or "markdown" for content. Call info or blocks before editing.',
      input_schema: {
        ...obj,
        properties: {
          action: { ...str, enum: ['info', 'blocks', 'text', 'markdown', 'html'], description: 'What to read.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_edit',
      description: 'Insert, replace, delete text, or undo/redo.',
      input_schema: {
        ...obj,
        properties: {
          action: { ...str, enum: ['insert', 'replace', 'delete', 'undo', 'redo'], description: 'Edit action.' },
          ref: { ...str, description: 'Ref from search result (for replace/delete).' },
          value: { ...str, description: 'Text to insert (for insert action).' },
          text: { ...str, description: 'Replacement text (for replace action).' },
          type: { ...str, enum: ['text', 'markdown', 'html'], description: 'Content format for insert.' },
          target: { ...obj, description: 'Target address for insert position.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_format',
      description: 'Apply inline or paragraph formatting.',
      input_schema: {
        ...obj,
        properties: {
          action: {
            ...str,
            enum: [
              'inline',
              'paragraph_alignment',
              'paragraph_spacing',
              'paragraph_indentation',
              'set_style',
              'clear_style',
            ],
            description: 'Format action.',
          },
          ref: { ...str, description: 'Ref from search (for inline formatting).' },
          target: { ...obj, description: 'Block address (for paragraph formatting).' },
          inline: {
            ...obj,
            description:
              'Inline properties: {bold, italic, underline, strike, color, highlight, fontSize, fontFamily}.',
          },
          alignment: { ...str, description: 'Paragraph alignment.' },
          styleId: { ...str, description: 'Named style ID (for set_style).' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_create',
      description: 'Create paragraphs or headings.',
      input_schema: {
        ...obj,
        properties: {
          action: { ...str, enum: ['paragraph', 'heading'], description: 'What to create.' },
          text: { ...str, description: 'Text content.' },
          level: { ...num, description: 'Heading level (1-6).' },
          at: { ...obj, description: 'Position to insert at.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_list',
      description: 'Create and manipulate bullet/numbered lists.',
      input_schema: {
        ...obj,
        properties: {
          action: {
            ...str,
            enum: ['insert', 'set_type', 'indent', 'outdent', 'restart', 'exit', 'list', 'get'],
            description: 'List action.',
          },
          target: { ...obj, description: 'Target address.' },
          text: { ...str, description: 'Text for new list item.' },
          kind: { ...str, enum: ['bullet', 'ordered'], description: 'List type.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_comment',
      description: 'Create, update, delete, and list comments.',
      input_schema: {
        ...obj,
        properties: {
          action: { ...str, enum: ['create', 'patch', 'delete', 'get', 'list'], description: 'Comment action.' },
          text: { ...str, description: 'Comment text (for create/patch).' },
          target: { ...obj, description: 'Text range to anchor comment (for create).' },
          id: { ...str, description: 'Comment ID (for patch/delete/get).' },
          parentId: { ...str, description: 'Parent comment ID (for replies).' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_track_changes',
      description: 'Review and resolve tracked changes.',
      input_schema: {
        ...obj,
        properties: {
          action: { ...str, enum: ['list', 'get', 'decide'], description: 'Track changes action.' },
          id: { ...str, description: 'Tracked change ID.' },
          decision: { ...str, enum: ['accept', 'reject'], description: 'Accept or reject.' },
          target: { ...obj, description: 'Target for batch decisions.' },
        },
        required: ['action'],
      },
    },
    {
      name: 'superdoc_mutations',
      description:
        'Execute multi-step atomic edits in a single batch. Steps: text.rewrite, text.insert, text.delete, format.apply, assert.',
      input_schema: {
        ...obj,
        properties: {
          atomic: { ...bool, description: 'Must be true.' },
          changeMode: { ...str, enum: ['direct', 'tracked'], description: 'Apply directly or as tracked changes.' },
          steps: {
            type: 'array' as const,
            items: {
              ...obj,
              properties: {
                id: { ...str, description: 'Step ID.' },
                op: {
                  ...str,
                  enum: ['text.rewrite', 'text.insert', 'text.delete', 'format.apply', 'assert'],
                  description: 'Operation.',
                },
                where: { ...obj, description: 'Target: {by: "ref", ref} or {by: "select", select, require}.' },
                args: { ...obj, description: 'Operation-specific args.' },
              },
              required: ['id', 'op', 'where', 'args'],
            },
            description: 'Array of mutation steps.',
          },
        },
        required: ['atomic', 'steps'],
      },
    },
  ];
}

export function getSDKIntentSystemPrompt(): string {
  return `You are a document editing assistant. You have a DOCX document open and a set of intent-based tools available.

Always take action using tools. Do not ask clarifying questions. Make reasonable assumptions.

Tools:
- superdoc_search: Find text or nodes. Returns handle.ref for edits and address for block operations.
- superdoc_get_content: Read document (action: info/blocks/text/markdown/html). Start with action="blocks" to see structure.
- superdoc_edit: Insert/replace/delete text, undo/redo. Use ref from search for replace/delete.
- superdoc_format: Apply inline (bold, italic, etc.) or paragraph formatting. Use ref from search.
- superdoc_create: Create paragraphs or headings.
- superdoc_list: Create and manipulate lists.
- superdoc_comment: Create, patch, delete, list comments. Target needs {kind:"text", blockId, range:{start,end}}.
- superdoc_track_changes: List, get, accept/reject tracked changes.
- superdoc_mutations: Batch atomic edits. Use for multi-step operations.

Workflow:
1. Call superdoc_get_content({action:"blocks"}) first to understand document structure.
2. Use superdoc_search to find content and get refs/addresses.
3. Use refs for inline operations (edit, format). Use addresses for block operations.
4. Refs expire after mutations — re-search before next operation.
5. For multi-step edits, use superdoc_mutations to batch them atomically.`;
}
