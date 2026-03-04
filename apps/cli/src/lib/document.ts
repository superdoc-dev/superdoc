import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Editor } from 'superdoc/super-editor';
import { BLANK_DOCX_BASE64 } from '@superdoc/super-editor/blank-docx';
import { getDocumentApiAdapters } from '@superdoc/super-editor/document-api-adapters';
import { markdownToPmDoc } from '@superdoc/super-editor/markdown';

import { createDocumentApi, type DocumentApi } from '@superdoc/document-api';
import { createCliDomEnvironment } from './dom-environment';
import type { CollaborationProfile } from './collaboration';
import { createCollaborationRuntime } from './collaboration';
import {
  DEFAULT_BOOTSTRAP_SETTLING_MS,
  detectRoomState,
  resolveBootstrapDecision,
  claimBootstrap,
  writeBootstrapMarker,
  detectBootstrapRace,
  type RoomState,
  type ObservedCompetitor,
  type RaceDetectionResult,
} from './bootstrap';
import { CliError } from './errors';
import { pathExists } from './guards';
import type { ContextMetadata } from './context';
import type { CliIO, DocumentSourceMeta, ExecutionMode, UserIdentity } from './types';
import type { SessionPool } from '../host/session-pool';

export type EditorWithDoc = Editor & {
  doc: DocumentApi;
};

export interface OpenedDocument {
  editor: EditorWithDoc;
  meta: DocumentSourceMeta;
  dispose(): void;
}

/** Content override options extracted before calling Editor.open(). */
interface ContentOverrideOptions {
  markdown?: string;
  html?: string;
  plainText?: string;
}

/** Options passed through to Editor.open() alongside content overrides. */
type EditorPassThroughOptions = Record<string, string>;

interface OpenDocumentOptions {
  documentId?: string;
  ydoc?: unknown;
  collaborationProvider?: unknown;
  /** Options passed through to Editor.open() (e.g., markdown/html/plainText for content override). */
  editorOpenOptions?: ContentOverrideOptions & EditorPassThroughOptions;
  /** When set, overrides Editor's auto-detected isNewFile flag. */
  isNewFile?: boolean;
  /** Optional user identity for attribution (comments, tracked changes, collaboration presence). */
  user?: UserIdentity;
}

export interface FileOutputMeta {
  path: string;
  byteLength: number;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  throw new CliError('DOCUMENT_EXPORT_FAILED', 'Exported document data is not binary.');
}

async function readDocumentSource(doc: string, io: CliIO): Promise<{ bytes: Uint8Array; meta: DocumentSourceMeta }> {
  if (doc === '-') {
    const bytes = await io.readStdinBytes();
    if (bytes.byteLength === 0) {
      throw new CliError('MISSING_REQUIRED', 'No DOCX bytes were provided on stdin.');
    }

    return {
      bytes,
      meta: {
        source: 'stdin',
        byteLength: bytes.byteLength,
      },
    };
  }

  let bytes: Uint8Array;
  try {
    const raw = await readFile(doc);
    bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('FILE_READ_ERROR', `Unable to read document: ${doc}`, {
      message,
    });
  }

  return {
    bytes,
    meta: {
      source: 'path',
      path: doc,
      byteLength: bytes.byteLength,
    },
  };
}

export async function openDocument(
  doc: string | undefined,
  io: CliIO,
  options: OpenDocumentOptions = {},
): Promise<OpenedDocument> {
  let source: Uint8Array;
  let meta: DocumentSourceMeta;

  if (doc != null) {
    const result = await readDocumentSource(doc, io);
    source = result.bytes;
    meta = result.meta;
  } else {
    source = Buffer.from(BLANK_DOCX_BASE64, 'base64');
    meta = { source: 'blank', byteLength: source.byteLength };
  }

  // Separate content overrides from options passed to Editor.open().
  // Markdown and plainText are applied post-init (DOM-free AST pipelines).
  // HTML passes through to Editor.open() directly — the CLI-provided happy-dom
  // document enables the Editor's built-in HTML init path.
  const {
    markdown: markdownOverride,
    html: htmlOverride,
    plainText: plainTextOverride,
    ...passThroughEditorOpts
  } = options.editorOpenOptions ?? {};

  // Create a DOM environment for headless HTML support (getHtml, insert HTML,
  // HTML content override). Always inject via options.document — never set globals.
  const domEnv = createCliDomEnvironment();

  let editor: Editor;
  try {
    const isTest = process.env.NODE_ENV === 'test';
    editor = await Editor.open(Buffer.from(source), {
      documentId: options.documentId ?? meta.path ?? 'blank.docx',
      document: domEnv.document,
      user: options.user
        ? { name: options.user.name, email: options.user.email, image: null }
        : { id: 'cli', name: 'CLI' },
      ...(isTest ? { telemetry: { enabled: false } } : {}),
      ydoc: options.ydoc,
      ...(options.collaborationProvider != null ? { collaborationProvider: options.collaborationProvider } : {}),
      ...(options.isNewFile != null ? { isNewFile: options.isNewFile } : {}),
      // Pass through HTML override directly — happy-dom provides DOM support.
      ...(htmlOverride != null ? { html: htmlOverride } : {}),
      ...passThroughEditorOpts,
    });
  } catch (error) {
    domEnv.dispose();
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('DOCUMENT_OPEN_FAILED', 'Failed to open document.', {
      message,
      source: meta,
    });
  }

  // Apply content override post-init.
  //   - markdown: DOM-free AST pipeline
  //   - plainText: builds PM paragraphs directly, preserving all whitespace
  if (markdownOverride != null) {
    try {
      const { doc: newDoc } = markdownToPmDoc(markdownOverride, editor);
      const tr = editor.state.tr;
      // The PM Fragment type is opaque at the CLI boundary — cast through unknown.
      tr.replaceWith(0, editor.state.doc.content.size, newDoc.content as any);
      editor.dispatch(tr);
    } catch (error) {
      editor.destroy();
      domEnv.dispose();
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError('DOCUMENT_OPEN_FAILED', 'Failed to apply content override.', {
        message,
        source: meta,
      });
    }
  } else if (plainTextOverride != null) {
    try {
      const schema = editor.state.schema;
      const lines = plainTextOverride.split('\n');
      const paragraphs = lines.map((line) => {
        const content = line.length > 0 ? [schema.text(line)] : undefined;
        return schema.nodes.paragraph.create(null, content);
      });
      const tr = editor.state.tr;
      tr.replaceWith(0, editor.state.doc.content.size, paragraphs);
      editor.dispatch(tr);
    } catch (error) {
      editor.destroy();
      domEnv.dispose();
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError('DOCUMENT_OPEN_FAILED', 'Failed to apply text content override.', {
        message,
        source: meta,
      });
    }
  }

  const adapters = getDocumentApiAdapters(editor);
  const docApi = createDocumentApi(adapters);
  Object.defineProperty(editor, 'doc', { value: docApi, configurable: true, writable: true });
  const editorWithDoc = editor as EditorWithDoc;

  return {
    editor: editorWithDoc,
    meta,
    dispose() {
      editor.destroy();
      domEnv.dispose();
    },
  };
}

/**
 * Describes the outcome of the bootstrap flow for a collaborative document.
 *
 * `raceSuspected` is a best-effort signal — when true, a competing finalized
 * marker was observed shortly after seeding, strongly suggesting (but not
 * proving) that two clients both seeded. `false` does not guarantee
 * exactly-once seeding.
 */
export type BootstrapResult = {
  roomState: RoomState;
  bootstrapApplied: boolean;
  bootstrapSource?: 'doc' | 'blank';
  raceSuspected?: boolean;
  raceCompetitor?: ObservedCompetitor;
};

export async function openCollaborativeDocument(
  doc: string | undefined,
  io: CliIO,
  profile: CollaborationProfile,
  options: { user?: UserIdentity } = {},
): Promise<OpenedDocument & { bootstrap?: BootstrapResult }> {
  const runtime = createCollaborationRuntime(profile);

  try {
    await runtime.waitForSync();

    const onMissing = profile.onMissing ?? 'seedFromDoc';
    let finalRoomState = detectRoomState(runtime.ydoc);
    let decision = resolveBootstrapDecision(finalRoomState, onMissing, doc != null);

    if (decision.action === 'seed') {
      const claim = await claimBootstrap(runtime.ydoc, profile.bootstrapSettlingMs ?? DEFAULT_BOOTSTRAP_SETTLING_MS);
      if (!claim.granted) {
        // Another client won the claim race — unconditionally yield.
        // Even if the winner's marker is still pending (detectRoomState
        // returns 'empty'), the winner will finalize shortly.  Re-seeding
        // here would produce a dual-seed race.
        finalRoomState = detectRoomState(runtime.ydoc);
        decision = { action: 'join' };
      }
    }

    if (decision.action === 'error') {
      throw new CliError('COLLABORATION_ROOM_EMPTY', decision.reason);
    }

    const shouldSeed = decision.action === 'seed';
    // When joining an existing room, skip local doc reading — content
    // comes from the Yjs document, not from the local file path.
    const docForEditor = shouldSeed ? doc : undefined;
    const opened = await openDocument(docForEditor, io, {
      documentId: profile.documentId,
      ydoc: runtime.ydoc,
      collaborationProvider: runtime.provider,
      isNewFile: shouldSeed,
      user: options.user,
    });

    let raceDetection: RaceDetectionResult | undefined;
    if (shouldSeed) {
      writeBootstrapMarker(runtime.ydoc, decision.source);
      raceDetection = await detectBootstrapRace(runtime.ydoc);
    }

    const bootstrap: BootstrapResult = {
      roomState: finalRoomState,
      bootstrapApplied: shouldSeed,
      bootstrapSource: shouldSeed ? decision.source : undefined,
      raceSuspected: raceDetection?.raceSuspected,
      raceCompetitor: raceDetection?.raceSuspected ? raceDetection.competitor : undefined,
    };
    return {
      editor: opened.editor,
      meta: opened.meta,
      bootstrap,
      dispose() {
        try {
          opened.dispose();
        } finally {
          runtime.dispose();
        }
      },
    };
  } catch (error) {
    runtime.dispose();
    throw error;
  }
}

export async function openSessionDocument(
  doc: string,
  io: CliIO,
  metadata: Pick<
    ContextMetadata,
    'contextId' | 'sessionType' | 'collaboration' | 'sourcePath' | 'workingDocPath' | 'user' | 'revision'
  >,
  options: {
    sessionId?: string;
    executionMode?: ExecutionMode;
    sessionPool?: SessionPool;
  } = {},
): Promise<OpenedDocument> {
  const { executionMode, sessionPool, sessionId } = options;

  // Host mode: always go through pool (local AND collab)
  if (executionMode === 'host' && sessionPool) {
    const resolvedSessionId = sessionId ?? metadata.contextId;
    return sessionPool.acquire(
      resolvedSessionId,
      {
        sessionType: metadata.sessionType,
        workingDocPath: metadata.workingDocPath ?? doc,
        metadataRevision: metadata.revision,
        user: metadata.user,
        collaboration: metadata.collaboration,
      },
      io,
    );
  }

  // Oneshot mode: open fresh, caller is responsible for dispose
  if (metadata.sessionType === 'collab') {
    if (!metadata.collaboration) {
      throw new CliError('COMMAND_FAILED', 'Session is marked as collaborative but has no collaboration profile.');
    }
    return openCollaborativeDocument(doc, io, metadata.collaboration, { user: metadata.user });
  }

  return openDocument(doc, io, { user: metadata.user });
}

export async function getFileChecksum(path: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    const data = await readFile(path);
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('FILE_READ_ERROR', `Failed to read file checksum: ${path}`, {
      message,
    });
  }

  return createHash('sha256').update(bytes).digest('hex');
}

export async function exportToPath(editor: Editor, outputPath: string, force = false): Promise<FileOutputMeta> {
  const exists = await pathExists(outputPath);
  if (exists && !force) {
    throw new CliError('OUTPUT_EXISTS', `Output path already exists: ${outputPath}`, {
      path: outputPath,
      hint: 'Use --force to overwrite.',
    });
  }

  let exported: unknown;
  try {
    exported = await editor.exportDocument();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('DOCUMENT_EXPORT_FAILED', 'Failed to export document.', {
      message,
    });
  }

  const bytes = toUint8Array(exported);

  try {
    await writeFile(outputPath, bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('FILE_WRITE_ERROR', `Failed to write output file: ${outputPath}`, {
      message,
    });
  }

  return {
    path: outputPath,
    byteLength: bytes.byteLength,
  };
}
