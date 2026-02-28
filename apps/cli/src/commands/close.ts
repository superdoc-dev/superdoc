import { getBooleanOption } from '../lib/args';
import { CliError } from '../lib/errors';
import { parseOperationArgs } from '../lib/operation-args';
import { clearActiveSessionId, clearContext, getActiveSessionId, withActiveContext } from '../lib/context';
import type { CommandContext, CommandExecution } from '../lib/types';
function validateCloseMode(discard: boolean): {
  discard: boolean;
} {
  return {
    discard,
  };
}

export async function runClose(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.close', tokens, { commandName: 'close' });

  if (help) {
    return {
      command: 'close',
      data: {
        usage: ['superdoc close [--discard]'],
      },
      pretty: ['Usage:', '  superdoc close [--discard]'].join('\n'),
    };
  }

  const mode = validateCloseMode(getBooleanOption(parsed, 'discard'));

  return withActiveContext(
    context.io,
    'close',
    async ({ metadata, paths }) => {
      const effectiveMetadata = metadata;
      const activeSessionId = await getActiveSessionId();
      const wasDefaultSession = activeSessionId === effectiveMetadata.contextId;

      if (effectiveMetadata.dirty && !mode.discard) {
        throw new CliError(
          'DIRTY_CLOSE_REQUIRES_DECISION',
          'Active document has unsaved changes. Run "superdoc save" first or close with --discard.',
          {
            revision: effectiveMetadata.revision,
          },
        );
      }

      const result = {
        command: 'close',
        data: {
          contextId: effectiveMetadata.contextId,
          closed: true,
          saved: false,
          discarded: mode.discard,
          defaultSessionCleared: wasDefaultSession,
          wasDirty: effectiveMetadata.dirty,
          document: {
            path: effectiveMetadata.sourcePath,
            source: effectiveMetadata.source,
            revision: effectiveMetadata.revision,
          },
        },
        pretty: mode.discard ? 'Closed context (discarded unsaved changes)' : 'Closed context',
      };

      if (context.executionMode === 'host' && context.collabSessionPool) {
        await context.collabSessionPool.disposeSession(effectiveMetadata.contextId);
      }

      await clearContext(paths);
      if (wasDefaultSession) {
        await clearActiveSessionId();
      }

      return result;
    },
    context.sessionId,
  );
}
