import type { SyncableProvider, WebSocketProviderType } from './types';

const REDACTED = '[REDACTED]';
const MAX_OBJECT_DEPTH = 5;

export type CollaborationDiagnosticContext = {
  providerType: WebSocketProviderType;
  url: string;
  documentId: string;
  // tokenEnvConfigured: the profile told us to read auth from an env var.
  // authTokenResolved: that env var actually held a non-empty value at runtime.
  // Splitting these two lets us tell "no auth configured" from "auth configured
  // but env empty" - the customer's reproduction was the first case, not the
  // second.
  tokenEnvConfigured: boolean;
  authTokenResolved: boolean;
  paramsKeys: string[];
};

export type ProviderDiagnostics = {
  toTimeoutDetails(provider: SyncableProvider, timeoutMs: number, elapsedMs: number): Record<string, unknown>;
  detach(): void;
};

function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return false;

  return (
    normalized === 'key' ||
    normalized === 'apikey' ||
    normalized === 'authorization' ||
    normalized.includes('token') ||
    normalized.includes('auth') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('credential')
  );
}

function sanitizeUrlCandidate(value: string): string {
  try {
    const parsed = new URL(value);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (isSensitiveDiagnosticKey(key)) {
        parsed.searchParams.set(key, REDACTED);
      }
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

export function sanitizeDiagnosticString(value: string): string {
  const withSanitizedUrls = value.replace(/\b(?:wss?|https?):\/\/[^\s"'<>]+/gi, sanitizeUrlCandidate);

  return withSanitizedUrls.replace(/([?&])([^=&#\s"']+)=([^&#\s"']*)/g, (match, prefix: string, key: string) => {
    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));
    } catch {
      // Malformed percent-encoding (e.g. a raw `%` in the key). Fall back to
      // the raw key for the sensitivity check — diagnostics must never throw
      // because they run inside the sync-timeout callback.
      decodedKey = key;
    }
    if (!isSensitiveDiagnosticKey(decodedKey)) return match;
    return `${prefix}${key}=${REDACTED}`;
  });
}

function summarizeError(error: Error): Record<string, unknown> {
  return {
    name: sanitizeDiagnosticString(error.name),
    message: sanitizeDiagnosticString(error.message),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function summarizeEventLike(value: Record<string, unknown>): Record<string, unknown> | null {
  if ('code' in value && 'reason' in value && 'wasClean' in value) {
    return {
      code: typeof value.code === 'number' ? value.code : undefined,
      reason: sanitizeDiagnosticString(String(value.reason ?? '')),
      wasClean: Boolean(value.wasClean),
    };
  }

  if ('message' in value && 'type' in value) {
    return {
      type: sanitizeDiagnosticString(String(value.type ?? '')),
      message: sanitizeDiagnosticString(String(value.message ?? '')),
    };
  }

  return null;
}

export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeDiagnosticString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return summarizeError(value);
  if (depth >= MAX_OBJECT_DEPTH) return '[Truncated]';

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDiagnosticValue(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return Object.prototype.toString.call(value);
  }

  const eventSummary = summarizeEventLike(value);
  if (eventSummary) return eventSummary;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function' || typeof entry === 'symbol' || typeof entry === 'undefined') continue;
    output[key] = sanitizeDiagnosticValue(entry, depth + 1);
  }
  return output;
}

function sanitizeProviderState(provider: SyncableProvider): Record<string, unknown> {
  const record = provider as Record<string, unknown>;
  return sanitizeDiagnosticValue({
    synced: record.synced,
    isSynced: record.isSynced,
    status: record.status,
    wsconnected: record.wsconnected,
    wsconnecting: record.wsconnecting,
    shouldConnect: record.shouldConnect,
  }) as Record<string, unknown>;
}

// y-websocket emits events as `[payload, provider]` where the second arg is
// the provider self-reference. Hocuspocus uses `[payload]`. We only want the
// payload - the provider self-ref bloats details with the entire YDoc/state
// graph and risks leaking document content if a future provider includes it.
function firstUsefulArg(args: unknown[]): unknown {
  return args[0];
}

export function attachProviderDiagnostics(
  provider: SyncableProvider,
  context: CollaborationDiagnosticContext,
): ProviderDiagnostics {
  const eventCounts: Record<string, number> = {};
  const cleanup: Array<() => void> = [];
  let lastStatus: unknown;
  let lastConnectionError: unknown;
  let lastConnectionClose: unknown;
  let lastClose: unknown;
  let lastDisconnect: unknown;
  let lastAuthenticationFailed: unknown;
  let detached = false;

  const capture = (eventName: string, args: unknown[]) => {
    eventCounts[eventName] = (eventCounts[eventName] ?? 0) + 1;

    const payload = firstUsefulArg(args);
    if (eventName === 'connection-close' && payload == null) return;

    const sanitizedPayload = sanitizeDiagnosticValue(payload);
    switch (eventName) {
      case 'status':
        lastStatus = sanitizedPayload;
        break;
      case 'connection-error':
        lastConnectionError = sanitizedPayload;
        break;
      case 'connection-close':
        lastConnectionClose = sanitizedPayload;
        break;
      case 'close':
        lastClose = sanitizedPayload;
        break;
      case 'disconnect':
        lastDisconnect = sanitizedPayload;
        break;
      case 'authenticationFailed':
        lastAuthenticationFailed = sanitizedPayload;
        break;
    }
  };

  const subscribe = (eventName: string) => {
    if (!provider.on) return;
    // Best-effort: a failing subscription must never crash collaboration setup.
    try {
      const handler = (...args: unknown[]) => capture(eventName, args);
      provider.on(eventName, handler);
      cleanup.push(() => {
        try {
          provider.off?.(eventName, handler);
        } catch {
          // ignore detach failures
        }
      });
    } catch {
      // ignore subscribe failures - diagnostics are advisory
    }
  };

  for (const eventName of [
    'status',
    'sync',
    'synced',
    'connection-error',
    'connection-close',
    'close',
    'disconnect',
    'authenticationFailed',
    'authenticated',
  ]) {
    subscribe(eventName);
  }

  return {
    toTimeoutDetails(providerForSnapshot, timeoutMs, elapsedMs) {
      const details: Record<string, unknown> = {
        timeoutMs,
        elapsedMs,
        providerType: context.providerType,
        url: sanitizeDiagnosticString(context.url),
        documentId: sanitizeDiagnosticString(context.documentId),
        tokenEnvConfigured: context.tokenEnvConfigured,
        authTokenResolved: context.authTokenResolved,
        paramsKeys: [...context.paramsKeys],
        eventCounts: { ...eventCounts },
        providerState: sanitizeProviderState(providerForSnapshot),
      };

      if (lastStatus !== undefined) details.lastStatus = lastStatus;
      if (lastConnectionError !== undefined) details.lastConnectionError = lastConnectionError;
      if (lastConnectionClose !== undefined) details.lastConnectionClose = lastConnectionClose;
      if (lastClose !== undefined) details.lastClose = lastClose;
      if (lastDisconnect !== undefined) details.lastDisconnect = lastDisconnect;
      if (lastAuthenticationFailed !== undefined) details.lastAuthenticationFailed = lastAuthenticationFailed;

      return details;
    },
    detach() {
      if (detached) return;
      detached = true;
      for (const run of cleanup.splice(0)) {
        run();
      }
    },
  };
}
