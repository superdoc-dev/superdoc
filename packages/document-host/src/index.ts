/**
 * @superdoc/document-host
 *
 * Neutral, headless structured document session over the SuperDoc engine.
 * Open a `.docx`, dispatch operations directly by `operationId` via
 * `document-api.invoke`, and export `.docx` bytes. No CLI argv, no agent
 * vocabulary - that lives in the labs agent runtime, which consumes this.
 *
 * Distilled from `apps/cli/src/lib/document.ts` (the existing headless
 * assembly), with CLI-specific types and stdin removed. Collaboration provider
 * construction stays caller-owned; callers can inject an already-created
 * Y.Doc and provider binding when they need a live collaborative session.
 */

import {
  Editor,
  BLANK_DOCX_BASE64,
  getDocumentApiAdapters,
  initPartsRuntime,
  encodeCollaborationCursorFromSelectionTarget,
  type CollaborationProvider,
} from 'superdoc/super-editor';
import { createDocumentApi, type DocumentApi, type SelectionTarget } from '@superdoc/document-api';
import { Window } from 'happy-dom';
import { isMutatingInvoke } from './dirty';

/** Identity published to collaboration awareness (provider-agnostic shape). */
export interface PresenceProfile {
  id?: string;
  name?: string;
  color?: string;
  [key: string]: unknown;
}

/** A transient activity status published to awareness (generic; no agent vocabulary). */
export interface PresenceStatus {
  state: string;
  label?: string | null;
}

/**
 * Collaboration presence surface. Publishes user / status / selection to the
 * caller-injected provider's awareness. The engine owns the ProseMirror/Yjs
 * selection encoding (`setSelection` takes a Document API `SelectionTarget`,
 * never raw editor positions). Every method throws a clear error if the session
 * was opened without a collaboration provider exposing
 * `awareness.setLocalStateField`, or after the session is closed.
 */
export interface PresenceHandle {
  /** Publish the local participant identity (awareness `user`). */
  setUser(profile: PresenceProfile): void;
  /** Publish a transient activity status (awareness `status`). */
  setStatus(status: PresenceStatus): void;
  /** Clear the activity status (awareness `status` -> null). */
  clearStatus(): void;
  /** Publish the local selection/caret as a collaboration cursor (awareness `cursor`). */
  setSelection(target: SelectionTarget): void;
  /** Clear the collaboration cursor (awareness `cursor` -> null). */
  clearSelection(): void;
}

/** A live, headless document session bound to one open `.docx`. */
export interface DocumentSession {
  /**
   * Dispatch a structured operation directly against the engine.
   * Mirrors `editor.doc.invoke({ operationId, input, options })`.
   */
  invoke(operationId: string, input?: unknown, options?: unknown): Promise<unknown>;
  /** Serialize current document state to `.docx` bytes. */
  export(): Promise<Uint8Array>;
  /** Release the editor and DOM environment. Idempotent. */
  close(): void;
  /** Collaboration presence (user / status / selection) over the injected provider's awareness. */
  presence: PresenceHandle;
}

export interface OpenOptions {
  /** Logical id used by the engine; defaults to `document.docx`. */
  documentId?: string;
  /**
   * Per-session author identity attributed to tracked changes and comments.
   * Takes precedence over the `SUPERDOC_DOC_AUTHOR(_ID)` env vars, which in turn
   * fall back to the headless host default. Omit it to keep env/default behavior.
   */
  user?: { id?: string; name?: string };
  /**
   * Optional collaboration binding, created and owned by the caller. The host
   * forwards `ydoc` and `collaborationProvider` to the engine; it never
   * constructs, configures, or bundles a provider package (Hocuspocus,
   * Liveblocks, y-websocket, and the like).
   *
   * Contract:
   * - The caller builds the Y.Doc and provider and syncs the provider before
   *   opening; the host does not wait for provider sync.
   * - The Y.Doc is authoritative for content: when a binding is passed the
   *   engine hydrates from the Y.Doc and ignores the opened docx body. Seeding
   *   a new room from a docx (isNewFile/bootstrap) is out of scope here.
   * - The binding is session-owned once passed in: close() runs the engine's
   *   collaboration teardown, which disconnects the provider and destroys the
   *   Y.Doc, so callers must not reuse the Y.Doc or provider after close().
   * - Provider sync, remote-change events, and reconnect policy are out of
   *   scope here. Presence/awareness is published through `session.presence`.
   */
  collaboration?: {
    ydoc: unknown;
    collaborationProvider?: CollaborationProvider | null;
  };
}

/**
 * Open a `.docx` (or a blank document when no source is given) as a headless
 * session. The returned session dispatches operations by `operationId` and can
 * export the mutated document back to bytes.
 */
export async function openDocument(source?: Uint8Array, options: OpenOptions = {}): Promise<DocumentSession> {
  const bytes = source ?? new Uint8Array(Buffer.from(BLANK_DOCX_BASE64, 'base64'));

  // Each session gets its own happy-dom window; inject via options.document so
  // no globals are touched (mirrors the CLI headless strategy).
  const window = new Window();
  const document = window.document as unknown as Document;
  let domDisposed = false;
  const disposeDom = () => {
    if (domDisposed) return;
    domDisposed = true;
    window.happyDOM.abort();
    window.close();
  };

  let editor: Editor;
  try {
    editor = await Editor.open(Buffer.from(bytes), {
      documentId: options.documentId ?? 'document.docx',
      document,
      isHeadless: true,
      ydoc: options.collaboration?.ydoc,
      collaborationProvider: options.collaboration?.collaborationProvider ?? null,
      // The change/comment author. Precedence: explicit per-session identity (e.g. an agent
      // attributing its own edits over the wire) > SUPERDOC_DOC_AUTHOR / SUPERDOC_DOC_AUTHOR_ID
      // env override > the headless host default.
      user: {
        id: options.user?.id ?? process.env.SUPERDOC_DOC_AUTHOR_ID ?? 'document-host',
        name: options.user?.name ?? process.env.SUPERDOC_DOC_AUTHOR ?? 'Document Host',
      },
    });
  } catch (error) {
    disposeDom();
    throw error;
  }

  // Idempotent: ensures adapter afterCommit hooks are wired in headless sessions.
  initPartsRuntime(editor as never);

  // Eagerly bind a DocumentApi over the engine adapters - this is the direct,
  // structured dispatch surface (no argv).
  const doc: DocumentApi = createDocumentApi(getDocumentApiAdapters(editor));

  // No-op save preservation: a session that applies no mutation (only dryRun previews or
  // read-only ops) exports the ORIGINAL input bytes verbatim, not a normalized re-export.
  // Re-exporting through the engine rewrites the OOXML package (zip ordering, normalization) so
  // byte identity is lost even when nothing changed; callers that preview-then-save need
  // the output to equal the input. Dirtiness is tracked per invoke: a non-dryRun op that is not
  // read-only marks the session dirty (see isMutatingInvoke). This catches mutations that do not
  // touch the ProseMirror doc node - e.g. comment ops - which a doc-node check would miss and
  // silently drop. `originalBytes` is a private snapshot of the bytes we opened from: we copy here
  // so a caller mutating their input buffer after open() cannot change what a no-op export returns
  // (Editor.open also copies via Buffer.from, so the editor never mutates the input either).
  const originalBytes = Uint8Array.from(bytes);
  let dirty = false;

  // Byte-preservation applies only to non-collaborative sessions. When a Y.Doc / collaboration
  // provider is bound, the Y.Doc is the authoritative state and receives edits via sync (which do
  // not go through doc.invoke, so they never mark the session dirty). Returning the opened input
  // bytes there would drop synced content, so a collaborative session always re-exports live state.
  const isCollaborative = Boolean(options.collaboration?.ydoc || options.collaboration?.collaborationProvider);

  let closed = false;

  // Presence resolves the awareness lazily on each call so it reflects the live
  // provider state, and fails clearly when the session was opened without a
  // collaboration provider (or after close()). The engine owns cursor encoding.
  // Narrowed awareness: the runtime guard guarantees setLocalStateField, but the
  // engine's Awareness type declares it optional, so the cast keeps callers typed.
  type LocalAwareness = { setLocalStateField: (field: string, value: unknown) => void };
  const requirePresence = (): LocalAwareness => {
    if (closed) throw new Error('Document session is closed; presence is unavailable.');
    const awareness = options.collaboration?.collaborationProvider?.awareness;
    if (!awareness || typeof awareness.setLocalStateField !== 'function') {
      throw new Error('Presence requires a collaboration provider with awareness.setLocalStateField().');
    }
    return awareness as LocalAwareness;
  };

  const presence: PresenceHandle = {
    setUser(profile) {
      requirePresence().setLocalStateField('user', profile);
    },
    setStatus(status) {
      requirePresence().setLocalStateField('status', { state: status.state, label: status.label ?? null });
    },
    clearStatus() {
      requirePresence().setLocalStateField('status', null);
    },
    setSelection(target) {
      const awareness = requirePresence();
      const payload = encodeCollaborationCursorFromSelectionTarget(editor, target);
      if (!payload) {
        throw new Error('setSelection requires a collaborative session (no Yjs binding for this document).');
      }
      awareness.setLocalStateField('cursor', payload);
    },
    clearSelection() {
      requirePresence().setLocalStateField('cursor', null);
    },
  };

  return {
    presence,
    async invoke(operationId, input, options) {
      // Closed sessions are inert: fail clearly rather than dispatching against a destroyed editor
      // (mirrors the presence guard and export below) so use-after-close is an explicit error.
      if (closed) throw new Error('Document session is closed; invoke is unavailable.');
      // Awaiting is a no-op for synchronous operations and correctly surfaces
      // async ones (e.g. template application). Input is forwarded exactly as
      // given - missing vs {} vs null is preserved, because each operation
      // validates its own input. The host must not normalize it.
      const result = await doc.invoke({ operationId, input, options } as Parameters<DocumentApi['invoke']>[0]);
      // After a successful (non-throwing) op: a non-dryRun mutation dirties the session.
      if (isMutatingInvoke(operationId, input, options)) dirty = true;
      return result;
    },
    async export() {
      // Closed sessions are inert: a no-op export must not return bytes from a torn-down session
      // (mirrors invoke + the presence guard).
      if (closed) throw new Error('Document session is closed; export is unavailable.');
      // Byte-preservation for clean, non-collaborative sessions only (see isCollaborative). Return a
      // fresh copy so the caller owns the result and cannot corrupt the private snapshot (or a later
      // no-op export) by mutating the returned buffer.
      if (!dirty && !isCollaborative) return originalBytes.slice();
      const exported = await editor.exportDocument();
      return toUint8Array(exported);
    },
    close() {
      if (closed) return;
      closed = true;
      editor.destroy();
      disposeDom();
    },
  };
}

async function toUint8Array(data: unknown): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (
    typeof data === 'object' &&
    data !== null &&
    'arrayBuffer' in data &&
    typeof (data as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  ) {
    return new Uint8Array(await (data as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer());
  }
  throw new Error(`Exported document data is not binary (type=${typeof data}).`);
}
