/**
 * Canonical CLI-only operation definitions — single source of truth.
 *
 * This module consolidates metadata for the CLI-only operations that
 * are not backed by document-api. All downstream consumers project the
 * views they need from this canonical object:
 *
 *   - operation-set.ts      → category, description, tokens, requiresDoc
 *   - export-sdk-contract.ts → sdkMetadata, outputSchema
 *   - response-schemas.ts   → CLI-only response schema entries
 */

import type { CliCategory, CliOnlyOperation } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliOnlySdkMetadata {
  mutates: boolean;
  idempotency: 'idempotent' | 'non-idempotent' | 'conditional';
  supportsTrackedMode: boolean;
  supportsDryRun: boolean;
}

export interface CliOnlyOperationDefinition {
  category: CliCategory;
  description: string;
  requiresDocumentContext: boolean;
  tokenOverride?: readonly string[];
  sdkMetadata: CliOnlySdkMetadata;
  outputSchema: Record<string, unknown>;
  /** When true, this operation is excluded from generated LLM tool catalogs. */
  skipAsATool?: boolean;
}

// ---------------------------------------------------------------------------
// Canonical definitions
// ---------------------------------------------------------------------------

export const CLI_ONLY_OPERATION_DEFINITIONS: Record<CliOnlyOperation, CliOnlyOperationDefinition> = {
  open: {
    category: 'session',
    description:
      'Open a document and create a persistent editing session. Collaboration supports the `y-websocket`, `hocuspocus`, and `liveblocks` providers. Optionally override the document body with contentOverride + overrideType (markdown, html, or text).',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        contextId: { type: 'string' },
        runtime: { type: 'string', enum: ['v1'] },
        sessionType: { type: 'string' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            byteLength: { type: 'number' },
            revision: { type: 'number' },
          },
        },
        dirty: { type: 'boolean' },
        collaboration: {
          type: 'object',
          description: 'Collaboration summary (auth config redacted).',
          properties: {
            providerType: { type: 'string', enum: ['y-websocket', 'hocuspocus', 'liveblocks'] },
            documentId: { type: 'string' },
            url: { type: 'string', description: 'WebSocket URL (websocket providers only).' },
          },
          required: ['providerType', 'documentId'],
        },
        bootstrap: {
          type: 'object',
          properties: {
            roomState: { type: 'string' },
            bootstrapApplied: { type: 'boolean' },
            bootstrapSource: { type: 'string' },
          },
        },
        openedAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      required: ['active', 'contextId', 'sessionType'],
    },
  },
  save: {
    category: 'session',
    description:
      'Save the current session to the original file or a new path. Supports explicit review-preserving, final, and original export modes.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string' },
        runtime: { type: 'string', enum: ['v1'] },
        saved: { type: 'boolean' },
        inPlace: { type: 'boolean' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            revision: { type: 'number' },
          },
        },
        context: {
          type: 'object',
          properties: {
            dirty: { type: 'boolean' },
            revision: { type: 'number' },
            lastSavedAt: { type: 'string' },
          },
        },
        output: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            byteLength: { type: 'number' },
          },
        },
        mode: { type: 'string', enum: ['review-preserving', 'final', 'original'] },
        report: {
          type: 'object',
          properties: {
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
                required: ['code'],
              },
            },
          },
        },
      },
      required: ['contextId', 'saved'],
    },
  },
  close: {
    category: 'session',
    description: 'Close the active editing session and clean up resources.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string' },
        runtime: { type: 'string', enum: ['v1'] },
        closed: { type: 'boolean' },
        saved: { type: 'boolean' },
        discarded: { type: 'boolean' },
        defaultSessionCleared: { type: 'boolean' },
        wasDirty: { type: 'boolean' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            revision: { type: 'number' },
          },
        },
      },
      required: ['contextId', 'closed'],
    },
  },
  insertTab: {
    category: 'core',
    description:
      'Insert a real Word tab node at a collapsed text insertion point. Accepts the same target/ref shortcuts as insert, but only for point inserts.',
    requiresDocumentContext: false,
    tokenOverride: ['insert', 'tab'],
    sdkMetadata: { mutates: true, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        document: { type: 'object' },
        receipt: { type: 'object' },
        inserted: { type: 'object' },
        context: { type: 'object' },
        output: { type: 'object' },
      },
      required: ['receipt', 'inserted'],
    },
  },
  insertLineBreak: {
    category: 'core',
    description:
      'Insert a real Word line-break node at a collapsed text insertion point. Accepts the same target/ref shortcuts as insert, but only for point inserts.',
    requiresDocumentContext: false,
    tokenOverride: ['insert', 'line-break'],
    sdkMetadata: { mutates: true, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        document: { type: 'object' },
        receipt: { type: 'object' },
        inserted: { type: 'object' },
        context: { type: 'object' },
        output: { type: 'object' },
      },
      required: ['receipt', 'inserted'],
    },
  },
  executeCode: {
    category: 'core',
    description:
      'Run model-authored JavaScript IN-HOST against the live, SYNCHRONOUS Document API for the open session. Two globals are injected: `doc` (the synchronous Document API — do NOT await doc.* calls) and `console`. `return` a short summary; logs and the return value come back structured as { ok, result, logs, error }. Use for complex/multi-step workflows (loops, per-item branching, extract-then-generate) in ONE call instead of chaining many narrow tools. Large code can be passed on stdin.',
    requiresDocumentContext: false,
    tokenOverride: ['execute', 'code'],
    sdkMetadata: { mutates: true, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        result: {},
        logs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              level: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
        error: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            message: { type: 'string' },
            stack: { type: 'string' },
          },
        },
        context: {
          type: 'object',
          properties: {
            dirty: { type: 'boolean' },
            revision: { type: 'number' },
            mutated: { type: 'boolean' },
          },
        },
      },
      required: ['ok', 'logs'],
    },
  },
  status: {
    category: 'session',
    description: 'Show the current session status and document metadata.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        contextId: { type: 'string' },
        runtime: { type: 'string', enum: ['v1'] },
        activeSessionId: { type: 'string' },
        requestedSessionId: { type: 'string' },
        projectRoot: { type: 'string' },
        sessionType: { type: 'string' },
        dirty: { type: 'boolean' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            sourceByteLength: { oneOf: [{ type: 'number' }, { type: 'null' }] },
            byteLength: { type: 'number' },
            revision: { type: 'number' },
          },
        },
        collaboration: {
          type: 'object',
          description: 'Collaboration summary (auth config redacted).',
          properties: {
            providerType: { type: 'string', enum: ['y-websocket', 'hocuspocus', 'liveblocks'] },
            documentId: { type: 'string' },
            url: { type: 'string', description: 'WebSocket URL (websocket providers only).' },
          },
          required: ['providerType', 'documentId'],
        },
        openedAt: { type: 'string' },
        updatedAt: { type: 'string' },
        lastSavedAt: { type: 'string' },
      },
      required: ['active'],
    },
  },
  describe: {
    category: 'session',
    description: 'List all available CLI operations and contract metadata.',
    requiresDocumentContext: false,
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        contractVersion: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              operationId: { type: 'string' },
              command: { type: 'string' },
              category: { type: 'string' },
              description: { type: 'string' },
              mutates: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  describeCommand: {
    category: 'session',
    description: 'Show detailed metadata for a single CLI operation.',
    requiresDocumentContext: false,
    tokenOverride: ['describe', 'command'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
        command: { type: 'string' },
        category: { type: 'string' },
        description: { type: 'string' },
        mutates: { type: 'boolean' },
        params: { type: 'array' },
        constraints: {},
      },
    },
  },
  'session.list': {
    category: 'session',
    description: 'List all active editing sessions.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        activeSessionId: { type: 'string' },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              sessionType: { type: 'string' },
              runtime: { type: 'string', enum: ['v1'] },
              dirty: { type: 'boolean' },
              revision: { type: 'number' },
              collaboration: {
                type: 'object',
                description: 'Collaboration summary (auth config redacted).',
                properties: {
                  providerType: { type: 'string', enum: ['y-websocket', 'hocuspocus', 'liveblocks'] },
                  documentId: { type: 'string' },
                  url: { type: 'string', description: 'WebSocket URL (websocket providers only).' },
                },
                required: ['providerType', 'documentId'],
              },
            },
          },
        },
        total: { type: 'number' },
      },
    },
  },
  'session.save': {
    category: 'session',
    description: 'Persist the current session state.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        contextId: { type: 'string' },
        saved: { type: 'boolean' },
        inPlace: { type: 'boolean' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            revision: { type: 'number' },
          },
        },
        output: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            byteLength: { type: 'number' },
          },
        },
      },
      required: ['sessionId'],
    },
  },
  'session.close': {
    category: 'session',
    description: 'Close a specific editing session by ID.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        contextId: { type: 'string' },
        closed: { type: 'boolean' },
        saved: { type: 'boolean' },
        discarded: { type: 'boolean' },
        defaultSessionCleared: { type: 'boolean' },
        wasDirty: { type: 'boolean' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            revision: { type: 'number' },
          },
        },
      },
      required: ['sessionId'],
    },
  },
  'session.setDefault': {
    category: 'session',
    description: 'Set the default session for subsequent commands.',
    requiresDocumentContext: false,
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        activeSessionId: { type: 'string' },
      },
      required: ['activeSessionId'],
    },
  },
  'preset.list': {
    category: 'session',
    description:
      'List the LLM-tools preset ids registered in the Node SDK preset registry, plus the default preset id.',
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'list'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        presets: { type: 'array', items: { type: 'string' } },
        defaultPreset: { type: 'string' },
      },
      required: ['presets', 'defaultPreset'],
    },
  },
  'preset.getCatalog': {
    category: 'session',
    description: 'Return the full tool catalog for an LLM-tools preset (defaults to the registered default preset).',
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'get-catalog'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: { type: 'object' },
  },
  'preset.getTools': {
    category: 'session',
    description:
      'Return the provider-shaped tool array (openai|anthropic|vercel|generic) for an LLM-tools preset, plus the active cache strategy.',
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'get-tools'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        tools: { type: 'array' },
        cacheStrategy: { type: 'string' },
      },
      required: ['tools', 'cacheStrategy'],
    },
  },
  'preset.getSystemPrompt': {
    category: 'session',
    description: 'Return the SDK-style system prompt for an LLM-tools preset.',
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'get-system-prompt'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  'preset.getMcpPrompt': {
    category: 'session',
    description: 'Return the MCP-flavored system prompt for an LLM-tools preset.',
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'get-mcp-prompt'],
    skipAsATool: true,
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  'preset.dispatch': {
    category: 'core',
    description:
      "Dispatch an LLM tool call through the named preset's dispatcher against the active session's live document. Used by cross-language SDKs (e.g. Python) to proxy preset behavior over the CLI.",
    requiresDocumentContext: false,
    tokenOverride: ['preset', 'dispatch'],
    skipAsATool: true,
    sdkMetadata: { mutates: true, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        result: {},
        context: {
          type: 'object',
          properties: {
            dirty: { type: 'boolean' },
            revision: { type: 'number' },
            mutated: { type: 'boolean' },
          },
        },
      },
    },
  },
};
