import { getBooleanOption, getNumberOption, getStringOption, resolveDocArg, resolveJsonInput } from '../lib/args';
import {
  buildShorthandCollaborationInput,
  parseCollaborationInput,
  resolveCollaborationProfile,
  toPublicCollaborationSummary,
} from '../lib/collaboration';
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
import { loadV2Runtime, openCollaborativeDocument, openDocument, type OpenedRuntimeDocument, EditorPassThroughOptions  } from '../lib/document';
import { CliError } from '../lib/errors';
import { resolvePassword } from '../lib/open-password';
import { parseOperationArgs } from '../lib/operation-args';
import { generateSessionId } from '../lib/session';
import {
  ACCEPTED_RUNTIME_VALUES,
  type CommandContext,
  type CommandExecution,
  type DocumentRuntimeKind,
} from '../lib/types';

const VALID_OVERRIDE_TYPES = new Set(['markdown', 'html', 'text']);
const VALID_ON_MISSING = new Set(['seedFromDoc', 'blank', 'error']);

/**
 * Normalize the `--runtime` value: accepts `'v1' | 'v2'`, treats absence as
 * `'v1'`, and rejects everything else with the named INVALID_RUNTIME error
 * code so consumers can tell client errors apart from engine errors.
 */
function validateRuntime(value: string | undefined, source: 'cli' | 'input' = 'cli'): DocumentRuntimeKind {
  if (value == null || value.length === 0) return 'v1';
  if ((ACCEPTED_RUNTIME_VALUES as readonly string[]).includes(value)) {
    return value as DocumentRuntimeKind;
  }
  throw new CliError(
    'INVALID_RUNTIME',
    `open: --runtime must be one of: ${ACCEPTED_RUNTIME_VALUES.join(', ')}. Got "${value}".`,
    { provided: value, acceptedValues: [...ACCEPTED_RUNTIME_VALUES], source },
  );
}

function normalizeTrackChangesOpenConfig(value: unknown): EditorPassThroughOptions['trackChanges'] | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError('INVALID_ARGUMENT', 'open: trackChanges must be a JSON object.');
  }

  const payload = value as Record<string, unknown>;
  const allowedKeys = new Set(['replacements']);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new CliError('INVALID_ARGUMENT', `open: trackChanges.${key} is not supported.`);
    }
  }

  const replacements = payload.replacements;
  if (replacements == null) return undefined;
  if (replacements === 'paired' || replacements === 'independent') {
    return { replacements };
  }

  throw new CliError('INVALID_ARGUMENT', 'open: trackChanges.replacements must be one of: paired, independent.', {
    provided: replacements,
  });
}

function rejectUnsupportedV2CollaborationProvider(
  runtime: DocumentRuntimeKind,
  collaboration: ReturnType<typeof resolveCollaborationProfile> | undefined,
): void {
  if (runtime !== 'v2' || !collaboration || collaboration.providerType === 'y-websocket') {
    return;
  }

  throw new CliError(
    'CAPABILITY_UNAVAILABLE',
    `open: runtime v2 single-socket collaboration only supports the 'y-websocket' relay; provider '${collaboration.providerType}' is a legacy v1-only transport.`,
    {
      runtime,
      providerType: collaboration.providerType,
      documentId: collaboration.documentId,
    },
  );
}

export async function runOpen(tokens: string[], context: CommandContext): Promise<CommandExecution> {
  const { parsed, args, help } = parseOperationArgs('doc.open', tokens, {
    commandName: 'open',
    extraOptionSpecs: [{ name: 'collaboration-file', type: 'string' }],
  });

  if (help || getBooleanOption(parsed, 'help')) {
    return {
      command: 'open',
      data: {
        usage: [
          'superdoc open [doc] [--session <id>] [--password <password>]',
          'superdoc open [doc] --content-override <content> --override-type <markdown|html|text>',
          'superdoc open [doc] --collaboration-json "{...}" [--session <id>]',
          '',
          'Encrypted documents: use --password or set SUPERDOC_DOC_PASSWORD env var.',
        ],
      },
      pretty: [
        'Usage:',
        '  superdoc open [doc] [--session <id>] [--password <password>]',
        '  superdoc open [doc] --content-override <content> --override-type <markdown|html|text>',
        '  superdoc open [doc] --collaboration-json "{...}" [--session <id>]',
        '',
        'Encrypted documents: use --password or set SUPERDOC_DOC_PASSWORD env var.',
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
  const runtimeArg = getStringOption(parsed, 'runtime');
  const runtime = validateRuntime(runtimeArg, context.argumentSource ?? 'cli');
  const allowEnvFallback = context.executionMode !== 'host';
  const password = resolvePassword(getStringOption(parsed, 'password'), allowEnvFallback);
  const trackChanges = normalizeTrackChangesOpenConfig(args.trackChanges);

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
    collaborationInput = buildShorthandCollaborationInput({
      url: collabUrl,
      documentId: collabDocumentId,
      onMissing,
      bootstrapSettlingMs,
    });
  } else if (collabDocumentId) {
    throw new CliError('MISSING_REQUIRED', 'open: --collab-document-id requires --collab-url.');
  }

  const collaboration = collaborationInput ? resolveCollaborationProfile(collaborationInput, sessionId) : undefined;
  const sessionType = collaboration ? 'collab' : 'local';
  rejectUnsupportedV2CollaborationProvider(runtime, collaboration);

  if (runtime === 'v2' && contentOverride != null) {
    throw new CliError('RUNTIME_V2_UNAVAILABLE', 'open: --content-override is not available in the v2 runtime.', {
      runtime: 'v2',
      feature: 'content-override',
    });
  }

  if (runtime === 'v2' && password != null) {
    throw new CliError(
      'RUNTIME_V2_UNAVAILABLE',
      'open: encrypted DOCX inputs are not yet supported in the v2 runtime.',
      { runtime: 'v2', feature: 'password' },
    );
  }

  if (!collaboration && (onMissing != null || bootstrapSettlingMs != null)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      'open: --on-missing and --bootstrap-settling-ms require collaboration mode (--collaboration-json or --collab-url).',
    );
  }

  // Build user identity when either flag is provided.
  const user = userName != null || userEmail != null ? { name: userName ?? 'CLI', email: userEmail ?? '' } : undefined;

  // Build editor open options from override params and password.
  const editorOpenOptions: EditorPassThroughOptions & Record<string, unknown> = {};
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
  if (password != null) {
    editorOpenOptions.password = password;
  }
  if (trackChanges != null) {
    editorOpenOptions.trackChanges = trackChanges;
    editorOpenOptions.modules = { ...(editorOpenOptions.modules ?? {}), trackChanges };
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

      let opened: OpenedRuntimeDocument & { bootstrap?: unknown };
      if (runtime === 'v2') {
        const v2Module = await loadV2Runtime();
        opened = collaboration
          ? await v2Module.openV2CollaborativeDocument(doc, context.io, collaboration, { editorOpenOptions, user })
          : await v2Module.openV2Document(doc, context.io, { editorOpenOptions, user });
      } else if (collaboration) {
        opened = await openCollaborativeDocument(doc, context.io, collaboration, { editorOpenOptions, user });
      } else {
        opened = await openDocument(doc, context.io, { editorOpenOptions, user });
      }
      const bootstrap = 'bootstrap' in opened ? opened.bootstrap : undefined;
      let adoptedToHostPool = false;
      try {
        await opened.exportToPath(paths.originalDocPath, true, { mode: 'original' });
        await opened.exportToPath(paths.workingDocPath, true);
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
          trackChanges,
          user,
          runtime,
        });

        await writeContextMetadata(paths, metadata);

        // AIDEV-NOTE: the project-global active-session pointer may
        // only be written in oneshot (CLI) mode. Host mode must never
        // touch this file: multiple SDK clients can share one project
        // root, and a write here cross-contaminates their sessions.
        // Mirror the same guard in close.ts when changing this rule.
        if (context.executionMode !== 'host') {
          await setActiveSessionId(metadata.contextId);
        }

        if (context.executionMode === 'host' && context.sessionPool) {
          context.sessionPool.adoptFromOpen(sessionId, opened, {
            runtime: metadata.runtime,
            sessionType: metadata.sessionType,
            workingDocPath: paths.workingDocPath,
            metadataRevision: metadata.revision,
            collaboration: metadata.collaboration,
            trackChanges: metadata.trackChanges,
          });
          adoptedToHostPool = true;
        }

        return {
          command: 'open',
          data: {
            active: true,
            contextId: metadata.contextId,
            runtime: metadata.runtime,
            document: {
              path: metadata.sourcePath,
              source: metadata.source,
              byteLength: opened.meta.byteLength,
              revision: metadata.revision,
            },
            dirty: metadata.dirty,
            sessionType: metadata.sessionType,
            collaboration: metadata.collaboration ? toPublicCollaborationSummary(metadata.collaboration) : undefined,
            bootstrap,
            openedAt: metadata.openedAt,
            updatedAt: metadata.updatedAt,
          },
          pretty: `Opened ${metadata.sourcePath ?? (metadata.source === 'blank' ? '<blank>' : '<stdin>')} in context ${metadata.contextId} (${metadata.sessionType}, runtime ${metadata.runtime})`,
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
