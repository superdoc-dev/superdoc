/**
 * Generic mutation orchestrator — handles all mutating doc operations.
 *
 * Replaces the 5 copy-pasted orchestrators across write-command.ts,
 * comments-mutation-shared.ts, lists-mutation-shared.ts, and inline
 * in operation-extra-invokers.ts with a single generic path.
 *
 * The 3-branch session structure (stateless / session+collab / session+local)
 * is preserved but unified into one function.
 */

import { COMMAND_CATALOG } from '@superdoc/document-api';
import { RESPONSE_ENVELOPE_KEY, SUCCESS_VERB } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { cliCommandTokens } from '../cli/operation-set.js';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from './context.js';
import { exportToPath, openDocument, openSessionDocument, type EditorWithDoc } from './document.js';
import { mapInvokeError, mapFailedReceipt } from './error-mapping.js';
import { CliError } from './errors.js';
import { formatOutput } from './output-formatters.js';
import { syncCollaborativeSessionSnapshot } from './session-collab.js';
import { PRE_INVOKE_HOOKS, POST_INVOKE_HOOKS } from './special-handlers.js';
import type { CommandExecution } from './types.js';
import type { DocOperationRequest } from './generic-dispatch.js';
import { readOptionalString, readOptionalNumber, readBoolean, readChangeMode } from './input-readers.js';
import { extractInvokeInput } from './invoke-input.js';

/**
 * Mutations that do NOT require --out in stateless mode.
 * These are state-only operations that don't produce document changes worth exporting.
 */
const STATELESS_OUT_EXEMPT = new Set<CliExposedOperationId>(['comments.setActive']);

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
  options?: Record<string, unknown>,
): unknown {
  const apiInput = extractInvokeInput(operationId, input);
  const preHook = PRE_INVOKE_HOOKS[operationId];
  const transformedInput = preHook ? preHook(apiInput as Record<string, unknown>, { editor }) : apiInput;

  let result: unknown;
  try {
    result = editor.doc.invoke({
      operationId,
      input: transformedInput,
      options,
    });
  } catch (error) {
    throw mapInvokeError(operationId, error);
  }

  // Check for failed receipts (non-throwing failure path)
  const failedReceiptError = mapFailedReceipt(operationId, result);
  if (failedReceiptError) throw failedReceiptError;

  const postHook = POST_INVOKE_HOOKS[operationId];
  return postHook ? postHook(result, { editor, apiInput: transformedInput }) : result;
}

function buildEnvelopeData(
  operationId: CliExposedOperationId,
  document: DocumentPayload,
  result: unknown,
  extras: Record<string, unknown>,
): Record<string, unknown> {
  const envelopeKey = RESPONSE_ENVELOPE_KEY[operationId];

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

async function exportOptionalSessionOutput(
  editor: EditorWithDoc,
  outPath: string | undefined,
  force: boolean,
): Promise<{ path: string; byteLength: number } | undefined> {
  if (!outPath) return undefined;
  try {
    return await exportToPath(editor, outPath, force);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[warn] optional export to ${outPath} failed: ${message}\n`);
    return undefined;
  }
}

export async function executeMutationOperation(request: DocOperationRequest): Promise<CommandExecution> {
  const { operationId, input, context } = request;
  const doc = readOptionalString(input, 'doc');
  const outPath = readOptionalString(input, 'out');
  const dryRun = readBoolean(input, 'dryRun');
  const changeMode = readChangeMode(input);
  const force = readBoolean(input, 'force');
  const expectedRevision = readOptionalNumber(input, 'expectedRevision');
  const commandName = deriveCommandName(operationId);

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
      const result = invokeOperation(opened.editor, operationId, input, invokeOptions);
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
            ...buildEnvelopeData(operationId, document, result, { changeMode, dryRun: true }),
            output: outPath ? { path: outPath, skippedWrite: true } : undefined,
          },
          pretty: `Revision 0: dry run`,
        };
      }

      const output = outPath ? await exportToPath(opened.editor, outPath, force) : undefined;
      return {
        command: commandName,
        data: buildEnvelopeData(operationId, document, result, {
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
  // Session paths (collab or local)
  // -----------------------------------------------------------------------
  return withActiveContext(
    context.io,
    commandName,
    async ({ metadata, paths }) => {
      assertExpectedRevision(metadata, expectedRevision);

      // --- Session + collab ---
      if (metadata.sessionType === 'collab') {
        const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          collabSessionPool: context.collabSessionPool,
        });

        try {
          const result = invokeOperation(opened.editor, operationId, input, invokeOptions);
          const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
          const document: DocumentPayload = {
            path: synced.updatedMetadata.sourcePath,
            source: synced.updatedMetadata.source,
            byteLength: synced.output.byteLength,
            revision: synced.updatedMetadata.revision,
          };

          if (dryRun) {
            return {
              command: commandName,
              data: {
                ...buildEnvelopeData(operationId, document, result, { changeMode, dryRun: true }),
                context: { dirty: synced.updatedMetadata.dirty, revision: synced.updatedMetadata.revision },
                output: outPath ? { path: outPath, skippedWrite: true } : undefined,
              },
              pretty: `Revision ${synced.updatedMetadata.revision}: dry run`,
            };
          }

          const externalOutput = await exportOptionalSessionOutput(opened.editor, outPath, force);
          return {
            command: commandName,
            data: buildEnvelopeData(operationId, document, result, {
              changeMode,
              dryRun: false,
              context: { dirty: synced.updatedMetadata.dirty, revision: synced.updatedMetadata.revision },
              output: externalOutput,
            }),
            pretty: buildPrettyOutput(operationId, document, result, externalOutput?.path),
          };
        } finally {
          opened.dispose();
        }
      }

      // --- Session + local ---
      const opened = await openDocument(paths.workingDocPath, context.io);
      try {
        const result = invokeOperation(opened.editor, operationId, input, invokeOptions);
        const document: DocumentPayload = {
          path: metadata.sourcePath,
          source: metadata.source,
          byteLength: opened.meta.byteLength,
          revision: metadata.revision,
        };

        if (dryRun) {
          return {
            command: commandName,
            data: {
              ...buildEnvelopeData(operationId, document, result, { changeMode, dryRun: true }),
              context: { dirty: metadata.dirty, revision: metadata.revision },
              output: outPath ? { path: outPath, skippedWrite: true } : undefined,
            },
            pretty: `Revision ${metadata.revision}: dry run`,
          };
        }

        const workingOutput = await exportToPath(opened.editor, paths.workingDocPath, true);
        const externalOutput = await exportOptionalSessionOutput(opened.editor, outPath, force);
        const updatedMetadata = markContextUpdated(context.io, metadata, {
          dirty: true,
          revision: metadata.revision + 1,
        });
        await writeContextMetadata(paths, updatedMetadata);

        const updatedDocument: DocumentPayload = {
          path: updatedMetadata.sourcePath,
          source: updatedMetadata.source,
          byteLength: workingOutput.byteLength,
          revision: updatedMetadata.revision,
        };

        return {
          command: commandName,
          data: buildEnvelopeData(operationId, updatedDocument, result, {
            changeMode,
            dryRun: false,
            context: { dirty: updatedMetadata.dirty, revision: updatedMetadata.revision },
            output: externalOutput,
          }),
          pretty: buildPrettyOutput(operationId, updatedDocument, result, externalOutput?.path),
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
  );
}
