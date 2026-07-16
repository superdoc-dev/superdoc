/**
 * Proofs for two hardening changes on the in-process host:
 *
 *  1. Per-session author identity: a caller can attribute tracked changes to a
 *     specific author via `openDocument(..., { user })`, overriding the env/default
 *     identity. Omitting `user` keeps the env/default behavior.
 *  2. Dirty tracking via the authoritative COMMAND_CATALOG: a read-only op leaves
 *     the export byte-identical to the input, a mutating op changes it, and a
 *     dryRun of a mutating op leaves it byte-identical.
 */

import { test, expect, afterEach } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { COMMAND_CATALOG } from '@superdoc/document-api';
import { openDocument } from './index';

const FIXTURE = join(import.meta.dir, '../../../evals/fixtures/docs/employment-offer.docx');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

// Representative ops, asserted against the catalog so the test fails loudly if a
// future contract change flips their mutation classification.
const READONLY_OP = 'getText';
const MUTATING_OP = 'insert';

test('catalog classifies our representative ops as expected', () => {
  expect(COMMAND_CATALOG[READONLY_OP].mutates).toBe(false);
  expect(COMMAND_CATALOG[MUTATING_OP].mutates).toBe(true);
});

interface TrackChange {
  author?: string;
}
interface TrackChangesList {
  items: TrackChange[];
}

async function listTrackedAuthors(session: Awaited<ReturnType<typeof openDocument>>): Promise<string[]> {
  const result = (await session.invoke('trackChanges.list', {})) as TrackChangesList;
  return result.items.map((item) => item.author ?? '');
}

// Restore any env we touch so tests stay order-independent.
const savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete savedEnv[key];
  }
});
function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('per-session user identity attributes tracked changes to the provided author', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  // Make sure the default path could NOT accidentally produce the expected name.
  setEnv('SUPERDOC_DOC_AUTHOR', undefined);
  setEnv('SUPERDOC_DOC_AUTHOR_ID', undefined);

  const session = await openDocument(source, { user: { id: 'agent-7', name: 'Agent Seven' } });
  try {
    await session.invoke('insert', { value: 'tracked identity marker', type: 'text' }, { changeMode: 'tracked' });
    const authors = await listTrackedAuthors(session);
    expect(authors.length).toBeGreaterThan(0);
    expect(authors).toContain('Agent Seven');
    // The headless default must not appear when an explicit identity was given.
    expect(authors).not.toContain('Document Host');
  } finally {
    session.close();
  }
});

test('omitting user falls back to the SUPERDOC_DOC_AUTHOR env identity', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  setEnv('SUPERDOC_DOC_AUTHOR', 'Env Author');
  setEnv('SUPERDOC_DOC_AUTHOR_ID', 'env-author');

  const session = await openDocument(source);
  try {
    await session.invoke('insert', { value: 'env identity marker', type: 'text' }, { changeMode: 'tracked' });
    const authors = await listTrackedAuthors(session);
    expect(authors).toContain('Env Author');
  } finally {
    session.close();
  }
});

test('omitting user and env falls back to the Document Host default', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  setEnv('SUPERDOC_DOC_AUTHOR', undefined);
  setEnv('SUPERDOC_DOC_AUTHOR_ID', undefined);

  const session = await openDocument(source);
  try {
    await session.invoke('insert', { value: 'default identity marker', type: 'text' }, { changeMode: 'tracked' });
    const authors = await listTrackedAuthors(session);
    expect(authors).toContain('Document Host');
  } finally {
    session.close();
  }
});

test('a read-only op (catalog mutates:false) leaves the export byte-identical to the input', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const session = await openDocument(source);
  try {
    await session.invoke(READONLY_OP, {});
    const exported = await session.export();
    // Byte identity: the no-op save returns the original bytes verbatim.
    expect(sha(exported)).toBe(sha(source));
  } finally {
    session.close();
  }
});

test('a mutating op (catalog mutates:true) changes the export', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const session = await openDocument(source);
  try {
    await session.invoke(MUTATING_OP, { value: 'real mutation marker', type: 'text' });
    const exported = await session.export();
    expect(sha(exported)).not.toBe(sha(source));
  } finally {
    session.close();
  }
});

test('a dryRun of a mutating op leaves the export byte-identical to the input', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));
  const session = await openDocument(source);
  try {
    await session.invoke(MUTATING_OP, { value: 'preview only marker', type: 'text' }, { dryRun: true });
    const exported = await session.export();
    expect(sha(exported)).toBe(sha(source));
  } finally {
    session.close();
  }
});
