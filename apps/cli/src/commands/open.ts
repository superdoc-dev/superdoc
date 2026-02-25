import { getBooleanOption, getStringOption, requireDocArg, resolveJsonInput } from '../lib/args';
import { parseCollaborationInput, resolveCollaborationProfile } from '../lib/collaboration';
import {
  getProjectRoot,
  createInitialContextMetadata,
  readContextMetadata,
  resolveSourcePathForMetadata,
  setActiveSessionId,
  snapshotSourceFile,
  withContextLock,
  writeContextMetadata,
} from '../lib/context';
import { exportToPath, openCollaborativeDocument, openDocument } from '../lib/document';
import { CliError } from '../lib/errors';
import { parseOperationArgs } from '../lib/operation-args';
import { generateSessionId } from '../lib/session';
import type { CommandContext, CommandExecution } from '../lib/types';

export async function runOpen(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, help } = parseOperationArgs('doc.open', tokens, {
    commandName: 'open',
    extraOptionSpecs: [{ name: 'collaboration-file', type: 'string' }],
  });

  if (help || getBooleanOption(parsed, 'help')) {
    return {
      command: 'open',
      data: {
        usage: [
          'superdoc open <doc> [--session <id>]',
          'superdoc open <doc> --collaboration-json "{...}" [--session <id>]',
        ],
      },
      pretty: [
        'Usage:',
        '  superdoc open <doc> [--session <id>]',
        '  superdoc open <doc> --collaboration-json "{...}" [--session <id>]',
      ].join('\n'),
    };
  }

  const { doc } = requireDocArg(parsed, 'open');

  const sessionId = context.sessionId ?? generateSessionId(doc);
  const collaborationPayload = await resolveJsonInput(parsed, 'collaboration');
  const collabUrl = getStringOption(parsed, 'collab-url');
  const collabDocumentId = getStringOption(parsed, 'collab-document-id');

  if (collaborationPayload != null && (collabUrl || collabDocumentId)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'open: do not combine --collaboration-json with --collab-url / --collab-document-id.',
    );
  }

  let collaborationInput;
  if (collaborationPayload != null) {
    collaborationInput = parseCollaborationInput(collaborationPayload);
  } else if (collabUrl) {
    collaborationInput = parseCollaborationInput({
      providerType: 'hocuspocus',
      url: collabUrl,
      documentId: collabDocumentId,
    });
  } else if (collabDocumentId) {
    throw new CliError('MISSING_REQUIRED', 'open: --collab-document-id requires --collab-url.');
  }

  const collaboration = collaborationInput ? resolveCollaborationProfile(collaborationInput, sessionId) : undefined;
  const sessionType = collaboration ? 'collab' : 'local';

  return withContextLock(
    context.io,
    'open',
    async (paths) => {
      const existing = await readContextMetadata(paths);

      if (existing && existing.projectRoot !== getProjectRoot()) {
        throw new CliError(
          'PROJECT_CONTEXT_MISMATCH',
          'The requested session id belongs to a different project root.',
          {
            sessionId,
            expectedProjectRoot: existing.projectRoot,
            actualProjectRoot: getProjectRoot(),
          },
        );
      }

      if (existing && existing.dirty) {
        throw new CliError(
          'DIRTY_SESSION_EXISTS',
          `Session "${sessionId}" has unsaved changes. Run "superdoc save" or "superdoc close --discard" first.`,
          {
            sessionId,
            revision: existing.revision,
          },
        );
      }

      const opened = collaboration
        ? await openCollaborativeDocument(doc, context.io, collaboration)
        : await openDocument(doc, context.io);
      let adoptedToHostPool = false;
      try {
        const output = await exportToPath(opened.editor, paths.workingDocPath, true);
        const sourcePath =
          opened.meta.source === 'path' && opened.meta.path
            ? resolveSourcePathForMetadata(opened.meta.path)
            : undefined;
        const sourceSnapshot = sourcePath ? await snapshotSourceFile(sourcePath) : undefined;

        const metadata = createInitialContextMetadata(context.io, paths, sessionId, {
          source: opened.meta.source,
          sourcePath,
          sourceSnapshot,
          sessionType,
          collaboration,
        });

        await writeContextMetadata(paths, metadata);
        await setActiveSessionId(metadata.contextId);

        if (collaboration && context.executionMode === 'host' && context.collabSessionPool) {
          await context.collabSessionPool.adoptFromOpen(sessionId, opened, metadata, context.io);
          adoptedToHostPool = true;
        }

        return {
          command: 'open',
          data: {
            active: true,
            contextId: metadata.contextId,
            document: {
              path: metadata.sourcePath,
              source: metadata.source,
              byteLength: output.byteLength,
              revision: metadata.revision,
            },
            dirty: metadata.dirty,
            sessionType: metadata.sessionType,
            collaboration: metadata.collaboration,
            openedAt: metadata.openedAt,
            updatedAt: metadata.updatedAt,
          },
          pretty: `Opened ${metadata.sourcePath ?? '<stdin>'} in context ${metadata.contextId} (${metadata.sessionType})`,
        };
      } finally {
        if (!adoptedToHostPool) {
          opened.dispose();
        }
      }
    },
    undefined,
    sessionId,
  );
}
