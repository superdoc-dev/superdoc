import { SuperDoc } from 'superdoc';
import { createSuperDocUI } from 'superdoc/ui';
import { Doc as YDoc, applyUpdate, encodeStateAsUpdate } from 'yjs';

export type User = { name: string; email: string; color: string };

export type Version = {
  id: string;
  number: string;
  publishedAt: string;
  publishedBy: { name: string; email: string };
  sizeBytes: number;
};

export type VersionPreview = { superdoc: any; ui: any };

type PublishOptions = {
  document: YDoc;
  user: User;
  commentsUi: any;
  editor: any;
};

type PublishResult = { version: Version; cleanupError?: unknown };

// Encodes a Yjs binary snapshot as base64 so it can be sent in a JSON request body.
const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

// Restores the binary Yjs snapshot returned by the version-history API.
const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

// Waits for React to render the version modal before SuperDoc mounts into its selector.
const nextAnimationFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Centralizes the demo's version API, publish cleanup, and snapshot-viewer lifecycle.
export class VersionHistoryController {
  private preview: VersionPreview | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly roomId: string,
  ) {}

  // Loads lightweight published-version summaries for the controller's room.
  async listVersions(): Promise<Version[]> {
    const response = await fetch(`${this.apiUrl}/versions?roomId=${encodeURIComponent(this.roomId)}`);
    if (!response.ok) throw new Error('Could not load versions');
    return (await response.json()).versions;
  }

  // Persists the current collaborative state, then closes the completed review cycle
  // in the working draft without altering the immutable published snapshot.
  async publish({ document, user, commentsUi, editor }: PublishOptions): Promise<PublishResult> {
    const publishedCommentIds = commentsUi.comments
      .getSnapshot()
      .items.filter((comment: any) => !comment.parentCommentId && !comment.trackedChange)
      .map((comment: any) => comment.id);

    const response = await fetch(`${this.apiUrl}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: this.roomId,
        yjsState: toBase64(encodeStateAsUpdate(document)),
        publishedBy: user,
      }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error || `Publish failed (${response.status})`);
    }

    const version = (await response.json()) as Version;
    try {
      this.cleanWorkingDraft(commentsUi, editor, publishedCommentIds);
      return { version };
    } catch (cleanupError) {
      return { version, cleanupError };
    }
  }

  // Resolves and removes version-scoped comments, then accepts all published changes
  // so subsequent edits form a fresh audit diff.
  private cleanWorkingDraft(commentsUi: any, editor: any, commentIds: string[]): void {
    for (const commentId of commentIds) {
      const resolved = commentsUi.comments.resolve(commentId);
      if (!resolved.success && resolved.failure?.code !== 'NO_OP') {
        throw new Error(resolved.failure?.message || 'Could not resolve published comments.');
      }
      commentsUi.comments.delete(commentId);
    }

    const accepted = editor?.doc?.trackChanges?.decide?.({
      target: { kind: 'all' },
      decision: 'accept',
    });
    if (accepted && !accepted.success && accepted.failure?.code !== 'NO_OP') {
      throw new Error(accepted.failure?.message || 'Could not accept published tracked changes.');
    }
  }

  // Fetches and opens an immutable Yjs snapshot with comments and tracked changes visible.
  async openVersion(versionId: string, selector: string): Promise<VersionPreview> {
    const response = await fetch(
      `${this.apiUrl}/versions/${versionId}?roomId=${encodeURIComponent(this.roomId)}`,
    );
    if (!response.ok) throw new Error('Could not load that version.');

    const stored = await response.json();
    const previewDocument = new YDoc();
    applyUpdate(previewDocument, fromBase64(stored.yjsState));
    await nextAnimationFrame();
    this.closeVersion();

    return new Promise((resolve, reject) => {
      let superdoc: any;
      superdoc = new SuperDoc({
        selector,
        documentMode: 'viewing',
        contained: true,
        comments: { visible: true },
        trackChanges: { visible: true },
        telemetry: { enabled: false },
        modules: {
          collaboration: { ydoc: previewDocument, provider: new NoOpProvider() as any },
          comments: {},
          trackChanges: { visible: true, mode: 'review' },
        },
        onReady: ({ superdoc: readySuperDoc }: any) => {
          readySuperDoc.setTrackedChangesPreferences?.({ mode: 'review', enabled: true });
          const preview = { superdoc: readySuperDoc, ui: createSuperDocUI({ superdoc: readySuperDoc }) };
          this.preview = preview;
          resolve(preview);
        },
        onException: ({ error }: any) => {
          superdoc.destroy();
          reject(error instanceof Error ? error : new Error('Could not open that version.'));
        },
      });
    });
  }

  // Destroys the active snapshot UI and editor, if one is currently open.
  closeVersion(): void {
    this.preview?.ui?.destroy?.();
    this.preview?.superdoc?.destroy?.();
    this.preview = null;
  }
}

// Supplies the minimal collaboration-provider contract required to render a frozen
// Yjs snapshot without connecting the version viewer to a live room.
class NoOpProvider {
  awareness = { setLocalState: () => {}, setLocalStateField: () => {}, getLocalState: () => ({}), getStates: () => new Map(), on: () => {}, off: () => {}, destroy: () => {} };

  // Immediately reports synchronization because the snapshot was already applied locally.
  on(event: string, callback: (synced: boolean) => void) { if (event === 'sync' || event === 'synced') setTimeout(() => callback(true)); }

  // Ignores listener removal because this provider never retains listeners.
  off() {}

  // Performs no cleanup because this provider owns no external resources.
  destroy() {}

  // Avoids opening a connection because the snapshot is entirely local.
  connect() {}

  // Avoids closing a connection because none was created.
  disconnect() {}
}
