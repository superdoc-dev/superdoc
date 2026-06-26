import { describe, it, expect, afterEach } from 'bun:test';
import { resolve } from 'node:path';
import { SessionManager, DEFAULT_MCP_USER } from '../session-manager.js';

const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');

describe('SessionManager', () => {
  const manager = new SessionManager();

  afterEach(async () => {
    await manager.closeAll();
  });

  it('opens a .docx file and returns a session', async () => {
    const session = await manager.open(BLANK_DOCX);

    expect(session.id).toBeString();
    expect(session.filePath).toBe(BLANK_DOCX);
    expect(session.editor).toBeDefined();
    expect(session.api).toBeDefined();
    expect(session.openedAt).toBeNumber();
  });

  it('retrieves an open session by id', async () => {
    const session = await manager.open(BLANK_DOCX);
    const retrieved = manager.get(session.id);

    expect(retrieved).toBe(session);
  });

  it('throws when getting a non-existent session', () => {
    expect(() => manager.get('nonexistent')).toThrow('No open session');
  });

  it('lists open sessions', async () => {
    const session = await manager.open(BLANK_DOCX);
    const list = manager.list();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(session.id);
    expect(list[0].filePath).toBe(BLANK_DOCX);
  });

  it('closes a session', async () => {
    const session = await manager.open(BLANK_DOCX);
    await manager.close(session.id);

    expect(() => manager.get(session.id)).toThrow('No open session');
    expect(manager.list()).toHaveLength(0);
  });

  it('close is idempotent for unknown ids', async () => {
    await manager.close('nonexistent');
    // should not throw
  });

  it('saves a document to a temp path', async () => {
    const session = await manager.open(BLANK_DOCX);
    const tmpPath = resolve(import.meta.dir, '../../../../tmp-test-output.docx');

    const result = await manager.save(session.id, tmpPath);

    expect(result.path).toBe(tmpPath);
    expect(result.byteLength).toBeGreaterThan(0);

    // Clean up
    const { unlink } = await import('node:fs/promises');
    await unlink(tmpPath).catch(() => {});
  });

  it('generates human-friendly session ids', async () => {
    const session = await manager.open(BLANK_DOCX);

    // Should contain part of the filename
    expect(session.id).toMatch(/^blank-[a-f0-9]{6}$/);
  });

  it('attributes edits to the default author when none is configured', async () => {
    const session = await manager.open(BLANK_DOCX);

    // The opened editor carries the author tracked changes/comments are recorded under.
    expect(session.editor.options.user).toEqual(DEFAULT_MCP_USER);
    expect(session.editor.options.user.name).toBe('MCP Server');
  });

  it('attributes edits to a configured author (tracked-change w:author)', async () => {
    const scoped = new SessionManager({ id: 'agent', name: 'Agent' });
    try {
      const session = await scoped.open(BLANK_DOCX);
      expect(session.editor.options.user).toEqual({ id: 'agent', name: 'Agent' });
      expect(session.editor.options.user.name).toBe('Agent');
    } finally {
      await scoped.closeAll();
    }
  });
});
