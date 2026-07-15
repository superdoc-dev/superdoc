import { access, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, basename } from 'node:path';
import {
  BLANK_DOCX_BASE64,
  Editor,
  getDocumentApiAdapters,
  getStarterExtensions,
  onCollaborationProviderSynced,
} from 'superdoc/super-editor';
import type { CollaborationProvider } from 'superdoc/super-editor';
import { createDocumentApi, type DocumentApi } from '@superdoc/document-api';
import { Doc as YDoc } from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface Session {
  id: string;
  filePath: string | null;
  editor: Editor;
  api: DocumentApi;
  openedAt: number;
  provider?: WebsocketProvider;
}

export interface OpenRoomOptions {
  /**
   * Factory for the collaboration provider, given the room's Yjs doc. Defaults to
   * a real `y-websocket` `WebsocketProvider`. Injected in tests with a stub so the
   * sync / timeout / presence orchestration can be exercised without a live socket.
   */
  createProvider?: (ydoc: YDoc) => WebsocketProvider | Promise<WebsocketProvider>;
  /** Milliseconds to await initial sync before rejecting. Default 10000. */
  syncTimeoutMs?: number;
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
      telemetry: {
        enabled: false,
        metadata: {
          source: 'superdoc-mcp',
        },
      },
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

  async openRoom(
    wsUrl: string,
    documentId: string,
    token?: string,
    user?: AttachUser,
    opts: OpenRoomOptions = {},
  ): Promise<Session> {
    const ydoc = new YDoc({ gc: false });
    const syncTimeoutMs = opts.syncTimeoutMs ?? 10_000;

    const createProvider =
      opts.createProvider ??
      (async (doc: YDoc) => {
        // y-websocket needs a WebSocket constructor; Node has no global one, so supply `ws`.
        const { default: WebSocket } = await import('ws');
        // Auth token is passed as a `params` query entry — the same mechanism SuperDoc's
        // own y-websocket provider uses (createSuperDocProvider in
        // packages/superdoc/src/core/collaboration/collaboration.js). The y-websocket
        // protocol has no header channel, so the token rides the connect URL.
        return new WebsocketProvider(wsUrl, documentId, doc, {
          WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
          params: token ? { token } : {},
        });
      });

    const provider = await createProvider(ydoc);

    // Presence: advertise the attach in the room's awareness so collaborators see
    // who is suggesting changes (SuperDoc surfaces `awareness.user` via
    // awarenessStatesToArray → the participant list; color is assigned on the
    // viewer's side from its palette, so id/name/email is enough here). Only the
    // `user` field is broadcast — the attach editor is built without
    // `collaborationProvider`, so CollaborationCursor stays inert and no cursor is
    // published. A "follow the agent" cursor is deliberately out of scope: a
    // headless agent's ProseMirror selection jumps per mutation, so echoing it raw
    // would teleport the caret rather than signal the region under review; a
    // meaningful cursor needs curated/throttled position broadcasting. See PR.
    if (user) {
      provider.awareness.setLocalStateField('user', user);
    }

    // Await initial sync before editor construction so the fragment is populated.
    // Delegate to the codebase's canonical sync waiter (onCollaborationProviderSynced):
    // it pre-checks an already-synced provider, listens to BOTH `sync(boolean)` and the
    // no-arg `synced` event, reads `synced`/`isSynced`, and re-checks after wiring to
    // close the register-after-sync race. The previous `sync`-only wait handled none of
    // these — adequate for the default WebsocketProvider (whose `sync(true)` is strictly
    // async, fired from `websocket.onmessage` after registration), but the `createProvider`
    // seam admits alternate providers (pooled/already-synced, or `synced`-only emitters)
    // that the bespoke wait would hang on until a spurious timeout.
    await new Promise<void>((resolve, reject) => {
      let cleanup = () => {};
      const timeout = setTimeout(() => {
        cleanup();
        provider.destroy();
        reject(new Error(`sync timeout (${syncTimeoutMs}ms)`));
      }, syncTimeoutMs);
      // If the provider is already synced, this invokes the callback synchronously
      // (before `cleanup` is reassigned) — `timeout` is already set, so it's cleared.
      cleanup = onCollaborationProviderSynced(provider as unknown as CollaborationProvider, () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Post-sync construction can throw (buildAttachEditor's `loadXmlData!` non-null
    // assertion, an adapter error). Without this guard, the now-synced provider — a live
    // socket plus `_checkInterval`/`_resyncInterval` timers and a `process.on('exit')`
    // handler — would leak: it's neither stored on a session nor destroyed (only the
    // timeout path above tore it down). Destroy before rethrowing so a failed openRoom
    // leaves nothing live. Applies to the default provider too, not just injected ones.
    try {
      const editor = await buildAttachEditor(ydoc, documentId, user);

      const adapters = getDocumentApiAdapters(editor);
      const api = createDocumentApi(adapters);

      const id = generateRoomSessionId(documentId);

      const session: Session = {
        id,
        filePath: null,
        editor,
        api,
        openedAt: Date.now(),
        provider,
      };

      this.sessions.set(id, session);
      return session;
    } catch (err) {
      provider.destroy();
      throw err;
    }
  }

  async save(sessionId: string, outputPath?: string): Promise<{ path: string; byteLength: number }> {
    const session = this.get(sessionId);
    if (!outputPath && !session.filePath) {
      throw new Error('Cannot save a room session without specifying an output path.');
    }
    const targetPath = outputPath ? resolve(outputPath) : resolve(session.filePath!);

    const exported = await session.editor.exportDocument();
    const bytes = await toBytes(exported);

    await writeFile(targetPath, bytes);

    return { path: targetPath, byteLength: bytes.byteLength };
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.provider?.destroy();
    session.editor.destroy();
    this.sessions.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.provider?.destroy();
      session.editor.destroy();
    }
    this.sessions.clear();
  }

  list(): Array<{ id: string; filePath: string | null; openedAt: number }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      filePath: s.filePath,
      openedAt: s.openedAt,
    }));
  }
}

/** Identity for attributing tracked changes authored over a collab attach. */
export interface AttachUser {
  id?: string;
  name?: string;
  email?: string;
}

/**
 * Build the headless Editor for a collaborative attach session.
 *
 * The document body arrives via the Yjs fragment (`ydoc`); `content` only seeds
 * the base OOXML parts (`converter.convertedXml`) that `Editor.exportDocx` derefs
 * on save. A bare `content: []` leaves those parts empty, so export throws and the
 * swallowing catch returns `undefined` ("not binary (got undefined)"). Seeding the
 * blank-docx template gives export valid scaffolding while Yjs still drives the body
 * (Editor only seeds the initial PM doc from `content` when no `ydoc` is present).
 *
 * An optional `user` configures the tracked-change author so an MCP client can
 * author attributable tracked (suggested) edits over the attach; without it,
 * `forceTrackChanges` rejects tracked edits. The file-open path (`open`) already
 * sets a default user; this brings the attach path to parity.
 */
export async function buildAttachEditor(ydoc: YDoc, documentId: string, user?: AttachUser): Promise<Editor> {
  const blankBytes = Buffer.from(BLANK_DOCX_BASE64, 'base64');
  const [content, , mediaFiles, fonts] = (await Editor.loadXmlData(blankBytes, true))!;

  return new Editor({
    isHeadless: true,
    mode: 'docx',
    documentId,
    extensions: getStarterExtensions(),
    ydoc,
    content,
    mediaFiles,
    fonts,
    fileSource: blankBytes,
    // Without a user, `forceTrackChanges` rejects tracked edits. Supplying one
    // lets the caller author attributable tracked changes over the attach.
    ...(user ? { user } : {}),
  });
}

function generateRoomSessionId(documentId: string): string {
  const stem = documentId.replace(/\//g, '-').replace(/[^a-zA-Z0-9._-]+/g, '-') || 'room';
  const normalized =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[._-]+|[._-]+$/g, '') || 'room';
  const suffix = randomBytes(4).toString('hex').slice(0, 6);
  return `room-${normalized.slice(0, 50)}-${suffix}`;
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

async function toBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // Blob (incl. cross-realm/polyfilled instances where `instanceof Blob` is false): duck-type
  // on arrayBuffer(). Headless/collab exportDocument() returns a Blob.
  if (data && typeof (data as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
    return new Uint8Array(await (data as Blob).arrayBuffer());
  }
  const desc = data == null ? String(data) : `${typeof data}/${(data as object).constructor?.name ?? 'unknown'}`;
  throw new Error(`Exported document data is not binary (got ${desc}).`);
}
