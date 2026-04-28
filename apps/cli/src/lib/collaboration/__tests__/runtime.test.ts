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
