import { readFile, writeFile, access  } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { Editor } from 'superdoc/super-editor';
import { getDocumentApiAdapters } from '@superdoc/super-editor/document-api-adapters';
import { createDocumentApi, type DocumentApi } from '@superdoc/document-api';
import { BLANK_DOCX_BASE64 } from '@superdoc/super-editor/blank-docx';

export interface Session {
  id: string;
  filePath: string;
  editor: Editor;
  api: DocumentApi;
  openedAt: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  async open(filePath: string): Promise<Session> {
    const absolutePath = resolve(filePath);

    let bytes: Buffer;

    try {
      await access(absolutePath);
      bytes = await readFile(absolutePath);
    } catch {
      // File doesn't exist — create a blank document from the built-in template
      bytes = Buffer.from(BLANK_DOCX_BASE64, 'base64');
    }

    const editor = await Editor.open(bytes, {
      documentId: absolutePath,
      user: { id: 'mcp', name: 'MCP Server' },
    });

    const adapters = getDocumentApiAdapters(editor);
    const api = createDocumentApi(adapters);

    const id = generateSessionId(absolutePath);

    const session: Session = {
      id,
      filePath: absolutePath,
      editor,
      api,
      openedAt: Date.now(),
    };

    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No open session with id "${sessionId}". Use superdoc_open first.`);
    }
    return session;
  }

  async save(sessionId: string, outputPath?: string): Promise<{ path: string; byteLength: number }> {
    const session = this.get(sessionId);
    const targetPath = outputPath ? resolve(outputPath) : session.filePath;

    const exported = await session.editor.exportDocument();
    const bytes = toUint8Array(exported);

    await writeFile(targetPath, bytes);

    return { path: targetPath, byteLength: bytes.byteLength };
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.editor.destroy();
    this.sessions.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.editor.destroy();
    }
    this.sessions.clear();
  }

  list(): Array<{ id: string; filePath: string; openedAt: number }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      filePath: s.filePath,
      openedAt: s.openedAt,
    }));
  }
}

function generateSessionId(filePath: string): string {
  const stem = basename(filePath).replace(/\.[^.]+$/, '');
  const normalized =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '') || 'session';
  const suffix = randomBytes(4).toString('hex').slice(0, 6);
  return `${normalized.slice(0, 57)}-${suffix}`;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error('Exported document data is not binary.');
}
