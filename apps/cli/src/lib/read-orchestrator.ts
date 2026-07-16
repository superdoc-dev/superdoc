/**
 * Generic read orchestrator — handles all read (non-mutating) doc operations.
 *
 * Replaces the per-operation runReadOperation() calls scattered across
 * operation-extra-invokers.ts with a single generic path.
 *
 * Dispatches through {@link OpenedRuntimeDocument}; engine specifics
 * (`editor.*`) MUST stay out of this file.
 */

import { SUCCESS_VERB } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { cliCommandTokens } from '../cli/operation-set.js';
import { withActiveContext } from './context.js';
import { openDocument, openSessionDocument, type OpenedRuntimeDocument } from './document.js';
import { mapInvokeError } from './error-mapping.js';
import { resolveResponseEnvelopeKey } from './response-envelope.js';
import { formatOutput } from './output-formatters.js';
import { syncCollaborativeSessionSnapshotFromOpened } from './session-collab.js';
import { PRE_INVOKE_HOOKS, POST_INVOKE_HOOKS } from './special-handlers.js';
import type { CommandExecution } from './types.js';
import type { DocOperationRequest } from './generic-dispatch.js';
import { readOptionalString } from './input-readers.js';
import { extractInvokeInput } from './invoke-input.js';

type DocumentPayload = {
  path?: string;
  source: 'path' | 'stdin' | 'blank';
  byteLength: number;
  revision: number;
};

function deriveCommandName(operationId: CliExposedOperationId): string {
  return cliCommandTokens(`doc.${operationId}` as `doc.${CliExposedOperationId}`).join(' ');
}

function invokeOpenedDocumentOperation(
  opened: OpenedRuntimeDocument,
  operationId: CliExposedOperationId,
  input: Record<string, unknown>,
  commandName?: string,
): unknown {
  const apiInput = extractInvokeInput(operationId, input);
  const invoke = (request: { operationId: string; input?: unknown; options?: unknown }) => opened.doc.invoke(request);
  // AIDEV-NOTE: Key per-document hook state by the stable opened.doc handle, not
  // the per-call `invoke` closure, so reads and mutations in the same host
  // session share one scope. See mutation-orchestrator.ts for the full rationale.
  const hookContext = { invoke, editor: { doc: opened.doc } };
  const preHook = PRE_INVOKE_HOOKS[operationId];
  const transformedInput = preHook ? preHook(apiInput as Record<string, unknown>, hookContext) : apiInput;

  let result: unknown;
  try {
    result = opened.doc.invoke({
      operationId,
      input: transformedInput,
    });
  } catch (error) {
    throw mapInvokeError(operationId, error, { commandName });
  }

  const postHook = POST_INVOKE_HOOKS[operationId];
  return postHook ? postHook(result, { ...hookContext, apiInput: transformedInput }) : result;
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
  envelopeKey: string | null,
  document: DocumentPayload,
  result: unknown,
  input: Record<string, unknown>,
): Record<string, unknown> {
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
  // Resolve the response envelope key up front so a hint-table drift fails
  // before we open the document or run the operation. Reads have no on-disk
  // side effects today, but doing this here keeps the guard symmetric with
  // the mutation path and protects future read-time effects (e.g. collab
  // snapshot sync) from running past a drift failure.
  const envelopeKey = resolveResponseEnvelopeKey(operationId);
  const doc = readOptionalString(input, 'doc');
  const commandName = request.commandName ?? deriveCommandName(operationId);

  if (doc) {
    const source = doc === '-' ? 'stdin' : 'path';
    const opened = await openDocument(doc, context.io);
    try {
      const result = invokeOpenedDocumentOperation(opened, operationId, input, commandName);
      const document: DocumentPayload = {
        path: source === 'path' ? doc : undefined,
        source,
        byteLength: opened.meta.byteLength,
        revision: 0,
      };

      return {
        command: commandName,
        data: buildEnvelopeData(operationId, envelopeKey, document, result, input),
        pretty: buildPrettyOutput(operationId, document, result),
      };
    } finally {
      opened.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Session path (unified: local + collab, host + oneshot)
  // -----------------------------------------------------------------------
  return withActiveContext(
    context.io,
    commandName,
    async ({ metadata, paths }) => {
      const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
        sessionId: context.sessionId ?? metadata.contextId,
        executionMode: context.executionMode,
        sessionPool: context.sessionPool,
      });

      try {
        const result = invokeOpenedDocumentOperation(opened, operationId, input, commandName);

        // For oneshot collab reads, sync snapshot to keep working.docx current
        const isHostMode = context.executionMode === 'host' && context.sessionPool != null;
        if (!isHostMode && metadata.sessionType === 'collab') {
          const synced = await syncCollaborativeSessionSnapshotFromOpened(context.io, metadata, paths, opened);
          const document: DocumentPayload = {
            path: synced.updatedMetadata.sourcePath,
            source: synced.updatedMetadata.source,
            byteLength: synced.output.byteLength,
            revision: synced.updatedMetadata.revision,
          };
          return {
            command: commandName,
            data: buildEnvelopeData(operationId, envelopeKey, document, result, input),
            pretty: buildPrettyOutput(operationId, document, result),
          };
        }

        const document: DocumentPayload = {
          path: metadata.sourcePath,
          source: metadata.source,
          byteLength: opened.meta.byteLength,
          revision: metadata.revision,
        };
        return {
          command: commandName,
          data: buildEnvelopeData(operationId, envelopeKey, document, result, input),
          pretty: buildPrettyOutput(operationId, document, result),
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
    context.executionMode,
  );
}
