/**
 * Generic read orchestrator — handles all read (non-mutating) doc operations.
 *
 * Replaces the per-operation runReadOperation() calls scattered across
 * operation-extra-invokers.ts with a single generic path.
 */

import { RESPONSE_ENVELOPE_KEY, SUCCESS_VERB } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { cliCommandTokens } from '../cli/operation-set.js';
import { withActiveContext } from './context.js';
import { openDocument, openSessionDocument, type EditorWithDoc } from './document.js';
import { mapInvokeError } from './error-mapping.js';
import { formatOutput } from './output-formatters.js';
import { syncCollaborativeSessionSnapshot } from './session-collab.js';
import { PRE_INVOKE_HOOKS, POST_INVOKE_HOOKS } from './special-handlers.js';
import type { CommandExecution } from './types.js';
import type { DocOperationRequest } from './generic-dispatch.js';
import { readOptionalString } from './input-readers.js';
import { extractInvokeInput } from './invoke-input.js';

type DocumentPayload = {
  path?: string;
  source: 'path' | 'stdin';
  byteLength: number;
  revision: number;
};

function deriveCommandName(operationId: CliExposedOperationId): string {
  return cliCommandTokens(`doc.${operationId}` as `doc.${CliExposedOperationId}`).join(' ');
}

function invokeOperation(
  editor: EditorWithDoc,
  operationId: CliExposedOperationId,
  input: Record<string, unknown>,
): unknown {
  const apiInput = extractInvokeInput(operationId, input);
  const preHook = PRE_INVOKE_HOOKS[operationId];
  const transformedInput = preHook ? preHook(apiInput as Record<string, unknown>, { editor }) : apiInput;

  let result: unknown;
  try {
    result = editor.doc.invoke({
      operationId,
      input: transformedInput,
    });
  } catch (error) {
    throw mapInvokeError(operationId, error);
  }

  const postHook = POST_INVOKE_HOOKS[operationId];
  return postHook ? postHook(result, { editor, apiInput: transformedInput }) : result;
}

/**
 * Input fields to echo in the response envelope alongside the result.
 * For example, `find` echoes the `query` input so callers can correlate results.
 */
const ECHO_INPUT_FIELDS: Partial<Record<CliExposedOperationId, string[]>> = {
  find: ['query'],
};

function buildEnvelopeData(
  operationId: CliExposedOperationId,
  document: DocumentPayload,
  result: unknown,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const envelopeKey = RESPONSE_ENVELOPE_KEY[operationId];

  const echoFields = ECHO_INPUT_FIELDS[operationId];
  const extras: Record<string, unknown> = {};
  if (echoFields) {
    for (const field of echoFields) {
      if (input[field] != null) extras[field] = input[field];
    }
  }

  if (envelopeKey === null) {
    // Spread result across top-level keys (e.g. info → counts, outline, capabilities)
    const resultObj = typeof result === 'object' && result != null ? result : {};
    return { document, ...(resultObj as Record<string, unknown>), ...extras };
  }

  return { document, [envelopeKey]: result, ...extras };
}

function buildPrettyOutput(operationId: CliExposedOperationId, document: DocumentPayload, result: unknown): string {
  const formatted = formatOutput(operationId, result, { revision: document.revision });
  if (formatted != null) return formatted;

  return `Revision ${document.revision}: ${SUCCESS_VERB[operationId]}`;
}

export async function executeReadOperation(request: DocOperationRequest): Promise<CommandExecution> {
  const { operationId, input, context } = request;
  const doc = readOptionalString(input, 'doc');
  const commandName = deriveCommandName(operationId);

  if (doc) {
    const source = doc === '-' ? 'stdin' : 'path';
    const opened = await openDocument(doc, context.io);
    try {
      const result = invokeOperation(opened.editor, operationId, input);
      const document: DocumentPayload = {
        path: source === 'path' ? doc : undefined,
        source,
        byteLength: opened.meta.byteLength,
        revision: 0,
      };

      return {
        command: commandName,
        data: buildEnvelopeData(operationId, document, result, input),
        pretty: buildPrettyOutput(operationId, document, result),
      };
    } finally {
      opened.dispose();
    }
  }

  return withActiveContext(
    context.io,
    commandName,
    async ({ metadata, paths }) => {
      if (metadata.sessionType === 'collab') {
        const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          collabSessionPool: context.collabSessionPool,
        });

        try {
          const result = invokeOperation(opened.editor, operationId, input);
          const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
          const document: DocumentPayload = {
            path: synced.updatedMetadata.sourcePath,
            source: synced.updatedMetadata.source,
            byteLength: synced.output.byteLength,
            revision: synced.updatedMetadata.revision,
          };

          return {
            command: commandName,
            data: buildEnvelopeData(operationId, document, result, input),
            pretty: buildPrettyOutput(operationId, document, result),
          };
        } finally {
          opened.dispose();
        }
      }

      const opened = await openDocument(paths.workingDocPath, context.io);
      try {
        const result = invokeOperation(opened.editor, operationId, input);
        const document: DocumentPayload = {
          path: metadata.sourcePath,
          source: metadata.source,
          byteLength: opened.meta.byteLength,
          revision: metadata.revision,
        };

        return {
          command: commandName,
          data: buildEnvelopeData(operationId, document, result, input),
          pretty: buildPrettyOutput(operationId, document, result),
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
  );
}
