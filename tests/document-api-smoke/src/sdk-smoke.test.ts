import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { createSuperDocClient, type SuperDocClient, type SuperDocDocument } from '@superdoc-dev/sdk';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const CLI_BIN = path.join(REPO_ROOT, 'apps/cli/dist/index.js');

function createSessionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBlocks(items: unknown): Array<Record<string, unknown>> {
  if (!isRecord(items) || !Array.isArray(items.blocks)) {
    throw new Error('Expected blocks.list() to return a blocks array.');
  }
  return items.blocks.filter(isRecord);
}

function findBlockNodeId(items: unknown, nodeType: string): string {
  const block = getBlocks(items).find((entry) => entry.nodeType === nodeType);
  if (!block || typeof block.nodeId !== 'string') {
    throw new Error(`Expected to find a ${nodeType} block with a string nodeId.`);
  }
  return block.nodeId;
}

describe('document api smoke', () => {
  let client: SuperDocClient | null = null;
  let doc: SuperDocDocument | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    await doc?.close({ discard: true }).catch(() => {});
    doc = null;
    await client?.dispose().catch(() => {});
    client = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
    }
  });

  test('exposes representative bound namespaces and methods', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superdoc-docapi-smoke-'));
    client = createSuperDocClient({
      requestTimeoutMs: 30_000,
      startupTimeoutMs: 30_000,
      shutdownTimeoutMs: 30_000,
      env: {
        SUPERDOC_CLI_BIN: CLI_BIN,
        SUPERDOC_CLI_STATE_DIR: path.join(tempDir, '.superdoc-cli-state'),
      },
    });

    await client.connect();
    doc = await client.open({ sessionId: createSessionId('smoke-methods') });

    expect(typeof doc.save).toBe('function');
    expect(typeof doc.close).toBe('function');
    expect(typeof doc.getText).toBe('function');
    expect(typeof doc.extract).toBe('function');
    expect(typeof doc.insert).toBe('function');
    expect(typeof doc.capabilities.get).toBe('function');
    expect(typeof doc.blocks.list).toBe('function');
    expect(typeof doc.lists.create).toBe('function');
    expect(typeof doc.lists.delete).toBe('function');
    expect(typeof doc.lists.merge).toBe('function');
    expect(typeof doc.lists.split).toBe('function');
    expect(typeof doc.tables.get).toBe('function');
    expect(typeof doc.tables.setCellText).toBe('function');
    expect(typeof doc.tables.applyPreset).toBe('function');
    expect(typeof doc.create.table).toBe('function');
    expect(typeof doc.customXml.parts.list).toBe('function');
    expect(typeof doc.customXml.parts.get).toBe('function');
    expect(typeof doc.customXml.parts.create).toBe('function');
    expect(typeof doc.customXml.parts.patch).toBe('function');
    expect(typeof doc.customXml.parts.remove).toBe('function');
    expect(typeof doc.metadata.attach).toBe('function');
    expect(typeof doc.metadata.list).toBe('function');
    expect(typeof doc.metadata.get).toBe('function');
    expect(typeof doc.metadata.update).toBe('function');
    expect(typeof doc.metadata.remove).toBe('function');
    expect(typeof doc.metadata.resolve).toBe('function');
    expect(typeof doc.selection.current).toBe('function');
  });

  test('runs a representative SDK roundtrip workflow', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'superdoc-docapi-smoke-'));
    const stateDir = path.join(tempDir, '.superdoc-cli-state');
    const savedDocPath = path.join(tempDir, 'roundtrip.docx');
    const insertedText = `Document API smoke ${Date.now()}`;

    client = createSuperDocClient({
      requestTimeoutMs: 30_000,
      startupTimeoutMs: 30_000,
      shutdownTimeoutMs: 30_000,
      env: {
        SUPERDOC_CLI_BIN: CLI_BIN,
        SUPERDOC_CLI_STATE_DIR: stateDir,
      },
    });

    await client.connect();
    doc = await client.open({ sessionId: createSessionId('smoke-roundtrip') });

    const capabilities = await doc.capabilities.get();
    expect(isRecord(capabilities)).toBe(true);

    await doc.insert({ value: insertedText });
    expect(await doc.getText()).toContain(insertedText);

    const paragraphNodeId = findBlockNodeId(await doc.blocks.list({ limit: 10 }), 'paragraph');
    await doc.lists.create({
      target: { kind: 'block', nodeType: 'paragraph', nodeId: paragraphNodeId },
      mode: 'fromParagraphs',
      kind: 'bullet',
    });

    const lists = await doc.lists.list({ limit: 10 });
    expect(typeof lists.total).toBe('number');
    expect(lists.total).toBeGreaterThan(0);

    await doc.create.table({
      rows: 2,
      columns: 2,
      at: { kind: 'documentEnd' },
    });

    await doc.save({ out: savedDocPath });
    await doc.close();
    doc = null;

    doc = await client.open({
      doc: savedDocPath,
      sessionId: createSessionId('smoke-reopen'),
    });

    expect(await doc.getText()).toContain(insertedText);

    const reopenedLists = await doc.lists.list({ limit: 10 });
    expect(reopenedLists.total).toBeGreaterThan(0);

    const reopenedTableNodeId = findBlockNodeId(await doc.blocks.list({ limit: 20 }), 'table');
    const reopenedTable = await doc.tables.get({ nodeId: reopenedTableNodeId });
    expect(reopenedTable.rows).toBe(2);
    expect(reopenedTable.columns).toBe(2);
  });
});
