/**
 * `execute_code` command runner — CLI/SDK-only session operation.
 *
 * Resolves the active session's live editor and runs model-authored JavaScript
 * IN-HOST against the SYNCHRONOUS `editor.doc` (a real DocumentApi) via
 * {@link executeCode}. This is the in-host counterpart to the eval provider's
 * old async, provider-side execute_code: the doc is synchronous, so the model's
 * code calls `doc.*` WITHOUT await.
 *
 * Session resolution mirrors the inline-special insert runner: open (or reuse,
 * in host mode, via the SessionPool) the session document, run the script,
 * then — if the script mutated the doc and we are in host mode — mark the
 * session dirty and bump the revision so persistence behaves like any other
 * mutating op. Read-only scripts (no revision change) leave the session clean.
 */

import { getStringOption } from '../lib/args';
import type { ParsedArgs } from '../lib/args';
import { assertExpectedRevision, markContextUpdated, withActiveContext, writeContextMetadata } from '../lib/context';
import { exportToPath, openSessionDocument, type OpenedDocument } from '../lib/document';
import { CliError } from '../lib/errors';
import { executeCodeWithRollback } from '../lib/execute-code-rollback';
import { parseOperationArgs } from '../lib/operation-args';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CliOperationId } from '../cli';
import type { CommandContext, CommandExecution } from '../lib/types';

const COMMAND_NAME = 'execute code';
const OPERATION_ID = 'doc.executeCode' as CliOperationId;

function scriptTimeoutMs(commandTimeoutMs: number | undefined): number | undefined {
  return commandTimeoutMs == null ? undefined : Math.max(1, commandTimeoutMs - 1);
}

/** Extract the model code from CLI options or the stdin payload (large code). */
async function resolveCode(parsed: ParsedArgs, context: CommandContext): Promise<string> {
  const inline = getStringOption(parsed, 'code');
  if (typeof inline === 'string' && inline.length > 0) {
    return inline;
  }

  // Large code is delivered via the host stdin channel (stdinBase64, 32MiB cap).
  const bytes = await context.io.readStdinBytes();
  if (bytes.byteLength === 0) {
    throw new CliError('MISSING_REQUIRED', `${COMMAND_NAME}: missing code. Pass --code or provide it on stdin.`);
  }
  return Buffer.from(bytes).toString('utf8');
}

export async function runExecuteCode(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, args, help } = parseOperationArgs(OPERATION_ID, tokens, { commandName: COMMAND_NAME });

  if (help) {
    return {
      command: COMMAND_NAME,
      data: {
        usage: [
          `superdoc execute code --session <id> --code '<js>'`,
          `superdoc execute code --session <id>   (code on stdin)`,
        ],
      },
      pretty: [
        'Usage:',
        `  superdoc execute code --session <id> --code '<js>'`,
        `  superdoc execute code --session <id>   (code on stdin)`,
      ].join('\n'),
    };
  }

  const code = await resolveCode(parsed, context);
  const expectedRevision = typeof args.expectedRevision === 'number' ? args.expectedRevision : undefined;

  return withActiveContext(
    context.io,
    COMMAND_NAME,
    async ({ metadata, paths }) => {
      assertExpectedRevision(metadata, expectedRevision);

      const isHostMode = context.executionMode === 'host' && context.sessionPool != null;
      const openedRuntime = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
        sessionId: context.sessionId ?? metadata.contextId,
        executionMode: context.executionMode,
        sessionPool: context.sessionPool,
      });
      // execute-code runs model JS against the live v1 editor.doc — a v1-only
      // path. openSessionDocument returns the runtime-neutral handle; narrow it
      // (same defensive guard as legacy-compat's assertV1Opened).
      if (!('editor' in openedRuntime)) {
        throw new CliError('COMMAND_FAILED', `${COMMAND_NAME}: expected a v1 editor-backed session.`);
      }
      const opened = openedRuntime as OpenedDocument;

      try {
        // Shared snapshot→run→rollback envelope (same semantics as the
        // preset-dispatch shim): a script that mutates and then throws is
        // restored; only surviving changes count as a mutation.
        const { result, mutated } = await executeCodeWithRollback(opened.editor, code, {
          timeoutMs: scriptTimeoutMs(context.timeoutMs),
        });

        let updatedMetadata = metadata;

        if (mutated) {
          if (isHostMode) {
            context.sessionPool!.markDirty(metadata.contextId);
            updatedMetadata = markContextUpdated(context.io, metadata, {
              dirty: true,
              revision: metadata.revision + 1,
            });
            await writeContextMetadata(paths, updatedMetadata);
            context.sessionPool!.updateMetadataRevision(metadata.contextId, updatedMetadata.revision);
          } else if (metadata.sessionType === 'collab') {
            const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
            updatedMetadata = synced.updatedMetadata;
          } else {
            // Oneshot local: export the mutated working doc to disk.
            await exportToPath(opened.editor, paths.workingDocPath, true);
            updatedMetadata = markContextUpdated(context.io, metadata, {
              dirty: true,
              revision: metadata.revision + 1,
            });
            await writeContextMetadata(paths, updatedMetadata);
          }
        }

        return {
          command: COMMAND_NAME,
          data: {
            ...result,
            context: { dirty: updatedMetadata.dirty, revision: updatedMetadata.revision, mutated },
          },
          pretty: result.ok
            ? `execute_code: ok (revision ${updatedMetadata.revision}${mutated ? ', mutated' : ''})`
            : `execute_code: failed — ${result.error.name}: ${result.error.message}`,
        };
      } finally {
        opened.dispose();
      }
    },
    context.sessionId,
    context.executionMode,
  );
}
