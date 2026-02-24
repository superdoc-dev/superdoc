import { describe, it, expect, afterEach } from 'bun:test';
import { resolve } from 'node:path';
import { SessionManager } from '../session-manager.js';

const BLANK_DOCX = resolve(import.meta.dir, '../../../../shared/common/data/blank.docx');

describe('MCP tools integration', () => {
  const sessions = new SessionManager();

  afterEach(async () => {
    await sessions.closeAll();
  });

  it('open → info → close lifecycle', async () => {
    const session = await sessions.open(BLANK_DOCX);
    const { api } = sessions.get(session.id);

    const info = api.invoke({ operationId: 'info', input: {} });
    expect(info).toBeDefined();

    await sessions.close(session.id);
    expect(() => sessions.get(session.id)).toThrow();
  });

  it('getText returns document text', async () => {
    const session = await sessions.open(BLANK_DOCX);
    const { api } = sessions.get(session.id);

    const text = api.invoke({ operationId: 'getText', input: {} });
    expect(text).toBeDefined();
    // blank.docx may have empty or minimal text
    expect(typeof text === 'string' || typeof text === 'object').toBe(true);
  });

  it('find returns results for paragraphs', async () => {
    const session = await sessions.open(BLANK_DOCX);
    const { api } = sessions.get(session.id);

    const result = api.invoke({
      operationId: 'find',
      input: {
        query: { select: { type: 'node', nodeType: 'paragraph' } },
      },
    });

    expect(result).toBeDefined();
  });

  it('create.paragraph adds a paragraph', async () => {
    const session = await sessions.open(BLANK_DOCX);
    const { api } = sessions.get(session.id);

    const result = api.invoke({
      operationId: 'create.paragraph',
      input: { text: 'Hello from MCP' },
    });

    expect(result).toBeDefined();

    // Verify the text was inserted
    const text = api.invoke({ operationId: 'getText', input: {} });
    expect(String(text)).toContain('Hello from MCP');
  });

  it('insert + getText roundtrip', async () => {
    const session = await sessions.open(BLANK_DOCX);
    const { api } = sessions.get(session.id);

    // Create a paragraph first to have a target
    const created = api.invoke({
      operationId: 'create.paragraph',
      input: { text: 'Initial text' },
    }) as { paragraph?: unknown; insertionPoint?: unknown };

    expect(created).toBeDefined();

    // Verify
    const text = api.invoke({ operationId: 'getText', input: {} });
    expect(String(text)).toContain('Initial text');
  });
});
