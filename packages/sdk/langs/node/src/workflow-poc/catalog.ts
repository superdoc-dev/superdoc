import type {
  WorkflowPocAnthropicTool,
  WorkflowPocGenericTool,
  WorkflowPocOpenAiTool,
  WorkflowPocProvider,
  WorkflowPocProviderTool,
  WorkflowPocToolDefinition,
  WorkflowPocToolName,
} from './types.js';
import { WORKFLOW_POC_TOOL_NAMES } from './types.js';

export const WORKFLOW_POC_TOOL_DEFINITIONS: readonly WorkflowPocToolDefinition[] = [
  {
    name: 'superdoc_do',
    description:
      'Compact compile-and-execute tool for common DOCX edits. Use this first: it resolves targets, executes deterministic workflow macros, and returns a small verification receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'replace_all',
            'delete_all',
            'fill_placeholders',
            'rewrite_block',
            'insert_paragraph',
            'insert_paragraphs',
            'insert_section_break',
            'count_paragraphs_and_append',
            'insert_summary_at_top',
            'comment_summary_at_top',
            'insert_heading_sections',
            'insert_list_items',
            'append_list',
            'color_texts',
            'apply_letter_spacing',
            'normalize_body_font_size',
            'move_section',
            'insert_toc',
            'insert_image_with_caption',
            'table',
            'comment_pass',
            'track_changes',
          ],
          description: 'General deterministic operation to execute.',
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string' },
              replace: { type: 'string' },
            },
            required: ['find'],
            additionalProperties: false,
          },
          description: 'Text edits for replace_all/delete_all/fill_placeholders.',
        },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['value'],
            additionalProperties: false,
          },
          description: 'Named placeholder values for fill_placeholders.',
        },
        values: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sequential placeholder values for fill_placeholders.',
        },
        target: {
          description:
            'Stable selector object such as {by:"paragraphOrdinal", value:2}, {by:"tableOrdinal", value:1}, {by:"listOrdinal", value:1}, or a ref string.',
        },
        placement: {
          description:
            'Optional placement selector, e.g. "document_start", "document_end", or {target:{by:"paragraphOrdinal",value:2}, position:"after"}.',
        },
        text: { type: 'string', description: 'Single replacement/insertion text.' },
        texts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple paragraphs or list items in final order.',
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alias for texts when creating or inserting list items.',
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              title: { type: 'string' },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
              },
              texts: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            additionalProperties: false,
          },
          description:
            'Sectioned long-form content for insert_heading_sections, e.g. [{heading:"Market",paragraphs:["...","..."]}].',
        },
        title: { type: 'string', description: 'Title for insert_toc or other titled insertions.' },
        headingText: { type: 'string', description: 'Heading text for appended lists or summary insertion.' },
        headingLevel: { type: 'number', description: 'Heading level 1-6 when a real heading is requested.' },
        summary: { type: 'string', description: 'One-paragraph summary text for insert_summary_at_top.' },
        textTemplate: {
          type: 'string',
          description: 'Template for count_paragraphs_and_append. Use {count} where the paragraph count should go.',
        },
        fontSize: {
          type: 'number',
          description: 'Font size in points for normalize_body_font_size. Default 11.',
        },
        size: {
          type: 'number',
          description: 'Alias for fontSize.',
        },
        letterSpacing: {
          type: 'number',
          description: 'Letter spacing in points for apply_letter_spacing. Default 2.',
        },
        spacing: {
          type: 'number',
          description: 'Alias for letterSpacing.',
        },
        headingOrdinal: {
          type: 'number',
          description: '1-based heading ordinal for apply_letter_spacing when target is omitted. Default 1.',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description: 'Apply edits directly or as tracked changes. Default direct.',
        },
        caseSensitive: { type: 'boolean', description: 'Whether text matching is case-sensitive. Default false.' },
        preserveStyle: {
          type: 'boolean',
          description: 'Preserve existing paragraph/inline style during text rewrites. Default true.',
        },
        kind: {
          type: 'string',
          enum: ['bullet', 'ordered'],
          description: 'List kind for append_list/insert_list_items.',
        },
        colors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              color: { type: 'string' },
              caseSensitive: { type: 'boolean' },
              matchMode: { type: 'string', enum: ['exact', 'contains'] },
            },
            required: ['text', 'color'],
            additionalProperties: false,
          },
          description:
            'Batch color rules, e.g. [{text:"Defined Term",color:"red"},{text:"Counterparty",color:"green"}].',
        },
        sourceSection: { type: 'number', description: '1-based source section for move_section.' },
        destinationSection: { type: 'number', description: '1-based destination section for move_section.' },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Relative position for move/table/list operations.',
        },
        bottomNote: { type: 'string', description: 'Optional note appended after a move_section operation.' },
        sectionBreakBefore: {
          type: 'boolean',
          description: 'When inserting an image, first insert a section break at the end of the document.',
        },
        breakType: {
          type: 'string',
          enum: ['continuous', 'nextPage', 'evenPage', 'oddPage'],
          description: 'Section break type for insert_section_break or sectionBreakBefore. Default nextPage.',
        },
        caption: { type: 'string', description: 'Image caption for insert_image_with_caption.' },
        src: { type: 'string', description: 'Optional image source if explicitly provided by the user.' },
        alt: { type: 'string', description: 'Optional image alt text.' },
        tableAction: {
          type: 'string',
          enum: ['split_table', 'insert_column', 'insert_row', 'create_table', 'preview_insert_row', 'set_shading'],
          description: 'Sub-action when action is table.',
        },
        rows: { type: 'number', description: 'Table row count for create_table.' },
        columns: { type: 'number', description: 'Table column count for create_table.' },
        cellTexts: {
          description:
            'Table cell values as a 2D string array or [{rowIndex,columnIndex,text}] using zero-based indexes. Prefer 2D strings for newly-created tables.',
        },
        rowOrdinal: { type: 'number', description: '1-based row ordinal for table row operations.' },
        afterRow: { type: 'number', description: '1-based row after which split_table should split.' },
        afterColumn: { type: 'number', description: '1-based column after which insert_column should insert.' },
        headerText: { type: 'string', description: 'Optional header text for insert_column.' },
        separatorText: { type: 'string', description: 'Optional separator paragraph for split_table.' },
        color: { type: 'string', description: 'Color name or hex for table shading.' },
        commentText: { type: 'string', description: 'Comment text for comment_pass.' },
        excludeBlockQuotes: { type: 'boolean', description: 'Exclude block quotes from comment_pass.' },
        excludeStyleId: { type: 'string', description: 'Optional style id/name to exclude from comment_pass.' },
        includeHeadings: { type: 'boolean', description: 'Whether comment_pass may comment headings.' },
        limit: { type: 'number', description: 'Optional maximum number of comments to create.' },
        trackAction: {
          type: 'string',
          enum: ['summary', 'accept_all', 'reject_all'],
          description: 'Sub-action for track_changes. Default accept_all.',
        },
        mode: {
          type: 'string',
          enum: ['summary', 'accept_all', 'reject_all'],
          description: 'Alias for trackAction.',
        },
        scope: { type: 'string', enum: ['all', 'author'], description: 'Scope for track_changes actions.' },
        author: {
          type: 'string',
          description: 'Author name for author-scoped track_changes actions.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_context',
    description:
      'Return a compact deterministic document overview or a focused target view to drive follow-up workflow steps. Overview includes semantic/risk snippets for long-document summary tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          description:
            'Optional deterministic selector (ref, nodeId, blockOrdinal, listOrdinal, tableOrdinal) for focused context.',
        },
        scope: {
          description: 'Optional deterministic selector alias for target. Provide either target or scope, not both.',
        },
        window: {
          type: 'number',
          description: 'Optional nearby block radius for focused context windows (default 2, max 6).',
        },
        includeOutline: {
          type: 'boolean',
          description: 'When false, omit outline rows from the returned context.',
        },
        verify: {
          type: 'boolean',
          description: 'When true, include revision fingerprints to verify later tool calls are on the same index.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_text_transform',
    description:
      'Execute high-leverage text rewrites/deletions/placeholders/block rewrites in one atomic mutation batch.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['replace_all', 'delete_all', 'rewrite_block', 'fill_placeholders'],
          description: 'Text transform action to execute.',
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'Text pattern to find.' },
              replace: {
                type: 'string',
                description:
                  'Replacement text (required for replace/fill); use an empty string to remove matched text.',
              },
            },
            required: ['find'],
            additionalProperties: false,
          },
          description: 'Required for replace_all/delete_all/fill_placeholders.',
        },
        values: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Sequential replacement values for fill_placeholders. If there are more placeholders than values, the last value is reused to remove every placeholder.',
        },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['value'],
            additionalProperties: false,
          },
          description:
            'Named placeholder values for fill_placeholders, e.g. [{label:"Investor", value:"John James Smith"}].',
        },
        target: {
          oneOf: [
            {
              type: 'string',
              description: 'Stable ref target string.',
            },
            {
              type: 'object',
              properties: {
                by: {
                  type: 'string',
                  enum: [
                    'ref',
                    'nodeId',
                    'blockOrdinal',
                    'paragraphOrdinal',
                    'bodyParagraphOrdinal',
                    'headingOrdinal',
                    'listOrdinal',
                    'tableOrdinal',
                  ],
                },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
              required: ['by', 'value'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                ref: { type: 'string' },
                nodeId: { type: 'string' },
                blockOrdinal: { type: 'number' },
                paragraphOrdinal: { type: 'number' },
                bodyParagraphOrdinal: { type: 'number' },
                headingOrdinal: { type: 'number' },
                listOrdinal: { type: 'number' },
                tableOrdinal: { type: 'number' },
              },
              additionalProperties: false,
            },
          ],
          description:
            'Deterministic target selector required for rewrite_block (string ref or selector object with one key).',
        },
        text: {
          type: 'string',
          description: 'Replacement text required for rewrite_block.',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description: 'Change mode for mutations.apply (default direct).',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case-sensitive text matching for replace/delete/fill actions (default false).',
        },
        preserveStyle: {
          type: 'boolean',
          description: 'Preserve inline/paragraph style when rewriting text where supported (default true).',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_list_transform',
    description:
      'Insert multiple list items into an existing list, or append a brand-new list at document end, optionally with a heading immediately above it.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['insert_many', 'append_new_list'],
          description:
            'Use insert_many for an existing list. Use append_new_list for a new bullet/numbered list at document end.',
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Ordered list item texts to insert.',
        },
        target: {
          oneOf: [
            {
              type: 'string',
              description: 'Stable ref target string.',
            },
            {
              type: 'object',
              properties: {
                by: {
                  type: 'string',
                  enum: [
                    'ref',
                    'nodeId',
                    'blockOrdinal',
                    'paragraphOrdinal',
                    'bodyParagraphOrdinal',
                    'headingOrdinal',
                    'listOrdinal',
                    'tableOrdinal',
                  ],
                },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
              required: ['by', 'value'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                ref: { type: 'string' },
                nodeId: { type: 'string' },
                blockOrdinal: { type: 'number' },
                paragraphOrdinal: { type: 'number' },
                bodyParagraphOrdinal: { type: 'number' },
                headingOrdinal: { type: 'number' },
                listOrdinal: { type: 'number' },
                tableOrdinal: { type: 'number' },
              },
              additionalProperties: false,
            },
          ],
          description: 'Optional deterministic list target selector for insert_many. Omit target for append_new_list.',
        },
        kind: {
          type: 'string',
          enum: ['bullet', 'ordered'],
          description: 'List kind for append_new_list or new-list fallback (default bullet for append_new_list).',
        },
        headingText: {
          type: 'string',
          description:
            'Optional heading text inserted immediately above a brand-new appended list. Only for action=append_new_list.',
        },
        headingLevel: {
          type: 'number',
          description: 'Optional heading level 1-6 for headingText when action=append_new_list.',
        },
        preset: {
          type: 'string',
          description: 'Optional list preset, e.g. disc for bullets or decimal for ordered lists.',
        },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Insert position relative to target (default after).',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description: 'Edit mode for list insertions (default direct).',
        },
      },
      required: ['action', 'items'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_table_transform',
    description:
      'Execute deterministic table transforms for creating/populating tables, row/column insertion, split, and dry-run row preview with explicit ordinal semantics.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['split_table', 'insert_column', 'insert_row', 'create_table', 'preview_insert_row', 'set_shading'],
          description: 'Table transform action to execute.',
        },
        target: {
          oneOf: [
            {
              type: 'string',
              description: 'Stable ref target string.',
            },
            {
              type: 'object',
              properties: {
                by: {
                  type: 'string',
                  enum: [
                    'ref',
                    'nodeId',
                    'blockOrdinal',
                    'paragraphOrdinal',
                    'bodyParagraphOrdinal',
                    'headingOrdinal',
                    'listOrdinal',
                    'tableOrdinal',
                  ],
                },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
              required: ['by', 'value'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                ref: { type: 'string' },
                nodeId: { type: 'string' },
                blockOrdinal: { type: 'number' },
                paragraphOrdinal: { type: 'number' },
                bodyParagraphOrdinal: { type: 'number' },
                headingOrdinal: { type: 'number' },
                listOrdinal: { type: 'number' },
                tableOrdinal: { type: 'number' },
              },
              additionalProperties: false,
            },
          ],
          description:
            'Optional deterministic table selector. If omitted, tool auto-targets only when exactly one table exists.',
        },
        afterRow: {
          type: 'number',
          description: '1-based row ordinal used by split_table; table splits after this row.',
        },
        separatorText: {
          type: 'string',
          description: 'Optional paragraph text inserted between split tables.',
        },
        afterColumn: {
          type: 'number',
          description: '1-based column ordinal used by insert_column; new column is inserted after this column.',
        },
        headerText: {
          type: 'string',
          description: 'Optional text written to the new header cell when insert_column runs.',
        },
        rowOrdinal: {
          type: 'number',
          description:
            '1-based row ordinal used by preview_insert_row and insert_row. For insert_row, omit it to insert at the bottom of the target table.',
        },
        rows: {
          type: 'number',
          description: 'Positive row count used by create_table.',
        },
        columns: {
          type: 'number',
          description: 'Positive column count used by create_table.',
        },
        cellTexts: {
          description:
            'Optional cell text matrix. Use a 2D array like [["Header",""],["",""]] for create_table, or a one-row matrix for insert_row. Indices are zero-based.',
        },
        color: {
          type: 'string',
          description:
            'Shading color for set_shading. Accepts 6-digit hex with or without #, plus common names like light grey.',
        },
        placement: {
          oneOf: [
            {
              type: 'string',
              enum: ['document_start', 'document_end'],
            },
            {
              type: 'object',
              properties: {
                at: {
                  type: 'string',
                  enum: ['document_start', 'document_end'],
                },
              },
              required: ['at'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                position: {
                  type: 'string',
                  enum: ['before', 'after'],
                },
                target: {
                  oneOf: [
                    {
                      type: 'string',
                      description: 'Stable ref target string.',
                    },
                    {
                      type: 'object',
                      properties: {
                        by: {
                          type: 'string',
                          enum: [
                            'ref',
                            'nodeId',
                            'blockOrdinal',
                            'paragraphOrdinal',
                            'bodyParagraphOrdinal',
                            'headingOrdinal',
                            'listOrdinal',
                            'tableOrdinal',
                          ],
                        },
                        value: {
                          oneOf: [{ type: 'string' }, { type: 'number' }],
                        },
                      },
                      required: ['by', 'value'],
                      additionalProperties: false,
                    },
                    {
                      type: 'object',
                      properties: {
                        ref: { type: 'string' },
                        nodeId: { type: 'string' },
                        blockOrdinal: { type: 'number' },
                        paragraphOrdinal: { type: 'number' },
                        bodyParagraphOrdinal: { type: 'number' },
                        headingOrdinal: { type: 'number' },
                        listOrdinal: { type: 'number' },
                        tableOrdinal: { type: 'number' },
                      },
                      additionalProperties: false,
                    },
                  ],
                },
              },
              required: ['position', 'target'],
              additionalProperties: false,
            },
          ],
          description:
            'Placement for create_table. Defaults to document_end. For sibling insertion, use {position:"after", target:{by:"paragraphOrdinal", value:2}}.',
        },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Relative insertion position for preview_insert_row and insert_row (default before).',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_structure_insert',
    description:
      'Insert a table of contents, section break, paragraph, ordered paragraph group, or move a numbered section with deterministic high-level semantics.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['insert_toc', 'insert_section_break', 'insert_paragraph', 'insert_paragraphs', 'move_section'],
          description: 'Structure insert action to execute.',
        },
        text: {
          type: 'string',
          description: 'Paragraph text required for action=insert_paragraph.',
        },
        texts: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Ordered paragraph texts required for action=insert_paragraphs. Use for a heading followed by one or more paragraphs.',
        },
        headingLevel: {
          type: 'number',
          description:
            'Optional heading level 1-6 for the first text when action=insert_paragraphs, e.g. 2 for a Heading 2 section title.',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description:
            'Edit mode for paragraph/heading insertion actions (default direct). Use tracked for tracked-change additions.',
        },
        title: {
          type: 'string',
          description: 'Optional title paragraph inserted immediately before the TOC when action=insert_toc.',
        },
        breakType: {
          type: 'string',
          enum: ['continuous', 'nextPage', 'evenPage', 'oddPage'],
          description: 'Optional section break type for action=insert_section_break (default nextPage).',
        },
        sourceSection: {
          type: 'number',
          description: 'Positive section number to move for action=move_section, e.g. 3 for "move section 3".',
        },
        destinationSection: {
          type: 'number',
          description: 'Positive destination section number for action=move_section, e.g. 2 for "before section 2".',
        },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Relative section placement for action=move_section (default before).',
        },
        bottomNote: {
          type: 'string',
          description: 'Optional note to append at the very bottom after action=move_section completes.',
        },
        placement: {
          oneOf: [
            {
              type: 'string',
              enum: ['document_start', 'document_end'],
              description:
                'High-level document placement. Defaults to document_start for TOC and document_end for section breaks.',
            },
            {
              type: 'object',
              properties: {
                at: {
                  type: 'string',
                  enum: ['document_start', 'document_end'],
                },
              },
              required: ['at'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                position: {
                  type: 'string',
                  enum: ['before', 'after'],
                },
                target: {
                  oneOf: [
                    {
                      type: 'string',
                      description: 'Stable ref target string.',
                    },
                    {
                      type: 'object',
                      properties: {
                        by: {
                          type: 'string',
                          enum: [
                            'ref',
                            'nodeId',
                            'blockOrdinal',
                            'paragraphOrdinal',
                            'bodyParagraphOrdinal',
                            'headingOrdinal',
                            'listOrdinal',
                            'tableOrdinal',
                          ],
                        },
                        value: {
                          oneOf: [{ type: 'string' }, { type: 'number' }],
                        },
                      },
                      required: ['by', 'value'],
                      additionalProperties: false,
                    },
                    {
                      type: 'object',
                      properties: {
                        ref: { type: 'string' },
                        nodeId: { type: 'string' },
                        blockOrdinal: { type: 'number' },
                        paragraphOrdinal: { type: 'number' },
                        bodyParagraphOrdinal: { type: 'number' },
                        headingOrdinal: { type: 'number' },
                        listOrdinal: { type: 'number' },
                        tableOrdinal: { type: 'number' },
                      },
                      additionalProperties: false,
                    },
                  ],
                  description: 'Deterministic placement target used with relative before/after positioning.',
                },
              },
              required: ['position', 'target'],
              additionalProperties: false,
            },
          ],
          description: 'Optional high-level placement. Defaults are chosen per action when omitted.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_media_insert',
    description:
      'Insert an image with deterministic placement, optional alt text, and an optional caption in one step.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['insert_image_with_caption'],
          description: 'Media insert action to execute.',
        },
        src: {
          type: 'string',
          description: 'Optional image source URI/path. Defaults to attachment when omitted.',
        },
        alt: {
          type: 'string',
          description: 'Optional image alt text.',
        },
        caption: {
          type: 'string',
          description: 'Optional caption to insert after the image is created.',
        },
        placement: {
          oneOf: [
            {
              type: 'string',
              enum: ['document_start', 'document_end'],
              description: 'Insert at the start or end of the document.',
            },
            {
              type: 'object',
              properties: {
                at: {
                  type: 'string',
                  enum: ['document_start', 'document_end'],
                },
              },
              required: ['at'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                position: {
                  type: 'string',
                  enum: ['before', 'after'],
                },
                target: {
                  oneOf: [
                    {
                      type: 'string',
                      description: 'Stable ref target string.',
                    },
                    {
                      type: 'object',
                      properties: {
                        by: {
                          type: 'string',
                          enum: [
                            'ref',
                            'nodeId',
                            'blockOrdinal',
                            'paragraphOrdinal',
                            'bodyParagraphOrdinal',
                            'headingOrdinal',
                            'listOrdinal',
                            'tableOrdinal',
                          ],
                        },
                        value: {
                          oneOf: [{ type: 'string' }, { type: 'number' }],
                        },
                      },
                      required: ['by', 'value'],
                      additionalProperties: false,
                    },
                    {
                      type: 'object',
                      properties: {
                        ref: { type: 'string' },
                        nodeId: { type: 'string' },
                        blockOrdinal: { type: 'number' },
                        paragraphOrdinal: { type: 'number' },
                        bodyParagraphOrdinal: { type: 'number' },
                        headingOrdinal: { type: 'number' },
                        listOrdinal: { type: 'number' },
                        tableOrdinal: { type: 'number' },
                      },
                      additionalProperties: false,
                    },
                  ],
                  description: 'Deterministic placement target used with relative before/after positioning.',
                },
              },
              required: ['position', 'target'],
              additionalProperties: false,
            },
          ],
          description: 'Optional high-level placement. Defaults to document_end when omitted.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_comment_pass',
    description: 'Add the same comment text across eligible paragraphs with deterministic paragraph filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['comment_paragraphs'],
          description: 'Comment pass action to execute.',
        },
        text: {
          type: 'string',
          description: 'Comment text to add to each eligible paragraph.',
        },
        excludeStyleId: {
          type: 'string',
          description:
            'Optional paragraph styleId/styleName to skip, such as IntenseQuote. If omitted, quote-like styles are skipped automatically.',
        },
      },
      required: ['action', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_comment_transform',
    description:
      'Compact comment workflow for comment summaries, paragraph-wide comment passes, and deterministic risk-clause comment review.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['comment_paragraphs', 'comment_summary_at_top', 'comment_risk_clauses'],
          description: 'Comment transform action to execute.',
        },
        text: {
          type: 'string',
          description: 'Comment body for comment_paragraphs or comment_risk_clauses.',
        },
        commentText: {
          type: 'string',
          description: 'Alias for text when adding comments.',
        },
        headingText: {
          type: 'string',
          description: 'Heading inserted before a comment summary. Defaults to "Comment summary:".',
        },
        criteria: {
          type: 'string',
          description:
            'Natural-language risk criteria for comment_risk_clauses, such as "high liability risk for the Company".',
        },
        side: {
          type: 'string',
          description: 'Optional represented side for risk review, such as "Company" or "Customer".',
        },
        riskTerms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional extra terms used to score risk-clause candidates.',
        },
        minComments: {
          type: 'number',
          description: 'Minimum comments required for comment_risk_clauses verification. Default 1.',
        },
        maxComments: {
          type: 'number',
          description: 'Maximum comments to create for comment_risk_clauses. Default 8.',
        },
        excludeStyleId: {
          type: 'string',
          description: 'Optional style id/name to skip for comment_paragraphs.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_format_transform',
    description:
      'Compact formatting macro for deterministic color, letter-spacing, and body-font normalization edits with built-in verification.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['color_texts', 'apply_letter_spacing', 'normalize_body_font_size'],
          description: 'Formatting operation to execute.',
        },
        colors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              color: { type: 'string' },
            },
            required: ['text', 'color'],
            additionalProperties: false,
          },
          description: 'Text/color pairs for action=color_texts.',
        },
        target: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                by: {
                  type: 'string',
                  enum: [
                    'ref',
                    'nodeId',
                    'blockOrdinal',
                    'paragraphOrdinal',
                    'bodyParagraphOrdinal',
                    'headingOrdinal',
                    'listOrdinal',
                  ],
                },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
              required: ['by', 'value'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                ref: { type: 'string' },
                nodeId: { type: 'string' },
                blockOrdinal: { type: 'number' },
                paragraphOrdinal: { type: 'number' },
                bodyParagraphOrdinal: { type: 'number' },
                headingOrdinal: { type: 'number' },
                listOrdinal: { type: 'number' },
              },
              additionalProperties: false,
            },
          ],
          description: 'Optional formatting target. For heading letter spacing, use {by:"headingOrdinal", value:1}.',
        },
        color: {
          type: 'string',
          description: 'Color name or 6-digit hex for target formatting.',
        },
        letterSpacing: {
          type: 'number',
          description: 'Letter spacing in points for action=apply_letter_spacing.',
        },
        fontSize: {
          type: 'number',
          description: 'Body font size in points for action=normalize_body_font_size.',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description: 'Apply formatting directly or as tracked changes. Default direct.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_section_transform',
    description:
      'Compact section-move macro. Moves a numbered top-level section range before or after another section and verifies final order.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceSection: {
          type: 'number',
          description: 'Positive source section number to move, e.g. 3 for "move section 3".',
        },
        destinationSection: {
          type: 'number',
          description: 'Positive destination section number, e.g. 2 for "before section 2".',
        },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Relative placement. Default before.',
        },
        bottomNote: {
          type: 'string',
          description: 'Optional note to append at the bottom after the section move.',
        },
      },
      required: ['sourceSection', 'destinationSection'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_style_clone',
    description:
      'Apply one deterministic formatting facet to repeated text matches or a specific paragraph/heading/list target without raw edit loops.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['apply_color_to_matches', 'apply_color_to_text', 'apply_color_to_target'],
          description: 'Style clone action to execute.',
        },
        targetText: {
          type: 'string',
          description:
            'Text to color across paragraphs, headings, and list items. Use apply_color_to_text for words/phrases inside a block.',
        },
        target: {
          oneOf: [
            {
              type: 'string',
              description: 'Stable ref target string.',
            },
            {
              type: 'object',
              properties: {
                by: {
                  type: 'string',
                  enum: [
                    'ref',
                    'nodeId',
                    'blockOrdinal',
                    'paragraphOrdinal',
                    'bodyParagraphOrdinal',
                    'headingOrdinal',
                    'listOrdinal',
                    'tableOrdinal',
                  ],
                },
                value: {
                  oneOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
              required: ['by', 'value'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                ref: { type: 'string' },
                nodeId: { type: 'string' },
                blockOrdinal: { type: 'number' },
                paragraphOrdinal: { type: 'number' },
                bodyParagraphOrdinal: { type: 'number' },
                headingOrdinal: { type: 'number' },
                listOrdinal: { type: 'number' },
                tableOrdinal: { type: 'number' },
              },
              additionalProperties: false,
            },
          ],
          description:
            'Deterministic paragraph/heading/list-item selector for apply_color_to_target, e.g. {by:"paragraphOrdinal", value:2}.',
        },
        color: {
          type: 'string',
          description:
            'Color to apply, as 6-digit hex with or without leading #, or a common name such as red, green, or blue.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'When false, match targetText case-insensitively. Default true.',
        },
        matchMode: {
          type: 'string',
          enum: ['exact', 'contains'],
          description:
            'Match whole block text or substring occurrences. apply_color_to_text always colors substring occurrences, even when omitted.',
        },
        changeMode: {
          type: 'string',
          enum: ['direct', 'tracked'],
          description: 'Apply formatting directly or as tracked changes. Default direct.',
        },
      },
      required: ['action', 'color'],
      additionalProperties: false,
    },
  },
  {
    name: 'superdoc_track_changes',
    description:
      'Return a compact tracked-changes review summary or deterministically accept/reject pending changes globally or by author.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['summary', 'accept_all', 'reject_all'],
          description: 'Tracked changes workflow action.',
        },
        scope: {
          type: 'string',
          enum: ['all', 'author'],
          description: 'Optional scope override. Use "author" with author to accept/reject one reviewer only.',
        },
        author: {
          type: 'string',
          description: 'Author name for scope "author".',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
];

const WORKFLOW_POC_TOOL_NAME_SET = new Set<string>(WORKFLOW_POC_TOOL_NAMES);

function toOpenAiTool(definition: WorkflowPocToolDefinition): WorkflowPocOpenAiTool {
  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.inputSchema,
    },
  };
}

function toAnthropicTool(definition: WorkflowPocToolDefinition): WorkflowPocAnthropicTool {
  return {
    name: definition.name,
    description: definition.description,
    input_schema: definition.inputSchema,
  };
}

function toGenericTool(definition: WorkflowPocToolDefinition): WorkflowPocGenericTool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
  };
}

function toProviderTool(provider: WorkflowPocProvider, definition: WorkflowPocToolDefinition): WorkflowPocProviderTool {
  if (provider === 'anthropic') {
    return toAnthropicTool(definition);
  }
  if (provider === 'generic') {
    return toGenericTool(definition);
  }
  return toOpenAiTool(definition);
}

export function listWorkflowPocTools(provider: WorkflowPocProvider): WorkflowPocProviderTool[] {
  return WORKFLOW_POC_TOOL_DEFINITIONS.map((definition) => toProviderTool(provider, definition));
}

export function isWorkflowPocToolName(toolName: string): toolName is WorkflowPocToolName {
  return WORKFLOW_POC_TOOL_NAME_SET.has(toolName);
}
