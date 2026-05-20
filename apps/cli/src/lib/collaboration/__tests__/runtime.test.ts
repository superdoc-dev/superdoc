import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { WebSocketCollaborationProfile } from '../types';

// ---------------------------------------------------------------------------
// Mock y-websocket and @hocuspocus/provider before importing the module
// ---------------------------------------------------------------------------

const mockWsInstance = {
  on: mock(() => {}),
  off: mock(() => {}),
  disconnect: mock(() => {}),
  destroy: mock(() => {}),
  synced: false,
};

const MockWebsocketProvider = mock(function (this: unknown, ..._args: unknown[]) {
  Object.assign(this as Record<string, unknown>, mockWsInstance);
});

const mockHocuspocusInstance = {
  on: mock(() => {}),
  off: mock(() => {}),
  disconnect: mock(() => {}),
  destroy: mock(() => {}),
  synced: false,
};

const MockHocuspocusProvider = mock(function (this: unknown, ..._args: unknown[]) {
  Object.assign(this as Record<string, unknown>, mockHocuspocusInstance);
});

mock.module('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

mock.module('@hocuspocus/provider', () => ({
  HocuspocusProvider: MockHocuspocusProvider,
}));

const { createCollaborationRuntime } = await import('../runtime');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebSocketProfile(overrides: Partial<WebSocketCollaborationProfile> = {}): WebSocketCollaborationProfile {
  return {
    providerType: 'y-websocket',
    url: 'ws://localhost:4000',
    documentId: 'doc-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCollaborationRuntime — y-websocket', () => {
  beforeEach(() => {
    MockWebsocketProvider.mockClear();
    delete process.env.TEST_TOKEN_ENV;
  });

  afterEach(() => {
    delete process.env.TEST_TOKEN_ENV;
  });

  test('forwards params to WebsocketProvider options', () => {
    createCollaborationRuntime(
      makeWebSocketProfile({ params: { customAttributions: 'agent_id:abc', region: 'us-east-1' } }),
    );

    expect(MockWebsocketProvider).toHaveBeenCalledTimes(1);
    const args = MockWebsocketProvider.mock.calls[0];
    const providerOptions = args[3] as { params: Record<string, string> };
    expect(providerOptions.params).toMatchObject({
      customAttributions: 'agent_id:abc',
      region: 'us-east-1',
    });
  });

  test('merges params with token when both are present', () => {
    process.env.TEST_TOKEN_ENV = 'auth-token-123';
    createCollaborationRuntime(
      makeWebSocketProfile({
        tokenEnv: 'TEST_TOKEN_ENV',
        params: { region: 'us' },
      }),
    );

    const args = MockWebsocketProvider.mock.calls[0];
    const providerOptions = args[3] as { params: Record<string, string> };
    expect(providerOptions.params).toEqual({
      region: 'us',
      token: 'auth-token-123',
    });
  });

  test('token overrides a colliding params.token entry', () => {
    // params.token is rejected at parse time, but the runtime must still
    // defend in depth — the auth token wins regardless.
    process.env.TEST_TOKEN_ENV = 'real-token';
    createCollaborationRuntime(
      makeWebSocketProfile({
        tokenEnv: 'TEST_TOKEN_ENV',
        params: { token: 'user-supplied' } as Record<string, string>,
      }),
    );

    const args = MockWebsocketProvider.mock.calls[0];
    const providerOptions = args[3] as { params: Record<string, string> };
    expect(providerOptions.params.token).toBe('real-token');
  });

  test('passes only token when params is absent', () => {
    process.env.TEST_TOKEN_ENV = 'auth-token';
    createCollaborationRuntime(makeWebSocketProfile({ tokenEnv: 'TEST_TOKEN_ENV' }));

    const args = MockWebsocketProvider.mock.calls[0];
    const providerOptions = args[3] as { params: Record<string, string> };
    expect(providerOptions.params).toEqual({ token: 'auth-token' });
  });

  test('omits options.params entirely when neither params nor token are present', () => {
    createCollaborationRuntime(makeWebSocketProfile());

    const args = MockWebsocketProvider.mock.calls[0];
    const providerOptions = args[3] as { params?: Record<string, string> };
    expect(providerOptions.params).toBeUndefined();
  });
});

describe('createCollaborationRuntime — hocuspocus', () => {
  beforeEach(() => {
    MockHocuspocusProvider.mockClear();
    delete process.env.TEST_TOKEN_ENV;
  });

  afterEach(() => {
    delete process.env.TEST_TOKEN_ENV;
  });

  test('forwards params as `parameters` option (Hocuspocus native field name)', () => {
    createCollaborationRuntime(
      makeWebSocketProfile({
        providerType: 'hocuspocus',
        params: { workspaceId: 'ws_123' },
      }),
    );

    expect(MockHocuspocusProvider).toHaveBeenCalledTimes(1);
    const args = MockHocuspocusProvider.mock.calls[0];
    const config = args[0] as { parameters?: Record<string, string> };
    expect(config.parameters).toEqual({ workspaceId: 'ws_123' });
  });

  test('parameters is undefined when params is absent', () => {
    createCollaborationRuntime(makeWebSocketProfile({ providerType: 'hocuspocus' }));

    const args = MockHocuspocusProvider.mock.calls[0];
    const config = args[0] as { parameters?: Record<string, string> };
    expect(config.parameters).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SD-3233: waitForProviderSync — connection-failure surfacing
//
// Standalone harness so each test gets a fresh provider with a real
// event-emitter shape. Validates that connection-close events fired
// during the sync wait surface on the COLLABORATION_SYNC_TIMEOUT
// error's `details`, and that the success path stays clean.
// ---------------------------------------------------------------------------

const { waitForProviderSync } = await import('../runtime');

type Handler = (...args: unknown[]) => void;

function makeFakeProvider() {
  const handlers = new Map<string, Set<Handler>>();
  const provider = {
    synced: false as boolean,
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
  };
  return provider;
}

describe('waitForProviderSync — SD-3233 connection-failure capture', () => {
  test('success path produces no failure details', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 500);

    // Sync arrives normally.
    setTimeout(() => provider.emit('synced'), 10);

    await expect(promise).resolves.toBeUndefined();
  });

  test('timeout error includes captured connection-close events', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 200);

    // Fire two distinct connection-close events before the timeout fires.
    setTimeout(() => provider.emit('connection-close', { code: 1006, reason: 'Failed to connect' }), 20);
    setTimeout(() => provider.emit('connection-close', { code: 1015, reason: 'TLS handshake failed' }), 60);

    try {
      await promise;
      throw new Error('expected timeout');
    } catch (err) {
      const e = err as { code: string; details?: { timeoutMs?: number; attempts?: number; lastErrors?: unknown[] } };
      expect(e.code).toBe('COLLABORATION_SYNC_TIMEOUT');
      expect(e.details?.timeoutMs).toBe(200);
      expect(e.details?.attempts).toBe(2);
      const errors = e.details?.lastErrors as Array<{ code?: number; reason?: string }>;
      expect(errors).toHaveLength(2);
      expect(errors[0]?.code).toBe(1006);
      expect(errors[0]?.reason).toBe('Failed to connect');
      expect(errors[1]?.code).toBe(1015);
      expect(errors[1]?.reason).toBe('TLS handshake failed');
    }
  });

  test('captured failures are bounded to the last 5', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 200);

    // Fire eight connection-close events; only the last 5 should survive.
    for (let i = 1; i <= 8; i += 1) {
      const code = 4000 + i;
      setTimeout(() => provider.emit('connection-close', { code, reason: `attempt-${i}` }), 5 * i);
    }

    try {
      await promise;
      throw new Error('expected timeout');
    } catch (err) {
      const e = err as { details?: { attempts?: number; lastErrors?: Array<{ reason?: string }> } };
      expect(e.details?.attempts).toBe(5);
      const reasons = e.details?.lastErrors?.map((entry) => entry.reason);
      // Earliest three (attempt-1..attempt-3) dropped; last five retained in order.
      expect(reasons).toEqual(['attempt-4', 'attempt-5', 'attempt-6', 'attempt-7', 'attempt-8']);
    }
  });

  test('success after transient failures still resolves with no error details', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 500);

    // Two failures then a successful sync.
    setTimeout(() => provider.emit('connection-close', { code: 1006, reason: 'transient' }), 20);
    setTimeout(() => provider.emit('connection-close', { code: 1006, reason: 'transient' }), 40);
    setTimeout(() => provider.emit('synced'), 80);

    await expect(promise).resolves.toBeUndefined();
  });

  test('timeout without any connection-close events keeps the legacy details shape', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 100);

    try {
      await promise;
      throw new Error('expected timeout');
    } catch (err) {
      const e = err as {
        code: string;
        details?: { timeoutMs?: number; attempts?: unknown; lastErrors?: unknown };
      };
      expect(e.code).toBe('COLLABORATION_SYNC_TIMEOUT');
      expect(e.details?.timeoutMs).toBe(100);
      // Backwards-compat: when no failures captured, attempts/lastErrors are omitted entirely.
      expect(e.details?.attempts).toBeUndefined();
      expect(e.details?.lastErrors).toBeUndefined();
    }
  });

  test('handles connection-close events with missing fields gracefully', async () => {
    const provider = makeFakeProvider();
    const promise = waitForProviderSync(provider as never, 150);

    // Event with no code/reason — could happen if the underlying socket dies oddly.
    setTimeout(() => provider.emit('connection-close', {}), 10);
    setTimeout(() => provider.emit('connection-close', undefined), 30);
    setTimeout(() => provider.emit('connection-close', { code: 1006 }), 50);

    try {
      await promise;
      throw new Error('expected timeout');
    } catch (err) {
      const e = err as { details?: { lastErrors?: Array<Record<string, unknown>> } };
      const errors = e.details?.lastErrors ?? [];
      expect(errors).toHaveLength(3);
      // Each record has `at`, and optional code/reason without crashing on undefined.
      for (const entry of errors) {
        expect(typeof entry.at).toBe('number');
      }
      expect(errors[2]?.code).toBe(1006);
    }
  });
});
