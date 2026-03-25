import { describe, expect, test } from 'bun:test';
import {
  buildShorthandCollaborationInput,
  DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE,
  parseCollaborationInput,
  resolveCollaborationProfile,
  toPublicCollaborationSummary,
  type WebSocketCollaborationInput,
} from '../index';

// ---------------------------------------------------------------------------
// Shorthand builder
// ---------------------------------------------------------------------------

describe('buildShorthandCollaborationInput', () => {
  test('defaults to y-websocket', () => {
    expect(DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE).toBe('y-websocket');
  });

  test('returns a validated input with all params', () => {
    const input = buildShorthandCollaborationInput({
      url: 'ws://localhost:4000',
      documentId: 'my-doc-room',
      onMissing: 'error',
      bootstrapSettlingMs: 2000,
    });

    expect(input).toEqual({
      providerType: 'y-websocket',
      url: 'ws://localhost:4000',
      documentId: 'my-doc-room',
      onMissing: 'error',
      bootstrapSettlingMs: 2000,
    });
  });

  test('handles minimal params (url-only)', () => {
    const input = buildShorthandCollaborationInput({ url: 'ws://localhost:4000' }) as WebSocketCollaborationInput;
    expect(input.providerType).toBe('y-websocket');
    expect(input.url).toBe('ws://localhost:4000');
  });

  test('flows through to resolveCollaborationProfile', () => {
    const input = buildShorthandCollaborationInput({
      url: 'ws://localhost:4000',
      documentId: 'my-doc-room',
    });
    const profile = resolveCollaborationProfile(input, 'fallback-session');
    expect(profile.providerType).toBe('y-websocket');
    expect(profile.documentId).toBe('my-doc-room');
  });
});

// ---------------------------------------------------------------------------
// WebSocket parsing
// ---------------------------------------------------------------------------

describe('parseCollaborationInput — websocket', () => {
  test('accepts explicit hocuspocus provider type', () => {
    const input = parseCollaborationInput({
      providerType: 'hocuspocus',
      url: 'ws://localhost:1234',
      documentId: 'room-1',
    });
    expect(input.providerType).toBe('hocuspocus');
  });

  test('accepts y-websocket with tokenEnv', () => {
    const input = parseCollaborationInput({
      providerType: 'y-websocket',
      url: 'ws://localhost:4000',
      tokenEnv: 'MY_TOKEN',
    });
    expect(input).toMatchObject({ providerType: 'y-websocket', url: 'ws://localhost:4000' });
  });

  test('rejects token field', () => {
    expect(() => parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', token: 'secret' })).toThrow(
      'collaboration.token is not supported',
    );
  });

  test('rejects params field', () => {
    expect(() => parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', params: {} })).toThrow(
      'collaboration.params is not supported',
    );
  });

  test('rejects Liveblocks-only fields on websocket providers', () => {
    expect(() => parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', roomId: 'room' })).toThrow(
      'collaboration.roomId is not supported for websocket',
    );

    expect(() =>
      parseCollaborationInput({ providerType: 'hocuspocus', url: 'ws://x', publicApiKey: 'pk_xxx' }),
    ).toThrow('collaboration.publicApiKey is only supported for Liveblocks');

    expect(() =>
      parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', authEndpoint: 'https://x' }),
    ).toThrow('collaboration.authEndpoint is only supported for Liveblocks');

    expect(() =>
      parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', authHeadersEnv: 'HEADERS' }),
    ).toThrow('collaboration.authHeadersEnv is only supported for Liveblocks');
  });

  test('rejects unknown keys', () => {
    expect(() => parseCollaborationInput({ providerType: 'y-websocket', url: 'ws://x', foo: 'bar' })).toThrow(
      'collaboration.foo is not supported',
    );
  });
});

// ---------------------------------------------------------------------------
// Liveblocks parsing
// ---------------------------------------------------------------------------

describe('parseCollaborationInput — liveblocks', () => {
  test('accepts publicApiKey input', () => {
    const input = parseCollaborationInput({
      providerType: 'liveblocks',
      roomId: 'my-room',
      publicApiKey: 'pk_test_xxx',
    });
    expect(input).toMatchObject({
      providerType: 'liveblocks',
      roomId: 'my-room',
      publicApiKey: 'pk_test_xxx',
    });
  });

  test('accepts authEndpoint + authHeadersEnv', () => {
    const input = parseCollaborationInput({
      providerType: 'liveblocks',
      roomId: 'my-room',
      authEndpoint: 'https://api.example.com/auth',
      authHeadersEnv: 'LB_HEADERS',
    });
    expect(input).toMatchObject({
      providerType: 'liveblocks',
      roomId: 'my-room',
      authEndpoint: 'https://api.example.com/auth',
      authHeadersEnv: 'LB_HEADERS',
    });
  });

  test('rejects missing roomId', () => {
    expect(() => parseCollaborationInput({ providerType: 'liveblocks', publicApiKey: 'pk_xxx' })).toThrow(
      'collaboration.roomId must be a non-empty string',
    );
  });

  test('rejects both publicApiKey and authEndpoint', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        authEndpoint: 'https://x',
      }),
    ).toThrow('either publicApiKey or authEndpoint, not both');
  });

  test('rejects neither publicApiKey nor authEndpoint', () => {
    expect(() => parseCollaborationInput({ providerType: 'liveblocks', roomId: 'room' })).toThrow(
      'either publicApiKey or authEndpoint',
    );
  });

  test('rejects authHeadersEnv without authEndpoint', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        authHeadersEnv: 'HEADERS',
      }),
    ).toThrow('authHeadersEnv is only valid with authEndpoint');
  });

  test('rejects relative authEndpoint', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        authEndpoint: '/api/liveblocks-auth',
      }),
    ).toThrow('absolute URL');

    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        authEndpoint: 'api/auth',
      }),
    ).toThrow('absolute URL');
  });

  test('rejects websocket-only fields on Liveblocks', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        url: 'ws://x',
      }),
    ).toThrow('collaboration.url is not supported for Liveblocks');

    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        documentId: 'doc-1',
      }),
    ).toThrow('collaboration.documentId is not supported for Liveblocks');

    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        tokenEnv: 'TOKEN',
      }),
    ).toThrow('collaboration.tokenEnv is not supported for Liveblocks');
  });

  test('rejects inline headers', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        authEndpoint: 'https://x',
        headers: { Authorization: 'Bearer x' },
      }),
    ).toThrow('collaboration.headers is not supported');
  });

  test('rejects unknown keys', () => {
    expect(() =>
      parseCollaborationInput({
        providerType: 'liveblocks',
        roomId: 'room',
        publicApiKey: 'pk_xxx',
        unknownField: 'value',
      }),
    ).toThrow('collaboration.unknownField is not supported');
  });
});

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

describe('resolveCollaborationProfile', () => {
  test('websocket: documentId defaults to sessionId', () => {
    const input = parseCollaborationInput({
      providerType: 'y-websocket',
      url: 'ws://localhost:4000',
    });
    const profile = resolveCollaborationProfile(input, 'my-session-id');
    expect(profile.documentId).toBe('my-session-id');
  });

  test('websocket: explicit documentId overrides sessionId', () => {
    const input = parseCollaborationInput({
      providerType: 'y-websocket',
      url: 'ws://localhost:4000',
      documentId: 'explicit-doc',
    });
    const profile = resolveCollaborationProfile(input, 'my-session-id');
    expect(profile.documentId).toBe('explicit-doc');
  });

  test('liveblocks: roomId maps to documentId directly', () => {
    const input = parseCollaborationInput({
      providerType: 'liveblocks',
      roomId: 'lb-room-123',
      publicApiKey: 'pk_test_xxx',
    });
    const profile = resolveCollaborationProfile(input, 'session-should-not-be-used');
    expect(profile.documentId).toBe('lb-room-123');
  });
});

// ---------------------------------------------------------------------------
// Public summary (redaction)
// ---------------------------------------------------------------------------

describe('toPublicCollaborationSummary', () => {
  test('websocket: includes url', () => {
    const summary = toPublicCollaborationSummary({
      providerType: 'y-websocket',
      url: 'ws://localhost:4000',
      documentId: 'doc-1',
      tokenEnv: 'MY_SECRET',
    });
    expect(summary).toEqual({
      providerType: 'y-websocket',
      documentId: 'doc-1',
      url: 'ws://localhost:4000',
    });
  });

  test('liveblocks: excludes auth config', () => {
    const summary = toPublicCollaborationSummary({
      providerType: 'liveblocks',
      documentId: 'lb-room',
      publicApiKey: 'pk_secret_xxx',
      authEndpoint: undefined,
    });
    expect(summary).toEqual({
      providerType: 'liveblocks',
      documentId: 'lb-room',
    });
    expect(summary).not.toHaveProperty('publicApiKey');
    expect(summary).not.toHaveProperty('authEndpoint');
    expect(summary).not.toHaveProperty('authHeadersEnv');
  });

  test('hocuspocus: strips tokenEnv', () => {
    const summary = toPublicCollaborationSummary({
      providerType: 'hocuspocus',
      url: 'ws://hp:1234',
      documentId: 'hp-doc',
      tokenEnv: 'HP_TOKEN',
    });
    expect(summary).not.toHaveProperty('tokenEnv');
    expect(summary.url).toBe('ws://hp:1234');
  });
});

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

describe('parseCollaborationInput — general', () => {
  test('rejects non-object', () => {
    expect(() => parseCollaborationInput('string')).toThrow('must be an object');
    expect(() => parseCollaborationInput(null)).toThrow('must be an object');
    expect(() => parseCollaborationInput(42)).toThrow('must be an object');
  });

  test('rejects invalid providerType', () => {
    expect(() => parseCollaborationInput({ providerType: 'unknown', url: 'ws://x' })).toThrow(
      '"hocuspocus", "y-websocket", or "liveblocks"',
    );
  });
});
