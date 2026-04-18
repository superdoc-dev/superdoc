import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock @liveblocks/client and @liveblocks/yjs before importing the module
// ---------------------------------------------------------------------------

const mockProvider = {
  synced: false,
  on: mock(() => {}),
  off: mock(() => {}),
  destroy: mock(() => {}),
};

const mockRoom = {
  subscribe: mock((_event: string, _cb: (...args: any[]) => void) => mock(() => {})),
};

const mockLeave = mock(() => {});

const mockCreateClient = mock(() => ({
  enterRoom: mock(() => ({
    room: mockRoom,
    leave: mockLeave,
  })),
}));

const MockLiveblocksYjsProvider = mock(() => mockProvider);

mock.module('@liveblocks/client', () => ({
  createClient: mockCreateClient,
}));

mock.module('@liveblocks/yjs', () => ({
  LiveblocksYjsProvider: MockLiveblocksYjsProvider,
}));

// Import after mocking
const { createLiveblocksRuntime, classifyLiveblocksCloseCode } = await import('../liveblocks');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLiveblocksProfile(overrides = {}) {
  return {
    providerType: 'liveblocks' as const,
    documentId: 'test-room',
    publicApiKey: 'pk_test_xxx',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLiveblocksRuntime', () => {
  beforeEach(() => {
    mockProvider.synced = false;
    mockProvider.on.mockClear();
    mockProvider.off.mockClear();
    mockProvider.destroy.mockClear();
    mockLeave.mockClear();
    mockCreateClient.mockClear();
    MockLiveblocksYjsProvider.mockClear();
  });

  test('creates a runtime with publicApiKey', () => {
    const runtime = createLiveblocksRuntime(makeLiveblocksProfile());

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(runtime.ydoc).toBeDefined();
    expect(runtime.provider).toBeDefined();
    expect(typeof runtime.waitForSync).toBe('function');
    expect(typeof runtime.dispose).toBe('function');
  });

  test('creates a runtime with authEndpoint', () => {
    const runtime = createLiveblocksRuntime(
      makeLiveblocksProfile({
        publicApiKey: undefined,
        authEndpoint: 'https://example.com/auth',
      }),
    );

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const clientOpts = mockCreateClient.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(typeof clientOpts?.authEndpoint).toBe('function');
    expect(runtime.ydoc).toBeDefined();
  });

  test('dispose calls provider.destroy → leave → ydoc.destroy in order', () => {
    const callOrder: string[] = [];
    mockProvider.destroy.mockImplementation(() => callOrder.push('provider.destroy'));
    mockLeave.mockImplementation(() => callOrder.push('leave'));

    const runtime = createLiveblocksRuntime(makeLiveblocksProfile());
    const ydocDestroy = mock(() => callOrder.push('ydoc.destroy'));
    (runtime.ydoc as any).destroy = ydocDestroy;

    runtime.dispose();

    expect(callOrder).toEqual(['provider.destroy', 'leave', 'ydoc.destroy']);
  });

  test('waitForSync resolves immediately when already synced', async () => {
    mockProvider.synced = true;
    const runtime = createLiveblocksRuntime(makeLiveblocksProfile());
    await runtime.waitForSync(); // should not throw or hang
  });
});

// ---------------------------------------------------------------------------
// Auth headers resolution
// ---------------------------------------------------------------------------

describe('auth headers env resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  test('missing authHeadersEnv variable throws MISSING_REQUIRED', () => {
    delete process.env.MY_LB_HEADERS;

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: 'https://example.com/auth',
          authHeadersEnv: 'MY_LB_HEADERS',
        }),
      );
      expect.unreachable('should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('MISSING_REQUIRED');
    }
  });

  test('invalid JSON in authHeadersEnv throws VALIDATION_ERROR', () => {
    process.env.MY_LB_HEADERS = 'not-json';

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: 'https://example.com/auth',
          authHeadersEnv: 'MY_LB_HEADERS',
        }),
      );
      expect.unreachable('should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('non-string header values throw VALIDATION_ERROR', () => {
    process.env.MY_LB_HEADERS = JSON.stringify({ Authorization: 123 });

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: 'https://example.com/auth',
          authHeadersEnv: 'MY_LB_HEADERS',
        }),
      );
      expect.unreachable('should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('valid JSON headers env creates runtime successfully', () => {
    process.env.MY_LB_HEADERS = JSON.stringify({ Authorization: 'Bearer test' });

    const runtime = createLiveblocksRuntime(
      makeLiveblocksProfile({
        publicApiKey: undefined,
        authEndpoint: 'https://example.com/auth',
        authHeadersEnv: 'MY_LB_HEADERS',
      }),
    );
    expect(runtime.ydoc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Auth endpoint response validation
// ---------------------------------------------------------------------------

describe('auth endpoint response validation', () => {
  test('malformed auth response (missing token) rejects with COLLABORATION_AUTH_FAILED', async () => {
    // Start a local server that returns `{}` (no token field)
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: `http://localhost:${server.port}`,
        }),
      );

      // The authEndpoint callback is invoked by createClient when enterRoom is called.
      // Since we mocked createClient, we need to extract and call the callback directly.
      const clientOpts = mockCreateClient.mock.calls[mockCreateClient.mock.calls.length - 1]?.[0] as Record<
        string,
        unknown
      >;
      const authCallback = clientOpts?.authEndpoint as (room: string) => Promise<unknown>;
      expect(typeof authCallback).toBe('function');

      try {
        await authCallback('test-room');
        expect.unreachable('should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('COLLABORATION_AUTH_FAILED');
        expect(error.message).toContain('without a valid "token" field');
      }
    } finally {
      server.stop();
    }
  });

  test('auth endpoint returning non-2xx rejects with COLLABORATION_AUTH_FAILED', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response('Forbidden', { status: 403 }),
    });

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: `http://localhost:${server.port}`,
        }),
      );

      const clientOpts = mockCreateClient.mock.calls[mockCreateClient.mock.calls.length - 1]?.[0] as Record<
        string,
        unknown
      >;
      const authCallback = clientOpts?.authEndpoint as (room: string) => Promise<unknown>;

      try {
        await authCallback('test-room');
        expect.unreachable('should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('COLLABORATION_AUTH_FAILED');
        expect(error.message).toContain('403');
      }
    } finally {
      server.stop();
    }
  });

  test('auth endpoint returning valid token succeeds', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify({ token: 'test-jwt-token' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    try {
      createLiveblocksRuntime(
        makeLiveblocksProfile({
          publicApiKey: undefined,
          authEndpoint: `http://localhost:${server.port}`,
        }),
      );

      const clientOpts = mockCreateClient.mock.calls[mockCreateClient.mock.calls.length - 1]?.[0] as Record<
        string,
        unknown
      >;
      const authCallback = clientOpts?.authEndpoint as (room: string) => Promise<unknown>;

      const result = await authCallback('test-room');
      expect(result).toEqual({ token: 'test-jwt-token' });
    } finally {
      server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// Close code classification
// ---------------------------------------------------------------------------

describe('classifyLiveblocksCloseCode', () => {
  test('4001 (NOT_ALLOWED) → COLLABORATION_AUTH_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4001);
    expect(result?.errorCode).toBe('COLLABORATION_AUTH_FAILED');
  });

  test('4109 (TOKEN_EXPIRED) → COLLABORATION_AUTH_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4109);
    expect(result?.errorCode).toBe('COLLABORATION_AUTH_FAILED');
  });

  test('4100 (KICKED) → COLLABORATION_AUTH_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4100);
    expect(result?.errorCode).toBe('COLLABORATION_AUTH_FAILED');
  });

  test('4003 (MAX_CONCURRENT_CONNECTIONS) → COLLABORATION_CAPACITY_EXCEEDED', () => {
    const result = classifyLiveblocksCloseCode(4003);
    expect(result?.errorCode).toBe('COLLABORATION_CAPACITY_EXCEEDED');
  });

  test('4005 (MAX_CONCURRENT_CONNECTIONS_PER_ROOM) → COLLABORATION_CAPACITY_EXCEEDED', () => {
    const result = classifyLiveblocksCloseCode(4005);
    expect(result?.errorCode).toBe('COLLABORATION_CAPACITY_EXCEEDED');
  });

  test('4006 (ROOM_ID_UPDATED) → COLLABORATION_CONNECTION_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4006);
    expect(result?.errorCode).toBe('COLLABORATION_CONNECTION_FAILED');
  });

  test('4999 (CLOSE_WITHOUT_RETRY) → COLLABORATION_CONNECTION_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4999);
    expect(result?.errorCode).toBe('COLLABORATION_CONNECTION_FAILED');
  });

  test('4000 (INVALID_MESSAGE_FORMAT) → COLLABORATION_CONNECTION_FAILED', () => {
    const result = classifyLiveblocksCloseCode(4000);
    expect(result?.errorCode).toBe('COLLABORATION_CONNECTION_FAILED');
  });

  test('-1 (connection failure) → COLLABORATION_CONNECTION_FAILED', () => {
    const result = classifyLiveblocksCloseCode(-1);
    expect(result?.errorCode).toBe('COLLABORATION_CONNECTION_FAILED');
  });

  test('unmapped 40xx code falls through to terminal catch-all', () => {
    const result = classifyLiveblocksCloseCode(4042);
    expect(result?.errorCode).toBe('COLLABORATION_CONNECTION_FAILED');
    expect(result?.label).toBe('terminal room error');
  });

  test('1xxx transient codes return null (not terminal)', () => {
    expect(classifyLiveblocksCloseCode(1006)).toBeNull();
    expect(classifyLiveblocksCloseCode(1013)).toBeNull();
  });

  test('unknown codes return null', () => {
    expect(classifyLiveblocksCloseCode(9999)).toBeNull();
    expect(classifyLiveblocksCloseCode(0)).toBeNull();
  });
});
