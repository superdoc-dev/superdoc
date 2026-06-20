/**
 * Generic mutation orchestrator — handles all mutating doc operations.
 *
 * Replaces the 5 copy-pasted orchestrators across write-command.ts,
 * comments-mutation-shared.ts, lists-mutation-shared.ts, and inline
 * in operation-extra-invokers.ts with a single generic path.
 *
 * Two branches: stateless (--doc) and session (unified local + collab,
 * host + oneshot).
 *
 * Runtime-neutral: dispatches through {@link OpenedRuntimeDocument} so v1
 * (editor-backed) and v2 (SDDocumentSession-backed) sessions share the same
 * orchestrator. Engine specifics (`editor.*`) MUST stay out of this file.
 */

import { COMMAND_CATALOG } from '@superdoc/document-api';
import { SUCCESS_VERB } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { cliCommandTokens } from '../cli/operation-set.js';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from './context.js';
import {
  exportOptionalSessionOutput,
  openDocument,
  openSessionDocument,
  type OpenedRuntimeDocument,
} from './document.js';
import { mapInvokeError, mapFailedReceipt } from './error-mapping.js';
import { CliError } from './errors.js';
import { formatOutput } from './output-formatters.js';
import { resolveResponseEnvelopeKey } from './response-envelope.js';
import { syncCollaborativeSessionSnapshotFromOpened } from './session-collab.js';
import { PRE_INVOKE_HOOKS, POST_INVOKE_HOOKS } from './special-handlers.js';
import type { CommandExecution } from './types.js';
import type { DocOperationRequest } from './generic-dispatch.js';
import { readOptionalString, readOptionalNumber, readBoolean, readChangeMode } from './input-readers.js';
import { extractInvokeInput } from './invoke-input.js';

/**
 * Mutations that do NOT require --out in stateless mode.
 * These are state-only operations that don't produce document changes worth exporting.
 */
const STATELESS_OUT_EXEMPT = new Set<CliExposedOperationId>([]);

type DocumentPayload = {
  path?: string;
  source: 'path' | 'stdin' | 'blank';
  byteLength: number;
  revision: number;
};

type FailedReceipt = {
  success: false;
  failure?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

type OperationInvocationResult = {
  result: unknown;
  failedReceipt: FailedReceipt | null;
};

function isFailedReceipt(value: unknown): value is FailedReceipt {
  if (typeof value !== 'object' || value == null) return false;
  if (!('success' in value) || (value as { success?: unknown }).success !== false) return false;
  return true;
}

function deriveCommandName(operationId: CliExposedOperationId): string {
  return cliCommandTokens(`doc.${operationId}` as `doc.${CliExposedOperationId}`).join(' ');
}

export async function invokeOpenedDocumentOperation(
  opened: OpenedRuntimeDocument,
  operationId: CliExposedOperationId,
  input: Record<string, unknown>,
  options?: Record<string, unknown>,
  preserveFailedReceipt = false,
  commandName?: string,
): Promise<OperationInvocationResult> {
  const apiInput = extractInvokeInput(operationId, input);
  const invoke = (request: { operationId: string; input?: unknown; options?: unknown }) => opened.doc.invoke(request);
  // AIDEV-NOTE: Pass the stable opened.doc handle so special-handlers.ts keys
  // per-document hook state (resolved track-change ids) by the document, never
  // by the per-call `invoke` closure below. In host mode the session pool hands
  // every operation the SAME opened.doc (session-pool.ts createLease:
  // `lease.doc = pooled.doc`), so this is what lets that state persist across
  // calls in a session. Drop editor.doc here and already-resolved NO_OP
  // detection silently breaks: a repeat decide surfaces TARGET_NOT_FOUND.
  const hookContext = { invoke, editor: { doc: opened.doc } };
  const preHook = PRE_INVOKE_HOOKS[operationId];
  const transformedInput = preHook ? preHook(apiInput as Record<string, unknown>, hookContext) : apiInput;

  let result: unknown;
  try {
    // Await so both synchronous throws and async rejections (e.g. the async
    // templates.apply path) are translated by mapInvokeError. Awaiting a
    // non-Promise result is a no-op for the synchronous operations.
    result = await opened.doc.invoke({
      operationId,
      input: transformedInput,
      options,
    });
  } catch (error) {
    throw mapInvokeError(operationId, error, { commandName });
  }

  const failedReceipt = isFailedReceipt(result) ? result : null;

  // Check for failed receipts (non-throwing failure path)
  if (!preserveFailedReceipt) {
    const failedReceiptError = mapFailedReceipt(operationId, result, { commandName });
    if (failedReceiptError) throw failedReceiptError;
  }

  const postHook = POST_INVOKE_HOOKS[operationId];
  return {
    result: postHook ? postHook(result, { ...hookContext, apiInput: transformedInput }) : result,
    failedReceipt,
  };
}

function buildEnvelopeData(
  envelopeKey: string | null,
  document: DocumentPayload,
  result: unknown,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  if (envelopeKey === null) {
    const resultObj = typeof result === 'object' && result != null ? result : {};
    return { document, ...(resultObj as Record<string, unknown>), ...extras };
  }

  return { document, [envelopeKey]: result, ...extras };
}

function buildPrettyOutput(
  operationId: CliExposedOperationId,
  document: DocumentPayload,
  result: unknown,
  outputPath?: string,
): string {
  const formatted = formatOutput(operationId, result, { revision: document.revision });
  if (formatted != null) {
    return outputPath ? `${formatted} -> ${outputPath}` : formatted;
  }

  const verb = SUCCESS_VERB[operationId];
  return outputPath
    ? `Revision ${document.revision}: ${verb} -> ${outputPath}`
    : `Revision ${document.revision}: ${verb}`;
}

function buildFailedReceiptPrettyOutput(
  operationId: CliExposedOperationId,
  document: DocumentPayload,
  result: unknown,
): string {
  const failure = isFailedReceipt(result) ? result.failure : undefined;
  const code = typeof failure?.code === 'string' && failure.code.length > 0 ? failure.code : 'COMMAND_FAILED';
  return `Revision ${document.revision}: ${SUCCESS_VERB[operationId]} failed (${code})`;
}

export async function executeMutationOperation(request: DocOperationRequest): Promise<CommandExecution> {
  const { operationId, input, context } = request;
  // Resolve the response envelope key up front so a hint-table drift fails
  // before we open the document, run the mutation, or persist any state.
  const envelopeKey = resolveResponseEnvelopeKey(operationId);
  const doc = readOptionalString(input, 'doc');
  const outPath = readOptionalString(input, 'out');
  const dryRun = readBoolean(input, 'dryRun');
  const changeMode = readChangeMode(input);
  const force = readBoolean(input, 'force');
  const expectedRevision =
    operationId === 'trackChanges.decide' && typeof input.expectedRevision === 'string'
      ? undefined
      : readOptionalNumber(input, 'expectedRevision');
  const commandName = request.commandName ?? deriveCommandName(operationId);

  const catalog = COMMAND_CATALOG[operationId];
  const invokeOptions: Record<string, unknown> = {};
  if (catalog.supportsTrackedMode) {
    invokeOptions.changeMode = changeMode;
  } else if (changeMode === 'tracked') {
    throw new CliError(
      'TRACK_CHANGE_COMMAND_UNAVAILABLE',
      `${commandName}: tracked mode is not supported for this operation.`,
    );
  }
  if (catalog.supportsDryRun && dryRun) invokeOptions.dryRun = true;

  if (doc && expectedRevision != null) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: --expected-revision is only supported with an active open context.`,
    );
  }

  // -----------------------------------------------------------------------
  // Stateless path (--doc)
  // -----------------------------------------------------------------------
  if (doc) {
    if (!outPath && !dryRun && !STATELESS_OUT_EXEMPT.has(operationId)) {
      throw new CliError('MISSING_REQUIRED', `${commandName}: missing required --out.`);
    }

    const source = doc === '-' ? 'stdin' : 'path';
    const opened = await openDocument(doc, context.io);
    try {
      const preserveFailedReceipt = context.executionMode === 'host';
      const { result, failedReceipt } = await invokeOpenedDocumentOperation(
        opened,
        operationId,
        input,
        invokeOptions,
        preserveFailedReceipt,
        commandName,
      );
      const document: DocumentPayload = {
        path: source === 'path' ? doc : undefined,
        source,
        byteLength: opened.meta.byteLength,
        revision: 0,
      };

      if (dryRun) {
        return {
          command: commandName,
          data: {
            ...buildEnvelopeData(envelopeKey, document, result, { changeMode, dryRun: true }),
            output: outPath ? { path: outPath, skippedWrite: true } : undefined,
          },
          pretty: `Revision 0: dry run`,
        };
      }

      if (preserveFailedReceipt && failedReceipt) {
        return {
          command: commandName,
          data: buildEnvelopeData(envelopeKey, document, result, {
            changeMode,
            dryRun: false,
            output: outPath ? { path: outPath, skippedWrite: true } : undefined,
          }),
          pretty: buildFailedReceiptPrettyOutput(operationId, document, failedReceipt),
        };
      }

      const output = outPath ? await opened.exportToPath(outPath, force) : undefined;
      return {
        command: commandName,
        data: buildEnvelopeData(envelopeKey, document, result, {
          changeMode,
          dryRun: false,
          output,
        }),
        pretty: buildPrettyOutput(operationId, document, result, output?.path),
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
      assertExpectedRevision(metadata, expectedRevision);

      const isHostMode = context.executionMode === 'host' && context.sessionPool != null;

      const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
        sessionId: context.sessionId ?? metadata.contextId,
        executionMode: context.executionMode,
        sessionPool: context.sessionPool,
      });

      try {
        const preserveFailedReceipt = isHostMode;
        const { result, failedReceipt } = await invokeOpenedDocumentOperation(
          opened,
          operationId,
          input,
          invokeOptions,
          preserveFailedReceipt,
          commandName,
        );

        if (dryRun) {
          const document: DocumentPayload = {
            path: metadata.sourcePath,
            source: metadata.source,
            byteLength: opened.meta.byteLength,
            revision: metadata.revision,
          };
          return {
            command: commandName,
            data: {
              ...buildEnvelopeData(envelopeKey, document, result, { changeMode, dryRun: true }),
              context: { dirty: metadata.dirty, revision: metadata.revision },
              output: outPath ? { path: outPath, skippedWrite: true } : undefined,
            },
            pretty: `Revision ${metadata.revision}: dry run`,
          };
        }

        if (preserveFailedReceipt && failedReceipt) {
          const document: DocumentPayload = {
            path: metadata.sourcePath,
            source: metadata.source,
            byteLength: opened.meta.byteLength,
            revision: metadata.revision,
          };
          return {
            command: commandName,
            data: buildEnvelopeData(envelopeKey, document, result, {
              changeMode,
              dryRun: false,
              context: { dirty: metadata.dirty, revision: metadata.revision },
              output: outPath ? { path: outPath, skippedWrite: true } : undefined,
            }),
            pretty: buildFailedReceiptPrettyOutput(operationId, document, failedReceipt),
          };
        }

        // Persist based on mode
        let updatedMetadata: typeof metadata;
        let byteLength: number;

        if (isHostMode) {
          // Host mode: mark dirty, let pool handle persistence
          context.sessionPool!.markDirty(metadata.contextId);
          updatedMetadata = markContextUpdated(context.io, metadata, {
            dirty: true,
            revision: metadata.revision + 1,
          });
          await writeContextMetadata(paths, updatedMetadata);
          context.sessionPool!.updateMetadataRevision(metadata.contextId, updatedMetadata.revision);
          byteLength = opened.meta.byteLength;
        } else if (metadata.sessionType === 'collab') {
          // Oneshot collab: sync snapshot to disk (v1-only).
          const synced = await syncCollaborativeSessionSnapshotFromOpened(context.io, metadata, paths, opened);
          updatedMetadata = synced.updatedMetadata;
          byteLength = synced.output.byteLength;
        } else {
          // Oneshot local / v2: export to disk through the runtime-neutral
          // contract.
          const workingOutput = await opened.exportToPath(paths.workingDocPath, true);
          updatedMetadata = markContextUpdated(context.io, metadata, {
            dirty: true,
            revision: metadata.revision + 1,
          });
          await writeContextMetadata(paths, updatedMetadata);
          byteLength = workingOutput.byteLength;
        }

        const externalOutput = await exportOptionalSessionOutput(opened, context.io, outPath, force);
        const document: DocumentPayload = {
          path: updatedMetadata.sourcePath,
          source: updatedMetadata.source,
          byteLength,
          revision: updatedMetadata.revision,
        };

        return {
          command: commandName,
          data: buildEnvelopeData(envelopeKey, document, result, {
            changeMode,
            dryRun: false,
            context: { dirty: updatedMetadata.dirty, revision: updatedMetadata.revision },
            output:
              externalOutput?.output ??
              (externalOutput?.warning
                ? {
                    path: externalOutput.warning.path,
                    failed: true,
                    error: {
                      code: externalOutput.warning.code,
                      message: externalOutput.warning.message,
                    },
                  }
                : undefined),
          }),
          pretty: buildPrettyOutput(operationId, document, result, externalOutput?.output?.path),
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
    context.executionMode,
  );
}
