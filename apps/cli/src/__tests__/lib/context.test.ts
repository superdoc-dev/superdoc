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
  });
});
