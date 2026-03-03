import { getBooleanOption, getNumberOption, getStringOption, resolveDocArg, resolveJsonInput } from '../lib/args';
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

const VALID_OVERRIDE_TYPES = new Set(['markdown', 'html', 'text']);
const VALID_ON_MISSING = new Set(['seedFromDoc', 'blank', 'error']);

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
          'superdoc open [doc] [--session <id>]',
          'superdoc open [doc] --content-override <content> --override-type <markdown|html|text>',
          'superdoc open [doc] --collaboration-json "{...}" [--session <id>]',
        ],
      },
      pretty: [
        'Usage:',
        '  superdoc open [doc] [--session <id>]',
        '  superdoc open [doc] --content-override <content> --override-type <markdown|html|text>',
        '  superdoc open [doc] --collaboration-json "{...}" [--session <id>]',
      ].join('\n'),
    };
  }

  const { doc } = resolveDocArg(parsed, 'open');

  const sessionId = context.sessionId ?? generateSessionId(doc ?? 'blank');
  const collaborationPayload = await resolveJsonInput(parsed, 'collaboration');
  const collabUrl = getStringOption(parsed, 'collab-url');
  const collabDocumentId = getStringOption(parsed, 'collab-document-id');
  const contentOverride = getStringOption(parsed, 'content-override');
  const overrideType = getStringOption(parsed, 'override-type');
  const onMissing = getStringOption(parsed, 'on-missing');
  const bootstrapSettlingMs = getNumberOption(parsed, 'bootstrap-settling-ms');
  const userName = getStringOption(parsed, 'user-name');
  const userEmail = getStringOption(parsed, 'user-email');

  // Validate contentOverride / overrideType co-requirement.
  // Use != null checks so that intentional empty-string overrides are honored.
  if (contentOverride != null && !overrideType) {
    throw new CliError('INVALID_ARGUMENT', 'open: --content-override requires --override-type.');
  }
  if (overrideType && contentOverride == null) {
    throw new CliError('INVALID_ARGUMENT', 'open: --override-type requires --content-override.');
  }
  if (overrideType && !VALID_OVERRIDE_TYPES.has(overrideType)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `open: --override-type must be one of: markdown, html, text. Got "${overrideType}".`,
    );
  }

  if (onMissing != null && !VALID_ON_MISSING.has(onMissing)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `open: --on-missing must be one of: seedFromDoc, blank, error. Got "${onMissing}".`,
    );
  }

  if (collaborationPayload != null && (collabUrl || collabDocumentId)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'open: do not combine --collaboration-json with --collab-url / --collab-document-id.',
    );
  }

  // Content override is incompatible with collaboration mode
  if (contentOverride != null && (collaborationPayload != null || collabUrl)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'open: --content-override is incompatible with collaboration mode. Content override is a template-initialization operation.',
    );
  }

  let collaborationInput;
  if (collaborationPayload != null) {
    if (typeof collaborationPayload !== 'object' || Array.isArray(collaborationPayload)) {
      throw new CliError('VALIDATION_ERROR', 'open: --collaboration-json must be a JSON object.');
    }
    const payload = collaborationPayload as Record<string, unknown>;
    if (onMissing != null && !('onMissing' in payload)) payload.onMissing = onMissing;
    if (bootstrapSettlingMs != null && !('bootstrapSettlingMs' in payload))
      payload.bootstrapSettlingMs = bootstrapSettlingMs;
    collaborationInput = parseCollaborationInput(payload);
  } else if (collabUrl) {
    collaborationInput = parseCollaborationInput({
      providerType: 'hocuspocus',
      url: collabUrl,
      documentId: collabDocumentId,
      ...(onMissing != null ? { onMissing } : {}),
      ...(bootstrapSettlingMs != null ? { bootstrapSettlingMs } : {}),
    });
  } else if (collabDocumentId) {
    throw new CliError('MISSING_REQUIRED', 'open: --collab-document-id requires --collab-url.');
  }

  const collaboration = collaborationInput ? resolveCollaborationProfile(collaborationInput, sessionId) : undefined;
  const sessionType = collaboration ? 'collab' : 'local';

  if (!collaboration && (onMissing != null || bootstrapSettlingMs != null)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'open: --on-missing and --bootstrap-settling-ms require collaboration mode (--collaboration-json or --collab-url).',
    );
  }

  // Build user identity when either flag is provided.
  const user = userName != null || userEmail != null ? { name: userName ?? 'CLI', email: userEmail ?? '' } : undefined;

  // Build editor open options from override params
  const editorOpenOptions: Record<string, string> = {};
  if (contentOverride != null && overrideType) {
    if (overrideType === 'markdown') {
      editorOpenOptions.markdown = contentOverride;
    } else if (overrideType === 'html') {
      editorOpenOptions.html = contentOverride;
    } else if (overrideType === 'text') {
      // Plain text bypass — handed off to document.ts which builds PM
      // paragraphs directly, preserving all whitespace without markdown parsing.
      editorOpenOptions.plainText = contentOverride;
    }
  }

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
        ? await openCollaborativeDocument(doc, context.io, collaboration, { user })
        : await openDocument(doc, context.io, { editorOpenOptions, user });
      const bootstrap = 'bootstrap' in opened ? opened.bootstrap : undefined;
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
          user,
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
            bootstrap,
            openedAt: metadata.openedAt,
            updatedAt: metadata.updatedAt,
          },
          pretty: `Opened ${metadata.sourcePath ?? (metadata.source === 'blank' ? '<blank>' : '<stdin>')} in context ${metadata.contextId} (${metadata.sessionType})`,
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
