import { describe, it, expect } from 'vitest';
import { isCollaborationActive } from './collaboration-detection.js';

function makeEditor(collaborationProvider: unknown) {
  return { options: { collaborationProvider } } as Parameters<typeof isCollaborationActive>[0];
}

describe('isCollaborationActive', () => {
  it('returns false when no provider is registered', () => {
    expect(isCollaborationActive(makeEditor(null))).toBe(false);
    expect(isCollaborationActive(makeEditor(undefined))).toBe(false);
  });

  it('returns false when provider is registered but pre-initial-sync (synced: false)', () => {
    expect(isCollaborationActive(makeEditor({ synced: false }))).toBe(false);
  });

  it('returns true when provider is connected and synced (synced: true)', () => {
    expect(isCollaborationActive(makeEditor({ synced: true }))).toBe(true);
  });

  it('returns true when provider uses isSynced: true', () => {
    expect(isCollaborationActive(makeEditor({ isSynced: true }))).toBe(true);
  });

  it('returns false when provider uses isSynced: false', () => {
    expect(isCollaborationActive(makeEditor({ isSynced: false }))).toBe(false);
  });

  it('returns false when provider is an empty object (no sync flags)', () => {
    expect(isCollaborationActive(makeEditor({}))).toBe(false);
  });

  // --- "has ever synced" latch behavior ---

  it('stays true after provider synced then disconnected (synced flips to false)', () => {
    const provider = { synced: true };
    const editor = makeEditor(provider);

    // First call: synced, latches the provider
    expect(isCollaborationActive(editor)).toBe(true);

    // Simulate transient disconnect
    provider.synced = false;

    // Should still report active due to latch
    expect(isCollaborationActive(editor)).toBe(true);
  });

  it('stays true after provider synced then disconnected (isSynced flips to false)', () => {
    const provider = { isSynced: true } as { isSynced: boolean };
    const editor = makeEditor(provider);

    expect(isCollaborationActive(editor)).toBe(true);

    provider.isSynced = false;
    expect(isCollaborationActive(editor)).toBe(true);
  });

  it('returns false when provider is removed after previously syncing', () => {
    const provider = { synced: true };
    const editor = makeEditor(provider);

    expect(isCollaborationActive(editor)).toBe(true);

    // Simulate provider removal (collaboration fully torn down)
    (editor.options as { collaborationProvider: unknown }).collaborationProvider = null;
    expect(isCollaborationActive(editor)).toBe(false);
  });

  it('does not latch a provider that never synced', () => {
    const provider = { synced: false };
    const editor = makeEditor(provider);

    expect(isCollaborationActive(editor)).toBe(false);
    expect(isCollaborationActive(editor)).toBe(false);
  });
});
