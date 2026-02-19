import type { CollaborationProfile } from '../lib/collaboration';
import { openCollaborativeDocument, type OpenedDocument } from '../lib/document';
import { CliError } from '../lib/errors';
import type { CliIO } from '../lib/types';

/** Metadata describing a document editing session and its optional collaboration configuration. */
export interface CollaborationSessionMetadata {
  contextId: string;
  sessionType: 'local' | 'collab';
  collaboration?: CollaborationProfile;
  sourcePath?: string;
  workingDocPath: string;
}

type SessionFingerprint = {
  profileKey: string;
  workingDocPath: string;
};

type PooledSessionHandle = {
  opened: OpenedDocument;
  fingerprint: SessionFingerprint;
  lastUsedAtMs: number;
};

type OpenCollaborativeDocumentFn = (
  docPath: string,
  io: CliIO,
  profile: CollaborationProfile,
) => Promise<OpenedDocument>;

function profileToKey(profile: CollaborationProfile): string {
  return JSON.stringify({
    providerType: profile.providerType,
    url: profile.url,
    documentId: profile.documentId,
    tokenEnv: profile.tokenEnv ?? null,
    syncTimeoutMs: profile.syncTimeoutMs ?? null,
  });
}

function buildFingerprint(metadata: CollaborationSessionMetadata): SessionFingerprint {
  if (metadata.sessionType !== 'collab') {
    throw new CliError('COMMAND_FAILED', 'Session is not collaborative.', {
      contextId: metadata.contextId,
      sessionType: metadata.sessionType,
    });
  }

  if (!metadata.collaboration) {
    throw new CliError('COMMAND_FAILED', 'Collaborative session metadata is missing collaboration profile.', {
      contextId: metadata.contextId,
    });
  }

  return {
    profileKey: profileToKey(metadata.collaboration),
    workingDocPath: metadata.workingDocPath,
  };
}

function sameFingerprint(left: SessionFingerprint, right: SessionFingerprint): boolean {
  return left.profileKey === right.profileKey && left.workingDocPath === right.workingDocPath;
}

/**
 * Manages pooled collaboration sessions, reusing connections when the session
 * fingerprint (provider profile + working document path) matches.
 */
export interface CollaborationSessionPool {
  /** Acquires (or reuses) a collaborative session, returning a leased document handle. */
  acquire(
    sessionId: string,
    docPath: string,
    metadata: CollaborationSessionMetadata,
    io: CliIO,
  ): Promise<OpenedDocument>;
  /** Adopts an externally-opened document into the pool, replacing any existing session. */
  adoptFromOpen(
    sessionId: string,
    opened: OpenedDocument,
    metadata: CollaborationSessionMetadata,
    io: CliIO,
  ): Promise<void>;
  /** Disposes a single session by id, closing its underlying document. */
  disposeSession(sessionId: string): Promise<void>;
  /** Disposes all pooled sessions. */
  disposeAll(): Promise<void>;
}

/** In-memory implementation of {@link CollaborationSessionPool}. */
export class InMemoryCollaborationSessionPool implements CollaborationSessionPool {
  private readonly handles = new Map<string, PooledSessionHandle>();
  private readonly openCollaborative: OpenCollaborativeDocumentFn;
  private readonly now: () => number;

  constructor(options: { openCollaborative?: OpenCollaborativeDocumentFn; now?: () => number } = {}) {
    this.openCollaborative = options.openCollaborative ?? openCollaborativeDocument;
    this.now = options.now ?? Date.now;
  }

  async acquire(
    sessionId: string,
    docPath: string,
    metadata: CollaborationSessionMetadata,
    io: CliIO,
  ): Promise<OpenedDocument> {
    const fingerprint = buildFingerprint(metadata);
    const existing = this.handles.get(sessionId);

    if (existing) {
      if (sameFingerprint(existing.fingerprint, fingerprint)) {
        existing.lastUsedAtMs = this.now();
        return this.createLease(existing);
      }

      await this.disposeSession(sessionId);
    }

    // Safe to assert: buildFingerprint above already validated metadata.collaboration
    const profile = metadata.collaboration!;

    const opened = await this.openCollaborative(docPath, io, profile);
    const created: PooledSessionHandle = {
      opened,
      fingerprint,
      lastUsedAtMs: this.now(),
    };
    this.handles.set(sessionId, created);

    return this.createLease(created);
  }

  async adoptFromOpen(
    sessionId: string,
    opened: OpenedDocument,
    metadata: CollaborationSessionMetadata,
    _io: CliIO,
  ): Promise<void> {
    const fingerprint = buildFingerprint(metadata);

    await this.disposeSession(sessionId);

    this.handles.set(sessionId, {
      opened,
      fingerprint,
      lastUsedAtMs: this.now(),
    });
  }

  async disposeSession(sessionId: string): Promise<void> {
    const existing = this.handles.get(sessionId);
    if (!existing) return;

    this.handles.delete(sessionId);
    existing.opened.dispose();
  }

  async disposeAll(): Promise<void> {
    const sessionIds = Array.from(this.handles.keys());
    for (const sessionId of sessionIds) {
      await this.disposeSession(sessionId);
    }
  }

  private createLease(handle: PooledSessionHandle): OpenedDocument {
    return {
      editor: handle.opened.editor,
      meta: handle.opened.meta,
      dispose: () => {
        handle.lastUsedAtMs = this.now();
      },
    };
  }
}
