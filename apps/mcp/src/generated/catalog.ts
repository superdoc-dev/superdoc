// Auto-generated from packages/sdk/tools/catalog.json
// Do not edit manually — re-run generate:all to update.
export const MCP_TOOL_CATALOG = {
  contractVersion: '0.1.0',
  generatedAt: null,
  toolCount: 9,
  tools: [
    {
      toolName: 'superdoc_get_content',
      description:
        'Read document content in various formats. Call this first in any workflow to understand document structure before making edits. Action "blocks" returns structured block data with nodeId, nodeType, textPreview, optional full text when includeText:true, formatting properties (fontFamily, fontSize, color, bold, underline, alignment), and ref handles for immediate use with superdoc_edit or superdoc_format. When you need to evaluate or rewrite existing paragraphs or clauses, prefer action "blocks" with includeText:true so you can identify the correct block and then target it by nodeId. Action "text" and "markdown" return the full document as plain text or Markdown. Action "html" returns HTML. Action "info" returns document metadata: word count, paragraph count, page count, outline, available styles, and capability flags. The "blocks" action supports pagination via "offset" and "limit", and filtering via "nodeTypes". Other actions ignore these parameters. This tool never modifies the document. Do NOT call superdoc_edit or superdoc_format without first reading blocks to get valid refs and formatting reference values.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['blocks', 'extract', 'html', 'info', 'markdown', 'text'],
            description: 'The action to perform. One of: blocks, extract, html, info, markdown, text.',
          },
          unflattenLists: {
            type: 'boolean',
            description:
              "When true, flattens nested list structures in output. Default: false. Only for action 'html'. Omit for other actions.",
          },
          offset: {
            type: 'number',
            description: "Number of blocks to skip. Default: 0. Only for action 'blocks'. Omit for other actions.",
          },
          limit: {
            type: 'number',
            description:
              "Maximum blocks to return. Omit for all blocks. Only for action 'blocks'. Omit for other actions.",
          },
          nodeTypes: {
            type: 'array',
            items: {
              enum: [
                'paragraph',
                'heading',
                'listItem',
                'table',
                'tableRow',
                'tableCell',
                'tableOfContents',
                'image',
                'sdt',
              ],
            },
            description:
              "Filter by block types (e.g. ['paragraph', 'heading']). Omit for all types. Only for action 'blocks'. Omit for other actions.",
          },
          includeText: {
            type: 'boolean',
            description:
              "When true, includes the full flattened block text in each block entry. Only for action 'blocks'. Omit for other actions.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: false,
      operations: [
        {
          operationId: 'doc.getText',
          intentAction: 'text',
        },
        {
          operationId: 'doc.getMarkdown',
          intentAction: 'markdown',
        },
        {
          operationId: 'doc.getHtml',
          intentAction: 'html',
        },
        {
          operationId: 'doc.info',
          intentAction: 'info',
        },
        {
          operationId: 'doc.extract',
          intentAction: 'extract',
        },
        {
          operationId: 'doc.blocks.list',
          intentAction: 'blocks',
        },
      ],
    },
    {
      toolName: 'superdoc_edit',
      description:
        'The primary tool for inserting content into documents. ALWAYS use action "insert" with type "markdown" to create headings, paragraphs, or any block content — this is faster and creates proper document structure in one call. Do NOT use superdoc_create for headings or paragraphs. The markdown parser creates headings from # markers (# = Heading1, ## = Heading2), bold from **text**, italic from *text*, and numbered/bullet lists. Position markdown inserts with "target" (a BlockNodeAddress like {kind:"block", nodeType, nodeId}) and "placement" (before, after, insideStart, insideEnd). Without a target, content appends at the end of the document. IMPORTANT: After a markdown insert, analyze the document context (what kind of document, how titles and body text are styled) and follow up with ONE superdoc_mutations call to format inserted blocks so they look like they belong. Each format.apply step accepts "inline" (fontFamily, fontSize, bold, underline, color), "alignment", and "scope" in the same step. Use scope: "block" so formatting covers the entire paragraph. Copy the exact property values from the existing get_content blocks (fontFamily, fontSize, color, alignment, bold, underline). Do NOT invent values — use what the blocks show. Also supports replace, delete, and undo/redo. For replace and delete, pass a "ref" from superdoc_search or superdoc_get_content blocks. A search ref covers only the matched substring; a block ref covers the entire block text, so use block refs when rewriting or shortening whole paragraphs. For multi-step redlines or whole-clause rewrites, prefer superdoc_mutations with where:{by:"block", nodeType, nodeId} from superdoc_get_content action "blocks" includeText:true rather than relying on text selectors. Refs expire after any mutation; always re-search before the next edit. For 2+ edits that must succeed or fail atomically, use superdoc_mutations instead. Supports "dryRun" to preview changes and "changeMode: tracked" to record edits as tracked changes (not supported for markdown/html inserts). Do NOT build "target" objects manually when a ref is available; prefer "ref" for simpler, more reliable targeting.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['delete', 'insert', 'redo', 'replace', 'undo'],
            description: 'The action to perform. One of: delete, insert, redo, replace, undo.',
          },
          force: {
            type: 'boolean',
            description: 'Bypass confirmation checks.',
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the result without applying changes.',
          },
          target: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'selection',
                    type: 'string',
                  },
                  start: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'text',
                            type: 'string',
                          },
                          blockId: {
                            type: 'string',
                          },
                          offset: {
                            type: 'number',
                          },
                        },
                        required: ['kind', 'blockId', 'offset'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'nodeEdge',
                            type: 'string',
                          },
                          node: {
                            type: 'object',
                            properties: {
                              kind: {
                                const: 'block',
                                type: 'string',
                              },
                              nodeType: {
                                enum: ['paragraph', 'heading', 'table', 'tableOfContents', 'sdt', 'image'],
                              },
                              nodeId: {
                                type: 'string',
                              },
                            },
                            required: ['kind', 'nodeType', 'nodeId'],
                          },
                          edge: {
                            enum: ['before', 'after'],
                          },
                        },
                        required: ['kind', 'node', 'edge'],
                      },
                    ],
                    description:
                      "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                  },
                  end: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'text',
                            type: 'string',
                          },
                          blockId: {
                            type: 'string',
                          },
                          offset: {
                            type: 'number',
                          },
                        },
                        required: ['kind', 'blockId', 'offset'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'nodeEdge',
                            type: 'string',
                          },
                          node: {
                            type: 'object',
                            properties: {
                              kind: {
                                const: 'block',
                                type: 'string',
                              },
                              nodeType: {
                                enum: ['paragraph', 'heading', 'table', 'tableOfContents', 'sdt', 'image'],
                              },
                              nodeId: {
                                type: 'string',
                              },
                            },
                            required: ['kind', 'nodeType', 'nodeId'],
                          },
                          edge: {
                            enum: ['before', 'after'],
                          },
                        },
                        required: ['kind', 'node', 'edge'],
                      },
                    ],
                    description:
                      "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                  },
                },
                required: ['kind', 'start', 'end'],
              },
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'block',
                    type: 'string',
                  },
                  nodeType: {
                    enum: [
                      'paragraph',
                      'heading',
                      'listItem',
                      'table',
                      'tableRow',
                      'tableCell',
                      'tableOfContents',
                      'image',
                      'sdt',
                    ],
                  },
                  nodeId: {
                    type: 'string',
                  },
                },
                required: ['kind', 'nodeType', 'nodeId'],
              },
            ],
            description:
              "Target address. For inline/set_style: prefer 'ref' from superdoc_search, or use {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. For paragraph actions (set_alignment, set_indentation, set_spacing, set_direction, set_flow_options): use {kind:'block', nodeType:'paragraph'|'heading'|'listItem', nodeId:'<nodeId from blocks list>'}.",
          },
          value: {
            type: 'string',
            description: "Text content to insert. Only for action 'insert'. Omit for other actions.",
          },
          type: {
            type: 'string',
            description:
              "Content format: 'text' (default), 'markdown', or 'html'. Only for action 'insert'. Omit for other actions.",
            enum: ['text', 'markdown', 'html'],
          },
          ref: {
            type: 'string',
            description:
              'Handle ref from superdoc_search result (pass handle.ref value directly). Preferred over building a target object.',
          },
          content: {
            oneOf: [
              {
                type: 'object',
                properties: {},
              },
              {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {},
                },
              },
            ],
            description:
              "Document fragment to insert (structured content). Only for actions 'insert', 'replace'. Omit for other actions.",
          },
          placement: {
            type: 'string',
            description:
              "Where to place content relative to target: 'before', 'after', 'insideStart', or 'insideEnd'. Only for action 'insert'. Omit for other actions.",
            enum: ['before', 'after', 'insideStart', 'insideEnd'],
          },
          nestingPolicy: {
            type: 'object',
            properties: {
              tables: {
                enum: ['forbid', 'allow'],
              },
            },
            description:
              "Controls nesting behavior. tables: 'allow' permits inserting tables inside other tables. Only for actions 'insert', 'replace'. Omit for other actions.",
          },
          text: {
            type: 'string',
            description: "Replacement text content. Only for action 'replace'. Omit for other actions.",
          },
          behavior: {
            type: 'string',
            enum: ['selection', 'exact'],
            description:
              "Delete behavior: 'selection' (default) or 'exact'. Only for action 'delete'. Omit for other actions.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.insert',
          intentAction: 'insert',
          requiredOneOf: [['target', 'value'], ['ref', 'value'], ['value'], ['content']],
        },
        {
          operationId: 'doc.replace',
          intentAction: 'replace',
          requiredOneOf: [
            ['target', 'text'],
            ['ref', 'text'],
            ['target', 'content'],
            ['ref', 'content'],
          ],
        },
        {
          operationId: 'doc.delete',
          intentAction: 'delete',
          requiredOneOf: [['target'], ['ref']],
        },
        {
          operationId: 'doc.history.undo',
          intentAction: 'undo',
        },
        {
          operationId: 'doc.history.redo',
          intentAction: 'redo',
        },
      ],
    },
    {
      toolName: 'superdoc_format',
      description:
        'Change text and paragraph formatting. To format multiple items at once, use superdoc_mutations with format.apply steps instead of calling this tool repeatedly. Use require "all" with a node selector to format every heading or paragraph in one batch. Use this tool for single-item formatting when you have a valid ref or nodeId. Action "inline" applies character formatting (bold, italic, underline, color, fontSize, fontFamily, highlight, strike, vertAlign) to a text range via "ref". Action "set_style" applies a named paragraph style by styleId (get available styles from superdoc_get_content info). Actions "set_alignment", "set_indentation", "set_spacing", "set_direction", and "set_flow_options" change paragraph-level properties and require a block target: {kind:"block", nodeType:"paragraph", nodeId:"<nodeId>"}, NOT a ref. Use "set_flow_options" with pageBreakBefore:true to start a paragraph on a new page. Supports "dryRun" and "changeMode: tracked" for inline formatting. Paragraph-level actions do NOT support tracked changes. Do NOT use a search ref for paragraph-level actions; they require a block target with nodeId. Do NOT use {kind:"block", start:{kind:"nodeEdge",...}} or selection-like structures for paragraph actions. ONLY {kind:"block", nodeType, nodeId} is accepted. Do NOT issue multiple superdoc_format calls in parallel; each call invalidates refs for subsequent calls.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'inline',
              'set_alignment',
              'set_direction',
              'set_flow_options',
              'set_indentation',
              'set_spacing',
              'set_style',
            ],
            description:
              'The action to perform. One of: inline, set_alignment, set_direction, set_flow_options, set_indentation, set_spacing, set_style.',
          },
          force: {
            type: 'boolean',
            description: 'Bypass confirmation checks.',
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the result without applying changes.',
          },
          target: {
            type: 'object',
            properties: {
              kind: {
                const: 'selection',
                type: 'string',
              },
              start: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'text',
                        type: 'string',
                      },
                      blockId: {
                        type: 'string',
                      },
                      offset: {
                        type: 'number',
                      },
                    },
                    required: ['kind', 'blockId', 'offset'],
                  },
                  {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'nodeEdge',
                        type: 'string',
                      },
                      node: {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'block',
                            type: 'string',
                          },
                          nodeType: {
                            enum: ['paragraph', 'heading', 'table', 'tableOfContents', 'sdt', 'image'],
                          },
                          nodeId: {
                            type: 'string',
                          },
                        },
                        required: ['kind', 'nodeType', 'nodeId'],
                      },
                      edge: {
                        enum: ['before', 'after'],
                      },
                    },
                    required: ['kind', 'node', 'edge'],
                  },
                ],
                description:
                  "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
              },
              end: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'text',
                        type: 'string',
                      },
                      blockId: {
                        type: 'string',
                      },
                      offset: {
                        type: 'number',
                      },
                    },
                    required: ['kind', 'blockId', 'offset'],
                  },
                  {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'nodeEdge',
                        type: 'string',
                      },
                      node: {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'block',
                            type: 'string',
                          },
                          nodeType: {
                            enum: ['paragraph', 'heading', 'table', 'tableOfContents', 'sdt', 'image'],
                          },
                          nodeId: {
                            type: 'string',
                          },
                        },
                        required: ['kind', 'nodeType', 'nodeId'],
                      },
                      edge: {
                        enum: ['before', 'after'],
                      },
                    },
                    required: ['kind', 'node', 'edge'],
                  },
                ],
                description:
                  "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
              },
            },
            required: ['kind', 'start', 'end'],
            description:
              "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle. Required for actions 'set_style', 'set_alignment', 'set_indentation', 'set_spacing', 'set_flow_options', 'set_direction'.",
          },
          inline: {
            type: 'object',
            properties: {
              bold: {
                type: 'boolean',
              },
              italic: {
                type: 'boolean',
              },
              strike: {
                type: 'boolean',
              },
              underline: {
                oneOf: [
                  {
                    type: 'boolean',
                  },
                  {
                    type: 'object',
                    properties: {
                      style: {
                        type: 'string',
                      },
                      color: {
                        type: 'string',
                      },
                      themeColor: {
                        type: 'string',
                      },
                    },
                  },
                ],
              },
              highlight: {
                type: 'string',
              },
              color: {
                type: 'string',
              },
              fontSize: {
                type: 'number',
              },
              fontFamily: {
                type: 'string',
              },
              letterSpacing: {
                type: 'number',
              },
              vertAlign: {
                enum: ['superscript', 'subscript', 'baseline'],
              },
              position: {
                type: 'number',
              },
              dstrike: {
                type: 'boolean',
              },
              smallCaps: {
                type: 'boolean',
              },
              caps: {
                type: 'boolean',
              },
              shading: {
                type: 'object',
                properties: {
                  fill: {
                    type: 'string',
                  },
                  color: {
                    type: 'string',
                  },
                  val: {
                    type: 'string',
                  },
                },
              },
              border: {
                type: 'object',
                properties: {
                  val: {
                    type: 'string',
                  },
                  sz: {
                    type: 'number',
                  },
                  color: {
                    type: 'string',
                  },
                  space: {
                    type: 'number',
                  },
                },
              },
              outline: {
                type: 'boolean',
              },
              shadow: {
                type: 'boolean',
              },
              emboss: {
                type: 'boolean',
              },
              imprint: {
                type: 'boolean',
              },
              charScale: {
                type: 'number',
              },
              kerning: {
                type: 'number',
              },
              vanish: {
                type: 'boolean',
              },
              webHidden: {
                type: 'boolean',
              },
              specVanish: {
                type: 'boolean',
              },
              rtl: {
                type: 'boolean',
              },
              cs: {
                type: 'boolean',
              },
              bCs: {
                type: 'boolean',
              },
              iCs: {
                type: 'boolean',
              },
              eastAsianLayout: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  combine: {
                    type: 'boolean',
                  },
                  combineBrackets: {
                    type: 'string',
                  },
                  vert: {
                    type: 'boolean',
                  },
                  vertCompress: {
                    type: 'boolean',
                  },
                },
              },
              em: {
                type: 'string',
              },
              fitText: {
                type: 'object',
                properties: {
                  val: {
                    type: 'number',
                  },
                  id: {
                    type: 'string',
                  },
                },
              },
              snapToGrid: {
                type: 'boolean',
              },
              lang: {
                type: 'object',
                properties: {
                  val: {
                    type: 'string',
                  },
                  eastAsia: {
                    type: 'string',
                  },
                  bidi: {
                    type: 'string',
                  },
                },
              },
              oMath: {
                type: 'boolean',
              },
              rStyle: {
                type: 'string',
              },
              rFonts: {
                type: 'object',
                properties: {
                  ascii: {
                    type: 'string',
                  },
                  hAnsi: {
                    type: 'string',
                  },
                  eastAsia: {
                    type: 'string',
                  },
                  cs: {
                    type: 'string',
                  },
                  asciiTheme: {
                    type: 'string',
                  },
                  hAnsiTheme: {
                    type: 'string',
                  },
                  eastAsiaTheme: {
                    type: 'string',
                  },
                  csTheme: {
                    type: 'string',
                  },
                  hint: {
                    type: 'string',
                  },
                },
              },
              fontSizeCs: {
                type: 'number',
              },
              ligatures: {
                type: 'string',
              },
              numForm: {
                type: 'string',
              },
              numSpacing: {
                type: 'string',
              },
              stylisticSets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'number',
                    },
                    val: {
                      type: 'boolean',
                    },
                  },
                  required: ['id'],
                },
              },
              contextualAlternates: {
                type: 'boolean',
              },
            },
            description:
              "Inline formatting properties to apply. Set a property to apply it, use null to clear it. Example: {bold: true, italic: true} or {bold: null} to remove bold. Only for action 'inline'. Omit for other actions.",
          },
          ref: {
            type: 'string',
            description:
              "Handle ref string from a superdoc_search result. Pass the handle.ref value directly (e.g. 'text:eyJ...'). Preferred over 'target' for inline formatting. Only for action 'inline'. Omit for other actions.",
          },
          styleId: {
            type: 'string',
            description:
              "Named paragraph style ID (e.g. 'Normal', 'Heading1', 'BodyText'). Use superdoc_search to find a nearby paragraph, then inspect its style to determine the correct styleId. Required for action 'set_style'.",
          },
          alignment: {
            type: 'string',
            enum: ['left', 'center', 'right', 'justify'],
            description: "Required for action 'set_alignment'.",
          },
          left: {
            type: 'number',
            description:
              "Left indentation in twips (1440 = 1 inch). Only for action 'set_indentation'. Omit for other actions.",
          },
          right: {
            type: 'number',
            description:
              "Right indentation in twips (1440 = 1 inch). Only for action 'set_indentation'. Omit for other actions.",
          },
          firstLine: {
            type: 'number',
            description:
              "First line indent in twips. Cannot be combined with hanging. Only for action 'set_indentation'. Omit for other actions.",
          },
          hanging: {
            type: 'number',
            description:
              "Hanging indent in twips. Cannot be combined with firstLine. Only for action 'set_indentation'. Omit for other actions.",
          },
          before: {
            type: 'number',
            description:
              "Space before paragraph in twips (20 twips = 1pt). Only for action 'set_spacing'. Omit for other actions.",
          },
          after: {
            type: 'number',
            description:
              "Space after paragraph in twips (20 twips = 1pt). Only for action 'set_spacing'. Omit for other actions.",
          },
          line: {
            type: 'number',
            description:
              "Line spacing value. Meaning depends on lineRule. Must be provided together with lineRule. Only for action 'set_spacing'. Omit for other actions.",
          },
          lineRule: {
            type: 'string',
            description:
              "Line spacing rule. Required when 'line' is set. Only for action 'set_spacing'. Omit for other actions.",
            enum: ['auto', 'exact', 'atLeast'],
          },
          contextualSpacing: {
            type: 'boolean',
            description: "Only for action 'set_flow_options'. Omit for other actions.",
          },
          pageBreakBefore: {
            type: 'boolean',
            description: "Only for action 'set_flow_options'. Omit for other actions.",
          },
          suppressAutoHyphens: {
            type: 'boolean',
            description: "Only for action 'set_flow_options'. Omit for other actions.",
          },
          direction: {
            type: 'string',
            enum: ['ltr', 'rtl'],
            description: "Required for action 'set_direction'.",
          },
          alignmentPolicy: {
            type: 'string',
            enum: ['preserve', 'matchDirection'],
            description: "Only for action 'set_direction'. Omit for other actions.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.format.apply',
          intentAction: 'inline',
          requiredOneOf: [
            ['target', 'inline'],
            ['ref', 'inline'],
          ],
        },
        {
          operationId: 'doc.styles.paragraph.setStyle',
          intentAction: 'set_style',
          required: ['target', 'styleId'],
        },
        {
          operationId: 'doc.format.paragraph.setAlignment',
          intentAction: 'set_alignment',
          required: ['target', 'alignment'],
        },
        {
          operationId: 'doc.format.paragraph.setIndentation',
          intentAction: 'set_indentation',
          required: ['target'],
        },
        {
          operationId: 'doc.format.paragraph.setSpacing',
          intentAction: 'set_spacing',
          required: ['target'],
        },
        {
          operationId: 'doc.format.paragraph.setFlowOptions',
          intentAction: 'set_flow_options',
          requiredOneOf: [
            ['target', 'contextualSpacing'],
            ['target', 'pageBreakBefore'],
            ['target', 'suppressAutoHyphens'],
          ],
        },
        {
          operationId: 'doc.format.paragraph.setDirection',
          intentAction: 'set_direction',
          required: ['target', 'direction'],
        },
      ],
    },
    {
      toolName: 'superdoc_create',
      description:
        'IMPORTANT: For headings and paragraphs, use superdoc_edit with type "markdown" instead — it is faster, creates proper styles, and handles positioning via target + placement. Only use superdoc_create for tables or when markdown cannot express the content. Creates a single paragraph, heading, or table. Returns nodeId and ref for the created block. After creating, the returned ref is valid for ONE immediate superdoc_format call. For subsequent operations, re-fetch blocks with superdoc_get_content to get fresh refs (refs expire after any mutation). When the user asks for a "heading", use action "heading" with a level (default 1). Use action "paragraph" for regular body text. Position with "at": {kind:"documentEnd"} (default), {kind:"documentStart"}, or {kind:"after"/"before", target:{kind:"block", nodeType, nodeId}} for relative placement. When creating multiple items in sequence, use the previous response nodeId as the next "at" target to maintain correct ordering. Do NOT use newlines in "text" to create multiple paragraphs; call this tool separately for each one.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['heading', 'paragraph', 'table'],
            description: 'The action to perform. One of: heading, paragraph, table.',
          },
          force: {
            type: 'boolean',
            description: 'Bypass confirmation checks.',
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the result without applying changes.',
          },
          at: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'documentStart',
                    type: 'string',
                  },
                },
                required: ['kind'],
              },
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'documentEnd',
                    type: 'string',
                  },
                },
                required: ['kind'],
              },
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'before',
                    type: 'string',
                  },
                  target: {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'block',
                        type: 'string',
                      },
                      nodeType: {
                        enum: [
                          'paragraph',
                          'heading',
                          'listItem',
                          'table',
                          'tableRow',
                          'tableCell',
                          'tableOfContents',
                          'image',
                          'sdt',
                        ],
                      },
                      nodeId: {
                        type: 'string',
                      },
                    },
                    required: ['kind', 'nodeType', 'nodeId'],
                  },
                },
                required: ['kind', 'target'],
              },
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'after',
                    type: 'string',
                  },
                  target: {
                    type: 'object',
                    properties: {
                      kind: {
                        const: 'block',
                        type: 'string',
                      },
                      nodeType: {
                        enum: [
                          'paragraph',
                          'heading',
                          'listItem',
                          'table',
                          'tableRow',
                          'tableCell',
                          'tableOfContents',
                          'image',
                          'sdt',
                        ],
                      },
                      nodeId: {
                        type: 'string',
                      },
                    },
                    required: ['kind', 'nodeType', 'nodeId'],
                  },
                },
                required: ['kind', 'target'],
              },
            ],
            description:
              "Position: {kind:'documentEnd'} to append, {kind:'documentStart'} to prepend, or {kind:'before'|'after', target:{kind:'block', nodeType:'...', nodeId:'...'}} for relative placement.",
          },
          text: {
            type: 'string',
            description:
              'Paragraph text content. Each call creates ONE paragraph. For multiple items (e.g. list items), call superdoc_create separately for each item — do NOT use newlines to put multiple items in one paragraph.',
          },
          input: {
            type: 'object',
            description: 'Full paragraph input as JSON (alternative to individual text/at params).',
          },
          level: {
            type: 'number',
            description: "Heading level (1-6). Required for action 'heading'.",
          },
          rows: {
            type: 'number',
            description: "Required for action 'table'.",
          },
          columns: {
            type: 'number',
            description: "Required for action 'table'.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.create.paragraph',
          intentAction: 'paragraph',
        },
        {
          operationId: 'doc.create.heading',
          intentAction: 'heading',
          required: ['level'],
        },
        {
          operationId: 'doc.create.table',
          intentAction: 'table',
          required: ['rows', 'columns'],
        },
      ],
    },
    {
      toolName: 'superdoc_list',
      description:
        'Create and manipulate bullet and numbered lists. Most actions require a list-item target: {kind:"block", nodeType:"listItem", nodeId:"<id>"}. Exceptions: "create" and "attach" operate on paragraph targets (they turn paragraphs into list items). Find nodeIds via superdoc_get_content({action:"blocks"}) — pick listItem blocks for most actions, paragraph blocks for create/attach.\n\nCREATE & CONVERT:\n• "create" — make a NEW list from paragraphs. Two modes: mode:"empty" with at:{kind:"block", nodeType:"paragraph", nodeId} converts a single paragraph; mode:"fromParagraphs" with target:{from:{...paragraph block address}, to:{...paragraph block address}} converts a range — ALL paragraphs between from and to become items, so make sure no other content sits between them. Pass a preset ("disc"|"circle"|"square"|"dash" for bullets; "decimal"|"decimalParenthesis"|"lowerLetter"|"upperLetter"|"lowerRoman"|"upperRoman" for ordered) or a custom style. Use "create" to start a fresh list — NOT to extend an existing one (use "attach" for that).\n• "attach" — add paragraphs to an EXISTING list, inheriting its numbering definition. Pass target:{paragraph block address} (or {from, to} range of paragraphs) + attachTo:{kind:"block", nodeType:"listItem", nodeId:"<any item in destination list>"} + optional level:0..8. Use this to extend a list or as the second half of a merge workflow (see "join" below).\n• "set_type" — convert an existing list between ordered and bullet. Pass target:{listItem} + kind:"ordered" or "bullet". Adjacent compatible sequences are merged automatically to preserve continuous numbering.\n• "detach" — convert a list item back to a plain paragraph. Pass target:{listItem}.\n\nITEMS & NESTING:\n• "insert" — add a new list item adjacent to an existing item in the same list. Pass target:{listItem} + position:"before"|"after" + optional text. Use this (NOT superdoc_create) to add items to an existing list.\n• "indent" / "outdent" — bump the target item\'s nesting level by one (0-8 range). Pass target:{listItem}.\n• "set_level" — jump the target item to an explicit level. Pass target:{listItem} + level:0..8.\n\nNUMBERING (ordered lists):\n• "set_value" — restart numbering at the target. Pass target:{listItem} + value:<number> (e.g. value:1 to start over) or value:null to clear a previous override. Mid-sequence targets are atomically split off into their own sequence.\n• "continue_previous" — make the target\'s sequence continue numbering from the nearest compatible previous sequence (same abstract definition). Pass target:{listItem of the sequence you want to renumber}. Fails with NO_COMPATIBLE_PREVIOUS or INCOMPATIBLE_DEFINITIONS if no matching prior sequence exists.\n\nSEQUENCE SHAPE (merge / split):\n• "merge" — merge the target\'s sequence with an adjacent one into one continuous list. Pass target:{listItem} + direction:"withPrevious" or "withNext". Absorbed items adopt the absorbing sequence\'s numbering definition, and empty paragraphs between the two sequences are removed so numbering flows continuously.\n• "split" — split the target\'s sequence at the target item into two independent lists. The target and everything after become a new sequence that restarts numbering at 1. Pass target:{listItem}; add restartNumbering:false to keep the count continuing instead of restarting.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'attach',
              'continue_previous',
              'create',
              'detach',
              'indent',
              'insert',
              'merge',
              'outdent',
              'set_level',
              'set_type',
              'set_value',
              'split',
            ],
            description:
              'The action to perform. One of: attach, continue_previous, create, detach, indent, insert, merge, outdent, set_level, set_type, set_value, split.',
          },
          force: {
            type: 'boolean',
            description: 'Bypass confirmation checks.',
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
          },
          dryRun: {
            type: 'boolean',
            description: 'Preview the result without applying changes.',
          },
          target: {
            type: 'object',
            properties: {
              kind: {
                const: 'block',
                type: 'string',
              },
              nodeType: {
                const: 'listItem',
                type: 'string',
              },
              nodeId: {
                type: 'string',
              },
            },
            required: ['kind', 'nodeType', 'nodeId'],
            description:
              "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}. Required for actions 'insert', 'attach', 'detach', 'indent', 'outdent', 'merge', 'split', 'set_level', 'set_value', 'continue_previous', 'set_type'.",
          },
          position: {
            type: 'string',
            description:
              "Required. Insert position relative to target: 'before' or 'after'. Required for action 'insert'.",
            enum: ['before', 'after'],
          },
          text: {
            type: 'string',
            description: "Text content for the new list item. Only for action 'insert'. Omit for other actions.",
          },
          input: {
            type: 'object',
            description: 'Operation input as JSON object.',
          },
          nodeId: {
            type: 'string',
            description: 'Node ID of the target list item.',
          },
          mode: {
            type: 'string',
            description:
              "Required. 'fromParagraphs' converts existing paragraphs into list items — each paragraph becomes one item, so create one paragraph per item first. 'empty' creates a new empty list at 'at'. Required for action 'create'.",
            enum: ['empty', 'fromParagraphs'],
          },
          at: {
            type: 'object',
            properties: {
              kind: {
                const: 'block',
                type: 'string',
              },
              nodeType: {
                const: 'paragraph',
                type: 'string',
              },
              nodeId: {
                type: 'string',
              },
            },
            required: ['kind', 'nodeType', 'nodeId'],
            description:
              "Required when mode is 'empty'. The paragraph to create the list at. Format: {kind:'block', nodeType:'paragraph', nodeId:'<id>'}. Only for action 'create'. Omit for other actions.",
          },
          kind: {
            type: 'string',
            description:
              "List type: 'bullet' for bullet points, 'ordered' for numbered lists. Required for action 'set_type'.",
            enum: ['ordered', 'bullet'],
          },
          level: {
            type: 'number',
            description: "List nesting level (0-8). 0 is the top level. Required for action 'set_level'.",
          },
          preset: {
            type: 'string',
            description:
              "Predefined list style preset. Overrides 'kind' with a specific numbering or bullet format. Only for action 'create'. Omit for other actions.",
            enum: [
              'decimal',
              'decimalParenthesis',
              'lowerLetter',
              'upperLetter',
              'lowerRoman',
              'upperRoman',
              'disc',
              'circle',
              'square',
              'dash',
            ],
          },
          style: {
            type: 'object',
            properties: {
              version: {
                const: 1,
                type: 'number',
              },
              levels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    level: {
                      type: 'number',
                    },
                    numFmt: {
                      type: 'string',
                    },
                    lvlText: {
                      type: 'string',
                    },
                    start: {
                      type: 'number',
                    },
                    alignment: {
                      enum: ['left', 'center', 'right'],
                    },
                    indents: {
                      type: 'object',
                      properties: {
                        left: {
                          type: 'number',
                        },
                        hanging: {
                          type: 'number',
                        },
                        firstLine: {
                          type: 'number',
                        },
                      },
                    },
                    trailingCharacter: {
                      enum: ['tab', 'space', 'nothing'],
                    },
                    markerFont: {
                      type: 'string',
                    },
                    pictureBulletId: {
                      type: 'number',
                    },
                    tabStopAt: {},
                  },
                  required: ['level'],
                },
              },
            },
            required: ['version', 'levels'],
            description: "Only for action 'create'. Omit for other actions.",
          },
          sequence: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  mode: {
                    const: 'new',
                    type: 'string',
                  },
                  startAt: {
                    type: 'number',
                  },
                },
                required: ['mode'],
              },
              {
                type: 'object',
                properties: {
                  mode: {
                    const: 'continuePrevious',
                    type: 'string',
                  },
                },
                required: ['mode'],
              },
            ],
            description: "Only for action 'create'. Omit for other actions.",
          },
          attachTo: {
            type: 'object',
            properties: {
              kind: {
                const: 'block',
                type: 'string',
              },
              nodeType: {
                const: 'listItem',
                type: 'string',
              },
              nodeId: {
                type: 'string',
              },
            },
            required: ['kind', 'nodeType', 'nodeId'],
            description: "Required for action 'attach'.",
          },
          direction: {
            type: 'string',
            enum: ['withPrevious', 'withNext'],
            description: "Required for action 'merge'.",
          },
          restartNumbering: {
            type: 'boolean',
            description: "Only for action 'split'. Omit for other actions.",
          },
          value: {
            type: 'object',
            description: "Required for action 'set_value'.",
          },
          continuity: {
            type: 'string',
            description:
              "Numbering continuity: 'preserve' keeps numbering; 'none' restarts. Only for action 'set_type'. Omit for other actions.",
            enum: ['preserve', 'none'],
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.lists.insert',
          intentAction: 'insert',
          required: ['target', 'position'],
        },
        {
          operationId: 'doc.lists.create',
          intentAction: 'create',
          required: ['mode'],
        },
        {
          operationId: 'doc.lists.attach',
          intentAction: 'attach',
          required: ['target', 'attachTo'],
        },
        {
          operationId: 'doc.lists.detach',
          intentAction: 'detach',
          required: ['target'],
        },
        {
          operationId: 'doc.lists.indent',
          intentAction: 'indent',
          required: ['target'],
        },
        {
          operationId: 'doc.lists.outdent',
          intentAction: 'outdent',
          required: ['target'],
        },
        {
          operationId: 'doc.lists.merge',
          intentAction: 'merge',
          required: ['target', 'direction'],
        },
        {
          operationId: 'doc.lists.split',
          intentAction: 'split',
          required: ['target'],
        },
        {
          operationId: 'doc.lists.setLevel',
          intentAction: 'set_level',
          required: ['target', 'level'],
        },
        {
          operationId: 'doc.lists.setValue',
          intentAction: 'set_value',
          required: ['target', 'value'],
        },
        {
          operationId: 'doc.lists.continuePrevious',
          intentAction: 'continue_previous',
          required: ['target'],
        },
        {
          operationId: 'doc.lists.setType',
          intentAction: 'set_type',
          required: ['target', 'kind'],
        },
      ],
    },
    {
      toolName: 'superdoc_comment',
      description:
        'Manage document comment threads: create, read, update, and delete. To create a comment, first use superdoc_search to find the target text, then pass action "create" with the comment text and a target: {kind:"text", blockId:"<blockId>", range:{start:<N>, end:<N>}} using the blockId and highlightRange from the search result. For threaded replies, pass "parentId" with the parent comment ID. Action "list" returns all comments with optional pagination (limit, offset) and filtering (includeResolved:true to include resolved). Action "get" retrieves a single comment by ID. Action "update" changes status to "resolved" or marks as internal. Action "delete" removes a comment or reply by ID. Do NOT pass "ref", "id", or "parentId" when creating a new top-level comment; only "action", "text", and "target" are needed.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'delete', 'get', 'list', 'update'],
            description: 'The action to perform. One of: create, delete, get, list, update.',
          },
          force: {
            type: 'boolean',
            description: 'Bypass confirmation checks.',
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description: 'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions.',
          },
          text: {
            type: 'string',
            description: "Comment text content. Required for action 'create'.",
          },
          target: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'text',
                    type: 'string',
                  },
                  blockId: {
                    type: 'string',
                  },
                  range: {
                    type: 'object',
                    properties: {
                      start: {
                        type: 'number',
                      },
                      end: {
                        type: 'number',
                      },
                    },
                    required: ['start', 'end'],
                  },
                },
                required: ['kind', 'blockId', 'range'],
              },
              {
                type: 'object',
                properties: {
                  kind: {
                    const: 'text',
                    type: 'string',
                  },
                  segments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        blockId: {
                          type: 'string',
                        },
                        range: {
                          type: 'object',
                          properties: {
                            start: {
                              type: 'number',
                            },
                            end: {
                              type: 'number',
                            },
                          },
                          required: ['start', 'end'],
                        },
                      },
                      required: ['blockId', 'range'],
                    },
                  },
                },
                required: ['kind', 'segments'],
              },
            ],
            description:
              "Text range to anchor the comment. Accepts either a single-block TextAddress {kind:'text', blockId, range} or a multi-segment TextTarget {kind:'text', segments:[{blockId, range}, ...]} for selections that span blocks. Only for actions 'create', 'update'. Omit for other actions.",
          },
          parentId: {
            type: 'string',
            description:
              "Parent comment ID for creating a threaded reply. Only for action 'create'. Omit for other actions.",
          },
          id: {
            type: 'string',
            description: "Required for actions 'delete', 'get'.",
          },
          status: {
            type: 'string',
            description:
              "Set comment status. Use 'resolved' to mark as resolved. Only for action 'update'. Omit for other actions.",
            enum: ['resolved'],
          },
          isInternal: {
            type: 'boolean',
            description:
              "When true, marks the comment as internal (hidden from external collaborators). Only for action 'update'. Omit for other actions.",
          },
          includeResolved: {
            type: 'boolean',
            description:
              "When true, includes resolved comments in results. Default: false. Only for action 'list'. Omit for other actions.",
          },
          limit: {
            type: 'number',
            description: "Maximum number of comments to return. Only for action 'list'. Omit for other actions.",
          },
          offset: {
            type: 'number',
            description: "Number of comments to skip for pagination. Only for action 'list'. Omit for other actions.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.comments.create',
          intentAction: 'create',
          required: ['text'],
        },
        {
          operationId: 'doc.comments.patch',
          intentAction: 'update',
        },
        {
          operationId: 'doc.comments.delete',
          intentAction: 'delete',
          required: ['id'],
        },
        {
          operationId: 'doc.comments.get',
          intentAction: 'get',
          required: ['id'],
        },
        {
          operationId: 'doc.comments.list',
          intentAction: 'list',
        },
      ],
    },
    {
      toolName: 'superdoc_track_changes',
      description:
        'Review and resolve tracked changes (insertions, deletions, format changes) in the document. Action "list" returns all tracked changes with optional filtering by type (insert, delete, format) and pagination (limit, offset). Each change includes an ID, type, author, timestamp, and content preview. Action "decide" accepts or rejects changes. Pass decision:"accept" to apply the change permanently, or decision:"reject" to discard it. Target a single change with {id:"<changeId>"} or all changes at once with {scope:"all"}. Do NOT use this tool unless the document has tracked changes. Use superdoc_get_content info to check the tracked change count first.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['decide', 'list'],
            description: 'The action to perform. One of: decide, list.',
          },
          limit: {
            type: 'number',
            description: "Maximum number of tracked changes to return. Only for action 'list'. Omit for other actions.",
          },
          offset: {
            type: 'number',
            description:
              "Number of tracked changes to skip for pagination. Only for action 'list'. Omit for other actions.",
          },
          type: {
            type: 'string',
            description:
              "Filter by change type: 'insert', 'delete', or 'format'. Only for action 'list'. Omit for other actions.",
            enum: ['insert', 'delete', 'format'],
          },
          force: {
            type: 'boolean',
            description: "Bypass confirmation checks. Only for action 'decide'. Omit for other actions.",
          },
          changeMode: {
            type: 'string',
            enum: ['direct', 'tracked'],
            description:
              'Edit mode: "direct" applies changes immediately, "tracked" records as suggestions. Only for action \'decide\'. Omit for other actions.',
          },
          decision: {
            type: 'string',
            enum: ['accept', 'reject'],
            description: "Required for action 'decide'.",
          },
          target: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                  },
                  story: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'story',
                            type: 'string',
                          },
                          storyType: {
                            const: 'body',
                            type: 'string',
                          },
                        },
                        required: ['kind', 'storyType'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'story',
                            type: 'string',
                          },
                          storyType: {
                            const: 'headerFooterSlot',
                            type: 'string',
                          },
                          section: {
                            type: 'object',
                            properties: {
                              kind: {
                                const: 'section',
                                type: 'string',
                              },
                              sectionId: {
                                type: 'string',
                              },
                            },
                            required: ['kind', 'sectionId'],
                          },
                          headerFooterKind: {
                            enum: ['header', 'footer'],
                          },
                          variant: {
                            enum: ['default', 'first', 'even'],
                          },
                          resolution: {
                            enum: ['effective', 'explicit'],
                          },
                          onWrite: {
                            enum: ['materializeIfInherited', 'editResolvedPart', 'error'],
                          },
                        },
                        required: ['kind', 'storyType', 'section', 'headerFooterKind', 'variant'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'story',
                            type: 'string',
                          },
                          storyType: {
                            const: 'headerFooterPart',
                            type: 'string',
                          },
                          refId: {
                            type: 'string',
                          },
                        },
                        required: ['kind', 'storyType', 'refId'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'story',
                            type: 'string',
                          },
                          storyType: {
                            const: 'footnote',
                            type: 'string',
                          },
                          noteId: {
                            type: 'string',
                          },
                        },
                        required: ['kind', 'storyType', 'noteId'],
                      },
                      {
                        type: 'object',
                        properties: {
                          kind: {
                            const: 'story',
                            type: 'string',
                          },
                          storyType: {
                            const: 'endnote',
                            type: 'string',
                          },
                          noteId: {
                            type: 'string',
                          },
                        },
                        required: ['kind', 'storyType', 'noteId'],
                      },
                    ],
                    description:
                      "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes.",
                  },
                },
                required: ['id'],
              },
              {
                type: 'object',
                properties: {
                  scope: {
                    enum: ['all'],
                  },
                },
                required: ['scope'],
              },
            ],
            description: "Required for action 'decide'.",
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.trackChanges.list',
          intentAction: 'list',
        },
        {
          operationId: 'doc.trackChanges.decide',
          intentAction: 'decide',
          required: ['decision', 'target'],
        },
      ],
    },
    {
      toolName: 'superdoc_search',
      description:
        'Find text patterns or nodes in the document and get ref handles for targeting edits and formatting. Refs expire after any mutation that changes the document. Re-search before the next edit when using individual tools (superdoc_edit, superdoc_format). Within a superdoc_mutations batch, selectors in "where" clauses resolve automatically at compile time; no manual re-searching needed between steps. Text search returns handle.ref covering only the matched substring. Node search finds blocks by type (paragraph, heading, table, listItem, etc.). The "require" parameter controls match cardinality: "first" returns one match, "all" returns every match, "exactlyOne" fails if not exactly one match. Supports scoping via "within" to search inside a single block. Do NOT use regex or markdown formatting markers (#, **, etc.) in search patterns; patterns are plain text only. Do NOT use this tool when you already have a ref from superdoc_get_content blocks or superdoc_create; use that ref directly.',
      inputSchema: {
        type: 'object',
        properties: {
          select: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  type: {
                    const: 'text',
                    description: "Must be 'text' for text pattern search.",
                    type: 'string',
                  },
                  pattern: {
                    type: 'string',
                    description: 'Text or regex pattern to match.',
                  },
                  mode: {
                    description: "Match mode: 'contains' (substring) or 'regex'.",
                    enum: ['contains', 'regex'],
                  },
                  caseSensitive: {
                    type: 'boolean',
                    description: 'Case-sensitive matching. Default: false.',
                  },
                },
                required: ['type', 'pattern'],
              },
              {
                type: 'object',
                properties: {
                  type: {
                    const: 'node',
                    description: "Must be 'node' for node type search.",
                    type: 'string',
                  },
                  nodeType: {
                    description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                    enum: [
                      'paragraph',
                      'heading',
                      'listItem',
                      'table',
                      'tableRow',
                      'tableCell',
                      'tableOfContents',
                      'image',
                      'sdt',
                      'run',
                      'bookmark',
                      'comment',
                      'hyperlink',
                      'footnoteRef',
                      'endnoteRef',
                      'crossRef',
                      'indexEntry',
                      'citation',
                      'authorityEntry',
                      'sequenceField',
                      'tab',
                      'lineBreak',
                    ],
                  },
                  kind: {
                    description: "Filter: 'block' or 'inline'.",
                    enum: ['block', 'inline'],
                  },
                },
                required: ['type'],
              },
            ],
            description:
              "Search selector. Use {type:'text', pattern:'...'} for text search or {type:'node', nodeType:'paragraph'|'heading'|...} for node search.",
          },
          within: {
            type: 'object',
            properties: {
              kind: {
                const: 'block',
                type: 'string',
              },
              nodeType: {
                enum: [
                  'paragraph',
                  'heading',
                  'listItem',
                  'table',
                  'tableRow',
                  'tableCell',
                  'tableOfContents',
                  'image',
                  'sdt',
                ],
              },
              nodeId: {
                type: 'string',
              },
            },
            required: ['kind', 'nodeType', 'nodeId'],
            description: "Limit search scope to within a specific block: {kind:'block', nodeType:'...', nodeId:'...'}.",
          },
          require: {
            type: 'string',
            description:
              "Match cardinality: 'any' (all matches), 'first' (only first), 'exactlyOne' (fail if != 1), 'all' (fail if 0).",
            enum: ['any', 'first', 'exactlyOne', 'all'],
          },
          mode: {
            type: 'string',
            description:
              "Search mode: 'strict' (default, exact matching) or 'candidates' (returns scored potential matches).",
            enum: ['strict', 'candidates'],
          },
          includeNodes: {
            type: 'boolean',
            description: 'When true, includes full node data in results. Default: false.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of matches to return.',
          },
          offset: {
            type: 'number',
            description: 'Number of matches to skip for pagination.',
          },
        },
        required: ['select'],
        additionalProperties: false,
      },
      mutates: false,
      operations: [
        {
          operationId: 'doc.query.match',
          intentAction: 'match',
          required: ['select'],
        },
      ],
    },
    {
      toolName: 'superdoc_mutations',
      description:
        'All steps succeed or all fail; no partial application. Execute multiple operations atomically in one batch. Use this for any workflow needing 2+ changes. Supported step types: text (text.rewrite, text.insert, text.delete), format (format.apply), create (create.heading, create.paragraph, create.table), assert. Each step has an id, an op, a "where" clause for targeting ({by:"select", select:{...}, require:"first"|"exactlyOne"|"all"} or {by:"ref", ref:"..."} or {by:"block", nodeType:"paragraph", nodeId:"..."}), and "args" with operation-specific parameters. Use {by:"block", nodeType, nodeId} when you want to rewrite, delete, format, or anchor against a whole known block from superdoc_get_content action "blocks" without relying on text matching. For full-paragraph or full-clause rewrites, first call superdoc_get_content with action:"blocks" and includeText:true, then rewrite the matching block by nodeId. Use {by:"select"} only for substring edits, discovery, or insertion relative to a sentence fragment; do NOT use a shortened text selector to replace an entire known block. For create steps, "where" targets an existing anchor block and args.position ("before" or "after") controls placement. Sequential creates targeting the same anchor maintain correct order via internal position mapping. For format.apply with require "all", use a node selector to format every heading or paragraph at once: {by:"select", select:{type:"node", nodeType:"heading"}, require:"all"}. Selectors resolve at compile time (before execution). This means format.apply steps CANNOT target content created by earlier create steps in the same batch. Split creates and formatting into separate batches: first a mutations call with creates, then a mutations call with format.apply. Action "preview" dry-runs the plan. Action "apply" executes it. If a selector matches nothing, the failure reports the step id plus selector details so you can retry with a shorter or more distinctive anchor. Do NOT create two steps that target overlapping text in the same block; combine them into a single text.rewrite step.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['apply', 'preview'],
            description: 'The action to perform. One of: apply, preview.',
          },
          expectedRevision: {
            type: 'string',
            description:
              "Document revision for optimistic concurrency. Mutation fails if document was modified since this revision. Only for action 'preview'. Omit for other actions.",
          },
          atomic: {
            type: 'boolean',
            description: 'Must be true. All steps execute as one atomic transaction.',
          },
          changeMode: {
            type: 'string',
            description:
              "Required. Use 'direct' for immediate edits or 'tracked' for suggestions. Must always be provided.",
            enum: ['direct', 'tracked'],
          },
          steps: {
            type: 'array',
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                    },
                    op: {
                      const: 'text.rewrite',
                      type: 'string',
                    },
                    where: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'select',
                              type: 'string',
                            },
                            select: {
                              oneOf: [
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'text',
                                      description: "Must be 'text' for text pattern search.",
                                      type: 'string',
                                    },
                                    pattern: {
                                      type: 'string',
                                      description: 'Text or regex pattern to match.',
                                    },
                                    mode: {
                                      description: "Match mode: 'contains' (substring) or 'regex'.",
                                      enum: ['contains', 'regex'],
                                    },
                                    caseSensitive: {
                                      type: 'boolean',
                                      description: 'Case-sensitive matching. Default: false.',
                                    },
                                  },
                                  required: ['type', 'pattern'],
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'node',
                                      description: "Must be 'node' for node type search.",
                                      type: 'string',
                                    },
                                    nodeType: {
                                      description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                                      enum: [
                                        'paragraph',
                                        'heading',
                                        'listItem',
                                        'table',
                                        'tableRow',
                                        'tableCell',
                                        'tableOfContents',
                                        'image',
                                        'sdt',
                                        'run',
                                        'bookmark',
                                        'comment',
                                        'hyperlink',
                                        'footnoteRef',
                                        'endnoteRef',
                                        'crossRef',
                                        'indexEntry',
                                        'citation',
                                        'authorityEntry',
                                        'sequenceField',
                                        'tab',
                                        'lineBreak',
                                      ],
                                    },
                                    kind: {
                                      description: "Filter: 'block' or 'inline'.",
                                      enum: ['block', 'inline'],
                                    },
                                  },
                                  required: ['type'],
                                },
                              ],
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                            require: {
                              enum: ['first', 'exactlyOne', 'all'],
                            },
                          },
                          required: ['by', 'select', 'require'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'ref',
                              type: 'string',
                            },
                            ref: {
                              type: 'string',
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                          },
                          required: ['by', 'ref'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'target',
                              type: 'string',
                            },
                            target: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'selection',
                                  type: 'string',
                                },
                                start: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                                end: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                              },
                              required: ['kind', 'start', 'end'],
                            },
                          },
                          required: ['by', 'target'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'block',
                              type: 'string',
                            },
                            nodeType: {
                              enum: [
                                'paragraph',
                                'heading',
                                'listItem',
                                'table',
                                'tableRow',
                                'tableCell',
                                'tableOfContents',
                                'image',
                                'sdt',
                              ],
                            },
                            nodeId: {
                              type: 'string',
                            },
                          },
                          required: ['by', 'nodeType', 'nodeId'],
                        },
                      ],
                    },
                    args: {
                      type: 'object',
                      properties: {
                        replacement: {
                          oneOf: [
                            {
                              type: 'object',
                              properties: {
                                text: {
                                  type: 'string',
                                },
                              },
                              required: ['text'],
                            },
                            {
                              type: 'object',
                              properties: {
                                blocks: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      text: {
                                        type: 'string',
                                      },
                                    },
                                    required: ['text'],
                                  },
                                },
                              },
                              required: ['blocks'],
                            },
                          ],
                        },
                        style: {
                          type: 'object',
                          properties: {
                            inline: {
                              type: 'object',
                              properties: {
                                mode: {
                                  enum: ['preserve', 'set', 'clear', 'merge'],
                                },
                                requireUniform: {
                                  type: 'boolean',
                                },
                                onNonUniform: {
                                  enum: ['error', 'useLeadingRun', 'majority', 'union'],
                                },
                                setMarks: {
                                  type: 'object',
                                  properties: {
                                    bold: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    italic: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    underline: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    strike: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                  },
                                },
                              },
                              required: ['mode'],
                            },
                            paragraph: {
                              type: 'object',
                              properties: {
                                mode: {
                                  enum: ['preserve', 'set', 'clear'],
                                },
                              },
                              required: ['mode'],
                            },
                          },
                          required: ['inline'],
                        },
                      },
                      required: ['replacement'],
                    },
                  },
                  required: ['id', 'op', 'where', 'args'],
                },
                {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                    },
                    op: {
                      const: 'text.insert',
                      type: 'string',
                    },
                    where: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'select',
                              type: 'string',
                            },
                            select: {
                              oneOf: [
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'text',
                                      description: "Must be 'text' for text pattern search.",
                                      type: 'string',
                                    },
                                    pattern: {
                                      type: 'string',
                                      description: 'Text or regex pattern to match.',
                                    },
                                    mode: {
                                      description: "Match mode: 'contains' (substring) or 'regex'.",
                                      enum: ['contains', 'regex'],
                                    },
                                    caseSensitive: {
                                      type: 'boolean',
                                      description: 'Case-sensitive matching. Default: false.',
                                    },
                                  },
                                  required: ['type', 'pattern'],
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'node',
                                      description: "Must be 'node' for node type search.",
                                      type: 'string',
                                    },
                                    nodeType: {
                                      description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                                      enum: [
                                        'paragraph',
                                        'heading',
                                        'listItem',
                                        'table',
                                        'tableRow',
                                        'tableCell',
                                        'tableOfContents',
                                        'image',
                                        'sdt',
                                        'run',
                                        'bookmark',
                                        'comment',
                                        'hyperlink',
                                        'footnoteRef',
                                        'endnoteRef',
                                        'crossRef',
                                        'indexEntry',
                                        'citation',
                                        'authorityEntry',
                                        'sequenceField',
                                        'tab',
                                        'lineBreak',
                                      ],
                                    },
                                    kind: {
                                      description: "Filter: 'block' or 'inline'.",
                                      enum: ['block', 'inline'],
                                    },
                                  },
                                  required: ['type'],
                                },
                              ],
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                            require: {
                              enum: ['first', 'exactlyOne'],
                            },
                          },
                          required: ['by', 'select', 'require'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'ref',
                              type: 'string',
                            },
                            ref: {
                              type: 'string',
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                          },
                          required: ['by', 'ref'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'target',
                              type: 'string',
                            },
                            target: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'selection',
                                  type: 'string',
                                },
                                start: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                                end: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                              },
                              required: ['kind', 'start', 'end'],
                            },
                          },
                          required: ['by', 'target'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'block',
                              type: 'string',
                            },
                            nodeType: {
                              enum: [
                                'paragraph',
                                'heading',
                                'listItem',
                                'table',
                                'tableRow',
                                'tableCell',
                                'tableOfContents',
                                'image',
                                'sdt',
                              ],
                            },
                            nodeId: {
                              type: 'string',
                            },
                          },
                          required: ['by', 'nodeType', 'nodeId'],
                        },
                      ],
                    },
                    args: {
                      type: 'object',
                      properties: {
                        position: {
                          enum: ['before', 'after'],
                        },
                        content: {
                          type: 'object',
                          properties: {
                            text: {
                              type: 'string',
                            },
                          },
                          required: ['text'],
                        },
                        style: {
                          type: 'object',
                          properties: {
                            inline: {
                              type: 'object',
                              properties: {
                                mode: {
                                  enum: ['inherit', 'set', 'clear'],
                                },
                                setMarks: {
                                  type: 'object',
                                  properties: {
                                    bold: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    italic: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    underline: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                    strike: {
                                      enum: ['on', 'off', 'clear'],
                                    },
                                  },
                                },
                              },
                              required: ['mode'],
                            },
                          },
                          required: ['inline'],
                        },
                      },
                      required: ['position', 'content'],
                    },
                  },
                  required: ['id', 'op', 'where', 'args'],
                },
                {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                    },
                    op: {
                      const: 'text.delete',
                      type: 'string',
                    },
                    where: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'select',
                              type: 'string',
                            },
                            select: {
                              oneOf: [
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'text',
                                      description: "Must be 'text' for text pattern search.",
                                      type: 'string',
                                    },
                                    pattern: {
                                      type: 'string',
                                      description: 'Text or regex pattern to match.',
                                    },
                                    mode: {
                                      description: "Match mode: 'contains' (substring) or 'regex'.",
                                      enum: ['contains', 'regex'],
                                    },
                                    caseSensitive: {
                                      type: 'boolean',
                                      description: 'Case-sensitive matching. Default: false.',
                                    },
                                  },
                                  required: ['type', 'pattern'],
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'node',
                                      description: "Must be 'node' for node type search.",
                                      type: 'string',
                                    },
                                    nodeType: {
                                      description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                                      enum: [
                                        'paragraph',
                                        'heading',
                                        'listItem',
                                        'table',
                                        'tableRow',
                                        'tableCell',
                                        'tableOfContents',
                                        'image',
                                        'sdt',
                                        'run',
                                        'bookmark',
                                        'comment',
                                        'hyperlink',
                                        'footnoteRef',
                                        'endnoteRef',
                                        'crossRef',
                                        'indexEntry',
                                        'citation',
                                        'authorityEntry',
                                        'sequenceField',
                                        'tab',
                                        'lineBreak',
                                      ],
                                    },
                                    kind: {
                                      description: "Filter: 'block' or 'inline'.",
                                      enum: ['block', 'inline'],
                                    },
                                  },
                                  required: ['type'],
                                },
                              ],
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                            require: {
                              enum: ['first', 'exactlyOne', 'all'],
                            },
                          },
                          required: ['by', 'select', 'require'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'ref',
                              type: 'string',
                            },
                            ref: {
                              type: 'string',
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                          },
                          required: ['by', 'ref'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'target',
                              type: 'string',
                            },
                            target: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'selection',
                                  type: 'string',
                                },
                                start: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                                end: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                              },
                              required: ['kind', 'start', 'end'],
                            },
                          },
                          required: ['by', 'target'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'block',
                              type: 'string',
                            },
                            nodeType: {
                              enum: [
                                'paragraph',
                                'heading',
                                'listItem',
                                'table',
                                'tableRow',
                                'tableCell',
                                'tableOfContents',
                                'image',
                                'sdt',
                              ],
                            },
                            nodeId: {
                              type: 'string',
                            },
                          },
                          required: ['by', 'nodeType', 'nodeId'],
                        },
                      ],
                    },
                    args: {
                      type: 'object',
                      properties: {
                        behavior: {
                          enum: ['selection', 'exact'],
                        },
                      },
                    },
                  },
                  required: ['id', 'op', 'where', 'args'],
                },
                {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                    },
                    op: {
                      const: 'format.apply',
                      type: 'string',
                    },
                    where: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'select',
                              type: 'string',
                            },
                            select: {
                              oneOf: [
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'text',
                                      description: "Must be 'text' for text pattern search.",
                                      type: 'string',
                                    },
                                    pattern: {
                                      type: 'string',
                                      description: 'Text or regex pattern to match.',
                                    },
                                    mode: {
                                      description: "Match mode: 'contains' (substring) or 'regex'.",
                                      enum: ['contains', 'regex'],
                                    },
                                    caseSensitive: {
                                      type: 'boolean',
                                      description: 'Case-sensitive matching. Default: false.',
                                    },
                                  },
                                  required: ['type', 'pattern'],
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      const: 'node',
                                      description: "Must be 'node' for node type search.",
                                      type: 'string',
                                    },
                                    nodeType: {
                                      description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                                      enum: [
                                        'paragraph',
                                        'heading',
                                        'listItem',
                                        'table',
                                        'tableRow',
                                        'tableCell',
                                        'tableOfContents',
                                        'image',
                                        'sdt',
                                        'run',
                                        'bookmark',
                                        'comment',
                                        'hyperlink',
                                        'footnoteRef',
                                        'endnoteRef',
                                        'crossRef',
                                        'indexEntry',
                                        'citation',
                                        'authorityEntry',
                                        'sequenceField',
                                        'tab',
                                        'lineBreak',
                                      ],
                                    },
                                    kind: {
                                      description: "Filter: 'block' or 'inline'.",
                                      enum: ['block', 'inline'],
                                    },
                                  },
                                  required: ['type'],
                                },
                              ],
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                            require: {
                              enum: ['first', 'exactlyOne', 'all'],
                            },
                          },
                          required: ['by', 'select', 'require'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'ref',
                              type: 'string',
                            },
                            ref: {
                              type: 'string',
                            },
                            within: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'block',
                                  type: 'string',
                                },
                                nodeType: {
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                  ],
                                },
                                nodeId: {
                                  type: 'string',
                                },
                              },
                              required: ['kind', 'nodeType', 'nodeId'],
                            },
                          },
                          required: ['by', 'ref'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'target',
                              type: 'string',
                            },
                            target: {
                              type: 'object',
                              properties: {
                                kind: {
                                  const: 'selection',
                                  type: 'string',
                                },
                                start: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                                end: {
                                  oneOf: [
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'text',
                                          type: 'string',
                                        },
                                        blockId: {
                                          type: 'string',
                                        },
                                        offset: {
                                          type: 'number',
                                        },
                                      },
                                      required: ['kind', 'blockId', 'offset'],
                                    },
                                    {
                                      type: 'object',
                                      properties: {
                                        kind: {
                                          const: 'nodeEdge',
                                          type: 'string',
                                        },
                                        node: {
                                          type: 'object',
                                          properties: {
                                            kind: {
                                              const: 'block',
                                              type: 'string',
                                            },
                                            nodeType: {
                                              enum: [
                                                'paragraph',
                                                'heading',
                                                'table',
                                                'tableOfContents',
                                                'sdt',
                                                'image',
                                              ],
                                            },
                                            nodeId: {
                                              type: 'string',
                                            },
                                          },
                                          required: ['kind', 'nodeType', 'nodeId'],
                                        },
                                        edge: {
                                          enum: ['before', 'after'],
                                        },
                                      },
                                      required: ['kind', 'node', 'edge'],
                                    },
                                  ],
                                  description:
                                    "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries.",
                                },
                              },
                              required: ['kind', 'start', 'end'],
                            },
                          },
                          required: ['by', 'target'],
                        },
                        {
                          type: 'object',
                          properties: {
                            by: {
                              const: 'block',
                              type: 'string',
                            },
                            nodeType: {
                              enum: [
                                'paragraph',
                                'heading',
                                'listItem',
                                'table',
                                'tableRow',
                                'tableCell',
                                'tableOfContents',
                                'image',
                                'sdt',
                              ],
                            },
                            nodeId: {
                              type: 'string',
                            },
                          },
                          required: ['by', 'nodeType', 'nodeId'],
                        },
                      ],
                    },
                    args: {
                      type: 'object',
                      properties: {
                        inline: {
                          type: 'object',
                          properties: {
                            bold: {
                              type: 'boolean',
                            },
                            italic: {
                              type: 'boolean',
                            },
                            strike: {
                              type: 'boolean',
                            },
                            underline: {
                              oneOf: [
                                {
                                  type: 'boolean',
                                },
                                {
                                  type: 'object',
                                  properties: {
                                    style: {
                                      type: 'string',
                                    },
                                    color: {
                                      type: 'string',
                                    },
                                    themeColor: {
                                      type: 'string',
                                    },
                                  },
                                },
                              ],
                            },
                            highlight: {
                              type: 'string',
                            },
                            color: {
                              type: 'string',
                            },
                            fontSize: {
                              type: 'number',
                            },
                            fontFamily: {
                              type: 'string',
                            },
                            letterSpacing: {
                              type: 'number',
                            },
                            vertAlign: {
                              enum: ['superscript', 'subscript', 'baseline'],
                            },
                            position: {
                              type: 'number',
                            },
                            dstrike: {
                              type: 'boolean',
                            },
                            smallCaps: {
                              type: 'boolean',
                            },
                            caps: {
                              type: 'boolean',
                            },
                            shading: {
                              type: 'object',
                              properties: {
                                fill: {
                                  type: 'string',
                                },
                                color: {
                                  type: 'string',
                                },
                                val: {
                                  type: 'string',
                                },
                              },
                            },
                            border: {
                              type: 'object',
                              properties: {
                                val: {
                                  type: 'string',
                                },
                                sz: {
                                  type: 'number',
                                },
                                color: {
                                  type: 'string',
                                },
                                space: {
                                  type: 'number',
                                },
                              },
                            },
                            outline: {
                              type: 'boolean',
                            },
                            shadow: {
                              type: 'boolean',
                            },
                            emboss: {
                              type: 'boolean',
                            },
                            imprint: {
                              type: 'boolean',
                            },
                            charScale: {
                              type: 'number',
                            },
                            kerning: {
                              type: 'number',
                            },
                            vanish: {
                              type: 'boolean',
                            },
                            webHidden: {
                              type: 'boolean',
                            },
                            specVanish: {
                              type: 'boolean',
                            },
                            rtl: {
                              type: 'boolean',
                            },
                            cs: {
                              type: 'boolean',
                            },
                            bCs: {
                              type: 'boolean',
                            },
                            iCs: {
                              type: 'boolean',
                            },
                            eastAsianLayout: {
                              type: 'object',
                              properties: {
                                id: {
                                  type: 'string',
                                },
                                combine: {
                                  type: 'boolean',
                                },
                                combineBrackets: {
                                  type: 'string',
                                },
                                vert: {
                                  type: 'boolean',
                                },
                                vertCompress: {
                                  type: 'boolean',
                                },
                              },
                            },
                            em: {
                              type: 'string',
                            },
                            fitText: {
                              type: 'object',
                              properties: {
                                val: {
                                  type: 'number',
                                },
                                id: {
                                  type: 'string',
                                },
                              },
                            },
                            snapToGrid: {
                              type: 'boolean',
                            },
                            lang: {
                              type: 'object',
                              properties: {
                                val: {
                                  type: 'string',
                                },
                                eastAsia: {
                                  type: 'string',
                                },
                                bidi: {
                                  type: 'string',
                                },
                              },
                            },
                            oMath: {
                              type: 'boolean',
                            },
                            rStyle: {
                              type: 'string',
                            },
                            rFonts: {
                              type: 'object',
                              properties: {
                                ascii: {
                                  type: 'string',
                                },
                                hAnsi: {
                                  type: 'string',
                                },
                                eastAsia: {
                                  type: 'string',
                                },
                                cs: {
                                  type: 'string',
                                },
                                asciiTheme: {
                                  type: 'string',
                                },
                                hAnsiTheme: {
                                  type: 'string',
                                },
                                eastAsiaTheme: {
                                  type: 'string',
                                },
                                csTheme: {
                                  type: 'string',
                                },
                                hint: {
                                  type: 'string',
                                },
                              },
                            },
                            fontSizeCs: {
                              type: 'number',
                            },
                            ligatures: {
                              type: 'string',
                            },
                            numForm: {
                              type: 'string',
                            },
                            numSpacing: {
                              type: 'string',
                            },
                            stylisticSets: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: {
                                    type: 'number',
                                  },
                                  val: {
                                    type: 'boolean',
                                  },
                                },
                                required: ['id'],
                              },
                            },
                            contextualAlternates: {
                              type: 'boolean',
                            },
                          },
                        },
                        alignment: {
                          description:
                            'Set paragraph alignment on the target block(s). Can be combined with inline formatting in the same step.',
                          enum: ['left', 'center', 'right', 'justify'],
                        },
                        scope: {
                          description:
                            'When "block", inline formatting expands to cover the entire parent paragraph(s), not just the matched text. Use "block" after markdown inserts to format whole paragraphs with a short identifying pattern. Default: "match".',
                          enum: ['match', 'block'],
                        },
                      },
                    },
                  },
                  required: ['id', 'op', 'where', 'args'],
                },
                {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                    },
                    op: {
                      const: 'assert',
                      type: 'string',
                    },
                    where: {
                      type: 'object',
                      properties: {
                        by: {
                          const: 'select',
                          type: 'string',
                        },
                        select: {
                          oneOf: [
                            {
                              type: 'object',
                              properties: {
                                type: {
                                  const: 'text',
                                  description: "Must be 'text' for text pattern search.",
                                  type: 'string',
                                },
                                pattern: {
                                  type: 'string',
                                  description: 'Text or regex pattern to match.',
                                },
                                mode: {
                                  description: "Match mode: 'contains' (substring) or 'regex'.",
                                  enum: ['contains', 'regex'],
                                },
                                caseSensitive: {
                                  type: 'boolean',
                                  description: 'Case-sensitive matching. Default: false.',
                                },
                              },
                              required: ['type', 'pattern'],
                            },
                            {
                              type: 'object',
                              properties: {
                                type: {
                                  const: 'node',
                                  description: "Must be 'node' for node type search.",
                                  type: 'string',
                                },
                                nodeType: {
                                  description: 'Block type to match (paragraph, heading, table, listItem, etc.).',
                                  enum: [
                                    'paragraph',
                                    'heading',
                                    'listItem',
                                    'table',
                                    'tableRow',
                                    'tableCell',
                                    'tableOfContents',
                                    'image',
                                    'sdt',
                                    'run',
                                    'bookmark',
                                    'comment',
                                    'hyperlink',
                                    'footnoteRef',
                                    'endnoteRef',
                                    'crossRef',
                                    'indexEntry',
                                    'citation',
                                    'authorityEntry',
                                    'sequenceField',
                                    'tab',
                                    'lineBreak',
                                  ],
                                },
                                kind: {
                                  description: "Filter: 'block' or 'inline'.",
                                  enum: ['block', 'inline'],
                                },
                              },
                              required: ['type'],
                            },
                          ],
                        },
                        within: {
                          type: 'object',
                          properties: {
                            kind: {
                              const: 'block',
                              type: 'string',
                            },
                            nodeType: {
                              enum: [
                                'paragraph',
                                'heading',
                                'listItem',
                                'table',
                                'tableRow',
                                'tableCell',
                                'tableOfContents',
                                'image',
                                'sdt',
                              ],
                            },
                            nodeId: {
                              type: 'string',
                            },
                          },
                          required: ['kind', 'nodeType', 'nodeId'],
                        },
                      },
                      required: ['by', 'select'],
                    },
                    args: {
                      type: 'object',
                      properties: {
                        expectCount: {
                          type: 'number',
                        },
                      },
                      required: ['expectCount'],
                    },
                  },
                  required: ['id', 'op', 'where', 'args'],
                },
              ],
            },
            description:
              "Ordered array of mutation steps. Each step needs 'op' (text.rewrite, text.insert, text.delete, format.apply, or assert) and a 'where' targeting clause.",
          },
          force: {
            type: 'boolean',
            description: "Bypass confirmation checks. Only for action 'apply'. Omit for other actions.",
          },
        },
        required: ['action', 'atomic', 'changeMode', 'steps'],
        additionalProperties: false,
      },
      mutates: true,
      operations: [
        {
          operationId: 'doc.mutations.preview',
          intentAction: 'preview',
          required: ['atomic', 'changeMode', 'steps'],
        },
        {
          operationId: 'doc.mutations.apply',
          intentAction: 'apply',
          required: ['atomic', 'steps', 'changeMode'],
        },
      ],
    },
  ],
} as const;
