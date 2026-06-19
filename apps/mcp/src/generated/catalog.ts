// Auto-generated from packages/sdk/tools/catalog.json
// Do not edit manually — re-run generate:all to update.
export const MCP_TOOL_CATALOG = {
  "contractVersion": "0.1.0",
  "generatedAt": null,
  "toolCount": 10,
  "tools": [
    {
      "toolName": "superdoc_get_content",
      "description": "Read document content in various formats. Call this first in any workflow to understand document structure before making edits. Action \"blocks\" returns structured block data with nodeId, nodeType, textPreview, optional full text when includeText:true, formatting properties (fontFamily, fontSize, color, bold, underline, alignment), and ref handles for immediate use with superdoc_edit or superdoc_format. When you need to evaluate or rewrite existing paragraphs or clauses, prefer action \"blocks\" with includeText:true so you can identify the correct block and then target it by nodeId. Action \"text\" and \"markdown\" return the full document as plain text or Markdown. Action \"html\" returns HTML. Action \"info\" returns document metadata: word count, paragraph count, page count, outline, available styles, and capability flags. The \"blocks\" action supports pagination via \"offset\" and \"limit\", and filtering via \"nodeTypes\". Other actions ignore these parameters. This tool never modifies the document. Do NOT call superdoc_edit or superdoc_format without first reading blocks to get valid refs and formatting reference values.\n\nEXAMPLES:\n  1. {\"action\":\"blocks\"}\n  2. {\"action\":\"blocks\",\"includeText\":true,\"offset\":0,\"limit\":20}\n  3. {\"action\":\"blocks\",\"offset\":0,\"limit\":20,\"nodeTypes\":[\"heading\",\"paragraph\"]}\n  4. {\"action\":\"text\"}\n  5. {\"action\":\"info\"}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "blocks",
              "extract",
              "html",
              "info",
              "markdown",
              "text"
            ],
            "description": "The action to perform. One of: blocks, extract, html, info, markdown, text."
          },
          "in": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
          },
          "unflattenLists": {
            "type": "boolean",
            "description": "When true, flattens nested list structures in output. Default: false. Only for action 'html'. Omit for other actions."
          },
          "offset": {
            "type": "number",
            "minimum": 0,
            "description": "Number of blocks to skip. Default: 0. Only for action 'blocks'. Omit for other actions."
          },
          "limit": {
            "type": "number",
            "minimum": 1,
            "description": "Maximum blocks to return. Omit for all blocks. Only for action 'blocks'. Omit for other actions."
          },
          "nodeTypes": {
            "type": "array",
            "items": {
              "enum": [
                "paragraph",
                "heading",
                "listItem",
                "table",
                "tableRow",
                "tableCell",
                "tableOfContents",
                "image",
                "sdt"
              ]
            },
            "description": "Filter by block types (e.g. ['paragraph', 'heading']). Omit for all types. Only for action 'blocks'. Omit for other actions."
          },
          "includeText": {
            "type": "boolean",
            "description": "When true, includes the full flattened block text in each block entry. Only for action 'blocks'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": false,
      "operations": [
        {
          "operationId": "doc.getText",
          "intentAction": "text"
        },
        {
          "operationId": "doc.getMarkdown",
          "intentAction": "markdown"
        },
        {
          "operationId": "doc.getHtml",
          "intentAction": "html"
        },
        {
          "operationId": "doc.info",
          "intentAction": "info"
        },
        {
          "operationId": "doc.extract",
          "intentAction": "extract"
        },
        {
          "operationId": "doc.blocks.list",
          "intentAction": "blocks"
        }
      ]
    },
    {
      "toolName": "superdoc_edit",
      "description": "The primary tool for inserting content into documents. ALWAYS use action \"insert\" with type \"markdown\" to create headings, paragraphs, or any block content: this is faster and creates proper document structure in one call. Do NOT use superdoc_create for headings or paragraphs. The markdown parser creates headings from # markers (# = Heading1, ## = Heading2), bold from **text**, italic from *text*, and numbered/bullet lists. Position markdown inserts with \"target\" (a BlockNodeAddress like {kind:\"block\", nodeType, nodeId}) and \"placement\" (before, after, insideStart, insideEnd). Without a target, content appends at the end of the document. IMPORTANT: After a markdown insert, analyze the document context (what kind of document, how titles and body text are styled) and follow up with ONE superdoc_mutations call to format inserted blocks so they look like they belong. Each format.apply step accepts \"inline\" (fontFamily, fontSize, bold, underline, color), \"alignment\", and \"scope\" in the same step. Use scope: \"block\" so formatting covers the entire paragraph. Copy the exact property values from the existing get_content blocks (fontFamily, fontSize, color, alignment, bold, underline). Do NOT invent values: use what the blocks show. Also supports replace, delete, and undo/redo. For replace and delete, pass a \"ref\" from superdoc_search or superdoc_get_content blocks. A search ref covers only the matched substring; a block ref covers the entire block text, so use block refs when rewriting or shortening whole paragraphs. For multi-step redlines or whole-clause rewrites, prefer superdoc_mutations with where:{by:\"block\", nodeType, nodeId} from superdoc_get_content action \"blocks\" includeText:true rather than relying on text selectors. Refs expire after any mutation; always re-search before the next edit. For 2+ edits that must succeed or fail atomically, use superdoc_mutations instead. Supports \"dryRun\" to preview changes and \"changeMode: tracked\" to record edits as tracked changes (not supported for markdown/html inserts). Do NOT build \"target\" objects manually when a ref is available; prefer \"ref\" for simpler, more reliable targeting.\n\nEXAMPLES:\n  1. {\"action\":\"insert\",\"type\":\"markdown\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"},\"placement\":\"before\",\"value\":\"# Executive Summary\\n\\nThis agreement sets forth the principal terms...\"}\n  2. {\"action\":\"insert\",\"type\":\"markdown\",\"value\":\"# Section Title\\n\\nParagraph content here.\\n\\n# Another Section\\n\\nMore content with **bold** and *italic*.\"}\n  3. {\"action\":\"replace\",\"ref\":\"<handle.ref>\",\"text\":\"new text here\"}\n  4. {\"action\":\"delete\",\"ref\":\"<handle.ref>\"}\n  5. {\"action\":\"undo\"}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "delete",
              "insert",
              "redo",
              "replace",
              "undo"
            ],
            "description": "The action to perform. One of: delete, insert, redo, replace, undo."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "dryRun": {
            "type": "boolean",
            "description": "Preview the result without applying changes."
          },
          "target": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "$ref": "#/$defs/BlockNodeAddress",
                    "description": "Block address for structural insertion: {kind:'block', nodeType:'...', nodeId:'...'}."
                  },
                  {
                    "oneOf": [
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "selection",
                            "type": "string"
                          },
                          "start": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "text",
                                    "type": "string"
                                  },
                                  "blockId": {
                                    "type": "string"
                                  },
                                  "offset": {
                                    "type": "number"
                                  },
                                  "story": {
                                    "oneOf": [
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "body",
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterSlot",
                                            "type": "string"
                                          },
                                          "section": {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "section",
                                                "type": "string"
                                              },
                                              "sectionId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "sectionId"
                                            ]
                                          },
                                          "headerFooterKind": {
                                            "enum": [
                                              "header",
                                              "footer"
                                            ]
                                          },
                                          "variant": {
                                            "enum": [
                                              "default",
                                              "first",
                                              "even"
                                            ]
                                          },
                                          "resolution": {
                                            "enum": [
                                              "effective",
                                              "explicit"
                                            ]
                                          },
                                          "onWrite": {
                                            "enum": [
                                              "materializeIfInherited",
                                              "editResolvedPart",
                                              "error"
                                            ]
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "section",
                                          "headerFooterKind",
                                          "variant"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterPart",
                                            "type": "string"
                                          },
                                          "refId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "refId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "footnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "endnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "textbox",
                                            "type": "string"
                                          },
                                          "textboxId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "textboxId"
                                        ]
                                      }
                                    ],
                                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                  }
                                },
                                "required": [
                                  "kind",
                                  "blockId",
                                  "offset"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "nodeEdge",
                                    "type": "string"
                                  },
                                  "node": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "block",
                                        "type": "string"
                                      },
                                      "nodeType": {
                                        "enum": [
                                          "paragraph",
                                          "heading",
                                          "table",
                                          "tableOfContents",
                                          "sdt",
                                          "image"
                                        ]
                                      },
                                      "nodeId": {
                                        "type": "string"
                                      },
                                      "story": {
                                        "oneOf": [
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "body",
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterSlot",
                                                "type": "string"
                                              },
                                              "section": {
                                                "type": "object",
                                                "properties": {
                                                  "kind": {
                                                    "const": "section",
                                                    "type": "string"
                                                  },
                                                  "sectionId": {
                                                    "type": "string"
                                                  }
                                                },
                                                "required": [
                                                  "kind",
                                                  "sectionId"
                                                ]
                                              },
                                              "headerFooterKind": {
                                                "enum": [
                                                  "header",
                                                  "footer"
                                                ]
                                              },
                                              "variant": {
                                                "enum": [
                                                  "default",
                                                  "first",
                                                  "even"
                                                ]
                                              },
                                              "resolution": {
                                                "enum": [
                                                  "effective",
                                                  "explicit"
                                                ]
                                              },
                                              "onWrite": {
                                                "enum": [
                                                  "materializeIfInherited",
                                                  "editResolvedPart",
                                                  "error"
                                                ]
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "section",
                                              "headerFooterKind",
                                              "variant"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterPart",
                                                "type": "string"
                                              },
                                              "refId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "refId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "footnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "endnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "textbox",
                                                "type": "string"
                                              },
                                              "textboxId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "textboxId"
                                            ]
                                          }
                                        ],
                                        "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "nodeType",
                                      "nodeId"
                                    ]
                                  },
                                  "edge": {
                                    "enum": [
                                      "before",
                                      "after"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "node",
                                  "edge"
                                ]
                              }
                            ],
                            "description": "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries."
                          },
                          "end": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "text",
                                    "type": "string"
                                  },
                                  "blockId": {
                                    "type": "string"
                                  },
                                  "offset": {
                                    "type": "number"
                                  },
                                  "story": {
                                    "oneOf": [
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "body",
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterSlot",
                                            "type": "string"
                                          },
                                          "section": {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "section",
                                                "type": "string"
                                              },
                                              "sectionId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "sectionId"
                                            ]
                                          },
                                          "headerFooterKind": {
                                            "enum": [
                                              "header",
                                              "footer"
                                            ]
                                          },
                                          "variant": {
                                            "enum": [
                                              "default",
                                              "first",
                                              "even"
                                            ]
                                          },
                                          "resolution": {
                                            "enum": [
                                              "effective",
                                              "explicit"
                                            ]
                                          },
                                          "onWrite": {
                                            "enum": [
                                              "materializeIfInherited",
                                              "editResolvedPart",
                                              "error"
                                            ]
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "section",
                                          "headerFooterKind",
                                          "variant"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterPart",
                                            "type": "string"
                                          },
                                          "refId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "refId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "footnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "endnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "textbox",
                                            "type": "string"
                                          },
                                          "textboxId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "textboxId"
                                        ]
                                      }
                                    ],
                                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                  }
                                },
                                "required": [
                                  "kind",
                                  "blockId",
                                  "offset"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "nodeEdge",
                                    "type": "string"
                                  },
                                  "node": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "block",
                                        "type": "string"
                                      },
                                      "nodeType": {
                                        "enum": [
                                          "paragraph",
                                          "heading",
                                          "table",
                                          "tableOfContents",
                                          "sdt",
                                          "image"
                                        ]
                                      },
                                      "nodeId": {
                                        "type": "string"
                                      },
                                      "story": {
                                        "oneOf": [
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "body",
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterSlot",
                                                "type": "string"
                                              },
                                              "section": {
                                                "type": "object",
                                                "properties": {
                                                  "kind": {
                                                    "const": "section",
                                                    "type": "string"
                                                  },
                                                  "sectionId": {
                                                    "type": "string"
                                                  }
                                                },
                                                "required": [
                                                  "kind",
                                                  "sectionId"
                                                ]
                                              },
                                              "headerFooterKind": {
                                                "enum": [
                                                  "header",
                                                  "footer"
                                                ]
                                              },
                                              "variant": {
                                                "enum": [
                                                  "default",
                                                  "first",
                                                  "even"
                                                ]
                                              },
                                              "resolution": {
                                                "enum": [
                                                  "effective",
                                                  "explicit"
                                                ]
                                              },
                                              "onWrite": {
                                                "enum": [
                                                  "materializeIfInherited",
                                                  "editResolvedPart",
                                                  "error"
                                                ]
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "section",
                                              "headerFooterKind",
                                              "variant"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterPart",
                                                "type": "string"
                                              },
                                              "refId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "refId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "footnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "endnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "textbox",
                                                "type": "string"
                                              },
                                              "textboxId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "textboxId"
                                            ]
                                          }
                                        ],
                                        "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "nodeType",
                                      "nodeId"
                                    ]
                                  },
                                  "edge": {
                                    "enum": [
                                      "before",
                                      "after"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "node",
                                  "edge"
                                ]
                              }
                            ],
                            "description": "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries."
                          },
                          "story": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "body",
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterSlot",
                                    "type": "string"
                                  },
                                  "section": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "section",
                                        "type": "string"
                                      },
                                      "sectionId": {
                                        "type": "string"
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "sectionId"
                                    ]
                                  },
                                  "headerFooterKind": {
                                    "enum": [
                                      "header",
                                      "footer"
                                    ]
                                  },
                                  "variant": {
                                    "enum": [
                                      "default",
                                      "first",
                                      "even"
                                    ]
                                  },
                                  "resolution": {
                                    "enum": [
                                      "effective",
                                      "explicit"
                                    ]
                                  },
                                  "onWrite": {
                                    "enum": [
                                      "materializeIfInherited",
                                      "editResolvedPart",
                                      "error"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "section",
                                  "headerFooterKind",
                                  "variant"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterPart",
                                    "type": "string"
                                  },
                                  "refId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "refId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "footnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "endnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "textbox",
                                    "type": "string"
                                  },
                                  "textboxId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "textboxId"
                                ]
                              }
                            ],
                            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                          }
                        },
                        "required": [
                          "kind",
                          "start",
                          "end"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "block",
                            "type": "string"
                          },
                          "nodeType": {
                            "enum": [
                              "paragraph",
                              "heading",
                              "listItem",
                              "table",
                              "tableRow",
                              "tableCell",
                              "tableOfContents",
                              "image",
                              "sdt"
                            ]
                          },
                          "nodeId": {
                            "type": "string"
                          },
                          "story": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "body",
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterSlot",
                                    "type": "string"
                                  },
                                  "section": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "section",
                                        "type": "string"
                                      },
                                      "sectionId": {
                                        "type": "string"
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "sectionId"
                                    ]
                                  },
                                  "headerFooterKind": {
                                    "enum": [
                                      "header",
                                      "footer"
                                    ]
                                  },
                                  "variant": {
                                    "enum": [
                                      "default",
                                      "first",
                                      "even"
                                    ]
                                  },
                                  "resolution": {
                                    "enum": [
                                      "effective",
                                      "explicit"
                                    ]
                                  },
                                  "onWrite": {
                                    "enum": [
                                      "materializeIfInherited",
                                      "editResolvedPart",
                                      "error"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "section",
                                  "headerFooterKind",
                                  "variant"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterPart",
                                    "type": "string"
                                  },
                                  "refId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "refId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "footnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "endnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "textbox",
                                    "type": "string"
                                  },
                                  "textboxId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "textboxId"
                                ]
                              }
                            ],
                            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                          }
                        },
                        "required": [
                          "kind",
                          "nodeType",
                          "nodeId"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "selection",
                            "type": "string"
                          },
                          "start": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "text",
                                    "type": "string"
                                  },
                                  "blockId": {
                                    "type": "string"
                                  },
                                  "offset": {
                                    "type": "number"
                                  },
                                  "story": {
                                    "oneOf": [
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "body",
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterSlot",
                                            "type": "string"
                                          },
                                          "section": {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "section",
                                                "type": "string"
                                              },
                                              "sectionId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "sectionId"
                                            ]
                                          },
                                          "headerFooterKind": {
                                            "enum": [
                                              "header",
                                              "footer"
                                            ]
                                          },
                                          "variant": {
                                            "enum": [
                                              "default",
                                              "first",
                                              "even"
                                            ]
                                          },
                                          "resolution": {
                                            "enum": [
                                              "effective",
                                              "explicit"
                                            ]
                                          },
                                          "onWrite": {
                                            "enum": [
                                              "materializeIfInherited",
                                              "editResolvedPart",
                                              "error"
                                            ]
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "section",
                                          "headerFooterKind",
                                          "variant"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterPart",
                                            "type": "string"
                                          },
                                          "refId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "refId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "footnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "endnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "textbox",
                                            "type": "string"
                                          },
                                          "textboxId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "textboxId"
                                        ]
                                      }
                                    ],
                                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                  }
                                },
                                "required": [
                                  "kind",
                                  "blockId",
                                  "offset"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "nodeEdge",
                                    "type": "string"
                                  },
                                  "node": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "block",
                                        "type": "string"
                                      },
                                      "nodeType": {
                                        "enum": [
                                          "paragraph",
                                          "heading",
                                          "table",
                                          "tableOfContents",
                                          "sdt",
                                          "image"
                                        ]
                                      },
                                      "nodeId": {
                                        "type": "string"
                                      },
                                      "story": {
                                        "oneOf": [
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "body",
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterSlot",
                                                "type": "string"
                                              },
                                              "section": {
                                                "type": "object",
                                                "properties": {
                                                  "kind": {
                                                    "const": "section",
                                                    "type": "string"
                                                  },
                                                  "sectionId": {
                                                    "type": "string"
                                                  }
                                                },
                                                "required": [
                                                  "kind",
                                                  "sectionId"
                                                ]
                                              },
                                              "headerFooterKind": {
                                                "enum": [
                                                  "header",
                                                  "footer"
                                                ]
                                              },
                                              "variant": {
                                                "enum": [
                                                  "default",
                                                  "first",
                                                  "even"
                                                ]
                                              },
                                              "resolution": {
                                                "enum": [
                                                  "effective",
                                                  "explicit"
                                                ]
                                              },
                                              "onWrite": {
                                                "enum": [
                                                  "materializeIfInherited",
                                                  "editResolvedPart",
                                                  "error"
                                                ]
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "section",
                                              "headerFooterKind",
                                              "variant"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterPart",
                                                "type": "string"
                                              },
                                              "refId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "refId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "footnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "endnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "textbox",
                                                "type": "string"
                                              },
                                              "textboxId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "textboxId"
                                            ]
                                          }
                                        ],
                                        "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "nodeType",
                                      "nodeId"
                                    ]
                                  },
                                  "edge": {
                                    "enum": [
                                      "before",
                                      "after"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "node",
                                  "edge"
                                ]
                              }
                            ],
                            "description": "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries."
                          },
                          "end": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "text",
                                    "type": "string"
                                  },
                                  "blockId": {
                                    "type": "string"
                                  },
                                  "offset": {
                                    "type": "number"
                                  },
                                  "story": {
                                    "oneOf": [
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "body",
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterSlot",
                                            "type": "string"
                                          },
                                          "section": {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "section",
                                                "type": "string"
                                              },
                                              "sectionId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "sectionId"
                                            ]
                                          },
                                          "headerFooterKind": {
                                            "enum": [
                                              "header",
                                              "footer"
                                            ]
                                          },
                                          "variant": {
                                            "enum": [
                                              "default",
                                              "first",
                                              "even"
                                            ]
                                          },
                                          "resolution": {
                                            "enum": [
                                              "effective",
                                              "explicit"
                                            ]
                                          },
                                          "onWrite": {
                                            "enum": [
                                              "materializeIfInherited",
                                              "editResolvedPart",
                                              "error"
                                            ]
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "section",
                                          "headerFooterKind",
                                          "variant"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "headerFooterPart",
                                            "type": "string"
                                          },
                                          "refId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "refId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "footnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "endnote",
                                            "type": "string"
                                          },
                                          "noteId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "noteId"
                                        ]
                                      },
                                      {
                                        "type": "object",
                                        "properties": {
                                          "kind": {
                                            "const": "story",
                                            "type": "string"
                                          },
                                          "storyType": {
                                            "const": "textbox",
                                            "type": "string"
                                          },
                                          "textboxId": {
                                            "type": "string"
                                          }
                                        },
                                        "required": [
                                          "kind",
                                          "storyType",
                                          "textboxId"
                                        ]
                                      }
                                    ],
                                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                  }
                                },
                                "required": [
                                  "kind",
                                  "blockId",
                                  "offset"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "nodeEdge",
                                    "type": "string"
                                  },
                                  "node": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "block",
                                        "type": "string"
                                      },
                                      "nodeType": {
                                        "enum": [
                                          "paragraph",
                                          "heading",
                                          "table",
                                          "tableOfContents",
                                          "sdt",
                                          "image"
                                        ]
                                      },
                                      "nodeId": {
                                        "type": "string"
                                      },
                                      "story": {
                                        "oneOf": [
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "body",
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterSlot",
                                                "type": "string"
                                              },
                                              "section": {
                                                "type": "object",
                                                "properties": {
                                                  "kind": {
                                                    "const": "section",
                                                    "type": "string"
                                                  },
                                                  "sectionId": {
                                                    "type": "string"
                                                  }
                                                },
                                                "required": [
                                                  "kind",
                                                  "sectionId"
                                                ]
                                              },
                                              "headerFooterKind": {
                                                "enum": [
                                                  "header",
                                                  "footer"
                                                ]
                                              },
                                              "variant": {
                                                "enum": [
                                                  "default",
                                                  "first",
                                                  "even"
                                                ]
                                              },
                                              "resolution": {
                                                "enum": [
                                                  "effective",
                                                  "explicit"
                                                ]
                                              },
                                              "onWrite": {
                                                "enum": [
                                                  "materializeIfInherited",
                                                  "editResolvedPart",
                                                  "error"
                                                ]
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "section",
                                              "headerFooterKind",
                                              "variant"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "headerFooterPart",
                                                "type": "string"
                                              },
                                              "refId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "refId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "footnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "endnote",
                                                "type": "string"
                                              },
                                              "noteId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "noteId"
                                            ]
                                          },
                                          {
                                            "type": "object",
                                            "properties": {
                                              "kind": {
                                                "const": "story",
                                                "type": "string"
                                              },
                                              "storyType": {
                                                "const": "textbox",
                                                "type": "string"
                                              },
                                              "textboxId": {
                                                "type": "string"
                                              }
                                            },
                                            "required": [
                                              "kind",
                                              "storyType",
                                              "textboxId"
                                            ]
                                          }
                                        ],
                                        "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "nodeType",
                                      "nodeId"
                                    ]
                                  },
                                  "edge": {
                                    "enum": [
                                      "before",
                                      "after"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "node",
                                  "edge"
                                ]
                              }
                            ],
                            "description": "A point in the document. Use {kind:'text', blockId, offset} for character positions or {kind:'nodeEdge', node:{kind:'block', nodeType, nodeId}, edge:'before'|'after'} for block boundaries."
                          },
                          "story": {
                            "oneOf": [
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "body",
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterSlot",
                                    "type": "string"
                                  },
                                  "section": {
                                    "type": "object",
                                    "properties": {
                                      "kind": {
                                        "const": "section",
                                        "type": "string"
                                      },
                                      "sectionId": {
                                        "type": "string"
                                      }
                                    },
                                    "required": [
                                      "kind",
                                      "sectionId"
                                    ]
                                  },
                                  "headerFooterKind": {
                                    "enum": [
                                      "header",
                                      "footer"
                                    ]
                                  },
                                  "variant": {
                                    "enum": [
                                      "default",
                                      "first",
                                      "even"
                                    ]
                                  },
                                  "resolution": {
                                    "enum": [
                                      "effective",
                                      "explicit"
                                    ]
                                  },
                                  "onWrite": {
                                    "enum": [
                                      "materializeIfInherited",
                                      "editResolvedPart",
                                      "error"
                                    ]
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "section",
                                  "headerFooterKind",
                                  "variant"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "headerFooterPart",
                                    "type": "string"
                                  },
                                  "refId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "refId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "footnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "endnote",
                                    "type": "string"
                                  },
                                  "noteId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "noteId"
                                ]
                              },
                              {
                                "type": "object",
                                "properties": {
                                  "kind": {
                                    "const": "story",
                                    "type": "string"
                                  },
                                  "storyType": {
                                    "const": "textbox",
                                    "type": "string"
                                  },
                                  "textboxId": {
                                    "type": "string"
                                  }
                                },
                                "required": [
                                  "kind",
                                  "storyType",
                                  "textboxId"
                                ]
                              }
                            ],
                            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                          }
                        },
                        "required": [
                          "kind",
                          "start",
                          "end"
                        ]
                      }
                    ]
                  }
                ],
                "description": "Block address for structural insertion: {kind:'block', nodeType:'...', nodeId:'...'}."
              },
              {
                "$ref": "#/$defs/SelectionTarget",
                "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
              }
            ],
            "description": "Block address for structural insertion: {kind:'block', nodeType:'...', nodeId:'...'}."
          },
          "in": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "$ref": "#/$defs/StoryLocator",
                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                  },
                  {
                    "oneOf": [
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "body",
                            "type": "string"
                          }
                        },
                        "required": [
                          "kind",
                          "storyType"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "headerFooterSlot",
                            "type": "string"
                          },
                          "section": {
                            "type": "object",
                            "properties": {
                              "kind": {
                                "const": "section",
                                "type": "string"
                              },
                              "sectionId": {
                                "type": "string"
                              }
                            },
                            "required": [
                              "kind",
                              "sectionId"
                            ]
                          },
                          "headerFooterKind": {
                            "enum": [
                              "header",
                              "footer"
                            ]
                          },
                          "variant": {
                            "enum": [
                              "default",
                              "first",
                              "even"
                            ]
                          },
                          "resolution": {
                            "enum": [
                              "effective",
                              "explicit"
                            ]
                          },
                          "onWrite": {
                            "enum": [
                              "materializeIfInherited",
                              "editResolvedPart",
                              "error"
                            ]
                          }
                        },
                        "required": [
                          "kind",
                          "storyType",
                          "section",
                          "headerFooterKind",
                          "variant"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "headerFooterPart",
                            "type": "string"
                          },
                          "refId": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "kind",
                          "storyType",
                          "refId"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "footnote",
                            "type": "string"
                          },
                          "noteId": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "kind",
                          "storyType",
                          "noteId"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "endnote",
                            "type": "string"
                          },
                          "noteId": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "kind",
                          "storyType",
                          "noteId"
                        ]
                      },
                      {
                        "type": "object",
                        "properties": {
                          "kind": {
                            "const": "story",
                            "type": "string"
                          },
                          "storyType": {
                            "const": "textbox",
                            "type": "string"
                          },
                          "textboxId": {
                            "type": "string"
                          }
                        },
                        "required": [
                          "kind",
                          "storyType",
                          "textboxId"
                        ]
                      }
                    ],
                    "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
                  }
                ],
                "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
              },
              {
                "$ref": "#/$defs/StoryLocator",
                "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
              }
            ],
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
          },
          "value": {
            "type": "string",
            "description": "Text content to insert. Only for action 'insert'. Omit for other actions."
          },
          "type": {
            "type": "string",
            "description": "Content format: 'text' (default), 'markdown', or 'html'. Only for action 'insert'. Omit for other actions.",
            "enum": [
              "text",
              "markdown",
              "html"
            ]
          },
          "ref": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "type": "string",
                    "description": "Handle ref from superdoc_search result (pass handle.ref value directly). Preferred over building a target object."
                  },
                  {
                    "type": "string",
                    "description": "Handle ref string from a superdoc_search result. Pass the handle.ref value directly (e.g. 'text:eyJ...'). Preferred over 'target' for inline formatting."
                  }
                ],
                "description": "Handle ref from superdoc_search result (pass handle.ref value directly). Preferred over building a target object."
              },
              {
                "type": "string",
                "description": "Handle ref string from a superdoc_search result. Pass the handle.ref value directly (e.g. 'text:eyJ...'). Preferred over 'target' for inline formatting."
              }
            ],
            "description": "Handle ref from superdoc_search result (pass handle.ref value directly). Preferred over building a target object."
          },
          "content": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "type": "object"
                  },
                  {
                    "type": "array",
                    "items": {
                      "type": "object"
                    }
                  }
                ],
                "description": "Document fragment to insert (structured content)."
              },
              {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {}
                  },
                  {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {}
                    }
                  }
                ],
                "description": "Document fragment to replace with (structured content)."
              }
            ],
            "description": "Document fragment to insert (structured content). Only for actions 'insert', 'replace'. Omit for other actions."
          },
          "placement": {
            "enum": [
              "before",
              "after",
              "insideStart",
              "insideEnd"
            ],
            "description": "Where to place content relative to target: 'before', 'after', 'insideStart', or 'insideEnd'. Only for action 'insert'. Omit for other actions."
          },
          "nestingPolicy": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "tables": {
                    "enum": [
                      "forbid",
                      "allow"
                    ]
                  }
                },
                "additionalProperties": false,
                "description": "Controls nesting behavior. tables: 'allow' permits inserting tables inside other tables."
              },
              {
                "type": "object",
                "properties": {
                  "tables": {
                    "enum": [
                      "forbid",
                      "allow"
                    ]
                  }
                },
                "description": "Controls nesting behavior. tables: 'allow' permits inserting tables inside other tables."
              }
            ],
            "description": "Controls nesting behavior. tables: 'allow' permits inserting tables inside other tables. Only for actions 'insert', 'replace'. Omit for other actions."
          },
          "text": {
            "type": "string",
            "description": "Replacement text content. Only for action 'replace'. Omit for other actions."
          },
          "behavior": {
            "$ref": "#/$defs/DeleteBehavior",
            "description": "Delete behavior: 'selection' (default) or 'exact'. Only for action 'delete'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.insert",
          "intentAction": "insert",
          "requiredOneOf": [
            [
              "target",
              "value"
            ],
            [
              "ref",
              "value"
            ],
            [
              "value"
            ],
            [
              "content"
            ]
          ]
        },
        {
          "operationId": "doc.replace",
          "intentAction": "replace",
          "requiredOneOf": [
            [
              "target",
              "text"
            ],
            [
              "ref",
              "text"
            ],
            [
              "target",
              "content"
            ],
            [
              "ref",
              "content"
            ]
          ]
        },
        {
          "operationId": "doc.delete",
          "intentAction": "delete",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "ref"
            ]
          ]
        },
        {
          "operationId": "doc.history.undo",
          "intentAction": "undo"
        },
        {
          "operationId": "doc.history.redo",
          "intentAction": "redo"
        }
      ]
    },
    {
      "toolName": "superdoc_format",
      "description": "Change text and paragraph formatting. To format multiple items at once, use superdoc_mutations with format.apply steps instead of calling this tool repeatedly. Use require \"all\" with a node selector to format every heading or paragraph in one batch. Use this tool for single-item formatting when you have a valid ref or nodeId. Action \"inline\" applies character formatting (bold, italic, underline, color, fontSize, fontFamily, highlight, strike, vertAlign) to a text range via \"ref\". Action \"set_style\" applies a named paragraph style by styleId (get available styles from superdoc_get_content info). Actions \"set_alignment\", \"set_indentation\", \"set_spacing\", \"set_direction\", and \"set_flow_options\" change paragraph-level properties and require a block target: {kind:\"block\", nodeType:\"paragraph\", nodeId:\"<nodeId>\"}, NOT a ref. Use \"set_flow_options\" with pageBreakBefore:true to start a paragraph on a new page. Supports \"dryRun\" and \"changeMode: tracked\" for inline formatting. Paragraph-level actions do NOT support tracked changes. Do NOT use a search ref for paragraph-level actions; they require a block target with nodeId. Do NOT use {kind:\"block\", start:{kind:\"nodeEdge\",...}} or selection-like structures for paragraph actions. ONLY {kind:\"block\", nodeType, nodeId} is accepted. Do NOT issue multiple superdoc_format calls in parallel; each call invalidates refs for subsequent calls.\n\nEXAMPLES:\n  1. {\"action\":\"inline\",\"ref\":\"<handle.ref>\",\"inline\":{\"bold\":true}}\n  2. {\"action\":\"inline\",\"ref\":\"<create.ref>\",\"inline\":{\"fontFamily\":\"Calibri\",\"fontSize\":11,\"color\":\"#000000\",\"bold\":false}}\n  3. {\"action\":\"set_alignment\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"},\"alignment\":\"center\"}\n  4. {\"action\":\"set_flow_options\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"},\"pageBreakBefore\":true}\n  5. {\"action\":\"set_spacing\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"},\"lineSpacing\":{\"rule\":\"auto\",\"value\":1.5}}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "inline",
              "set_alignment",
              "set_direction",
              "set_flow_options",
              "set_indentation",
              "set_spacing",
              "set_style"
            ],
            "description": "The action to perform. One of: inline, set_alignment, set_direction, set_flow_options, set_indentation, set_spacing, set_style."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "dryRun": {
            "type": "boolean",
            "description": "Preview the result without applying changes."
          },
          "target": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "oneOf": [
                      {
                        "oneOf": [
                          {
                            "oneOf": [
                              {
                                "oneOf": [
                                  {
                                    "$ref": "#/$defs/SelectionTarget",
                                    "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
                                  },
                                  {
                                    "oneOf": [
                                      {
                                        "$ref": "#/$defs/ParagraphAddress"
                                      },
                                      {
                                        "$ref": "#/$defs/HeadingAddress"
                                      },
                                      {
                                        "$ref": "#/$defs/ListItemAddress"
                                      }
                                    ]
                                  }
                                ],
                                "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
                              },
                              {
                                "oneOf": [
                                  {
                                    "$ref": "#/$defs/ParagraphAddress"
                                  },
                                  {
                                    "$ref": "#/$defs/HeadingAddress"
                                  },
                                  {
                                    "$ref": "#/$defs/ListItemAddress"
                                  }
                                ]
                              }
                            ],
                            "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
                          },
                          {
                            "oneOf": [
                              {
                                "$ref": "#/$defs/ParagraphAddress"
                              },
                              {
                                "$ref": "#/$defs/HeadingAddress"
                              },
                              {
                                "$ref": "#/$defs/ListItemAddress"
                              }
                            ]
                          }
                        ],
                        "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
                      },
                      {
                        "oneOf": [
                          {
                            "$ref": "#/$defs/ParagraphAddress"
                          },
                          {
                            "$ref": "#/$defs/HeadingAddress"
                          },
                          {
                            "$ref": "#/$defs/ListItemAddress"
                          }
                        ]
                      }
                    ],
                    "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
                  },
                  {
                    "oneOf": [
                      {
                        "$ref": "#/$defs/ParagraphAddress"
                      },
                      {
                        "$ref": "#/$defs/HeadingAddress"
                      },
                      {
                        "$ref": "#/$defs/ListItemAddress"
                      }
                    ]
                  }
                ],
                "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle."
              },
              {
                "oneOf": [
                  {
                    "$ref": "#/$defs/ParagraphAddress"
                  },
                  {
                    "$ref": "#/$defs/HeadingAddress"
                  },
                  {
                    "$ref": "#/$defs/ListItemAddress"
                  }
                ]
              }
            ],
            "description": "Selection target: {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. Use 'ref' instead when you have a search result handle. Required for actions 'set_style', 'set_alignment', 'set_indentation', 'set_spacing', 'set_flow_options', 'set_direction'."
          },
          "in": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes. Only for action 'inline'. Omit for other actions."
          },
          "inline": {
            "type": "object",
            "properties": {
              "bold": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "italic": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "strike": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "underline": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  },
                  {
                    "type": "object",
                    "properties": {
                      "style": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "color": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "themeColor": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  }
                ]
              },
              "highlight": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "color": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fontSize": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fontFamily": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "letterSpacing": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "vertAlign": {
                "oneOf": [
                  {
                    "enum": [
                      "superscript",
                      "subscript",
                      "baseline"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "position": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "dstrike": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "smallCaps": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "caps": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "shading": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "fill": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "color": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "val": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "border": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "val": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "sz": {
                        "oneOf": [
                          {
                            "type": "number"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "color": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "space": {
                        "oneOf": [
                          {
                            "type": "number"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "outline": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "shadow": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "emboss": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "imprint": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "charScale": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "kerning": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "vanish": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "webHidden": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "specVanish": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "rtl": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "cs": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "bCs": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "iCs": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "eastAsianLayout": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "id": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "combine": {
                        "oneOf": [
                          {
                            "type": "boolean"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "combineBrackets": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "vert": {
                        "oneOf": [
                          {
                            "type": "boolean"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "vertCompress": {
                        "oneOf": [
                          {
                            "type": "boolean"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "em": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fitText": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "val": {
                        "oneOf": [
                          {
                            "type": "number"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "id": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "snapToGrid": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "lang": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "val": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "eastAsia": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "bidi": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "oMath": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "rStyle": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "rFonts": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "ascii": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "hAnsi": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "eastAsia": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "cs": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "asciiTheme": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "hAnsiTheme": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "eastAsiaTheme": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "csTheme": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "hint": {
                        "oneOf": [
                          {
                            "type": "string",
                            "minLength": 1
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "additionalProperties": false,
                    "minProperties": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fontSizeCs": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "ligatures": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "numForm": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "numSpacing": {
                "oneOf": [
                  {
                    "type": "string",
                    "minLength": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stylisticSets": {
                "oneOf": [
                  {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "number"
                        },
                        "val": {
                          "type": "boolean"
                        }
                      },
                      "required": [
                        "id"
                      ],
                      "additionalProperties": false
                    },
                    "minItems": 1
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "contextualAlternates": {
                "oneOf": [
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "additionalProperties": false,
            "minProperties": 1,
            "description": "Inline formatting properties to apply. Set a property to apply it, use null to clear it. Example: {bold: true, italic: true} or {bold: null} to remove bold. Only for action 'inline'. Omit for other actions."
          },
          "ref": {
            "type": "string",
            "description": "Handle ref string from a superdoc_search result. Pass the handle.ref value directly (e.g. 'text:eyJ...'). Preferred over 'target' for inline formatting. Only for action 'inline'. Omit for other actions."
          },
          "styleId": {
            "type": "string",
            "minLength": 1,
            "description": "Named paragraph style ID (e.g. 'Normal', 'Heading1', 'BodyText'). Use superdoc_search to find a nearby paragraph, then inspect its style to determine the correct styleId. Required for action 'set_style'."
          },
          "alignment": {
            "enum": [
              "left",
              "center",
              "right",
              "justify"
            ],
            "description": "Visual paragraph alignment. In RTL paragraphs, 'left' stores w:jc='right' and 'right' stores w:jc='left' so Word displays the requested side. Required for action 'set_alignment'."
          },
          "left": {
            "type": "integer",
            "description": "Left indentation in twips (1440 = 1 inch). Only for action 'set_indentation'. Omit for other actions."
          },
          "right": {
            "type": "integer",
            "description": "Right indentation in twips (1440 = 1 inch). Only for action 'set_indentation'. Omit for other actions."
          },
          "firstLine": {
            "type": "integer",
            "minimum": 0,
            "description": "First line indent in twips. Cannot be combined with hanging. Only for action 'set_indentation'. Omit for other actions."
          },
          "hanging": {
            "type": "integer",
            "minimum": 0,
            "description": "Hanging indent in twips. Cannot be combined with firstLine. Only for action 'set_indentation'. Omit for other actions."
          },
          "before": {
            "type": "integer",
            "minimum": 0,
            "description": "Space before paragraph in twips (20 twips = 1pt). Only for action 'set_spacing'. Omit for other actions."
          },
          "after": {
            "type": "integer",
            "minimum": 0,
            "description": "Space after paragraph in twips (20 twips = 1pt). Only for action 'set_spacing'. Omit for other actions."
          },
          "line": {
            "type": "integer",
            "minimum": 1,
            "description": "Line spacing value. Meaning depends on lineRule. Must be provided together with lineRule. Only for action 'set_spacing'. Omit for other actions."
          },
          "lineRule": {
            "enum": [
              "auto",
              "exact",
              "atLeast"
            ],
            "description": "Line spacing rule. Required when 'line' is set. Only for action 'set_spacing'. Omit for other actions."
          },
          "contextualSpacing": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "pageBreakBefore": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "suppressAutoHyphens": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "autoSpaceDE": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "autoSpaceDN": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "adjustRightInd": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "snapToGrid": {
            "type": "boolean",
            "description": "Only for action 'set_flow_options'. Omit for other actions."
          },
          "direction": {
            "type": "string",
            "enum": [
              "ltr",
              "rtl"
            ],
            "description": "Required for action 'set_direction'."
          },
          "alignmentPolicy": {
            "type": "string",
            "enum": [
              "preserve",
              "matchDirection"
            ],
            "description": "Only for action 'set_direction'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.format.apply",
          "intentAction": "inline",
          "requiredOneOf": [
            [
              "target",
              "inline"
            ],
            [
              "ref",
              "inline"
            ]
          ]
        },
        {
          "operationId": "doc.styles.paragraph.setStyle",
          "intentAction": "set_style",
          "required": [
            "target",
            "styleId"
          ]
        },
        {
          "operationId": "doc.format.paragraph.setAlignment",
          "intentAction": "set_alignment",
          "required": [
            "target",
            "alignment"
          ]
        },
        {
          "operationId": "doc.format.paragraph.setIndentation",
          "intentAction": "set_indentation",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.format.paragraph.setSpacing",
          "intentAction": "set_spacing",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.format.paragraph.setFlowOptions",
          "intentAction": "set_flow_options",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.format.paragraph.setDirection",
          "intentAction": "set_direction",
          "required": [
            "target",
            "direction"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_create",
      "description": "IMPORTANT: For headings and paragraphs, use superdoc_edit with type \"markdown\" instead: it is faster, creates proper styles, and handles positioning via target + placement. Only use superdoc_create for tables or when markdown cannot express the content. Creates a single paragraph, heading, or table. Returns nodeId and ref for the created block. After creating, the returned ref is valid for ONE immediate superdoc_format call. For subsequent operations, re-fetch blocks with superdoc_get_content to get fresh refs (refs expire after any mutation). When the user asks for a \"heading\", use action \"heading\" with a level (default 1). Use action \"paragraph\" for regular body text. Position with \"at\": {kind:\"documentEnd\"} (default), {kind:\"documentStart\"}, or {kind:\"after\"/\"before\", target:{kind:\"block\", nodeType, nodeId}} for relative placement. When creating multiple items in sequence, use the previous response nodeId as the next \"at\" target to maintain correct ordering. Do NOT use newlines in \"text\" to create multiple paragraphs; call this tool separately for each one.\n\nEXAMPLES:\n  1. {\"action\":\"paragraph\",\"text\":\"New paragraph content.\",\"at\":{\"kind\":\"documentEnd\"}}\n  2. {\"action\":\"heading\",\"text\":\"Section Title\",\"level\":2,\"at\":{\"kind\":\"after\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"}}}\n  3. {\"action\":\"paragraph\",\"text\":\"Chained item.\",\"at\":{\"kind\":\"after\",\"target\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<previousNodeId>\"}}}\n  4. {\"action\":\"table\",\"rows\":3,\"columns\":4,\"at\":{\"kind\":\"documentEnd\"}}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "heading",
              "paragraph",
              "table"
            ],
            "description": "The action to perform. One of: heading, paragraph, table."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "dryRun": {
            "type": "boolean",
            "description": "Preview the result without applying changes."
          },
          "in": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
          },
          "at": {
            "oneOf": [
              {
                "description": "Position: {kind:'documentEnd'} to append, {kind:'documentStart'} to prepend, or {kind:'before'|'after', target:{kind:'block', nodeType:'...', nodeId:'...'}} for relative placement.",
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "documentStart",
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "documentEnd",
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "before",
                        "type": "string"
                      },
                      "target": {
                        "$ref": "#/$defs/BlockNodeAddress"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "target"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "after",
                        "type": "string"
                      },
                      "target": {
                        "$ref": "#/$defs/BlockNodeAddress"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "target"
                    ]
                  }
                ]
              },
              {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "documentStart",
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "documentEnd",
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "before",
                        "type": "string"
                      },
                      "target": {
                        "$ref": "#/$defs/BlockNodeAddress"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "target"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "after",
                        "type": "string"
                      },
                      "target": {
                        "$ref": "#/$defs/BlockNodeAddress"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "target"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "before",
                        "type": "string"
                      },
                      "nodeId": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "nodeId"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "after",
                        "type": "string"
                      },
                      "nodeId": {
                        "type": "string"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "nodeId"
                    ]
                  }
                ]
              }
            ],
            "description": "Position: {kind:'documentEnd'} to append, {kind:'documentStart'} to prepend, or {kind:'before'|'after', target:{kind:'block', nodeType:'...', nodeId:'...'}} for relative placement."
          },
          "text": {
            "oneOf": [
              {
                "type": "string",
                "description": "Paragraph text content. Each call creates ONE paragraph. For multiple items (e.g. list items), call superdoc_create separately for each item: do NOT use newlines to put multiple items in one paragraph."
              },
              {
                "type": "string",
                "description": "Heading text content."
              }
            ],
            "description": "Paragraph text content. Each call creates ONE paragraph. For multiple items (e.g. list items), call superdoc_create separately for each item: do NOT use newlines to put multiple items in one paragraph."
          },
          "input": {
            "oneOf": [
              {
                "type": "object",
                "description": "Full paragraph input as JSON (alternative to individual text/at params)."
              },
              {
                "type": "object",
                "description": "Full heading input as JSON (alternative to individual text/level/at params)."
              }
            ],
            "description": "Full paragraph input as JSON (alternative to individual text/at params)."
          },
          "level": {
            "type": "integer",
            "minimum": 1,
            "maximum": 6,
            "description": "Heading level (1-6). Required for action 'heading'."
          },
          "rows": {
            "type": "integer",
            "minimum": 1,
            "description": "Required for action 'table'."
          },
          "columns": {
            "type": "integer",
            "minimum": 1,
            "description": "Required for action 'table'."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.create.paragraph",
          "intentAction": "paragraph"
        },
        {
          "operationId": "doc.create.heading",
          "intentAction": "heading",
          "required": [
            "level"
          ]
        },
        {
          "operationId": "doc.create.table",
          "intentAction": "table",
          "required": [
            "rows",
            "columns"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_list",
      "description": "Create and manipulate bullet and numbered lists. Most actions require a list-item target: {kind:\"block\", nodeType:\"listItem\", nodeId:\"<id>\"}. Exceptions: \"create\" and \"attach\" operate on paragraph targets (they turn paragraphs into list items). Find nodeIds via superdoc_get_content({action:\"blocks\"}): pick listItem blocks for most actions, paragraph blocks for create/attach.\n\nCREATE & CONVERT:\n• \"create\": make a NEW list from paragraphs. Two modes: mode:\"empty\" with at:{kind:\"block\", nodeType:\"paragraph\", nodeId} converts a single paragraph; mode:\"fromParagraphs\" with target:{from:{...paragraph block address}, to:{...paragraph block address}} converts a range: ALL paragraphs between from and to become items, so make sure no other content sits between them. Pass a preset (\"disc\"|\"circle\"|\"square\"|\"dash\" for bullets; \"decimal\"|\"decimalParenthesis\"|\"lowerLetter\"|\"upperLetter\"|\"lowerRoman\"|\"upperRoman\" for ordered) or a custom style. Use \"create\" to start a fresh list: NOT to extend an existing one (use \"attach\" for that).\n• \"attach\": add paragraphs to an EXISTING list, inheriting its numbering definition. Pass target:{paragraph block address} (or {from, to} range of paragraphs) + attachTo:{kind:\"block\", nodeType:\"listItem\", nodeId:\"<any item in destination list>\"} + optional level:0..8. Use this to extend a list or as the second half of a merge workflow (see \"join\" below).\n• \"set_type\": convert an existing list between ordered and bullet. Pass target:{listItem} + kind:\"ordered\" or \"bullet\". Adjacent compatible sequences are merged automatically to preserve continuous numbering.\n• \"detach\": convert a list item back to a plain paragraph. Pass target:{listItem}.\n\nITEMS & NESTING:\n• \"insert\": add a new list item adjacent to an existing item in the same list. Pass target:{listItem} + position:\"before\"|\"after\" + optional text. Use this (NOT superdoc_create) to add items to an existing list.\n• \"indent\" / \"outdent\": bump the target item's nesting level by one (0-8 range). Pass target:{listItem}.\n• \"set_level\": jump the target item to an explicit level. Pass target:{listItem} + level:0..8.\n\nNUMBERING (ordered lists):\n• \"set_value\": restart numbering at the target. Pass target:{listItem} + value:<number> (e.g. value:1 to start over) or value:null to clear a previous override. Mid-sequence targets are atomically split off into their own sequence.\n• \"continue_previous\": make the target's sequence continue numbering from the nearest compatible previous sequence (same abstract definition). Pass target:{listItem of the sequence you want to renumber}. Fails with NO_COMPATIBLE_PREVIOUS or INCOMPATIBLE_DEFINITIONS if no matching prior sequence exists.\n\nSEQUENCE SHAPE (merge / split):\n• \"merge\": merge the target's sequence with an adjacent one into one continuous list. Pass target:{listItem} + direction:\"withPrevious\" or \"withNext\". Absorbed items adopt the absorbing sequence's numbering definition, and empty paragraphs between the two sequences are removed so numbering flows continuously.\n• \"split\": split the target's sequence at the target item into two independent lists. The target and everything after become a new sequence that restarts numbering at 1. Pass target:{listItem}; add restartNumbering:false to keep the count continuing instead of restarting.\n\nEXAMPLES:\n  1. {\"action\":\"create\",\"mode\":\"fromParagraphs\",\"preset\":\"disc\",\"target\":{\"from\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<firstId>\"},\"to\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<lastId>\"}}}\n  2. {\"action\":\"set_type\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"},\"kind\":\"ordered\"}\n  3. {\"action\":\"insert\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"},\"position\":\"after\",\"text\":\"New list item\"}\n  4. {\"action\":\"indent\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"}}\n  5. {\"action\":\"merge\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"},\"direction\":\"withPrevious\"}\n  6. {\"action\":\"split\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"}}\n  7. {\"action\":\"set_value\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"},\"value\":1}\n  8. {\"action\":\"continue_previous\",\"target\":{\"kind\":\"block\",\"nodeType\":\"listItem\",\"nodeId\":\"<itemId>\"}}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "attach",
              "continue_previous",
              "create",
              "delete",
              "detach",
              "indent",
              "insert",
              "merge",
              "outdent",
              "set_level",
              "set_type",
              "set_value",
              "split"
            ],
            "description": "The action to perform. One of: attach, continue_previous, create, delete, detach, indent, insert, merge, outdent, set_level, set_type, set_value, split."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "dryRun": {
            "type": "boolean",
            "description": "Preview the result without applying changes."
          },
          "target": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "oneOf": [
                      {
                        "oneOf": [
                          {
                            "oneOf": [
                              {
                                "oneOf": [
                                  {
                                    "oneOf": [
                                      {
                                        "oneOf": [
                                          {
                                            "oneOf": [
                                              {
                                                "oneOf": [
                                                  {
                                                    "oneOf": [
                                                      {
                                                        "oneOf": [
                                                          {
                                                            "$ref": "#/$defs/ListItemAddress",
                                                            "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                                          },
                                                          {
                                                            "$ref": "#/$defs/BlockAddressOrRange",
                                                            "description": "Required when mode is 'fromParagraphs'. Each call converts ONE paragraph into a list item. To make a list with N items, create N separate paragraphs first, then call superdoc_list create for EACH one. Format: {kind:'block', nodeType:'paragraph', nodeId:'<id>'}."
                                                          }
                                                        ],
                                                        "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                                      },
                                                      {
                                                        "$ref": "#/$defs/BlockAddressOrRange"
                                                      }
                                                    ],
                                                    "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                                  },
                                                  {
                                                    "$ref": "#/$defs/ListItemAddress"
                                                  }
                                                ],
                                                "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                              },
                                              {
                                                "$ref": "#/$defs/ListItemAddress"
                                              }
                                            ],
                                            "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                          },
                                          {
                                            "$ref": "#/$defs/ListItemAddress"
                                          }
                                        ],
                                        "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                      },
                                      {
                                        "$ref": "#/$defs/ListItemAddress"
                                      }
                                    ],
                                    "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                                  },
                                  {
                                    "$ref": "#/$defs/ListItemAddress"
                                  }
                                ],
                                "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                              },
                              {
                                "$ref": "#/$defs/ListItemAddress"
                              }
                            ],
                            "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                          },
                          {
                            "$ref": "#/$defs/ListItemAddress"
                          }
                        ],
                        "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                      },
                      {
                        "$ref": "#/$defs/ListItemAddress"
                      }
                    ],
                    "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
                  },
                  {
                    "$ref": "#/$defs/ListItemAddress"
                  }
                ],
                "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}."
              },
              {
                "$ref": "#/$defs/ListItemAddress"
              }
            ],
            "description": "The target list item. For 'insert': the item to insert relative to. For 'create' with mode 'fromParagraphs': use nodeType 'paragraph' instead. Format: {kind:'block', nodeType:'listItem', nodeId:'<id>'}. Required for actions 'insert', 'attach', 'detach', 'delete', 'indent', 'outdent', 'merge', 'split', 'set_level', 'set_value', 'continue_previous', 'set_type'."
          },
          "position": {
            "enum": [
              "before",
              "after"
            ],
            "description": "Required. Insert position relative to target: 'before' or 'after'. Required for action 'insert'."
          },
          "text": {
            "type": "string",
            "description": "Text content for the new list item. Only for action 'insert'. Omit for other actions."
          },
          "input": {
            "type": "object",
            "description": "Operation input as JSON object."
          },
          "nodeId": {
            "type": "string",
            "description": "Node ID of the target list item."
          },
          "mode": {
            "enum": [
              "empty",
              "fromParagraphs"
            ],
            "description": "Required. 'fromParagraphs' converts existing paragraphs into list items: each paragraph becomes one item, so create one paragraph per item first. 'empty' creates a new empty list at 'at'. Required for action 'create'."
          },
          "at": {
            "$ref": "#/$defs/BlockAddress",
            "description": "Required when mode is 'empty'. The paragraph to create the list at. Format: {kind:'block', nodeType:'paragraph', nodeId:'<id>'}. Only for action 'create'. Omit for other actions."
          },
          "kind": {
            "enum": [
              "ordered",
              "bullet"
            ],
            "description": "List type: 'bullet' for bullet points, 'ordered' for numbered lists. Required for action 'set_type'."
          },
          "level": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 8,
                    "description": "List nesting level (0-8). 0 is the top level."
                  },
                  {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 8
                  }
                ],
                "description": "List nesting level (0-8). 0 is the top level."
              },
              {
                "type": "integer",
                "minimum": 0,
                "maximum": 8
              }
            ],
            "description": "List nesting level (0-8). 0 is the top level. Required for action 'set_level'."
          },
          "preset": {
            "enum": [
              "decimal",
              "decimalParenthesis",
              "lowerLetter",
              "upperLetter",
              "lowerRoman",
              "upperRoman",
              "disc",
              "circle",
              "square",
              "dash"
            ],
            "description": "Predefined list style preset. Overrides 'kind' with a specific numbering or bullet format. Only for action 'create'. Omit for other actions."
          },
          "style": {
            "type": "object",
            "properties": {
              "version": {
                "const": 1,
                "type": "number"
              },
              "levels": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "level": {
                      "type": "integer",
                      "minimum": 0,
                      "maximum": 8
                    },
                    "numFmt": {
                      "type": "string"
                    },
                    "lvlText": {
                      "type": "string"
                    },
                    "start": {
                      "type": "integer"
                    },
                    "alignment": {
                      "enum": [
                        "left",
                        "center",
                        "right"
                      ]
                    },
                    "indents": {
                      "type": "object",
                      "properties": {
                        "left": {
                          "type": "integer"
                        },
                        "hanging": {
                          "type": "integer"
                        },
                        "firstLine": {
                          "type": "integer"
                        }
                      },
                      "additionalProperties": false
                    },
                    "trailingCharacter": {
                      "enum": [
                        "tab",
                        "space",
                        "nothing"
                      ]
                    },
                    "markerFont": {
                      "type": "string"
                    },
                    "pictureBulletId": {
                      "type": "integer"
                    },
                    "tabStopAt": {
                      "type": [
                        "integer",
                        "null"
                      ]
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "level"
                  ]
                }
              }
            },
            "additionalProperties": false,
            "required": [
              "version",
              "levels"
            ],
            "description": "Only for action 'create'. Omit for other actions."
          },
          "sequence": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "mode": {
                    "const": "new",
                    "type": "string"
                  },
                  "startAt": {
                    "type": "integer",
                    "minimum": 1
                  }
                },
                "additionalProperties": false,
                "required": [
                  "mode"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "mode": {
                    "const": "continuePrevious",
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "mode"
                ]
              }
            ],
            "description": "Only for action 'create'. Omit for other actions."
          },
          "attachTo": {
            "$ref": "#/$defs/ListItemAddress",
            "description": "Required for action 'attach'."
          },
          "direction": {
            "enum": [
              "withPrevious",
              "withNext"
            ],
            "description": "Required for action 'merge'."
          },
          "restartNumbering": {
            "type": "boolean",
            "description": "Only for action 'split'. Omit for other actions."
          },
          "value": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Required for action 'set_value'."
          },
          "continuity": {
            "enum": [
              "preserve",
              "none"
            ],
            "description": "Numbering continuity: 'preserve' keeps numbering; 'none' restarts. Only for action 'set_type'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.lists.insert",
          "intentAction": "insert",
          "required": [
            "target",
            "position"
          ]
        },
        {
          "operationId": "doc.lists.create",
          "intentAction": "create",
          "required": [
            "mode"
          ]
        },
        {
          "operationId": "doc.lists.attach",
          "intentAction": "attach",
          "required": [
            "target",
            "attachTo"
          ]
        },
        {
          "operationId": "doc.lists.detach",
          "intentAction": "detach",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.delete",
          "intentAction": "delete",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.indent",
          "intentAction": "indent",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.outdent",
          "intentAction": "outdent",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.merge",
          "intentAction": "merge",
          "required": [
            "target",
            "direction"
          ]
        },
        {
          "operationId": "doc.lists.split",
          "intentAction": "split",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.setLevel",
          "intentAction": "set_level",
          "required": [
            "target",
            "level"
          ]
        },
        {
          "operationId": "doc.lists.setValue",
          "intentAction": "set_value",
          "required": [
            "target",
            "value"
          ]
        },
        {
          "operationId": "doc.lists.continuePrevious",
          "intentAction": "continue_previous",
          "required": [
            "target"
          ]
        },
        {
          "operationId": "doc.lists.setType",
          "intentAction": "set_type",
          "required": [
            "target",
            "kind"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_comment",
      "description": "Manage document comment threads: create, read, update, and delete. To create a comment, first use superdoc_search to find the target text, then pass action \"create\" with the comment text and a target built from items[0].blocks. For a single-block match use {kind:\"text\", blockId: items[0].blocks[0].blockId, range: items[0].blocks[0].range}. For a cross-block match use {kind:\"text\", segments: items[0].blocks.map(b => ({blockId: b.blockId, range: b.range}))}. Do NOT use items[0].highlightRange (snippet-relative, not block-relative) or items[0].target (a SelectionTarget, not accepted by comments.create). For threaded replies, pass \"parentId\" with the parent comment ID. Action \"list\" returns all comments with optional pagination (limit, offset) and filtering (includeResolved:true to include resolved). Action \"get\" retrieves a single comment by ID. Action \"update\" changes comment text, re-anchors the thread, or changes status to \"resolved\". The legacy `isInternal` field remains in schema for v1 compatibility but the v2 surface rejects it with `CAPABILITY_UNAVAILABLE`. Action \"delete\" removes a comment or reply by ID. Do NOT pass \"ref\", \"id\", or \"parentId\" when creating a new top-level comment; only \"action\", \"text\", and \"target\" are needed.\n\nEXAMPLES:\n  1. {\"action\":\"create\",\"text\":\"Please review this section.\",\"target\":{\"kind\":\"text\",\"blockId\":\"<blockId>\",\"range\":{\"start\":5,\"end\":25}}}\n  2. {\"action\":\"list\",\"limit\":20,\"offset\":0}\n  3. {\"action\":\"update\",\"id\":\"<commentId>\",\"status\":\"resolved\"}\n  4. {\"action\":\"delete\",\"id\":\"<commentId>\"}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "create",
              "delete",
              "get",
              "list",
              "update"
            ],
            "description": "The action to perform. One of: create, delete, get, list, update."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "text": {
            "oneOf": [
              {
                "type": "string",
                "description": "Comment text content."
              },
              {
                "type": "string",
                "description": "Updated comment text."
              }
            ],
            "description": "Comment text content. Required for action 'create'."
          },
          "target": {
            "oneOf": [
              {
                "description": "Text range to anchor the comment. Accepts either a single-block TextAddress {kind:'text', blockId, range}, a multi-segment TextTarget {kind:'text', segments:[{blockId, range}, ...]} for selections that span blocks, a SelectionTarget {kind:'selection', start, end} returned by query.match, a TextSearchCommentTarget {text, story?}, or a TrackedChangeCommentTarget ({kind:'trackedChange', trackedChangeId, side?} or {trackedChangeId, side?}) that names a logical tracked-change id as a convenience anchor .",
                "oneOf": [
                  {
                    "$ref": "#/$defs/TextAddress"
                  },
                  {
                    "$ref": "#/$defs/TextTarget"
                  },
                  {
                    "$ref": "#/$defs/SelectionTarget"
                  },
                  {
                    "$ref": "#/$defs/CommentTrackedChangeTarget"
                  },
                  {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "description": "Text to find and anchor the comment to. The adapter resolves the first body/story match."
                      },
                      "story": {
                        "$ref": "#/$defs/StoryLocator"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "text"
                    ]
                  }
                ]
              },
              {
                "oneOf": [
                  {
                    "$ref": "#/$defs/TextAddress"
                  },
                  {
                    "$ref": "#/$defs/SelectionTarget"
                  },
                  {
                    "$ref": "#/$defs/CommentTrackedChangeTarget"
                  },
                  {
                    "type": "object",
                    "properties": {
                      "text": {
                        "type": "string",
                        "description": "Text to find and anchor the comment to. The adapter resolves the first body/story match."
                      },
                      "story": {
                        "$ref": "#/$defs/StoryLocator"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "text"
                    ]
                  }
                ],
                "description": "New anchor for the comment. Accepts a plain TextAddress, a SelectionTarget {kind:'selection', start, end}, a TextSearchCommentTarget {text, story?}, or a TrackedChangeCommentTarget, with or without kind, that names a logical tracked-change id as a convenience re-anchor target ."
              }
            ],
            "description": "Text range to anchor the comment. Accepts either a single-block TextAddress {kind:'text', blockId, range}, a multi-segment TextTarget {kind:'text', segments:[{blockId, range}, ...]} for selections that span blocks, a SelectionTarget {kind:'selection', start, end} returned by query.match, a TextSearchCommentTarget {text, story?}, or a TrackedChangeCommentTarget ({kind:'trackedChange', trackedChangeId, side?} or {trackedChangeId, side?}) that names a logical tracked-change id as a convenience anchor . Only for actions 'create', 'update'. Omit for other actions."
          },
          "trackedChangeId": {
            "type": "string",
            "description": "Compatibility shorthand for target: { trackedChangeId }. Used only when target is omitted. Only for action 'create'. Omit for other actions."
          },
          "side": {
            "enum": [
              "inserted",
              "deleted",
              "source",
              "destination"
            ],
            "description": "Optional side for the top-level trackedChangeId shorthand. Only for action 'create'. Omit for other actions."
          },
          "story": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Optional story for the top-level trackedChangeId shorthand. Only for action 'create'. Omit for other actions."
          },
          "parentId": {
            "type": "string",
            "description": "Parent comment ID for creating a threaded reply. Only for action 'create'. Omit for other actions."
          },
          "id": {
            "type": "string",
            "description": "Required for actions 'delete', 'get'."
          },
          "status": {
            "enum": [
              "resolved",
              "active"
            ],
            "description": "Set comment status. Use 'resolved' to resolve a comment, or 'active' to reopen a previously resolved comment (lifecycle inverse). Only for action 'update'. Omit for other actions."
          },
          "isInternal": {
            "type": "boolean",
            "description": "Legacy v1/document-api compatibility field. Not a supported v2 behavior. V2 adapters MUST reject a `comments.patch` request containing `isInternal` with `CAPABILITY_UNAVAILABLE` (kernel reason `internal-comments-unsupported`). The field is preserved in the schema only so v1 callers keep their input shape (`comments-spec.md` §7, §14.6). Only for action 'update'. Omit for other actions."
          },
          "includeResolved": {
            "type": "boolean",
            "description": "When true, includes resolved comments in results. Default: false. Only for action 'list'. Omit for other actions."
          },
          "limit": {
            "type": "integer",
            "description": "Maximum number of comments to return. Only for action 'list'. Omit for other actions."
          },
          "offset": {
            "type": "integer",
            "description": "Number of comments to skip for pagination. Only for action 'list'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.comments.create",
          "intentAction": "create",
          "required": [
            "text"
          ]
        },
        {
          "operationId": "doc.comments.patch",
          "intentAction": "update"
        },
        {
          "operationId": "doc.comments.delete",
          "intentAction": "delete",
          "required": [
            "id"
          ]
        },
        {
          "operationId": "doc.comments.get",
          "intentAction": "get",
          "required": [
            "id"
          ]
        },
        {
          "operationId": "doc.comments.list",
          "intentAction": "list"
        }
      ]
    },
    {
      "toolName": "superdoc_track_changes",
      "description": "Review and resolve tracked changes (insertions, deletions, replacements, format changes) in the document. Action \"list\" returns all tracked changes with optional filtering by type (insert, delete, replacement, format) and pagination (limit, offset). Each change includes an ID, type, author, timestamp, and content preview. Action \"decide\" accepts or rejects changes. Pass decision:\"accept\" to apply the change permanently, or decision:\"reject\" to discard it. Target a single change with {id:\"<changeId>\"}, a partial selection with {kind:\"range\", range:{...}}, or all changes at once with {scope:\"all\"} (optionally plus story). Do NOT use this tool unless the document has tracked changes. Use superdoc_get_content info to check the tracked change count first.\n\nEXAMPLES:\n  1. {\"action\":\"list\"}\n  2. {\"action\":\"list\",\"type\":\"insertion\",\"limit\":10}\n  3. {\"action\":\"list\",\"type\":\"replacement\",\"limit\":10}\n  4. {\"action\":\"decide\",\"decision\":\"accept\",\"target\":{\"id\":\"<changeId>\"}}\n  5. {\"action\":\"decide\",\"decision\":\"reject\",\"target\":{\"kind\":\"range\",\"range\":{\"kind\":\"text\",\"segments\":[{\"blockId\":\"<blockId>\",\"range\":{\"start\":0,\"end\":5}}]}}}\n  6. {\"action\":\"decide\",\"decision\":\"reject\",\"target\":{\"scope\":\"all\"}}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "decide",
              "list"
            ],
            "description": "The action to perform. One of: decide, list."
          },
          "limit": {
            "type": "integer",
            "description": "Maximum number of tracked changes to return. Only for action 'list'. Omit for other actions."
          },
          "offset": {
            "type": "integer",
            "description": "Number of tracked changes to skip for pagination. Only for action 'list'. Omit for other actions."
          },
          "type": {
            "enum": [
              "insertion",
              "deletion",
              "replacement",
              "formatting",
              "move",
              "structural",
              "insert",
              "delete",
              "format"
            ],
            "description": "Filter by change type. Canonical values: 'insertion', 'deletion', 'replacement', 'formatting', 'move', 'structural'. Legacy aliases 'insert', 'delete', and 'format' remain accepted during migration. Only for action 'list'. Omit for other actions."
          },
          "in": {
            "oneOf": [
              {
                "$ref": "#/$defs/StoryLocator"
              },
              {
                "const": "all",
                "type": "string"
              }
            ],
            "description": "Story scope. Omit for body only, pass a StoryLocator for a single story, or 'all' for body + every revision-capable non-body story. Only for action 'list'. Omit for other actions."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks. Only for action 'decide'. Omit for other actions."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions. Only for action 'decide'. Omit for other actions."
          },
          "decision": {
            "enum": [
              "accept",
              "reject"
            ],
            "description": "Required for action 'decide'."
          },
          "expectedRevision": {
            "type": "string",
            "description": "Backward-compatible alias for options.expectedRevision. Explicit mutation options take precedence when both are supplied. Only for action 'decide'. Omit for other actions."
          },
          "target": {
            "description": "Decision target. Canonical shapes: { kind: 'id', id, story? } (whole logical tracked change), { kind: 'range', range: TextTarget, overlap?, side?, story?, part? } or { kind: 'range', range: { anchor, relativeStart, relativeEnd }, overlap?, side?, story?, part? } (resolves only the selected overlap; may split fragments), { kind: 'all' } (every active tracked change). Legacy { id, story? } / { id, range: { kind: 'partial', start, end } } / { scope: 'all' } shapes are accepted and transparently promoted to canonical targets. Required for action 'decide'.",
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "id",
                    "type": "string"
                  },
                  "id": {
                    "type": "string"
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator"
                  },
                  "moveRole": {
                    "enum": [
                      "pair",
                      "source",
                      "destination"
                    ],
                    "description": "Optional move pairing assertion. 'pair' requires the resolved tracked change to be a paired move; 'source' / 'destination' further narrow to a specific half. When the assertion does not hold the decide adapter fails closed."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "id"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "range",
                    "type": "string"
                  },
                  "range": {
                    "$ref": "#/$defs/TextTarget"
                  },
                  "overlap": {
                    "type": "string",
                    "description": "Optional logical overlap selector for callers that already resolved an ambiguous overlap surface. Adapter-owned interpretation."
                  },
                  "side": {
                    "enum": [
                      "insert",
                      "inserted",
                      "delete",
                      "deleted",
                      "source",
                      "destination"
                    ],
                    "description": "Optional revision side for paired replacement or move targets."
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator",
                    "description": "Optional story containing the range target."
                  },
                  "part": {
                    "type": "string",
                    "description": "Compatibility alias used by older range callers; interpretation is adapter-owned."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "range"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "range",
                    "type": "string"
                  },
                  "range": {
                    "type": "object",
                    "properties": {
                      "anchor": {
                        "type": "string"
                      },
                      "relativeStart": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "relativeEnd": {
                        "type": "integer",
                        "minimum": 0
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "anchor",
                      "relativeStart",
                      "relativeEnd"
                    ]
                  },
                  "overlap": {
                    "type": "string",
                    "description": "Optional logical overlap selector for callers that already resolved an ambiguous overlap surface. Adapter-owned interpretation."
                  },
                  "side": {
                    "enum": [
                      "insert",
                      "inserted",
                      "delete",
                      "deleted",
                      "source",
                      "destination"
                    ],
                    "description": "Optional revision side for paired replacement or move targets."
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator",
                    "description": "Optional story containing the range target."
                  },
                  "part": {
                    "type": "string",
                    "description": "Compatibility alias used by older range callers; interpretation is adapter-owned."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "range"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "range",
                    "type": "string"
                  },
                  "anchor": {
                    "type": "string"
                  },
                  "relativeStart": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "relativeEnd": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "overlap": {
                    "type": "string",
                    "description": "Optional logical overlap selector for callers that already resolved an ambiguous overlap surface. Adapter-owned interpretation."
                  },
                  "side": {
                    "enum": [
                      "insert",
                      "inserted",
                      "delete",
                      "deleted",
                      "source",
                      "destination"
                    ],
                    "description": "Optional revision side for paired replacement or move targets."
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator",
                    "description": "Optional story containing the range target."
                  },
                  "part": {
                    "type": "string",
                    "description": "Compatibility alias used by older range callers; interpretation is adapter-owned."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "anchor",
                  "relativeStart",
                  "relativeEnd"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "all",
                    "type": "string"
                  },
                  "story": {
                    "oneOf": [
                      {
                        "$ref": "#/$defs/StoryLocator"
                      },
                      {
                        "const": "all",
                        "type": "string"
                      }
                    ],
                    "description": "Optional explicit bulk filter. Omit or pass 'all' to target every revision-capable story, or pass a StoryLocator to scope the decision to one story."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator"
                  },
                  "moveRole": {
                    "enum": [
                      "pair",
                      "source",
                      "destination"
                    ],
                    "description": "Optional move pairing assertion. 'pair' requires the resolved tracked change to be a paired move; 'source' / 'destination' further narrow to a specific half. When the assertion does not hold the decide adapter fails closed."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "id"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string"
                  },
                  "range": {
                    "type": "object",
                    "properties": {
                      "kind": {
                        "const": "partial",
                        "type": "string"
                      },
                      "start": {
                        "type": "integer",
                        "minimum": 0
                      },
                      "end": {
                        "type": "integer",
                        "minimum": 0
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "start",
                      "end"
                    ]
                  },
                  "story": {
                    "$ref": "#/$defs/StoryLocator"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "id",
                  "range"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "scope": {
                    "enum": [
                      "all"
                    ]
                  },
                  "story": {
                    "oneOf": [
                      {
                        "$ref": "#/$defs/StoryLocator"
                      },
                      {
                        "const": "all",
                        "type": "string"
                      }
                    ],
                    "description": "Optional explicit bulk filter. Omit or pass 'all' to target every revision-capable story, or pass a StoryLocator to scope the decision to one story."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "scope"
                ]
              }
            ]
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.trackChanges.list",
          "intentAction": "list"
        },
        {
          "operationId": "doc.trackChanges.decide",
          "intentAction": "decide",
          "required": [
            "decision",
            "target"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_search",
      "description": "Find text patterns or nodes in the document and get ref handles for targeting edits and formatting. Refs expire after any mutation that changes the document. Re-search before the next edit when using individual tools (superdoc_edit, superdoc_format). Within a superdoc_mutations batch, selectors in \"where\" clauses resolve automatically at compile time; no manual re-searching needed between steps. Text search returns handle.ref covering only the matched substring. Node search finds blocks by type (paragraph, heading, table, listItem, etc.). The \"require\" parameter controls match cardinality: \"first\" returns one match, \"all\" returns every match, \"exactlyOne\" fails if not exactly one match. Supports scoping via \"within\" to search inside a single block. Do NOT use regex or markdown formatting markers (#, **, etc.) in search patterns; patterns are plain text only. Do NOT use this tool when you already have a ref from superdoc_get_content blocks or superdoc_create; use that ref directly.\n\nEXAMPLES:\n  1. {\"select\":{\"type\":\"text\",\"pattern\":\"Introduction\"},\"require\":\"first\"}\n  2. {\"select\":{\"type\":\"text\",\"pattern\":\"total amount\"},\"require\":\"all\"}\n  3. {\"select\":{\"type\":\"node\",\"nodeType\":\"heading\"},\"require\":\"all\"}\n  4. {\"select\":{\"type\":\"text\",\"pattern\":\"contract\"},\"within\":{\"kind\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"abc123\"},\"require\":\"first\"}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "in": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
          },
          "select": {
            "description": "Search selector. Use {type:'text', pattern:'...'} for text search or {type:'node', nodeType:'paragraph'|'heading'|...} for node search.",
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "text",
                    "description": "Must be 'text' for text pattern search.",
                    "type": "string"
                  },
                  "pattern": {
                    "type": "string",
                    "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                  },
                  "mode": {
                    "enum": [
                      "contains",
                      "regex"
                    ],
                    "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                  },
                  "caseSensitive": {
                    "type": "boolean",
                    "description": "Case-sensitive matching. Default: false."
                  },
                  "wholeWord": {
                    "type": "boolean",
                    "description": "Require word-boundary matches. Default: false."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "type",
                  "pattern"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "node",
                    "description": "Must be 'node' for node type search.",
                    "type": "string"
                  },
                  "nodeType": {
                    "enum": [
                      "paragraph",
                      "heading",
                      "listItem",
                      "table",
                      "tableRow",
                      "tableCell",
                      "tableOfContents",
                      "image",
                      "sdt",
                      "run",
                      "bookmark",
                      "comment",
                      "hyperlink",
                      "footnoteRef",
                      "endnoteRef",
                      "crossRef",
                      "indexEntry",
                      "citation",
                      "authorityEntry",
                      "sequenceField",
                      "tab",
                      "lineBreak"
                    ],
                    "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                  },
                  "kind": {
                    "enum": [
                      "block",
                      "inline"
                    ],
                    "description": "Filter: 'block' or 'inline'."
                  }
                },
                "additionalProperties": false,
                "required": [
                  "type"
                ]
              }
            ]
          },
          "within": {
            "$ref": "#/$defs/BlockNodeAddress",
            "description": "Limit search scope to within a specific block: {kind:'block', nodeType:'...', nodeId:'...'}."
          },
          "require": {
            "enum": [
              "any",
              "first",
              "exactlyOne",
              "all"
            ],
            "description": "Match cardinality: 'any' (all matches), 'first' (only first), 'exactlyOne' (fail if != 1), 'all' (fail if 0)."
          },
          "mode": {
            "enum": [
              "strict",
              "candidates"
            ],
            "description": "Search mode: 'strict' (default, exact matching) or 'candidates' (returns scored potential matches)."
          },
          "includeNodes": {
            "type": "boolean",
            "description": "When true, includes full node data in results. Default: false."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "description": "Maximum number of matches to return."
          },
          "offset": {
            "type": "integer",
            "minimum": 0,
            "description": "Number of matches to skip for pagination."
          }
        },
        "required": [
          "select"
        ],
        "additionalProperties": false
      },
      "mutates": false,
      "operations": [
        {
          "operationId": "doc.query.match",
          "intentAction": "match",
          "required": [
            "select"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_mutations",
      "description": "All steps succeed or all fail; no partial application. Execute multiple operations atomically in one batch. Use this for any workflow needing 2+ changes. Supported step types: text (text.rewrite, text.insert, text.delete), format (format.apply), create (create.heading, create.paragraph, create.table), assert. Each step has an id, an op, a \"where\" clause for targeting ({by:\"select\", select:{...}, require:\"first\"|\"exactlyOne\"|\"all\"} or {by:\"ref\", ref:\"...\"} or {by:\"block\", nodeType:\"paragraph\", nodeId:\"...\"}), and \"args\" with operation-specific parameters. Use {by:\"block\", nodeType, nodeId} when you want to rewrite, delete, format, or anchor against a whole known block from superdoc_get_content action \"blocks\" without relying on text matching. For full-paragraph or full-clause rewrites, first call superdoc_get_content with action:\"blocks\" and includeText:true, then rewrite the matching block by nodeId. Use {by:\"select\"} only for substring edits, discovery, or insertion relative to a sentence fragment; do NOT use a shortened text selector to replace an entire known block. For create steps, \"where\" targets an existing anchor block and args.position (\"before\" or \"after\") controls placement. Sequential creates targeting the same anchor maintain correct order via internal position mapping. For format.apply with require \"all\", use a node selector to format every heading or paragraph at once: {by:\"select\", select:{type:\"node\", nodeType:\"heading\"}, require:\"all\"}. Selectors resolve at compile time (before execution). This means format.apply steps CANNOT target content created by earlier create steps in the same batch. Split creates and formatting into separate batches: first a mutations call with creates, then a mutations call with format.apply. Action \"preview\" dry-runs the plan. Action \"apply\" executes it. If a selector matches nothing, the failure reports the step id plus selector details so you can retry with a shorter or more distinctive anchor. Do NOT create two steps that target overlapping text in the same block; combine them into a single text.rewrite step.\n\nEXAMPLES:\n  1. {\"action\":\"apply\",\"atomic\":true,\"changeMode\":\"direct\",\"steps\":[{\"id\":\"s1\",\"op\":\"text.rewrite\",\"where\":{\"by\":\"select\",\"select\":{\"type\":\"text\",\"pattern\":\"old term\"},\"require\":\"all\"},\"args\":{\"replacement\":{\"text\":\"new term\"}}},{\"id\":\"s2\",\"op\":\"text.delete\",\"where\":{\"by\":\"select\",\"select\":{\"type\":\"text\",\"pattern\":\" (deprecated)\"},\"require\":\"all\"},\"args\":{}}]}\n  2. {\"action\":\"apply\",\"steps\":[{\"id\":\"r1\",\"op\":\"text.rewrite\",\"where\":{\"by\":\"block\",\"nodeType\":\"paragraph\",\"nodeId\":\"<nodeId>\"},\"args\":{\"replacement\":{\"text\":\"Updated clause text.\"}}},{\"id\":\"f1\",\"op\":\"format.apply\",\"where\":{\"by\":\"select\",\"select\":{\"type\":\"node\",\"nodeType\":\"heading\"},\"require\":\"all\"},\"args\":{\"inline\":{\"color\":\"#FF0000\"}}},{\"id\":\"f2\",\"op\":\"format.apply\",\"where\":{\"by\":\"select\",\"select\":{\"type\":\"text\",\"pattern\":\"Confidential Information\"},\"require\":\"all\"},\"args\":{\"inline\":{\"bold\":true}}}]}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "apply",
              "preview"
            ],
            "description": "The action to perform. One of: apply, preview."
          },
          "in": {
            "$ref": "#/$defs/StoryLocator",
            "description": "Story scope. Defaults to document body when omitted. Use {kind:'story', storyType:'body'} for body, or other storyType values for headers, footers, footnotes, endnotes."
          },
          "expectedRevision": {
            "type": "string",
            "description": "Document revision for optimistic concurrency. Mutation fails if document was modified since this revision. Only for action 'preview'. Omit for other actions."
          },
          "atomic": {
            "const": true,
            "type": "boolean",
            "description": "Must be true. All steps execute as one atomic transaction."
          },
          "changeMode": {
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Required. Use 'direct' for immediate edits or 'tracked' for suggestions. Must always be provided."
          },
          "steps": {
            "type": "array",
            "items": {
              "oneOf": [
                {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "op": {
                      "const": "text.rewrite",
                      "type": "string"
                    },
                    "where": {
                      "oneOf": [
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "select",
                              "type": "string"
                            },
                            "select": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "text",
                                      "description": "Must be 'text' for text pattern search.",
                                      "type": "string"
                                    },
                                    "pattern": {
                                      "type": "string",
                                      "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                                    },
                                    "mode": {
                                      "enum": [
                                        "contains",
                                        "regex"
                                      ],
                                      "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                                    },
                                    "caseSensitive": {
                                      "type": "boolean",
                                      "description": "Case-sensitive matching. Default: false."
                                    },
                                    "wholeWord": {
                                      "type": "boolean",
                                      "description": "Require word-boundary matches. Default: false."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type",
                                    "pattern"
                                  ]
                                },
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "node",
                                      "description": "Must be 'node' for node type search.",
                                      "type": "string"
                                    },
                                    "nodeType": {
                                      "enum": [
                                        "paragraph",
                                        "heading",
                                        "listItem",
                                        "table",
                                        "tableRow",
                                        "tableCell",
                                        "tableOfContents",
                                        "image",
                                        "sdt",
                                        "run",
                                        "bookmark",
                                        "comment",
                                        "hyperlink",
                                        "footnoteRef",
                                        "endnoteRef",
                                        "crossRef",
                                        "indexEntry",
                                        "citation",
                                        "authorityEntry",
                                        "sequenceField",
                                        "tab",
                                        "lineBreak"
                                      ],
                                      "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                                    },
                                    "kind": {
                                      "enum": [
                                        "block",
                                        "inline"
                                      ],
                                      "description": "Filter: 'block' or 'inline'."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type"
                                  ]
                                }
                              ]
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            },
                            "require": {
                              "enum": [
                                "first",
                                "exactlyOne",
                                "all"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "select",
                            "require"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "ref",
                              "type": "string"
                            },
                            "ref": {
                              "type": "string"
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "ref"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "target",
                              "type": "string"
                            },
                            "target": {
                              "$ref": "#/$defs/SelectionTarget"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "target"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "block",
                              "type": "string"
                            },
                            "nodeType": {
                              "enum": [
                                "paragraph",
                                "heading",
                                "listItem",
                                "table",
                                "tableRow",
                                "tableCell",
                                "tableOfContents",
                                "image",
                                "sdt"
                              ]
                            },
                            "nodeId": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "nodeType",
                            "nodeId"
                          ]
                        }
                      ]
                    },
                    "args": {
                      "type": "object",
                      "properties": {
                        "replacement": {
                          "oneOf": [
                            {
                              "type": "object",
                              "properties": {
                                "text": {
                                  "type": "string"
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "text"
                              ]
                            },
                            {
                              "type": "object",
                              "properties": {
                                "blocks": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "properties": {
                                      "text": {
                                        "type": "string"
                                      }
                                    },
                                    "additionalProperties": false,
                                    "required": [
                                      "text"
                                    ]
                                  }
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "blocks"
                              ]
                            }
                          ]
                        },
                        "style": {
                          "type": "object",
                          "properties": {
                            "inline": {
                              "type": "object",
                              "properties": {
                                "mode": {
                                  "enum": [
                                    "preserve",
                                    "set",
                                    "clear",
                                    "merge"
                                  ],
                                  "type": "string"
                                },
                                "requireUniform": {
                                  "type": "boolean"
                                },
                                "onNonUniform": {
                                  "enum": [
                                    "error",
                                    "useLeadingRun",
                                    "majority",
                                    "union"
                                  ]
                                },
                                "setMarks": {
                                  "type": "object",
                                  "properties": {
                                    "bold": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "italic": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "underline": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "strike": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    }
                                  },
                                  "additionalProperties": false
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "mode"
                              ]
                            },
                            "paragraph": {
                              "type": "object",
                              "properties": {
                                "mode": {
                                  "enum": [
                                    "preserve",
                                    "set",
                                    "clear"
                                  ],
                                  "type": "string"
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "mode"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "inline"
                          ]
                        }
                      },
                      "additionalProperties": false,
                      "required": [
                        "replacement"
                      ]
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "op",
                    "where",
                    "args"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "op": {
                      "const": "text.insert",
                      "type": "string"
                    },
                    "where": {
                      "oneOf": [
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "select",
                              "type": "string"
                            },
                            "select": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "text",
                                      "description": "Must be 'text' for text pattern search.",
                                      "type": "string"
                                    },
                                    "pattern": {
                                      "type": "string",
                                      "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                                    },
                                    "mode": {
                                      "enum": [
                                        "contains",
                                        "regex"
                                      ],
                                      "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                                    },
                                    "caseSensitive": {
                                      "type": "boolean",
                                      "description": "Case-sensitive matching. Default: false."
                                    },
                                    "wholeWord": {
                                      "type": "boolean",
                                      "description": "Require word-boundary matches. Default: false."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type",
                                    "pattern"
                                  ]
                                },
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "node",
                                      "description": "Must be 'node' for node type search.",
                                      "type": "string"
                                    },
                                    "nodeType": {
                                      "enum": [
                                        "paragraph",
                                        "heading",
                                        "listItem",
                                        "table",
                                        "tableRow",
                                        "tableCell",
                                        "tableOfContents",
                                        "image",
                                        "sdt",
                                        "run",
                                        "bookmark",
                                        "comment",
                                        "hyperlink",
                                        "footnoteRef",
                                        "endnoteRef",
                                        "crossRef",
                                        "indexEntry",
                                        "citation",
                                        "authorityEntry",
                                        "sequenceField",
                                        "tab",
                                        "lineBreak"
                                      ],
                                      "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                                    },
                                    "kind": {
                                      "enum": [
                                        "block",
                                        "inline"
                                      ],
                                      "description": "Filter: 'block' or 'inline'."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type"
                                  ]
                                }
                              ]
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            },
                            "require": {
                              "enum": [
                                "first",
                                "exactlyOne"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "select",
                            "require"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "ref",
                              "type": "string"
                            },
                            "ref": {
                              "type": "string"
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "ref"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "target",
                              "type": "string"
                            },
                            "target": {
                              "$ref": "#/$defs/SelectionTarget"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "target"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "block",
                              "type": "string"
                            },
                            "nodeType": {
                              "enum": [
                                "paragraph",
                                "heading",
                                "listItem",
                                "table",
                                "tableRow",
                                "tableCell",
                                "tableOfContents",
                                "image",
                                "sdt"
                              ]
                            },
                            "nodeId": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "nodeType",
                            "nodeId"
                          ]
                        }
                      ]
                    },
                    "args": {
                      "type": "object",
                      "properties": {
                        "position": {
                          "enum": [
                            "before",
                            "after"
                          ]
                        },
                        "content": {
                          "type": "object",
                          "properties": {
                            "text": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "text"
                          ]
                        },
                        "style": {
                          "type": "object",
                          "properties": {
                            "inline": {
                              "type": "object",
                              "properties": {
                                "mode": {
                                  "enum": [
                                    "inherit",
                                    "set",
                                    "clear"
                                  ],
                                  "type": "string"
                                },
                                "setMarks": {
                                  "type": "object",
                                  "properties": {
                                    "bold": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "italic": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "underline": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    },
                                    "strike": {
                                      "enum": [
                                        "on",
                                        "off",
                                        "clear"
                                      ]
                                    }
                                  },
                                  "additionalProperties": false
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "mode"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "inline"
                          ]
                        }
                      },
                      "additionalProperties": false,
                      "required": [
                        "position",
                        "content"
                      ]
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "op",
                    "where",
                    "args"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "op": {
                      "const": "text.delete",
                      "type": "string"
                    },
                    "where": {
                      "oneOf": [
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "select",
                              "type": "string"
                            },
                            "select": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "text",
                                      "description": "Must be 'text' for text pattern search.",
                                      "type": "string"
                                    },
                                    "pattern": {
                                      "type": "string",
                                      "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                                    },
                                    "mode": {
                                      "enum": [
                                        "contains",
                                        "regex"
                                      ],
                                      "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                                    },
                                    "caseSensitive": {
                                      "type": "boolean",
                                      "description": "Case-sensitive matching. Default: false."
                                    },
                                    "wholeWord": {
                                      "type": "boolean",
                                      "description": "Require word-boundary matches. Default: false."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type",
                                    "pattern"
                                  ]
                                },
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "node",
                                      "description": "Must be 'node' for node type search.",
                                      "type": "string"
                                    },
                                    "nodeType": {
                                      "enum": [
                                        "paragraph",
                                        "heading",
                                        "listItem",
                                        "table",
                                        "tableRow",
                                        "tableCell",
                                        "tableOfContents",
                                        "image",
                                        "sdt",
                                        "run",
                                        "bookmark",
                                        "comment",
                                        "hyperlink",
                                        "footnoteRef",
                                        "endnoteRef",
                                        "crossRef",
                                        "indexEntry",
                                        "citation",
                                        "authorityEntry",
                                        "sequenceField",
                                        "tab",
                                        "lineBreak"
                                      ],
                                      "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                                    },
                                    "kind": {
                                      "enum": [
                                        "block",
                                        "inline"
                                      ],
                                      "description": "Filter: 'block' or 'inline'."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type"
                                  ]
                                }
                              ]
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            },
                            "require": {
                              "enum": [
                                "first",
                                "exactlyOne",
                                "all"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "select",
                            "require"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "ref",
                              "type": "string"
                            },
                            "ref": {
                              "type": "string"
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "ref"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "target",
                              "type": "string"
                            },
                            "target": {
                              "$ref": "#/$defs/SelectionTarget"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "target"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "block",
                              "type": "string"
                            },
                            "nodeType": {
                              "enum": [
                                "paragraph",
                                "heading",
                                "listItem",
                                "table",
                                "tableRow",
                                "tableCell",
                                "tableOfContents",
                                "image",
                                "sdt"
                              ]
                            },
                            "nodeId": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "nodeType",
                            "nodeId"
                          ]
                        }
                      ]
                    },
                    "args": {
                      "type": "object",
                      "properties": {
                        "behavior": {
                          "$ref": "#/$defs/DeleteBehavior"
                        }
                      },
                      "additionalProperties": false
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "op",
                    "where",
                    "args"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "op": {
                      "const": "format.apply",
                      "type": "string"
                    },
                    "where": {
                      "oneOf": [
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "select",
                              "type": "string"
                            },
                            "select": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "text",
                                      "description": "Must be 'text' for text pattern search.",
                                      "type": "string"
                                    },
                                    "pattern": {
                                      "type": "string",
                                      "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                                    },
                                    "mode": {
                                      "enum": [
                                        "contains",
                                        "regex"
                                      ],
                                      "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                                    },
                                    "caseSensitive": {
                                      "type": "boolean",
                                      "description": "Case-sensitive matching. Default: false."
                                    },
                                    "wholeWord": {
                                      "type": "boolean",
                                      "description": "Require word-boundary matches. Default: false."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type",
                                    "pattern"
                                  ]
                                },
                                {
                                  "type": "object",
                                  "properties": {
                                    "type": {
                                      "const": "node",
                                      "description": "Must be 'node' for node type search.",
                                      "type": "string"
                                    },
                                    "nodeType": {
                                      "enum": [
                                        "paragraph",
                                        "heading",
                                        "listItem",
                                        "table",
                                        "tableRow",
                                        "tableCell",
                                        "tableOfContents",
                                        "image",
                                        "sdt",
                                        "run",
                                        "bookmark",
                                        "comment",
                                        "hyperlink",
                                        "footnoteRef",
                                        "endnoteRef",
                                        "crossRef",
                                        "indexEntry",
                                        "citation",
                                        "authorityEntry",
                                        "sequenceField",
                                        "tab",
                                        "lineBreak"
                                      ],
                                      "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                                    },
                                    "kind": {
                                      "enum": [
                                        "block",
                                        "inline"
                                      ],
                                      "description": "Filter: 'block' or 'inline'."
                                    }
                                  },
                                  "additionalProperties": false,
                                  "required": [
                                    "type"
                                  ]
                                }
                              ]
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            },
                            "require": {
                              "enum": [
                                "first",
                                "exactlyOne",
                                "all"
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "select",
                            "require"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "ref",
                              "type": "string"
                            },
                            "ref": {
                              "type": "string"
                            },
                            "within": {
                              "$ref": "#/$defs/BlockNodeAddress"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "ref"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "target",
                              "type": "string"
                            },
                            "target": {
                              "$ref": "#/$defs/SelectionTarget"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "target"
                          ]
                        },
                        {
                          "type": "object",
                          "properties": {
                            "by": {
                              "const": "block",
                              "type": "string"
                            },
                            "nodeType": {
                              "enum": [
                                "paragraph",
                                "heading",
                                "listItem",
                                "table",
                                "tableRow",
                                "tableCell",
                                "tableOfContents",
                                "image",
                                "sdt"
                              ]
                            },
                            "nodeId": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false,
                          "required": [
                            "by",
                            "nodeType",
                            "nodeId"
                          ]
                        }
                      ]
                    },
                    "args": {
                      "type": "object",
                      "properties": {
                        "inline": {
                          "type": "object",
                          "properties": {
                            "bold": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "italic": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "strike": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "underline": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                },
                                {
                                  "type": "object",
                                  "properties": {
                                    "style": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "color": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "themeColor": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                }
                              ]
                            },
                            "highlight": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "color": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "fontSize": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "fontFamily": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "letterSpacing": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "vertAlign": {
                              "oneOf": [
                                {
                                  "enum": [
                                    "superscript",
                                    "subscript",
                                    "baseline"
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "position": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "dstrike": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "smallCaps": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "caps": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "shading": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "fill": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "color": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "val": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "border": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "val": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "sz": {
                                      "oneOf": [
                                        {
                                          "type": "number"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "color": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "space": {
                                      "oneOf": [
                                        {
                                          "type": "number"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "outline": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "shadow": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "emboss": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "imprint": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "charScale": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "kerning": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "vanish": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "webHidden": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "specVanish": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "rtl": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "cs": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "bCs": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "iCs": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "eastAsianLayout": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "id": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "combine": {
                                      "oneOf": [
                                        {
                                          "type": "boolean"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "combineBrackets": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "vert": {
                                      "oneOf": [
                                        {
                                          "type": "boolean"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "vertCompress": {
                                      "oneOf": [
                                        {
                                          "type": "boolean"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "em": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "fitText": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "val": {
                                      "oneOf": [
                                        {
                                          "type": "number"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "id": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "snapToGrid": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "lang": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "val": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "eastAsia": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "bidi": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "oMath": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "rStyle": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "rFonts": {
                              "oneOf": [
                                {
                                  "type": "object",
                                  "properties": {
                                    "ascii": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "hAnsi": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "eastAsia": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "cs": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "asciiTheme": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "hAnsiTheme": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "eastAsiaTheme": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "csTheme": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    },
                                    "hint": {
                                      "oneOf": [
                                        {
                                          "type": "string",
                                          "minLength": 1
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "additionalProperties": false,
                                  "minProperties": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "fontSizeCs": {
                              "oneOf": [
                                {
                                  "type": "number"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "ligatures": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "numForm": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "numSpacing": {
                              "oneOf": [
                                {
                                  "type": "string",
                                  "minLength": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "stylisticSets": {
                              "oneOf": [
                                {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "properties": {
                                      "id": {
                                        "type": "number"
                                      },
                                      "val": {
                                        "type": "boolean"
                                      }
                                    },
                                    "required": [
                                      "id"
                                    ],
                                    "additionalProperties": false
                                  },
                                  "minItems": 1
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            },
                            "contextualAlternates": {
                              "oneOf": [
                                {
                                  "type": "boolean"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "additionalProperties": false,
                          "minProperties": 1
                        },
                        "alignment": {
                          "type": "string",
                          "enum": [
                            "left",
                            "center",
                            "right",
                            "justify"
                          ],
                          "description": "Set paragraph alignment on the target block(s). Can be combined with inline formatting in the same step."
                        },
                        "scope": {
                          "type": "string",
                          "enum": [
                            "match",
                            "block"
                          ],
                          "description": "When \"block\", inline formatting expands to cover the entire parent paragraph(s), not just the matched text. Use \"block\" after markdown inserts to format whole paragraphs with a short identifying pattern. Default: \"match\"."
                        }
                      },
                      "additionalProperties": false,
                      "minProperties": 1
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "op",
                    "where",
                    "args"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string"
                    },
                    "op": {
                      "const": "assert",
                      "type": "string"
                    },
                    "where": {
                      "type": "object",
                      "properties": {
                        "by": {
                          "const": "select",
                          "type": "string"
                        },
                        "select": {
                          "oneOf": [
                            {
                              "type": "object",
                              "properties": {
                                "type": {
                                  "const": "text",
                                  "description": "Must be 'text' for text pattern search.",
                                  "type": "string"
                                },
                                "pattern": {
                                  "type": "string",
                                  "description": "Text to match. In regex mode, patterns are validated for syntax, maximum length, and safety before execution."
                                },
                                "mode": {
                                  "enum": [
                                    "contains",
                                    "regex"
                                  ],
                                  "description": "Match mode: 'contains' (literal substring, recommended for literal text) or 'regex' (validated regular expression)."
                                },
                                "caseSensitive": {
                                  "type": "boolean",
                                  "description": "Case-sensitive matching. Default: false."
                                },
                                "wholeWord": {
                                  "type": "boolean",
                                  "description": "Require word-boundary matches. Default: false."
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "type",
                                "pattern"
                              ]
                            },
                            {
                              "type": "object",
                              "properties": {
                                "type": {
                                  "const": "node",
                                  "description": "Must be 'node' for node type search.",
                                  "type": "string"
                                },
                                "nodeType": {
                                  "enum": [
                                    "paragraph",
                                    "heading",
                                    "listItem",
                                    "table",
                                    "tableRow",
                                    "tableCell",
                                    "tableOfContents",
                                    "image",
                                    "sdt",
                                    "run",
                                    "bookmark",
                                    "comment",
                                    "hyperlink",
                                    "footnoteRef",
                                    "endnoteRef",
                                    "crossRef",
                                    "indexEntry",
                                    "citation",
                                    "authorityEntry",
                                    "sequenceField",
                                    "tab",
                                    "lineBreak"
                                  ],
                                  "description": "Block type to match (paragraph, heading, table, listItem, etc.)."
                                },
                                "kind": {
                                  "enum": [
                                    "block",
                                    "inline"
                                  ],
                                  "description": "Filter: 'block' or 'inline'."
                                }
                              },
                              "additionalProperties": false,
                              "required": [
                                "type"
                              ]
                            }
                          ]
                        },
                        "within": {
                          "$ref": "#/$defs/BlockNodeAddress"
                        }
                      },
                      "additionalProperties": false,
                      "required": [
                        "by",
                        "select"
                      ]
                    },
                    "args": {
                      "type": "object",
                      "properties": {
                        "expectCount": {
                          "type": "number"
                        }
                      },
                      "additionalProperties": false,
                      "required": [
                        "expectCount"
                      ]
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "op",
                    "where",
                    "args"
                  ]
                }
              ]
            },
            "description": "Ordered array of mutation steps. Each step needs 'op' (text.rewrite, text.insert, text.delete, format.apply, or assert) and a 'where' targeting clause."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks. Only for action 'apply'. Omit for other actions."
          }
        },
        "required": [
          "action",
          "atomic",
          "changeMode",
          "steps"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.mutations.preview",
          "intentAction": "preview",
          "required": [
            "atomic",
            "changeMode",
            "steps"
          ]
        },
        {
          "operationId": "doc.mutations.apply",
          "intentAction": "apply",
          "required": [
            "atomic",
            "steps",
            "changeMode"
          ]
        }
      ]
    },
    {
      "toolName": "superdoc_table",
      "description": "Create and modify table structure, content, and styling. Find table/row/cell nodeIds via superdoc_get_content({action:\"blocks\"}) or superdoc_search.\n\nACTIONS:\n• Structure: delete, insert_row, delete_row, insert_column, delete_column, merge_cells, unmerge_cells.\n• Cell content: set_cell_text (text). set_cell (vAlign / wrap / fit / preferred width).\n• Row / column: set_row (height + rule), set_row_options (repeat-header, allow-break), set_column (widthPt).\n• Table styling: set_borders, set_shading, set_style_options (headerRow / bandedRows / firstColumn / lastColumn / lastRow / bandedColumns), set_layout (autofit / alignment / direction / preferredWidth), set_options (default cell margins + cell spacing).\n\nLOCATORS (the shapes ops accept):\n• insert_row append shorthand: { nodeId: \"<tableId>\" } with no rowIndex/position appends at the end. Three other forms: target a row + position, table + rowIndex + position, or any of the above with count:N for multiple.\n• insert_column shorthand: position:\"first\"|\"last\" with no columnIndex. Otherwise columnIndex + position:\"left\"|\"right\".\n• merge_cells: table target + start:{rowIndex, columnIndex} + end:{rowIndex, columnIndex}.\n• set_cell_text: table target + rowIndex + columnIndex (preferred) OR cell target.\n• set_cell: cell target only. Does NOT accept table+rowIndex+columnIndex.\n• set_borders / set_shading: table OR cell target. NOT a row target.\n\nCOLOR FORMAT:\nHex strings accept #RRGGBB, RRGGBB, #RGB, or 3-digit RGB; also \"auto\"; also null to clear (where supported). Stored canonically as uppercase RRGGBB. Always pass a concrete color when one is implied. Never call set_borders with `auto` for a \"make it look [X]\" ask.\n\nSTYLING (TWO MODES):\n\nA. STRUCTURAL CHANGE → re-apply the existing styling.\n   Triggers: insert_row / insert_column / delete_row / delete_column / merge_cells / unmerge_cells. (NOT set_cell_text or set_cell: those don't disturb borders/shading.)\n   Recipe: read the current borders/shading/cnf flags via superdoc_get_content({action:\"blocks\"}) before the change, then re-apply the SAME values after with set_borders + set_shading + set_style_options. The goal is consistency, not a redesign.\n   Skip on a freshly created table. A new table starts un-styled.\n\nB. STYLE-CHANGE REQUEST (\"make it look [X]\" / \"style the whole table\") → apply the FULL set with concrete colors.\n   Touch every axis: borders, shading, text alignment, font color/weight, cnf flags, spacing. A single set_borders call without shading and font tweaks always looks half-finished. That's the #1 cause of \"no visual change\" complaints.\n   Color palette: discover the document's palette by reading superdoc_get_content({action:\"blocks\"}) and reusing the colors on existing tables/headings. When no palette is obvious, default to corporate blue \"1F3864\" or dark grey \"444444\" for accents and \"F2F2F2\" / \"E7E6E6\" for banding.\n   Recipe (call ALL of these):\n     1. set_borders applyTo:\"all\" with an explicit color and weight.\n     2. set_shading on the header row cells with the accent color. Add banding on alternate body rows if appropriate.\n     3. set_style_options { headerRow: true, bandedRows?: true } so cnf regions are recognized.\n     4. Cell-text alignment via superdoc_format action:\"set_alignment\". Center the header, left-align body, right-align numeric columns. Paragraph-level: target the paragraph inside each cell.\n     5. Font color + weight via superdoc_format action:\"inline\". Header gets a contrasting color (white on dark fill, accent on light fill) plus bold:true.\n     6. set_options if the user asks for tighter or looser spacing.\n   Steps 4–5 cross to superdoc_format. Use superdoc_mutations to batch many format.apply steps in one call.\n\nAFTER set_cell_text, match the new cell to its siblings:\nset_cell_text writes plain text with the document's default font/size/color and no weight. Always follow up with one superdoc_format inline call copying fontFamily/fontSize/color/bold from a sibling cell (or any non-empty body paragraph if the table is fresh and has no sibling content). If sibling cells show a bold-prefix pattern like \"Label: value\", replicate it on the new cell via superdoc_search + superdoc_format inline (or one superdoc_mutations batch with format.apply steps).\n\nLIST-TO-TABLE:\n(1) superdoc_create action:\"table\" with the desired rows/columns. (2) Populate cells with set_cell_text using rowIndex/columnIndex (one call per cell). (3) DELETE THE WHOLE LIST in one call: superdoc_list({action:\"delete\", target:{kind:\"block\", nodeType:\"listItem\", nodeId:\"<any-item-id>\"}}). The op walks the contiguous list and removes all items.\nWrong paths for list deletion (all leave bullets/empty paragraphs behind): text.delete, superdoc_edit action:\"delete\" on text refs, lists.detach, lists.convertToText.\n\nEXAMPLES:\n  1. {\"action\":\"insert_row\",\"nodeId\":\"<tableNodeId>\"}\n  2. {\"action\":\"insert_column\",\"nodeId\":\"<tableNodeId>\",\"position\":\"last\"}\n  3. {\"action\":\"merge_cells\",\"nodeId\":\"<tableNodeId>\",\"start\":{\"rowIndex\":0,\"columnIndex\":0},\"end\":{\"rowIndex\":1,\"columnIndex\":1}}\n  4. {\"action\":\"set_cell_text\",\"nodeId\":\"<tableNodeId>\",\"rowIndex\":0,\"columnIndex\":0,\"text\":\"Q1 Revenue\"}\n  5. {\"action\":\"set_row\",\"nodeId\":\"<tableNodeId>\",\"rowIndex\":0,\"heightPt\":24,\"rule\":\"atLeast\"}\n  6. {\"action\":\"set_borders\",\"nodeId\":\"<tableNodeId>\",\"mode\":\"applyTo\",\"applyTo\":\"all\",\"border\":{\"lineStyle\":\"single\",\"lineWeightPt\":1,\"color\":\"#000000\"}}\n  7. {\"action\":\"set_shading\",\"target\":{\"kind\":\"block\",\"nodeType\":\"tableCell\",\"nodeId\":\"<cellNodeId>\"},\"color\":\"#E3F2FD\"}\n  8. {\"action\":\"set_style_options\",\"nodeId\":\"<tableNodeId>\",\"styleOptions\":{\"headerRow\":true,\"bandedRows\":true}}",
      "inputSchema": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "delete",
              "delete_column",
              "delete_row",
              "insert_column",
              "insert_row",
              "merge_cells",
              "move_row",
              "set_borders",
              "set_cell",
              "set_cell_text",
              "set_column",
              "set_layout",
              "set_options",
              "set_row",
              "set_row_options",
              "set_shading",
              "set_style_options",
              "unmerge_cells"
            ],
            "description": "The action to perform. One of: delete, delete_column, delete_row, insert_column, insert_row, merge_cells, move_row, set_borders, set_cell, set_cell_text, set_column, set_layout, set_options, set_row, set_row_options, set_shading, set_style_options, unmerge_cells."
          },
          "force": {
            "type": "boolean",
            "description": "Bypass confirmation checks."
          },
          "changeMode": {
            "type": "string",
            "enum": [
              "direct",
              "tracked"
            ],
            "description": "Edit mode: \"direct\" applies changes immediately, \"tracked\" records as suggestions."
          },
          "dryRun": {
            "type": "boolean",
            "description": "Preview the result without applying changes."
          },
          "target": {
            "oneOf": [
              {
                "oneOf": [
                  {
                    "oneOf": [
                      {
                        "oneOf": [
                          {
                            "oneOf": [
                              {
                                "oneOf": [
                                  {
                                    "oneOf": [
                                      {
                                        "oneOf": [
                                          {
                                            "oneOf": [
                                              {
                                                "oneOf": [
                                                  {
                                                    "oneOf": [
                                                      {
                                                        "oneOf": [
                                                          {
                                                            "oneOf": [
                                                              {
                                                                "oneOf": [
                                                                  {
                                                                    "oneOf": [
                                                                      {
                                                                        "oneOf": [
                                                                          {
                                                                            "$ref": "#/$defs/TableAddress"
                                                                          },
                                                                          {
                                                                            "oneOf": [
                                                                              {
                                                                                "oneOf": [
                                                                                  {
                                                                                    "$ref": "#/$defs/TableRowAddress"
                                                                                  },
                                                                                  {
                                                                                    "$ref": "#/$defs/TableAddress"
                                                                                  }
                                                                                ]
                                                                              },
                                                                              {
                                                                                "$ref": "#/$defs/TableAddress"
                                                                              }
                                                                            ]
                                                                          }
                                                                        ]
                                                                      },
                                                                      {
                                                                        "oneOf": [
                                                                          {
                                                                            "$ref": "#/$defs/TableRowAddress"
                                                                          },
                                                                          {
                                                                            "$ref": "#/$defs/TableAddress"
                                                                          }
                                                                        ]
                                                                      }
                                                                    ]
                                                                  },
                                                                  {
                                                                    "oneOf": [
                                                                      {
                                                                        "$ref": "#/$defs/TableRowAddress"
                                                                      },
                                                                      {
                                                                        "$ref": "#/$defs/TableAddress"
                                                                      }
                                                                    ]
                                                                  }
                                                                ]
                                                              },
                                                              {
                                                                "oneOf": [
                                                                  {
                                                                    "$ref": "#/$defs/TableRowAddress"
                                                                  },
                                                                  {
                                                                    "$ref": "#/$defs/TableAddress"
                                                                  }
                                                                ]
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "oneOf": [
                                                              {
                                                                "$ref": "#/$defs/TableRowAddress"
                                                              },
                                                              {
                                                                "$ref": "#/$defs/TableAddress"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "$ref": "#/$defs/TableAddress"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "$ref": "#/$defs/TableAddress"
                                                  }
                                                ]
                                              },
                                              {
                                                "$ref": "#/$defs/TableAddress"
                                              }
                                            ]
                                          },
                                          {
                                            "$ref": "#/$defs/TableAddress"
                                          }
                                        ]
                                      },
                                      {
                                        "oneOf": [
                                          {
                                            "$ref": "#/$defs/TableCellAddress"
                                          },
                                          {
                                            "$ref": "#/$defs/TableAddress"
                                          }
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "$ref": "#/$defs/TableCellAddress"
                                  }
                                ]
                              },
                              {
                                "oneOf": [
                                  {
                                    "$ref": "#/$defs/TableCellAddress"
                                  },
                                  {
                                    "$ref": "#/$defs/TableAddress"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "$ref": "#/$defs/TableOrCellAddress"
                          }
                        ]
                      },
                      {
                        "$ref": "#/$defs/BlockNodeAddress"
                      }
                    ]
                  },
                  {
                    "$ref": "#/$defs/BlockNodeAddress"
                  }
                ]
              },
              {
                "$ref": "#/$defs/BlockNodeAddress"
              }
            ],
            "description": "Target address. For inline/set_style: prefer 'ref' from superdoc_search, or use {kind:'selection', start:{kind:'text', blockId, offset}, end:{kind:'text', blockId, offset}}. For paragraph actions (set_alignment, set_indentation, set_spacing, set_direction, set_flow_options): use {kind:'block', nodeType:'paragraph'|'heading'|'listItem', nodeId:'<nodeId from blocks list>'}."
          },
          "nodeId": {
            "type": "string"
          },
          "preferredWidth": {
            "type": "number",
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "preferredWidthType": {
            "enum": [
              "dxa",
              "auto",
              "pct"
            ],
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "alignment": {
            "enum": [
              "left",
              "center",
              "right"
            ],
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "leftIndentPt": {
            "type": "number",
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "autoFitMode": {
            "enum": [
              "fixedWidth",
              "fitContents",
              "fitWindow"
            ],
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "tableDirection": {
            "enum": [
              "ltr",
              "rtl"
            ],
            "description": "Only for action 'set_layout'. Omit for other actions."
          },
          "position": {
            "enum": [
              "above",
              "below",
              "left",
              "right",
              "first",
              "last"
            ],
            "description": "Required for action 'insert_column'."
          },
          "count": {
            "type": "integer",
            "minimum": 1,
            "description": "Only for actions 'insert_row', 'insert_column'. Omit for other actions."
          },
          "rowIndex": {
            "type": "integer",
            "minimum": 0,
            "description": "Only for actions 'insert_row', 'delete_row', 'move_row', 'set_row', 'set_row_options', 'unmerge_cells', 'set_cell_text'. Omit for other actions."
          },
          "destination": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "first",
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "last",
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "before",
                    "type": "string"
                  },
                  "rowIndex": {
                    "type": "integer",
                    "minimum": 0
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "rowIndex"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "after",
                    "type": "string"
                  },
                  "rowIndex": {
                    "type": "integer",
                    "minimum": 0
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "rowIndex"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "before",
                    "type": "string"
                  },
                  "target": {
                    "$ref": "#/$defs/TableRowAddress"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "target"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "after",
                    "type": "string"
                  },
                  "target": {
                    "$ref": "#/$defs/TableRowAddress"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "target"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "before",
                    "type": "string"
                  },
                  "nodeId": {
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "nodeId"
                ]
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "after",
                    "type": "string"
                  },
                  "nodeId": {
                    "type": "string"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "kind",
                  "nodeId"
                ]
              }
            ],
            "description": "Required for action 'move_row'."
          },
          "heightPt": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Required for action 'set_row'."
          },
          "rule": {
            "enum": [
              "atLeast",
              "exact",
              "auto"
            ],
            "description": "Only for action 'set_row'. Omit for other actions."
          },
          "allowBreakAcrossPages": {
            "type": "boolean",
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "repeatHeader": {
            "type": "boolean",
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "gridBefore": {
            "type": "integer",
            "minimum": 0,
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "gridAfter": {
            "type": "integer",
            "minimum": 0,
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "wBefore": {
            "type": "object",
            "properties": {
              "value": {
                "type": "integer",
                "minimum": 0
              },
              "type": {
                "enum": [
                  "auto",
                  "dxa",
                  "nil",
                  "pct"
                ]
              }
            },
            "additionalProperties": false,
            "required": [
              "value",
              "type"
            ],
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "wAfter": {
            "type": "object",
            "properties": {
              "value": {
                "type": "integer",
                "minimum": 0
              },
              "type": {
                "enum": [
                  "auto",
                  "dxa",
                  "nil",
                  "pct"
                ]
              }
            },
            "additionalProperties": false,
            "required": [
              "value",
              "type"
            ],
            "description": "Only for action 'set_row_options'. Omit for other actions."
          },
          "columnIndex": {
            "type": "integer",
            "minimum": 0,
            "description": "Required for actions 'delete_column', 'set_column'."
          },
          "widthPt": {
            "type": "number",
            "exclusiveMinimum": 0,
            "description": "Required for action 'set_column'."
          },
          "start": {
            "type": "object",
            "properties": {
              "rowIndex": {
                "type": "integer",
                "minimum": 0
              },
              "columnIndex": {
                "type": "integer",
                "minimum": 0
              }
            },
            "additionalProperties": false,
            "required": [
              "rowIndex",
              "columnIndex"
            ],
            "description": "Required for action 'merge_cells'."
          },
          "end": {
            "type": "object",
            "properties": {
              "rowIndex": {
                "type": "integer",
                "minimum": 0
              },
              "columnIndex": {
                "type": "integer",
                "minimum": 0
              }
            },
            "additionalProperties": false,
            "required": [
              "rowIndex",
              "columnIndex"
            ],
            "description": "Required for action 'merge_cells'."
          },
          "preferredWidthPt": {
            "type": "number",
            "description": "Only for action 'set_cell'. Omit for other actions."
          },
          "verticalAlign": {
            "enum": [
              "top",
              "center",
              "bottom"
            ],
            "description": "Only for action 'set_cell'. Omit for other actions."
          },
          "wrapText": {
            "type": "boolean",
            "description": "Only for action 'set_cell'. Omit for other actions."
          },
          "fitText": {
            "type": "boolean",
            "description": "Only for action 'set_cell'. Omit for other actions."
          },
          "text": {
            "type": "string",
            "description": "Required for action 'set_cell_text'."
          },
          "color": {
            "oneOf": [
              {
                "type": "string",
                "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
              },
              {
                "type": "null"
              }
            ],
            "description": "Required for action 'set_shading'."
          },
          "styleId": {
            "type": "string",
            "description": "Only for action 'set_style_options'. Omit for other actions."
          },
          "styleOptions": {
            "type": "object",
            "properties": {
              "headerRow": {
                "type": "boolean"
              },
              "lastRow": {
                "type": "boolean"
              },
              "totalRow": {
                "type": "boolean"
              },
              "firstColumn": {
                "type": "boolean"
              },
              "lastColumn": {
                "type": "boolean"
              },
              "bandedRows": {
                "type": "boolean"
              },
              "bandedColumns": {
                "type": "boolean"
              }
            },
            "additionalProperties": false,
            "description": "Only for action 'set_style_options'. Omit for other actions."
          },
          "mode": {
            "enum": [
              "applyTo",
              "edges"
            ],
            "description": "Required for action 'set_borders'."
          },
          "applyTo": {
            "enum": [
              "all",
              "outside",
              "inside",
              "top",
              "bottom",
              "left",
              "right",
              "insideH",
              "insideV"
            ],
            "description": "Only for action 'set_borders'. Omit for other actions."
          },
          "border": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "lineStyle": {
                    "type": "string"
                  },
                  "lineWeightPt": {
                    "type": "number",
                    "exclusiveMinimum": 0
                  },
                  "color": {
                    "type": "string",
                    "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                  }
                },
                "additionalProperties": false,
                "required": [
                  "lineStyle",
                  "lineWeightPt",
                  "color"
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "Only for action 'set_borders'. Omit for other actions."
          },
          "edges": {
            "type": "object",
            "properties": {
              "top": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "bottom": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "left": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "right": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "insideH": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "insideV": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "lineStyle": {
                        "type": "string"
                      },
                      "lineWeightPt": {
                        "type": "number",
                        "exclusiveMinimum": 0
                      },
                      "color": {
                        "type": "string",
                        "pattern": "^(#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})|auto)$"
                      }
                    },
                    "additionalProperties": false,
                    "required": [
                      "lineStyle",
                      "lineWeightPt",
                      "color"
                    ]
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "additionalProperties": false,
            "description": "Only for action 'set_borders'. Omit for other actions."
          },
          "defaultCellMargins": {
            "type": "object",
            "properties": {
              "topPt": {
                "type": "number",
                "minimum": 0
              },
              "rightPt": {
                "type": "number",
                "minimum": 0
              },
              "bottomPt": {
                "type": "number",
                "minimum": 0
              },
              "leftPt": {
                "type": "number",
                "minimum": 0
              }
            },
            "additionalProperties": false,
            "required": [
              "topPt",
              "rightPt",
              "bottomPt",
              "leftPt"
            ],
            "description": "Only for action 'set_options'. Omit for other actions."
          },
          "cellSpacingPt": {
            "oneOf": [
              {
                "type": "number",
                "minimum": 0
              },
              {
                "type": "null"
              }
            ],
            "description": "Only for action 'set_options'. Omit for other actions."
          }
        },
        "required": [
          "action"
        ],
        "additionalProperties": false
      },
      "mutates": true,
      "operations": [
        {
          "operationId": "doc.tables.delete",
          "intentAction": "delete",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setLayout",
          "intentAction": "set_layout",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.insertRow",
          "intentAction": "insert_row",
          "requiredOneOf": [
            [
              "target",
              "position"
            ],
            [
              "target",
              "rowIndex",
              "position"
            ],
            [
              "nodeId",
              "rowIndex",
              "position"
            ],
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.deleteRow",
          "intentAction": "delete_row",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "target",
              "rowIndex"
            ],
            [
              "nodeId",
              "rowIndex"
            ]
          ]
        },
        {
          "operationId": "doc.tables.moveRow",
          "intentAction": "move_row",
          "requiredOneOf": [
            [
              "target",
              "destination"
            ],
            [
              "target",
              "rowIndex",
              "destination"
            ],
            [
              "nodeId",
              "rowIndex",
              "destination"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setRowHeight",
          "intentAction": "set_row",
          "requiredOneOf": [
            [
              "target",
              "heightPt"
            ],
            [
              "target",
              "rowIndex",
              "heightPt"
            ],
            [
              "nodeId",
              "rowIndex",
              "heightPt"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setRowOptions",
          "intentAction": "set_row_options",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "target",
              "rowIndex"
            ],
            [
              "nodeId",
              "rowIndex"
            ]
          ]
        },
        {
          "operationId": "doc.tables.insertColumn",
          "intentAction": "insert_column",
          "requiredOneOf": [
            [
              "position",
              "target"
            ],
            [
              "position",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.deleteColumn",
          "intentAction": "delete_column",
          "requiredOneOf": [
            [
              "columnIndex",
              "target"
            ],
            [
              "columnIndex",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setColumnWidth",
          "intentAction": "set_column",
          "requiredOneOf": [
            [
              "columnIndex",
              "widthPt",
              "target"
            ],
            [
              "columnIndex",
              "widthPt",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.mergeCells",
          "intentAction": "merge_cells",
          "requiredOneOf": [
            [
              "start",
              "end",
              "target"
            ],
            [
              "start",
              "end",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.unmergeCells",
          "intentAction": "unmerge_cells",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ],
            [
              "target",
              "rowIndex",
              "columnIndex"
            ],
            [
              "nodeId",
              "rowIndex",
              "columnIndex"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setCellProperties",
          "intentAction": "set_cell",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setCellText",
          "intentAction": "set_cell_text",
          "requiredOneOf": [
            [
              "target",
              "text"
            ],
            [
              "nodeId",
              "text"
            ],
            [
              "target",
              "rowIndex",
              "columnIndex",
              "text"
            ],
            [
              "nodeId",
              "rowIndex",
              "columnIndex",
              "text"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setShading",
          "intentAction": "set_shading",
          "requiredOneOf": [
            [
              "color",
              "target"
            ],
            [
              "color",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.applyStyle",
          "intentAction": "set_style_options",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setBorders",
          "intentAction": "set_borders",
          "requiredOneOf": [
            [
              "mode",
              "applyTo",
              "border",
              "target"
            ],
            [
              "mode",
              "applyTo",
              "border",
              "nodeId"
            ],
            [
              "mode",
              "edges",
              "target"
            ],
            [
              "mode",
              "edges",
              "nodeId"
            ]
          ]
        },
        {
          "operationId": "doc.tables.setTableOptions",
          "intentAction": "set_options",
          "requiredOneOf": [
            [
              "target"
            ],
            [
              "nodeId"
            ]
          ]
        }
      ]
    }
  ]
} as const;
