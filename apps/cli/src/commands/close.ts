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

      if (effectiveMetadata.dirty && !mode.discard) {
        throw new CliError(
          'DIRTY_CLOSE_REQUIRES_DECISION',
          'Active document has unsaved changes. Run "superdoc save" first or close with --discard.',
          {
            revision: effectiveMetadata.revision,
          },
        );
      }

      // AIDEV-NOTE: the project-global active-session pointer may
      // only be read or cleared in oneshot (CLI) mode. Host mode must
      // never touch this file: multiple SDK clients can share one
      // project root, and any read/clear here cross-contaminates their
      // sessions. Mirror the same guard in open.ts when changing this
      // rule.
      let wasDefaultSession = false;
      if (context.executionMode !== 'host') {
        const activeSessionId = await getActiveSessionId();
        wasDefaultSession = activeSessionId === effectiveMetadata.contextId;
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
          runtime: effectiveMetadata.runtime,
          document: {
            path: effectiveMetadata.sourcePath,
            source: effectiveMetadata.source,
            revision: effectiveMetadata.revision,
          },
        },
        pretty: mode.discard ? 'Closed context (discarded unsaved changes)' : 'Closed context',
      };

      if (context.executionMode === 'host' && context.sessionPool) {
        await context.sessionPool.disposeSession(effectiveMetadata.contextId, { discard: mode.discard });
      }

      await clearContext(paths);
      if (wasDefaultSession) {
        await clearActiveSessionId();
      }

      return result;
    },
    context.sessionId,
    context.executionMode,
  );
}
