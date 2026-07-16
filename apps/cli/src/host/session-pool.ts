import { createHash } from 'node:crypto';
import type { CollaborationProfile } from '../lib/collaboration';
import {
  openCollaborativeDocument,
  openDocument,
  type EditorPassThroughOptions,
  type FileOutputMeta,
  type OpenedRuntimeDocument,
} from '../lib/document';
import type { TrackChangesOpenOptions } from '../lib/context';
import type { CliIO, UserIdentity } from '../lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = 3_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionType = 'local' | 'collab';

export interface AcquireMetadata {
  sessionType: SessionType;
  workingDocPath: string;
  metadataRevision: number;
  user?: UserIdentity;
  trackChanges?: TrackChangesOpenOptions;
  /** Required for collab sessions. */
  collaboration?: CollaborationProfile;
}

export interface AdoptMetadata {
  sessionType: SessionType;
  workingDocPath: string;
  metadataRevision: number;
  collaboration?: CollaborationProfile;
  trackChanges?: TrackChangesOpenOptions;
}

export interface DisposeOptions {
  /** Skip checkpoint on dispose. Used by `close --discard`. */
  discard?: boolean;
}

/** Dependencies injectable for testing. */
export interface SessionPoolDeps {
  openLocal?: (
    docPath: string,
    io: CliIO,
    options?: { user?: UserIdentity; editorOpenOptions?: EditorPassThroughOptions },
  ) => Promise<OpenedRuntimeDocument>;
  openCollaborative?: (
    docPath: string | undefined,
    io: CliIO,
    profile: CollaborationProfile,
    options?: { user?: UserIdentity; editorOpenOptions?: EditorPassThroughOptions },
  ) => Promise<OpenedRuntimeDocument>;
  /**
   * Optional override for checkpointing. Receives the opened document and
   * defaults to {@link OpenedRuntimeDocument.exportToPath}.
   */
  exportToPath?: (opened: OpenedRuntimeDocument, docPath: string, overwrite: boolean) => Promise<FileOutputMeta>;
  now?: () => number;
  createTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

// ---------------------------------------------------------------------------
// Pool interface
// ---------------------------------------------------------------------------

export interface SessionPool {
  acquire(sessionId: string, metadata: AcquireMetadata, io: CliIO): Promise<OpenedRuntimeDocument>;
  adoptFromOpen(sessionId: string, opened: OpenedRuntimeDocument, metadata: AdoptMetadata): void;
  checkpoint(sessionId: string): Promise<void>;
  checkpointAll(): Promise<void>;
  markDirty(sessionId: string): void;
  updateMetadataRevision(sessionId: string, revision: number): void;
  isDirty(sessionId: string): boolean;
  disposeSession(sessionId: string, options?: DisposeOptions): Promise<void>;
  disposeAll(): Promise<void>;
  /** Immediately runs any pending autosave checkpoints (for testing). */
  flushPendingCheckpoints(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Collab fingerprint
// ---------------------------------------------------------------------------

// Stable stringify that sorts keys at every depth so nested objects (e.g.
// `params`) contribute to the hash. JSON.stringify's array replacer is a
// single global allow-list applied at all depths, which silently strips
// unlisted nested keys.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

function profileToFingerprint(profile: CollaborationProfile): string {
  return createHash('sha256').update(stableStringify(profile)).digest('hex');
}

// ---------------------------------------------------------------------------
// Per-session async mutex
// ---------------------------------------------------------------------------

type SessionLockEntry = { chain: Promise<void> };

function createSessionLocks(): {
  withLock: <T>(sessionId: string, fn: () => Promise<T>) => Promise<T>;
} {
  const locks = new Map<string, SessionLockEntry>();

  function withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const entry = locks.get(sessionId) ?? { chain: Promise.resolve() };
    locks.set(sessionId, entry);

    const result = entry.chain.then(fn, fn);

    // Update chain to wait for this operation (ignore errors — they're returned to caller)
    entry.chain = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  return { withLock };
}

// ---------------------------------------------------------------------------
// Pooled session entry
// ---------------------------------------------------------------------------

interface PooledSession {
  opened: OpenedRuntimeDocument;
  sessionType: SessionType;
  dirty: boolean;
  leased: boolean;
  workingDocPath: string;
  io: CliIO;
  metadataRevision: number;
  lastUsedAtMs: number;
  autosaveTimer: ReturnType<typeof setTimeout> | null;
  /** Collab-only fields */
  collaboration?: CollaborationProfile;
  trackChanges?: TrackChangesOpenOptions;
  fingerprint?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class InMemorySessionPool implements SessionPool {
  private readonly sessions = new Map<string, PooledSession>();
  private readonly sessionLocks = createSessionLocks();

  private readonly openLocal: NonNullable<SessionPoolDeps['openLocal']>;
  private readonly openCollaborative: NonNullable<SessionPoolDeps['openCollaborative']>;
  private readonly exportToPathFn: NonNullable<SessionPoolDeps['exportToPath']>;
  private readonly now: () => number;
  private readonly createTimer: NonNullable<SessionPoolDeps['createTimer']>;
  private readonly clearTimer: NonNullable<SessionPoolDeps['clearTimer']>;

  constructor(deps: SessionPoolDeps = {}) {
    this.openLocal = deps.openLocal ?? openDocument;
    this.openCollaborative = deps.openCollaborative ?? openCollaborativeDocument;
    this.exportToPathFn =
      deps.exportToPath ?? ((opened, docPath, overwrite) => opened.exportToPath(docPath, overwrite));
    this.now = deps.now ?? Date.now;
    this.createTimer = deps.createTimer ?? setTimeout;
    this.clearTimer = deps.clearTimer ?? clearTimeout;
  }

  // -------------------------------------------------------------------------
  // acquire
  // -------------------------------------------------------------------------

  async acquire(sessionId: string, metadata: AcquireMetadata, io: CliIO): Promise<OpenedRuntimeDocument> {
    return this.sessionLocks.withLock(sessionId, async () => {
      const existing = this.sessions.get(sessionId);

      if (existing) {
        if (this.isSessionValid(existing, metadata)) {
          existing.leased = true;
          existing.lastUsedAtMs = this.now();
          existing.io = io;
          return this.createLease(sessionId, existing);
        }

        // Drift or fingerprint mismatch — discard without checkpoint
        await this.destroySession(existing);
        this.sessions.delete(sessionId);
      }

      const session = await this.openFreshSession(metadata, io);
      this.sessions.set(sessionId, session);
      return this.createLease(sessionId, session);
    });
  }

  // -------------------------------------------------------------------------
  // adoptFromOpen
  // -------------------------------------------------------------------------

  adoptFromOpen(sessionId: string, opened: OpenedRuntimeDocument, metadata: AdoptMetadata): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.clearAutosaveTimer(existing);
      existing.opened.dispose();
    }

    this.sessions.set(sessionId, {
      opened,
      sessionType: metadata.sessionType,
      dirty: false,
      leased: false,
      workingDocPath: metadata.workingDocPath,
      io: {
        stdout() {
          /* noop – pool sessions have no output */
        },
        stderr() {
          /* noop – pool sessions have no output */
        },
        readStdinBytes: async () => new Uint8Array(),
        now: this.now,
      },
      metadataRevision: metadata.metadataRevision,
      lastUsedAtMs: this.now(),
      autosaveTimer: null,
      collaboration: metadata.collaboration,
      trackChanges: metadata.trackChanges,
      fingerprint: metadata.collaboration ? profileToFingerprint(metadata.collaboration) : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // checkpoint
  // -------------------------------------------------------------------------

  async checkpoint(sessionId: string): Promise<void> {
    return this.sessionLocks.withLock(sessionId, () => this.checkpointUnsafe(sessionId));
  }

  async checkpointAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.checkpoint(id);
    }
  }

  // -------------------------------------------------------------------------
  // markDirty / updateMetadataRevision / isDirty
  // -------------------------------------------------------------------------

  markDirty(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.dirty = true;
    this.resetAutosaveTimer(sessionId, session);
  }

  updateMetadataRevision(sessionId: string, revision: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.metadataRevision = revision;
  }

  isDirty(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.dirty ?? false;
  }

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  async disposeSession(sessionId: string, options?: DisposeOptions): Promise<void> {
    return this.sessionLocks.withLock(sessionId, async () => {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      this.clearAutosaveTimer(session);

      const shouldCheckpoint = !options?.discard && (session.dirty || session.sessionType === 'collab');
      if (shouldCheckpoint) {
        await this.checkpointUnsafe(sessionId);
      }

      await this.destroySession(session);
      this.sessions.delete(sessionId);
    });
  }

  async disposeAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.disposeSession(id);
    }
  }

  // -------------------------------------------------------------------------
  // flushPendingCheckpoints (test helper)
  // -------------------------------------------------------------------------

  async flushPendingCheckpoints(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (session?.autosaveTimer != null) {
        this.clearAutosaveTimer(session);
        await this.checkpoint(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private isSessionValid(session: PooledSession, metadata: AcquireMetadata): boolean {
    if (session.sessionType === 'collab') {
      const incomingFingerprint = metadata.collaboration ? profileToFingerprint(metadata.collaboration) : undefined;
      return session.fingerprint === incomingFingerprint && session.workingDocPath === metadata.workingDocPath;
    }

    // Local: validate working doc path and metadata revision match
    return session.workingDocPath === metadata.workingDocPath && session.metadataRevision === metadata.metadataRevision;
  }

  private async openFreshSession(metadata: AcquireMetadata, io: CliIO): Promise<PooledSession> {
    let opened: OpenedRuntimeDocument;
    const editorOpenOptions = metadata.trackChanges
      ? {
          trackChanges: metadata.trackChanges,
          modules: { trackChanges: metadata.trackChanges },
        }
      : undefined;
    if (metadata.sessionType === 'collab' && metadata.collaboration) {
      opened = await this.openCollaborative(metadata.workingDocPath, io, metadata.collaboration, {
        user: metadata.user,
        editorOpenOptions,
      });
    } else {
      opened = await this.openLocal(metadata.workingDocPath, io, { user: metadata.user, editorOpenOptions });
    }

    return {
      opened,
      sessionType: metadata.sessionType,
      dirty: false,
      leased: true,
      workingDocPath: metadata.workingDocPath,
      io,
      metadataRevision: metadata.metadataRevision,
      lastUsedAtMs: this.now(),
      autosaveTimer: null,
      collaboration: metadata.collaboration,
      trackChanges: metadata.trackChanges,
      fingerprint: metadata.collaboration ? profileToFingerprint(metadata.collaboration) : undefined,
    };
  }

  private createLease(sessionId: string, session: PooledSession): OpenedRuntimeDocument {
    const pooled = session.opened;
    const lease: OpenedRuntimeDocument = {
      runtime: 'v1',
      doc: pooled.doc,
      meta: pooled.meta,
      exportBytes: (options) => pooled.exportBytes(options),
      exportToPath: (outputPath, force, options) => pooled.exportToPath(outputPath, force, options),
      dispose: () => {
        session.leased = false;
        session.lastUsedAtMs = this.now();
      },
    };
    // Preserve the v1 `editor` reference on the lease when present so v1-only
    // code paths (collab sync helper, headless comment bridge) keep working.
    if (pooled.runtime === 'v1' && 'editor' in pooled) {
      (lease as { editor?: unknown }).editor = (pooled as unknown as { editor: unknown }).editor;
    }
    return lease;
  }

  /** Checkpoint without acquiring the session lock (caller must hold it). */
  private async checkpointUnsafe(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Local sessions: only checkpoint when dirty (we control all mutations).
    // Collab sessions: always checkpoint — remote peer edits update the
    // in-memory editor via the Yjs provider without going through markDirty().
    if (!session.dirty && session.sessionType !== 'collab') return;

    if (session.sessionType === 'collab') {
      await this.checkpointCollabSession(session);
    } else {
      await this.checkpointLocalSession(session);
    }

    session.dirty = false;
    this.clearAutosaveTimer(session);
  }

  private async checkpointLocalSession(session: PooledSession): Promise<void> {
    await this.exportToPathFn(session.opened, session.workingDocPath, true);
  }

  private async checkpointCollabSession(session: PooledSession): Promise<void> {
    // Pool checkpoint only flushes session state to the working doc file.
    // Metadata writes (dirty flag, revision bump) happen through the context
    // layer during save/close — not here.
    await this.exportToPathFn(session.opened, session.workingDocPath, true);
  }

  private async destroySession(session: PooledSession): Promise<void> {
    this.clearAutosaveTimer(session);
    session.opened.dispose();
  }

  // -------------------------------------------------------------------------
  // Autosave timer
  // -------------------------------------------------------------------------

  private resetAutosaveTimer(sessionId: string, session: PooledSession): void {
    this.clearAutosaveTimer(session);

    session.autosaveTimer = this.createTimer(() => {
      this.onAutosaveTimerFired(sessionId).catch(() => {
        // Autosave is best-effort — swallow to avoid unhandled rejection.
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private clearAutosaveTimer(session: PooledSession): void {
    if (session.autosaveTimer != null) {
      this.clearTimer(session.autosaveTimer);
      session.autosaveTimer = null;
    }
  }

  private async onAutosaveTimerFired(sessionId: string): Promise<void> {
    await this.sessionLocks.withLock(sessionId, async () => {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      session.autosaveTimer = null;

      if (session.leased) {
        // In-flight invoke — reschedule instead of checkpointing
        this.resetAutosaveTimer(sessionId, session);
        return;
      }

      await this.checkpointUnsafe(sessionId);
    });
  }
}
