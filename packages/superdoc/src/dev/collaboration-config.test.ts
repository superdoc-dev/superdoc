import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vite-plus/test';
import {
  createDevCollaborationAutoUrl,
  createDevDocumentConfig,
  createDevV2CollaborationConfig,
  resolveDevCollaborationRoomMode,
  resolveDevCollaborationServerUrl,
} from './collaboration-config';

describe('dev v2 collaboration config', () => {
  test('treats the bare collab URL as an auto room open', () => {
    expect(resolveDevCollaborationRoomMode(null)).toBe('auto');
  });

  test('accepts explicit room intents and rejects ambiguous values', () => {
    expect(resolveDevCollaborationRoomMode('auto')).toBe('auto');
    expect(resolveDevCollaborationRoomMode('create')).toBe('create');
    expect(resolveDevCollaborationRoomMode('join')).toBe('join');
    expect(() => resolveDevCollaborationRoomMode('open-or-create')).toThrow('Expected "auto", "create", or "join"');
  });

  test('allows an isolated collaboration server URL while preserving the default', () => {
    expect(resolveDevCollaborationServerUrl(null)).toBe('ws://localhost:8081/v2/collaboration');
    expect(resolveDevCollaborationServerUrl('ws://127.0.0.1:8181/v2/collaboration')).toBe(
      'ws://127.0.0.1:8181/v2/collaboration',
    );
  });

  test('promotes a successful creator URL back to auto mode for reloads', () => {
    expect(createDevCollaborationAutoUrl('http://localhost:9094/?collab=1&room=room-1&collabRoomMode=create')).toBe(
      'http://localhost:9094/?collab=1&room=room-1',
    );
  });

  test('puts the provider target on document.v2Collaboration', () => {
    const v2Collaboration = createDevV2CollaborationConfig({
      enabled: true,
      serverUrl: 'ws://localhost:8081/v2/collaboration',
      documentId: 'room-1',
      roomMode: 'create',
      userId: 'dev-user',
    });
    const source = new Blob(['docx']);

    expect(createDevDocumentConfig({ source, id: 'document-123', v2Collaboration })).toEqual({
      data: source,
      id: 'document-123',
      v2Collaboration: {
        providerType: 'y-websocket',
        serverUrl: 'ws://localhost:8081/v2/collaboration',
        documentId: 'room-1',
        roomMode: 'create',
        params: { userId: 'dev-user' },
      },
    });
  });

  test('does not create a legacy collaboration config when collaboration is disabled', () => {
    expect(
      createDevV2CollaborationConfig({
        enabled: false,
        serverUrl: 'ws://localhost:8081/v2/collaboration',
        documentId: 'room-1',
        roomMode: null,
      }),
    ).toBeNull();
  });

  test('keeps the auto room policy out of runtime collaboration config', () => {
    expect(() =>
      createDevV2CollaborationConfig({
        enabled: true,
        serverUrl: 'ws://localhost:8081/v2/collaboration',
        documentId: 'room-1',
        roomMode: 'auto' as never,
      }),
    ).toThrow('requires an explicit create or join room mode');
  });

  test('keeps provider ownership in the v2 runtime', () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const devAppSource = readFileSync(resolve(testDirectory, 'components/SuperdocDev.vue'), 'utf8');

    expect(devAppSource).toContain('createDevV2CollaborationConfig');
    expect(devAppSource).toContain('createDevDocumentConfig');
    expect(devAppSource).not.toContain("from 'y-websocket'");
    expect(devAppSource).not.toContain("from 'yjs'");
    expect(devAppSource).not.toContain('modules.collaboration');
    expect(devAppSource).not.toContain('new EventSource');
    expect(devAppSource).not.toContain('legacyCollab');
  });

  test('keeps dev collaboration vite wiring v2-only', () => {
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const packageRoot = resolve(testDirectory, '../..');

    for (const configFile of ['vite.config.js', 'vite.config.devapp.js']) {
      const configSource = readFileSync(resolve(packageRoot, configFile), 'utf8');
      expect(configSource).not.toContain('y-prosemirror');
      expect(configSource).not.toContain('prosemirror-');
      expect(configSource).toContain("dedupe: ['yjs']");
    }
  });
});
