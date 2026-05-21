import { describe, expect, test } from 'bun:test';
import { attachProviderDiagnostics, sanitizeDiagnosticString } from '../diagnostics';
import type { SyncableProvider } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type EmittableProvider = SyncableProvider & {
  emit(event: string, ...args: unknown[]): void;
};

function makeEmittableProvider(initial: Partial<SyncableProvider> = {}): EmittableProvider {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    ...initial,
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(fn);
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      const arr = handlers.get(event);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    },
  } as EmittableProvider;
}

function baseContext() {
  return {
    providerType: 'y-websocket' as const,
    url: 'wss://broker.example.com/room',
    documentId: 'doc-1',
    tokenEnvConfigured: false,
    authTokenResolved: false,
    paramsKeys: [],
  };
}

// ---------------------------------------------------------------------------
// sanitizeDiagnosticString
// ---------------------------------------------------------------------------

describe('sanitizeDiagnosticString', () => {
  test('redacts ?token= in URL', () => {
    const out = sanitizeDiagnosticString('wss://broker.example.com/room?token=secret-abc-123');
    expect(out).not.toContain('secret-abc-123');
    expect(out).toContain('[REDACTED]');
  });

  test('redacts ?auth= in URL', () => {
    const out = sanitizeDiagnosticString('wss://x/r?auth=open-sesame-99');
    expect(out).not.toContain('open-sesame-99');
    expect(out).toContain('[REDACTED]');
  });

  test('redacts ?authorization= in URL', () => {
    const out = sanitizeDiagnosticString('https://x/r?authorization=BEARER-XYZ');
    expect(out).not.toContain('BEARER-XYZ');
    expect(out).toContain('[REDACTED]');
  });

  test('redacts ?password= in URL', () => {
    const out = sanitizeDiagnosticString('wss://x/r?password=p4ss');
    expect(out).not.toContain('p4ss');
    expect(out).toContain('[REDACTED]');
  });

  test('redacts ?apiKey= and ?api-key= in URL', () => {
    const out1 = sanitizeDiagnosticString('wss://x/r?apiKey=KEY-ONE');
    const out2 = sanitizeDiagnosticString('wss://x/r?api-key=KEY-TWO');
    expect(out1).not.toContain('KEY-ONE');
    expect(out2).not.toContain('KEY-TWO');
  });

  test('preserves non-sensitive params', () => {
    const out = sanitizeDiagnosticString('wss://x/r?token=secret&docId=open-data&region=us');
    expect(out).not.toContain('secret');
    expect(out).toContain('docId=open-data');
    expect(out).toContain('region=us');
  });

  test('redacts multiple sensitive keys at once', () => {
    const out = sanitizeDiagnosticString('wss://x/r?token=tok-x&auth=auth-y&secret=sec-z');
    expect(out).not.toContain('tok-x');
    expect(out).not.toContain('auth-y');
    expect(out).not.toContain('sec-z');
  });

  test('redacts tokens in free-form error messages', () => {
    const out = sanitizeDiagnosticString(
      "WebSocket connection to 'wss://broker.example.com/room?token=leaked-abc-123' failed: Expected 101",
    );
    expect(out).not.toContain('leaked-abc-123');
    expect(out).toContain('Expected 101');
  });

  test('leaves benign strings alone', () => {
    const out = sanitizeDiagnosticString('Expected 101 status code');
    expect(out).toBe('Expected 101 status code');
  });

  test('does not throw on malformed percent-encoded query keys', () => {
    // decodeURIComponent('%') throws URIError. The sanitizer runs inside the
    // sync-timeout callback, so any throw here would suppress the structured
    // COLLABORATION_SYNC_TIMEOUT envelope entirely.
    expect(() => sanitizeDiagnosticString('wss://broker/r?%=x')).not.toThrow();
    expect(typeof sanitizeDiagnosticString('wss://broker/r?%=x')).toBe('string');
  });

  test('still redacts other sensitive keys when one key has a malformed escape', () => {
    const out = sanitizeDiagnosticString('wss://broker/r?%=junk&token=secret-leak-123');
    expect(out).not.toContain('secret-leak-123');
    expect(out).toContain('[REDACTED]');
  });

  test('redacts percent-encoded sensitive key names', () => {
    // %74oken decodes to 'token' - should still be redacted so encoded
    // variants can't bypass the sensitivity check.
    const out = sanitizeDiagnosticString('wss://broker/r?%74oken=secret-leak-xyz');
    expect(out).not.toContain('secret-leak-xyz');
  });
});

// ---------------------------------------------------------------------------
// attachProviderDiagnostics — context fields
// ---------------------------------------------------------------------------

describe('attachProviderDiagnostics — timeout details shape', () => {
  test('includes every required field', () => {
    const provider = makeEmittableProvider({ synced: false });
    const diagnostics = attachProviderDiagnostics(provider, {
      providerType: 'y-websocket',
      url: 'wss://broker.example.com/room',
      documentId: 'doc-1',
      tokenEnvConfigured: true,
      authTokenResolved: true,
      paramsKeys: ['region', 'docVersion'],
    });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 9_500);

    expect(details).toMatchObject({
      timeoutMs: 10_000,
      elapsedMs: 9_500,
      providerType: 'y-websocket',
      url: 'wss://broker.example.com/room',
      documentId: 'doc-1',
      tokenEnvConfigured: true,
      authTokenResolved: true,
      paramsKeys: ['region', 'docVersion'],
    });
    expect(details.eventCounts).toBeDefined();
    expect(details.providerState).toBeDefined();
  });

  test('distinguishes auth-not-configured from auth-configured-and-resolved', () => {
    // The tokenEnv-configured-but-empty case throws MISSING_REQUIRED in
    // resolveCollaborationToken before runtime setup, so it can't reach
    // toTimeoutDetails. The two states we actually see at the timeout path
    // are: (a) no tokenEnv configured, no token resolved; (b) tokenEnv
    // configured AND env var resolved to a non-empty value.
    const provider = makeEmittableProvider();

    const notConfigured = attachProviderDiagnostics(provider, {
      ...baseContext(),
      tokenEnvConfigured: false,
      authTokenResolved: false,
    }).toTimeoutDetails(provider, 10_000, 1);
    expect(notConfigured.tokenEnvConfigured).toBe(false);
    expect(notConfigured.authTokenResolved).toBe(false);

    const configuredAndResolved = attachProviderDiagnostics(provider, {
      ...baseContext(),
      tokenEnvConfigured: true,
      authTokenResolved: true,
    }).toTimeoutDetails(provider, 10_000, 1);
    expect(configuredAndResolved.tokenEnvConfigured).toBe(true);
    expect(configuredAndResolved.authTokenResolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// attachProviderDiagnostics — event capture
// ---------------------------------------------------------------------------

describe('attachProviderDiagnostics — event capture', () => {
  test('captures last connection-close with code/reason/wasClean', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('connection-close', { code: 1006, reason: 'closed', wasClean: false });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect(details.lastConnectionClose).toMatchObject({
      code: 1006,
      reason: 'closed',
      wasClean: false,
    });
  });

  test('captures last connection-error', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('connection-error', { type: 'error', message: 'Expected 101 status code' });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect(details.lastConnectionError).toMatchObject({
      type: 'error',
      message: 'Expected 101 status code',
    });
  });

  test('captures last status', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('status', { status: 'connecting' });
    provider.emit('status', { status: 'connected' });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect(details.lastStatus).toMatchObject({ status: 'connected' });
  });

  test('skips null-payload connection-close (client-initiated disconnect)', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('connection-close', { code: 1006, reason: 'real', wasClean: false });
    provider.emit('connection-close', null);

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect((details.lastConnectionClose as { code?: number }).code).toBe(1006);
  });

  test('strips trailing provider self-reference (second emit arg)', () => {
    // y-websocket emits `[event, provider]`. The provider self-ref must NOT
    // appear in the captured payload - it would bloat the envelope and risk
    // leaking document content if the provider holds it.
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    const fakeProviderRef = {
      _observers: {},
      doc: { internals: 'should-not-leak' },
      wsconnected: false,
    };
    provider.emit('connection-error', { type: 'error', message: 'fail' }, fakeProviderRef);

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    const lastErr = details.lastConnectionError as Record<string, unknown>;
    expect(lastErr.type).toBe('error');
    expect(lastErr.message).toBe('fail');
    expect(JSON.stringify(lastErr)).not.toContain('should-not-leak');
    expect(JSON.stringify(lastErr)).not.toContain('_observers');
  });

  test('captures Hocuspocus authenticationFailed', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('authenticationFailed', { reason: 'permission-denied' });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect(details.lastAuthenticationFailed).toBeDefined();
  });

  test('eventCounts reflect number of emissions per event', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('status', { status: 'connecting' });
    provider.emit('status', { status: 'connected' });
    provider.emit('connection-error', { type: 'error', message: 'x' });
    provider.emit('connection-close', { code: 1006, reason: '', wasClean: false });
    provider.emit('connection-close', { code: 1006, reason: '', wasClean: false });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    const counts = details.eventCounts as Record<string, number>;
    expect(counts.status).toBe(2);
    expect(counts['connection-error']).toBe(1);
    expect(counts['connection-close']).toBe(2);
  });

  test('detach stops further capture and is idempotent', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('connection-error', { type: 'error', message: 'before-detach' });
    diagnostics.detach();
    diagnostics.detach(); // idempotent
    provider.emit('connection-error', { type: 'error', message: 'after-detach' });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect((details.lastConnectionError as { message?: string }).message).toBe('before-detach');
  });
});

// ---------------------------------------------------------------------------
// attachProviderDiagnostics — redaction in captured payloads
// ---------------------------------------------------------------------------

describe('attachProviderDiagnostics — redaction', () => {
  test('redacts token in URL inside event payload reason', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, baseContext());

    provider.emit('connection-error', {
      type: 'error',
      message: "WebSocket connection to 'wss://broker/room?token=leaked-xyz' failed",
    });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    const err = details.lastConnectionError as { message?: string };
    expect(err.message).not.toContain('leaked-xyz');
    expect(err.message).toContain('[REDACTED]');
  });

  test('redacts sensitive keys in url field of context', () => {
    const provider = makeEmittableProvider();
    const diagnostics = attachProviderDiagnostics(provider, {
      ...baseContext(),
      url: 'wss://broker.example.com/room?token=should-not-leak&region=us',
    });

    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1) as Record<string, unknown>;
    expect(details.url as string).not.toContain('should-not-leak');
    expect(details.url as string).toContain('region=us');
  });
});

// ---------------------------------------------------------------------------
// attachProviderDiagnostics — defensive subscription
// ---------------------------------------------------------------------------

describe('attachProviderDiagnostics — defensive subscription', () => {
  test('does not throw when provider.on throws', () => {
    const provider: SyncableProvider = {
      on() {
        throw new Error('subscribe failed');
      },
      off() {},
    };
    expect(() => attachProviderDiagnostics(provider, baseContext())).not.toThrow();
  });

  test('returns a working diagnostics object even when subscription fails', () => {
    const provider: SyncableProvider = {
      on() {
        throw new Error('subscribe failed');
      },
      off() {},
    };
    const diagnostics = attachProviderDiagnostics(provider, baseContext());
    const details = diagnostics.toTimeoutDetails(provider, 10_000, 1);
    expect(details).toBeDefined();
    expect((details as Record<string, unknown>).providerType).toBe('y-websocket');
  });
});
