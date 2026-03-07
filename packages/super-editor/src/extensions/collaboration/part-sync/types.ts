/**
 * Runtime type contracts for the part-sync collaboration module.
 */

import type { PartId } from '../../../core/parts/types.js';

// ---------------------------------------------------------------------------
// Yjs Part Envelope
// ---------------------------------------------------------------------------

/** Per-part envelope stored in the Yjs `parts` map. */
export interface PartEnvelope {
  /** Version counter — incremented on every publish. Starts at 1. */
  v: number;
  /** `ydoc.clientID` of the writer. Identifies which client produced this version. */
  clientId: number;
  /** Full OOXML JSON tree for the part. */
  data: unknown;
}

// ---------------------------------------------------------------------------
// Migration Metadata
// ---------------------------------------------------------------------------

export interface PartsMigrationMeta {
  status: 'success' | 'failed' | 'in-progress';
  attempts: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  source: string;
}

export interface PartsCapability {
  version: number;
  enabledAt: string;
  clientId: number;
}

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

/** Buffered part event during compound mutations. */
export interface BufferedPartEvent {
  partId: PartId;
  operation: 'mutate' | 'create' | 'delete';
  data: unknown;
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

/** Tracks a failed remote part for retry gating. */
export interface FailedPartEntry {
  v: number;
  clientId: number;
}

// ---------------------------------------------------------------------------
// Telemetry Payloads
// ---------------------------------------------------------------------------

export interface ConcurrentOverwriteTelemetry {
  partId: string;
  localVersion: number;
  remoteVersion: number;
  remoteClientId: number;
  gapMs: number;
}

export interface RemoteApplyErrorTelemetry {
  partId: string;
  error: string;
  remoteVersion: number;
  remoteClientId: number;
}

export interface HydrationCriticalFailureTelemetry {
  partId: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Activation Mode
// ---------------------------------------------------------------------------

/** Controls which parts of the part-sync pipeline are active. */
export type PartSyncMode = 'off' | 'passive' | 'active';
