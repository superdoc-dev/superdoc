import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Editor } from 'superdoc/super-editor';
import { getDocumentApiAdapters } from '@superdoc/super-editor/document-api-adapters';

import { createDocumentApi, type DocumentApi } from '@superdoc/document-api';
import type { CollaborationProfile } from './collaboration';
import { createCollaborationRuntime } from './collaboration';
import { CliError } from './errors';
import { pathExists } from './guards';
import type { ContextMetadata } from './context';
import type { CliIO, DocumentSourceMeta, ExecutionMode } from './types';
import type { CollaborationSessionPool } from '../host/collab-session-pool';

export type EditorWithDoc = Editor & {
  doc: DocumentApi;
};

export interface OpenedDocument {
  editor: EditorWithDoc;
  meta: DocumentSourceMeta;
  dispose(): void;
}

interface OpenDocumentOptions {
  documentId?: string;
  ydoc?: unknown;
  collaborationProvider?: unknown;
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

export async function openDocument(doc: string, io: CliIO, options: OpenDocumentOptions = {}): Promise<OpenedDocument> {
  const { bytes, meta } = await readDocumentSource(doc, io);

  let editor: Editor;
  try {
    const isTest = process.env.NODE_ENV === 'test';
    editor = await Editor.open(Buffer.from(bytes), {
      documentId: options.documentId ?? meta.path ?? 'stdin.docx',
      user: { id: 'cli', name: 'CLI' },
      ...(isTest ? { telemetry: { enabled: false } } : {}),
      ydoc: options.ydoc,
      ...(options.collaborationProvider != null ? { collaborationProvider: options.collaborationProvider } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError('DOCUMENT_OPEN_FAILED', 'Failed to open document.', {
      message,
      source: meta,
    });
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
    },
  };
}

export async function openCollaborativeDocument(
  doc: string,
  io: CliIO,
  profile: CollaborationProfile,
): Promise<OpenedDocument> {
  const runtime = createCollaborationRuntime(profile);

  try {
    await runtime.waitForSync();
    const opened = await openDocument(doc, io, {
      documentId: profile.documentId,
      ydoc: runtime.ydoc,
      collaborationProvider: runtime.provider,
    });

    return {
      editor: opened.editor,
      meta: opened.meta,
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
  metadata: Pick<ContextMetadata, 'contextId' | 'sessionType' | 'collaboration' | 'sourcePath' | 'workingDocPath'>,
  options: {
    sessionId?: string;
    executionMode?: ExecutionMode;
    collabSessionPool?: CollaborationSessionPool;
  } = {},
): Promise<OpenedDocument> {
  if (metadata.sessionType !== 'collab') {
    return openDocument(doc, io);
  }

  if (!metadata.collaboration) {
    throw new CliError('COMMAND_FAILED', 'Session is marked as collaborative but has no collaboration profile.');
  }

  if (options.executionMode === 'host' && options.collabSessionPool) {
    const sessionId = options.sessionId ?? metadata.contextId;
    if (!sessionId) {
      throw new CliError('COMMAND_FAILED', 'Session id is required for host-mode collaboration operations.');
    }

    const metadataForPool = {
      contextId: sessionId,
      sessionType: metadata.sessionType,
      collaboration: metadata.collaboration,
      sourcePath: metadata.sourcePath,
      workingDocPath: metadata.workingDocPath,
    };

    return options.collabSessionPool.acquire(sessionId, doc, metadataForPool, io);
  }

  return openCollaborativeDocument(doc, io, metadata.collaboration);
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
