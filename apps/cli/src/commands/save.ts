import { getBooleanOption, getStringOption } from '../lib/args';
import { CliError } from '../lib/errors';
import { parseOperationArgs } from '../lib/operation-args';
import {
  copyWorkingDocumentToPath,
  detectSourceDrift,
  markContextUpdated,
  resolveSourcePathForMetadata,
  snapshotSourceFile,
  withActiveContext,
  writeContextMetadata,
} from '../lib/context';
import { openSessionDocument } from '../lib/document';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CommandContext, CommandExecution } from '../lib/types';
function validateSaveMode(
  inPlace: boolean,
  outPath: string | undefined,
  force: boolean,
): {
  inPlace: boolean;
  outPath?: string;
  force: boolean;
} {
  if (inPlace && outPath) {
    throw new CliError('INVALID_ARGUMENT', 'save: use either --in-place or --out, not both.');
  }

  return {
    inPlace,
    outPath,
    force,
  };
}

export async function runSave(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.save', tokens, { commandName: 'save' });

  if (help) {
    return {
      command: 'save',
      data: {
        usage: ['superdoc save [--in-place] [--out <path>] [--force]'],
      },
      pretty: ['Usage:', '  superdoc save [--in-place] [--out <path>] [--force]'].join('\n'),
    };
  }

  const mode = validateSaveMode(
    getBooleanOption(parsed, 'in-place'),
    getStringOption(parsed, 'out'),
    getBooleanOption(parsed, 'force'),
  );

  return withActiveContext(
    context.io,
    'save',
    async ({ metadata, paths }) => {
      let effectiveMetadata = metadata;
      if (metadata.sessionType === 'collab') {
        const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          collabSessionPool: context.collabSessionPool,
        });
        try {
          const synced = await syncCollaborativeSessionSnapshot(context.io, metadata, paths, opened.editor);
          effectiveMetadata = synced.updatedMetadata;
        } finally {
          opened.dispose();
        }
      }

      const resolvedOutPath = mode.outPath ? resolveSourcePathForMetadata(mode.outPath) : undefined;
      const sourcePath = effectiveMetadata.sourcePath;
      const targetPath = resolvedOutPath ?? sourcePath;
      if (!targetPath) {
        throw new CliError('MISSING_REQUIRED', 'save: this session has no source path; use --out <path>.');
      }

      const isInPlace = mode.inPlace || (sourcePath != null && targetPath === sourcePath);
      if (isInPlace && !sourcePath) {
        throw new CliError('MISSING_REQUIRED', 'save: --in-place requires a source path; use --out <path>.');
      }

      let output: { path: string; byteLength: number };
      if (isInPlace) {
        const drift = await detectSourceDrift(effectiveMetadata);
        if (drift.drifted && !mode.force) {
          throw new CliError('SOURCE_DRIFT_DETECTED', 'Source document changed since open. Refusing to overwrite.', {
            sourcePath: effectiveMetadata.sourcePath,
            expected: drift.expected,
            actual: drift.actual,
            reason: drift.reason,
            hint: 'Use --force to overwrite anyway or save with --out <path>.',
          });
        }

        output = await copyWorkingDocumentToPath(paths, sourcePath!, true);
      } else {
        output = await copyWorkingDocumentToPath(paths, targetPath, mode.force);
      }

      const nextSourcePath = isInPlace ? sourcePath! : targetPath;
      const nextSnapshot = await snapshotSourceFile(nextSourcePath);
      const nowIso = new Date(context.io.now()).toISOString();
      const updatedMetadata = markContextUpdated(context.io, effectiveMetadata, {
        source: 'path',
        sourcePath: nextSourcePath,
        sourceSnapshot: nextSnapshot,
        dirty: false,
        lastSavedAt: nowIso,
      });
      await writeContextMetadata(paths, updatedMetadata);

      return {
        command: 'save',
        data: {
          contextId: updatedMetadata.contextId,
          saved: true,
          inPlace: isInPlace,
          document: {
            path: updatedMetadata.sourcePath,
            source: updatedMetadata.source,
            revision: updatedMetadata.revision,
          },
          context: {
            dirty: updatedMetadata.dirty,
            revision: updatedMetadata.revision,
            lastSavedAt: updatedMetadata.lastSavedAt,
          },
          output,
        },
        pretty: `Saved context to ${output.path}`,
      };
    },
    context.sessionId,
  );
}
