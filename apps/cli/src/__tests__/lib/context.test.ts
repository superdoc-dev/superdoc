import { describe, expect, test } from 'bun:test';
import { normalizeContextMetadata, type ContextMetadata } from '../../lib/context';

function makeMetadata(overrides: Partial<ContextMetadata> = {}): ContextMetadata {
  return {
    contextId: 'test-session',
    projectRoot: '/tmp/test',
    source: 'path',
    sourcePath: '/tmp/test/doc.docx',
    workingDocPath: '/tmp/test/working.docx',
    dirty: false,
    revision: 0,
    sessionType: 'local',
    runtime: 'v1',
    openedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeContextMetadata', () => {
  describe('user normalization', () => {
    test('preserves valid user', () => {
      const metadata = makeMetadata({ user: { name: 'Bot', email: 'bot@co.com' } });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toEqual({ name: 'Bot', email: 'bot@co.com' });
    });

    test('strips non-object user', () => {
      const metadata = makeMetadata({ user: 42 as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('strips user with non-string name', () => {
      const metadata = makeMetadata({ user: { name: 123, email: 'a@b.com' } as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('strips user with empty name', () => {
      const metadata = makeMetadata({ user: { name: '', email: 'a@b.com' } });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('strips user with non-string email', () => {
      const metadata = makeMetadata({ user: { name: 'Bot', email: 123 } as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('preserves user with empty email', () => {
      const metadata = makeMetadata({ user: { name: 'Bot', email: '' } });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toEqual({ name: 'Bot', email: '' });
    });

    test('strips array user', () => {
      const metadata = makeMetadata({ user: ['Bot'] as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('strips string user', () => {
      const metadata = makeMetadata({ user: 'Bot' as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });

    test('preserves undefined user', () => {
      const metadata = makeMetadata();
      const result = normalizeContextMetadata(metadata);
      expect(result.user).toBeUndefined();
    });
  });

  describe('runtime normalization', () => {
    test('preserves the supported v1 runtime', () => {
      const result = normalizeContextMetadata(makeMetadata({ runtime: 'v1' }));
      expect(result.runtime).toBe('v1');
    });

    test('defaults an absent runtime to v1', () => {
      const result = normalizeContextMetadata(makeMetadata({ runtime: undefined as any }));
      expect(result.runtime).toBe('v1');
    });

    test('normalizes stale unsupported runtime metadata to v1', () => {
      const metadata = makeMetadata({ runtime: 'legacy-runtime' as any });
      expect(normalizeContextMetadata(metadata).runtime).toBe('v1');
    });

    test('normalizes any unknown runtime value to v1', () => {
      const metadata = makeMetadata({ runtime: 'v3' as any });
      expect(normalizeContextMetadata(metadata).runtime).toBe('v1');
    });
  });

  describe('session type normalization', () => {
    test('normalizes unknown session type to local', () => {
      const metadata = makeMetadata({ sessionType: 'unknown' as any });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
    });

    test('preserves collab session type with valid collaboration', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'hocuspocus',
          url: 'ws://localhost:4000',
          documentId: 'test-doc',
        },
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('collab');
      expect(result.collaboration).toBeDefined();
    });

    test('falls back to local when collab profile is missing', () => {
      const metadata = makeMetadata({ sessionType: 'collab' });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('preserves websocket params on rehydration', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'y-websocket',
          url: 'ws://localhost:4000',
          documentId: 'test-doc',
          params: { customAttributions: 'agent_id:abc', region: 'us-east-1' },
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('collab');
      expect(result.collaboration).toMatchObject({
        params: { customAttributions: 'agent_id:abc', region: 'us-east-1' },
      });
    });

    test('preserves websocket profile when params is absent', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'y-websocket',
          url: 'ws://localhost:4000',
          documentId: 'test-doc',
        },
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('collab');
      expect(result.collaboration).toBeDefined();
      expect((result.collaboration as any).params).toBeUndefined();
    });

    test('rejects websocket profile with non-object params', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'y-websocket',
          url: 'ws://localhost:4000',
          documentId: 'test-doc',
          params: 'not-an-object',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('rejects websocket profile with non-string param values', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'y-websocket',
          url: 'ws://localhost:4000',
          documentId: 'test-doc',
          params: { count: 42 },
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('preserves Liveblocks collab profile with publicApiKey', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room-123',
          publicApiKey: 'pk_test_xxx',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('collab');
      expect(result.collaboration).toEqual({
        providerType: 'liveblocks',
        documentId: 'lb-room-123',
        publicApiKey: 'pk_test_xxx',
      });
    });

    test('preserves Liveblocks collab profile with authEndpoint', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room-456',
          authEndpoint: 'https://example.com/auth',
          authHeadersEnv: 'LB_HEADERS',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('collab');
      expect(result.collaboration).toEqual({
        providerType: 'liveblocks',
        documentId: 'lb-room-456',
        authEndpoint: 'https://example.com/auth',
        authHeadersEnv: 'LB_HEADERS',
      });
    });

    test('rejects Liveblocks profile with both auth modes', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room',
          publicApiKey: 'pk_xxx',
          authEndpoint: 'https://x',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('rejects Liveblocks profile with neither auth mode', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('rejects malformed Liveblocks profile (missing documentId)', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          publicApiKey: 'pk_xxx',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
    });

    test('rejects Liveblocks profile with relative authEndpoint', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room',
          authEndpoint: '/api/auth',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('rejects Liveblocks profile with authHeadersEnv but no authEndpoint', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room',
          publicApiKey: 'pk_xxx',
          authHeadersEnv: 'MY_HEADERS',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });

    test('rejects Liveblocks profile with invalid authHeadersEnv name', () => {
      const metadata = makeMetadata({
        sessionType: 'collab',
        collaboration: {
          providerType: 'liveblocks',
          documentId: 'lb-room',
          authEndpoint: 'https://example.com/auth',
          authHeadersEnv: '123-invalid',
        } as any,
      });
      const result = normalizeContextMetadata(metadata);
      expect(result.sessionType).toBe('local');
      expect(result.collaboration).toBeUndefined();
    });
  });
});
