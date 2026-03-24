import { describe, expect, test } from 'bun:test';
import {
  buildShorthandCollaborationInput,
  DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE,
  parseCollaborationInput,
  resolveCollaborationProfile,
} from '../collaboration';

describe('buildShorthandCollaborationInput', () => {
  test('uses y-websocket as the default provider type', () => {
    expect(DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE).toBe('y-websocket');
  });

  test('returns a validated CollaborationInput with all params', () => {
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
    const input = buildShorthandCollaborationInput({ url: 'ws://localhost:4000' });

    expect(input.providerType).toBe('y-websocket');
    expect(input.url).toBe('ws://localhost:4000');
    expect(input.documentId).toBeUndefined();
    expect(input.onMissing).toBeUndefined();
    expect(input.bootstrapSettlingMs).toBeUndefined();
  });

  test('flows through to resolveCollaborationProfile with correct provider', () => {
    const input = buildShorthandCollaborationInput({
      url: 'ws://localhost:4000',
      documentId: 'my-doc-room',
    });
    const profile = resolveCollaborationProfile(input, 'fallback-session');

    expect(profile.providerType).toBe('y-websocket');
    expect(profile.documentId).toBe('my-doc-room');
  });
});

describe('parseCollaborationInput', () => {
  test('accepts explicit hocuspocus provider type', () => {
    const input = parseCollaborationInput({
      providerType: 'hocuspocus',
      url: 'ws://localhost:1234',
      documentId: 'room-1',
    });

    expect(input.providerType).toBe('hocuspocus');
  });
});
