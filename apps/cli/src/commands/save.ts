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
import { exportToPath, openSessionDocument } from '../lib/document';
import { syncCollaborativeSessionSnapshot } from '../lib/session-collab';
import type { CommandContext, CommandExecution } from '../lib/types';

type SaveMode = 'review-preserving' | 'final';

function validateSaveMode(
  inPlace: boolean,
  outPath: string | undefined,
  force: boolean,
  mode: string | undefined,
): {
  inPlace: boolean;
  outPath?: string;
  force: boolean;
  mode: SaveMode;
} {
  if (inPlace && outPath) {
    throw new CliError('INVALID_ARGUMENT', 'save: use either --in-place or --out, not both.');
  }

  const resolvedMode = mode === 'final' ? 'final' : 'review-preserving';

  return {
    inPlace,
    outPath,
    force,
    mode: resolvedMode,
  };
}

export async function runSave(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.save', tokens, { commandName: 'save' });

  if (help) {
    return {
      command: 'save',
      data: {
        usage: ['superdoc save [--mode <review-preserving|final>] [--in-place] [--out <path>] [--force]'],
      },
      pretty: [
        'Usage:',
        '  superdoc save [--mode <review-preserving|final>] [--in-place] [--out <path>] [--force]',
      ].join('\n'),
    };
  }

  const mode = validateSaveMode(
    getBooleanOption(parsed, 'in-place'),
    getStringOption(parsed, 'out'),
    getBooleanOption(parsed, 'force'),
    getStringOption(parsed, 'mode'),
  );

  return withActiveContext(
    context.io,
    'save',
    async ({ metadata, paths }) => {
      let effectiveMetadata = metadata;

      // Flush in-memory state to working.docx before copying
      if (context.executionMode === 'host' && context.sessionPool) {
        await context.sessionPool.checkpoint(metadata.contextId);
      } else if (metadata.sessionType === 'collab') {
        // Oneshot collab: sync snapshot the old way
        const opened = await openSessionDocument(paths.workingDocPath, context.io, metadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          sessionPool: context.sessionPool,
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
      if (mode.mode !== 'review-preserving' && isInPlace) {
        throw new CliError(
          'INVALID_ARGUMENT',
          'save: final-mode export requires --out <path>; in-place final export would desynchronize the live session.',
        );
      }

      let output: { path: string; byteLength: number };
      if (mode.mode === 'review-preserving' && isInPlace) {
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
      } else if (mode.mode === 'review-preserving') {
        output = await copyWorkingDocumentToPath(paths, targetPath, mode.force);
      } else {
        const opened = await openSessionDocument(paths.workingDocPath, context.io, effectiveMetadata, {
          sessionId: context.sessionId ?? effectiveMetadata.contextId,
          executionMode: context.executionMode,
          sessionPool: context.sessionPool,
        });
        try {
          output = await exportToPath(opened.editor, targetPath, mode.force, { isFinalDoc: true });
        } finally {
          opened.dispose();
        }

        return {
          command: 'save',
          data: {
            contextId: effectiveMetadata.contextId,
            saved: true,
            inPlace: false,
            mode: mode.mode,
            document: {
              path: effectiveMetadata.sourcePath,
              source: effectiveMetadata.source,
              revision: effectiveMetadata.revision,
            },
            context: {
              dirty: effectiveMetadata.dirty,
              revision: effectiveMetadata.revision,
              lastSavedAt: effectiveMetadata.lastSavedAt,
            },
            output,
          },
          pretty: `Exported final document to ${output.path}`,
        };
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
          mode: mode.mode,
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
    context.executionMode,
  );
}
