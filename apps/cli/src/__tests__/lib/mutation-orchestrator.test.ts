import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import type { OpenedRuntimeDocument } from '../../lib/document';
import { CliError } from '../../lib/errors';
import { invokeOpenedDocumentOperation } from '../../lib/mutation-orchestrator';

type DocInvoke = OpenedRuntimeDocument['doc']['invoke'];

// Mirrors publicTrackChangeIdForRawId in special-handlers.ts for a single id:
// composite raw ids (with `|`) collapse to a SHA-1 stable id, so the decide
// pre-hook has to translate stable -> raw against the live list.
function stableTrackChangeId(rawId: string): string {
  if (rawId.length <= 64 && !/[|/\\]/.test(rawId)) return rawId;
  return createHash('sha1').update(rawId).digest('hex').slice(0, 24);
}

// A host session hands every operation a fresh lease whose `.doc` is the SAME
// pooled object (session-pool.ts createLease: `lease.doc = pooled.doc`). The
// orchestrator then builds a fresh per-call `invoke` closure over that stable
// doc. Returning a new lease object per call while sharing one `doc` reproduces
// exactly that shape; `invokeOpenedDocumentOperation` only ever touches
// `opened.doc.invoke`, so the minimal lease is faithful at runtime.
function hostSession(invoke: DocInvoke): () => OpenedRuntimeDocument {
  const doc = { invoke };
  return () => ({ runtime: 'v1', doc }) as unknown as OpenedRuntimeDocument;
}

const acceptDecided = (rawId: string) => ({
  success: true,
  removed: [{ entityType: 'trackedChange', entityId: rawId }],
  invalidatedRefs: [],
});

describe('mutation orchestrator track-change scope', () => {
  test('repeat decide of an already-resolved change reports NO_OP across host calls', async () => {
    const rawId = 'tc|main:/word/document.xml|ins|ScopeTester|2026-05-20T16:30:00Z|7';
    const stableId = stableTrackChangeId(rawId);
    const change = {
      id: rawId,
      type: 'insertion',
      author: 'ScopeTester',
      authorEmail: '',
      date: '2026-05-20T16:30:00Z',
      excerpt: 'resolve me once',
    };

    // After the first accept the change leaves the list, like the real adapter:
    // the second decide can no longer translate the stable id off the live list,
    // so the only thing that can produce NO_OP is the per-document resolved-id
    // memory surviving between calls.
    let listItems: { items: unknown[] } = { items: [change] };
    const invoke: DocInvoke = (request) => {
      if (request.operationId === 'trackChanges.list') return listItems;
      if (request.operationId === 'trackChanges.decide') {
        listItems = { items: [] };
        return acceptDecided(rawId);
      }
      throw new Error(`unexpected operation ${request.operationId}`);
    };
    const lease = hostSession(invoke);

    const first = await invokeOpenedDocumentOperation(lease(), 'trackChanges.decide', {
      decision: 'accept',
      target: { kind: 'id', id: stableId },
    });
    expect((first.result as { success?: boolean }).success).toBe(true);

    // Fresh lease => fresh per-call invoke closure; only the shared opened.doc
    // keeps the resolved-id memory alive. Must be NO_OP, not a fall-through that
    // hands a stale id to the adapter and surfaces TARGET_NOT_FOUND.
    let thrown: unknown;
    try {
      await invokeOpenedDocumentOperation(lease(), 'trackChanges.decide', {
        decision: 'accept',
        target: { kind: 'id', id: stableId },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).code).toBe('NO_OP');
  });

  test('resolved-id memory stays scoped to its own document', async () => {
    const rawId = 'tc|main:/word/document.xml|ins|DocScopeTester|2026-05-20T16:30:00Z|9';
    const stableId = stableTrackChangeId(rawId);
    const change = {
      id: rawId,
      type: 'insertion',
      author: 'DocScopeTester',
      authorEmail: '',
      date: '2026-05-20T16:30:00Z',
      excerpt: 'doc a only',
    };

    // Document A: accept the change, after which it is gone from A's list.
    let aItems: { items: unknown[] } = { items: [change] };
    const docA = hostSession((request) => {
      if (request.operationId === 'trackChanges.list') return aItems;
      if (request.operationId === 'trackChanges.decide') {
        aItems = { items: [] };
        return acceptDecided(rawId);
      }
      throw new Error(`unexpected operation ${request.operationId}`);
    });
    await invokeOpenedDocumentOperation(docA(), 'trackChanges.decide', {
      decision: 'accept',
      target: { kind: 'id', id: stableId },
    });

    // Document B never resolved this id and has an empty list, so the stable id
    // cannot be translated. With per-document scope B's own resolved set is
    // empty, so this must fall through and decide (not short-circuit to NO_OP).
    // A global/module-level scope would wrongly find A's id and throw NO_OP.
    const docB = hostSession((request) => {
      if (request.operationId === 'trackChanges.list') return { items: [] };
      if (request.operationId === 'trackChanges.decide') return acceptDecided(rawId);
      throw new Error(`unexpected operation ${request.operationId}`);
    });
    const result = await invokeOpenedDocumentOperation(docB(), 'trackChanges.decide', {
      decision: 'accept',
      target: { kind: 'id', id: stableId },
    });
    expect((result.result as { success?: boolean }).success).toBe(true);
  });
});
