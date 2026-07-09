import { Doc as YDoc, encodeStateAsUpdate, applyUpdate } from 'yjs';

// =============================================================================
// Types
// =============================================================================

export interface Version {
  id: string;
  label?: string;
  createdAt: string;
  sizeBytes?: number;
  isYjsState?: boolean;
}

export interface SnapshotData {
  yjsState: Uint8Array;
  sizeBytes: number;
}

// =============================================================================
// Yjs Operations - Low-level state encoding/decoding
// =============================================================================

export const YjsOps = {
  /**
   * Capture current Yjs document state as a compact byte array.
   * This is the core snapshot primitive - captures full document including tracked changes.
   */
  capture(ydoc: YDoc): Uint8Array {
    return encodeStateAsUpdate(ydoc);
  },

  /**
   * Apply a captured state to a Yjs document.
   * Used to restore a document to a previous state.
   */
  apply(ydoc: YDoc, state: Uint8Array): void {
    applyUpdate(ydoc, state);
  },

  /**
   * Create a new Yjs document initialized with a captured state.
   * Used for preview and revert operations.
   */
  createFromState(state: Uint8Array): YDoc {
    const ydoc = new YDoc();
    applyUpdate(ydoc, state);
    return ydoc;
  },

  /**
   * Encode Uint8Array to base64 string for API transport.
   * Uses chunked encoding to avoid stack overflow on large documents.
   */
  toBase64(state: Uint8Array): string {
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < state.length; i += chunkSize) {
      const chunk = state.subarray(i, Math.min(i + chunkSize, state.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  },

  /**
   * Decode base64 string back to Uint8Array.
   */
  fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },
};

// =============================================================================
// Version API - Server communication for version storage
// =============================================================================

export const VersionAPI = {
  _apiUrl: '',

  /**
   * Initialize the API client with the server URL.
   */
  init(apiUrl: string): void {
    this._apiUrl = apiUrl;
  },

  _log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [snapshots] ${msg}`);
  },

  /**
   * List all versions for a document.
   */
  async list(documentId: string): Promise<Version[]> {
    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.versions;
  },

  /**
   * Save a new version from Yjs state.
   */
  async saveYjsState(documentId: string, yjsState: Uint8Array, label?: string): Promise<Version> {
    const base64 = YjsOps.toBase64(yjsState);
    this._log(`→ POST /documents/${documentId}/versions/yjs (${yjsState.byteLength} bytes)`);

    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions/yjs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yjsState: base64, label }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    this._log(`← ✓ saved ${data.sizeBytes} bytes`);
    return data;
  },

  /**
   * Download a version's Yjs state.
   */
  async downloadYjsState(documentId: string, versionId: string): Promise<Uint8Array> {
    this._log(`→ GET /documents/${documentId}/versions/${versionId}/yjs`);

    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions/${versionId}/yjs`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const bytes = YjsOps.fromBase64(data.yjsState);

    this._log(`← ✓ downloaded ${bytes.byteLength} bytes`);
    return bytes;
  },

  /**
   * Save a new version (DOCX blob - legacy).
   */
  async saveBlob(documentId: string, blob: Blob, label?: string): Promise<Version> {
    const formData = new FormData();
    formData.append('file', blob, 'version.docx');
    if (label) formData.append('label', label);

    this._log(`→ POST /documents/${documentId}/versions (blob)`);
    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    this._log(`← ✓`);
    return data;
  },

  /**
   * Download a version blob (DOCX - legacy).
   */
  async downloadBlob(documentId: string, versionId: string): Promise<Blob> {
    this._log(`→ GET /documents/${documentId}/versions/${versionId}/download`);

    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions/${versionId}/download`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    this._log(`← ✓`);
    return blob;
  },

  /**
   * Revert to a previous version (server-side pointer update).
   */
  async revert(documentId: string, versionId: string): Promise<void> {
    this._log(`→ POST /documents/${documentId}/versions/${versionId}/revert`);

    const response = await fetch(`${this._apiUrl}/documents/${documentId}/versions/${versionId}/revert`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    this._log(`← ✓`);
  },

  /**
   * Start polling for versions.
   */
  startPolling(documentId: string, onUpdate: (versions: Version[]) => void, intervalMs = 2000): () => void {
    this._log(`started polling every ${intervalMs}ms`);

    const poll = async () => {
      try {
        const versions = await this.list(documentId);
        onUpdate(versions);
      } catch (e) {
        this._log(`poll failed: ${e}`);
      }
    };

    poll();
    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  },
};

// =============================================================================
// Snapshot Manager - High-level operations combining Yjs + API
// =============================================================================

export const Snapshots = {
  /**
   * Capture and save the current document state as a new version.
   */
  async save(ydoc: YDoc, documentId: string, label?: string): Promise<Version> {
    const yjsState = YjsOps.capture(ydoc);
    return VersionAPI.saveYjsState(documentId, yjsState, label);
  },

  /**
   * Load a version and create a Yjs document from it.
   * Returns the ydoc ready to be used with SuperDoc.
   */
  async load(documentId: string, versionId: string, isYjsState: boolean): Promise<YDoc | null> {
    if (!isYjsState) {
      // Legacy DOCX versions can't be loaded as Yjs
      return null;
    }

    const yjsState = await VersionAPI.downloadYjsState(documentId, versionId);
    return YjsOps.createFromState(yjsState);
  },

  /**
   * Create a preview ydoc for viewing a version without modifying the main document.
   */
  async createPreview(documentId: string, version: Version): Promise<YDoc | null> {
    if (!version.isYjsState) {
      return null;
    }

    const yjsState = await VersionAPI.downloadYjsState(documentId, version.id);
    return YjsOps.createFromState(yjsState);
  },
};
