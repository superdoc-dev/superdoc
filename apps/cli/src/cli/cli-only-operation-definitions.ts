/**
 * Canonical CLI-only operation definitions — single source of truth.
 *
 * This module consolidates metadata for the 10 CLI-only operations that
 * are not backed by document-api. All downstream consumers project the
 * views they need from this canonical object:
 *
 *   - operation-set.ts      → category, description, tokens, requiresDoc
 *   - export-sdk-contract.ts → intentName, sdkMetadata, outputSchema
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
  intentName: string;
  sdkMetadata: CliOnlySdkMetadata;
  outputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Canonical definitions
// ---------------------------------------------------------------------------

export const CLI_ONLY_OPERATION_DEFINITIONS: Record<CliOnlyOperation, CliOnlyOperationDefinition> = {
  open: {
    category: 'lifecycle',
    description: 'Open a document and create a persistent editing session.',
    requiresDocumentContext: false,
    intentName: 'open_document',
    sdkMetadata: { mutates: false, idempotency: 'non-idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string' },
        sessionType: { type: 'string' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
            revision: { type: 'number' },
          },
        },
        collaboration: {
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            url: { type: 'string' },
          },
        },
      },
      required: ['contextId', 'sessionType'],
    },
  },
  save: {
    category: 'lifecycle',
    description: 'Save the current session to the original file or a new path.',
    requiresDocumentContext: false,
    intentName: 'save_document',
    sdkMetadata: { mutates: true, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
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
      },
      required: ['contextId', 'saved'],
    },
  },
  close: {
    category: 'lifecycle',
    description: 'Close the active editing session and clean up resources.',
    requiresDocumentContext: false,
    intentName: 'close_document',
    sdkMetadata: { mutates: false, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
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
      required: ['contextId', 'closed'],
    },
  },
  status: {
    category: 'introspection',
    description: 'Show the current session status and document metadata.',
    requiresDocumentContext: false,
    intentName: 'get_status',
    sdkMetadata: { mutates: false, idempotency: 'idempotent', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        contextId: { type: 'string' },
        sessionType: { type: 'string' },
        dirty: { type: 'boolean' },
        revision: { type: 'number' },
        document: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            source: { type: 'string' },
          },
        },
      },
      required: ['contextId'],
    },
  },
  describe: {
    category: 'introspection',
    description: 'List all available CLI operations and contract metadata.',
    requiresDocumentContext: false,
    intentName: 'describe_commands',
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
    category: 'introspection',
    description: 'Show detailed metadata for a single CLI operation.',
    requiresDocumentContext: false,
    tokenOverride: ['describe', 'command'],
    intentName: 'describe_command',
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
    intentName: 'list_sessions',
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
              dirty: { type: 'boolean' },
              revision: { type: 'number' },
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
    intentName: 'save_session',
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
    intentName: 'close_session',
    sdkMetadata: { mutates: false, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
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
    intentName: 'set_default_session',
    sdkMetadata: { mutates: false, idempotency: 'conditional', supportsTrackedMode: false, supportsDryRun: false },
    outputSchema: {
      type: 'object',
      properties: {
        activeSessionId: { type: 'string' },
      },
      required: ['activeSessionId'],
    },
  },
};
