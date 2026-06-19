import { getBooleanOption, getStringOption } from '../lib/args';
import { CliError } from '../lib/errors';
import { parseOperationArgs } from '../lib/operation-args';
import {
  copyOriginalDocumentToPath,
  copyWorkingDocumentToPath,
  detectSourceDrift,
  markContextUpdated,
  resolveSourcePathForMetadata,
  snapshotSourceFile,
  withActiveContext,
  writeContextMetadata,
} from '../lib/context';
import { openSessionDocument } from '../lib/document';
import { syncCollaborativeSessionSnapshotFromOpened } from '../lib/session-collab';
import type { RuntimeExportMode, RuntimeFileExportMeta } from '../lib/document';
import type { CommandContext, CommandExecution } from '../lib/types';

const EXPORT_MODES = new Set<RuntimeExportMode>(['review-preserving', 'final', 'original']);

function validateSaveMode(
  inPlace: boolean,
  outPath: string | undefined,
  force: boolean,
  mode: string | undefined,
): {
  inPlace: boolean;
  outPath?: string;
  force: boolean;
  mode: RuntimeExportMode;
  explicitMode: boolean;
} {
  if (inPlace && outPath) {
    throw new CliError('INVALID_ARGUMENT', 'save: use either --in-place or --out, not both.');
  }

  if (mode != null && !EXPORT_MODES.has(mode as RuntimeExportMode)) {
    throw new CliError('INVALID_INPUT', `save: invalid export mode "${mode}".`, {
      mode,
      allowedModes: Array.from(EXPORT_MODES),
    });
  }

  return {
    inPlace,
    outPath,
    force,
    mode: (mode as RuntimeExportMode | undefined) ?? 'review-preserving',
    explicitMode: mode != null,
  };
}

export async function runSave(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.save', tokens, { commandName: 'save' });

  if (help) {
    return {
      command: 'save',
      data: {
        usage: ['superdoc save [--mode <review-preserving|final|original>] [--in-place] [--out <path>] [--force]'],
      },
      pretty: [
        'Usage:',
        '  superdoc save [--mode <review-preserving|final|original>] [--in-place] [--out <path>] [--force]',
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
          const synced = await syncCollaborativeSessionSnapshotFromOpened(context.io, metadata, paths, opened);
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
          'save: non-review-preserving export requires --out <path>; in-place export would desynchronize the live session.',
        );
      }

      const exportCurrentSessionToPath = async (outputPath: string, force: boolean): Promise<RuntimeFileExportMeta> => {
        const opened = await openSessionDocument(paths.workingDocPath, context.io, effectiveMetadata, {
          sessionId: context.sessionId ?? metadata.contextId,
          executionMode: context.executionMode,
          sessionPool: context.sessionPool,
        });
        try {
          return await opened.exportToPath(outputPath, force, { mode: mode.mode });
        } finally {
          opened.dispose();
        }
      };

      const copyReviewPreservingSessionToPath = async (
        outputPath: string,
        force: boolean,
      ): Promise<RuntimeFileExportMeta> => {
        const output = await copyWorkingDocumentToPath(paths, outputPath, force);
        return mode.explicitMode
          ? {
              ...output,
              mode: 'review-preserving',
              report: { warnings: [] },
            }
          : output;
      };

      let output: RuntimeFileExportMeta;
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

        output = await copyReviewPreservingSessionToPath(sourcePath!, true);
      } else if (mode.mode === 'review-preserving') {
        output = await copyReviewPreservingSessionToPath(targetPath, mode.force);
      } else if (mode.mode === 'original') {
        output = {
          ...(await copyOriginalDocumentToPath(paths, targetPath, mode.force)),
          mode: 'original',
          report: { warnings: [] },
        };

        return {
          command: 'save',
          data: {
            contextId: effectiveMetadata.contextId,
            saved: true,
            inPlace: false,
            runtime: effectiveMetadata.runtime,
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
            report: output.report ?? { warnings: [] },
          },
          pretty: `Exported ${mode.mode} document to ${output.path}`,
        };
      } else {
        output = await exportCurrentSessionToPath(targetPath, mode.force);

        return {
          command: 'save',
          data: {
            contextId: effectiveMetadata.contextId,
            saved: true,
            inPlace: false,
            runtime: effectiveMetadata.runtime,
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
            report: output.report ?? { warnings: [] },
          },
          pretty: `Exported ${mode.mode} document to ${output.path}`,
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
          runtime: updatedMetadata.runtime,
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
          mode: mode.explicitMode ? mode.mode : output.mode,
          report: mode.explicitMode ? (output.report ?? { warnings: [] }) : output.report,
        },
        pretty: `Saved context to ${output.path}`,
      };
    },
    context.sessionId,
    context.executionMode,
  );
}
