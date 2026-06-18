/**
 * SD-3214 regression: comment metadata authored on the browser side (Y.Array)
 * must reach the headless SDK's CommentEntityStore so `doc.comments.list()`
 * surfaces text / creatorName / creatorEmail / createdTime.
 *
 * Architectural gap (pre-fix): browser clients write to BOTH
 * `ydoc.getArray('comments')` (metadata) and the PM XmlFragment (anchor marks).
 * The headless CLI bridge only handled the WRITE direction. The fix wires
 * `bridge.attachEditor(editor)` to observe Y.Array and feed entries through
 * `syncCommentEntitiesFromCollaboration`.
 *
 * This test focuses on the ENTITY STORE flow: when a Y.Array entry exists
 * pre-open OR arrives post-open, its metadata should be readable via
 * `doc.comments.list()`. (PM anchor presence is orthogonal — it supplies
 * target/anchoredText/status when the comment is anchored to text.)
 */
import { describe, expect, it } from 'vitest';
import { Doc as YDoc, Map as YMap } from 'yjs';
import { openDocument } from '../document';

// Bun currently loads duplicate Yjs instances across the CLI test harness and
// the editor collaboration stack, which breaks shared-Y.Doc constructor checks.
// Keep this regression covered in non-Bun runners where the Yjs runtime is
// unified.
const describeSharedYDoc = typeof Bun === 'undefined' ? describe : describe.skip;

function createIo() {
  return {
    stdout() {},
    stderr() {},
    async readStdinBytes() {
      return new Uint8Array();
    },
    now() {
      return Date.now();
    },
  };
}

function createProviderStub() {
  const noop = () => {};
  return {
    synced: true,
    awareness: {
      on: noop,
      off: noop,
      getStates: () => new Map(),
      setLocalState: noop,
      setLocalStateField: noop,
    },
    on: noop,
    off: noop,
    connect: noop,
    disconnect: noop,
    destroy: noop,
  };
}

/**
 * Mirror the shape `addYComment` in collaboration-comments.js produces when
 * a browser user creates a comment via SuperDoc.vue's normal flow.
 */
function pushBrowserAuthoredComment(ydoc: YDoc, comment: Record<string, unknown>): void {
  const yArray = ydoc.getArray('comments');
  const yComment = new YMap(Object.entries(comment));
  ydoc.transact(
    () => {
      yArray.push([yComment]);
    },
    { user: { name: comment.creatorName, email: comment.creatorEmail } },
  );
}

function expectFirstMatchBlock(matchResult: { items: Array<{ blocks: Array<{ blockId: string; range: unknown }> }> }) {
  const block = matchResult.items[0]?.blocks[0];
  expect(block).toBeDefined();
  if (!block) {
    throw new Error('Expected query to return at least one block match.');
  }
  return block;
}

describeSharedYDoc('SD-3214: headless SDK reads browser-authored comment metadata', () => {
  it('exposes creatorName, createdTime, and text from Y.Array entries pre-existing at open', async () => {
    const ydoc = new YDoc();

    // Browser authored this comment BEFORE the headless client connected.
    pushBrowserAuthoredComment(ydoc, {
      commentId: 'c-browser-pre',
      commentText: 'Please review this clause.',
      creatorName: 'Browser User',
      creatorEmail: 'browser@example.com',
      createdTime: 1700000000000,
      isInternal: false,
    });

    const opened = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-doc',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    const result = opened.editor.doc.comments.list();
    opened.dispose();

    const item = result.items.find((c) => c.id === 'c-browser-pre');
    expect(item, 'browser-authored comment should be listed by headless SDK').toBeDefined();
    expect(item?.text, 'commentText from Y.Array should reach SDK').toBe('Please review this clause.');
    expect(item?.creatorName, 'creatorName from Y.Array should reach SDK').toBe('Browser User');
    expect(item?.creatorEmail, 'creatorEmail from Y.Array should reach SDK').toBe('browser@example.com');
    expect(item?.createdTime, 'createdTime from Y.Array should reach SDK').toBe(1700000000000);
  });

  it('exposes metadata for browser-authored comments that arrive AFTER open via Y.Array observe', async () => {
    const ydoc = new YDoc();

    const opened = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-doc-late',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    // Browser authors the comment AFTER the headless client connected.
    pushBrowserAuthoredComment(ydoc, {
      commentId: 'c-browser-late',
      commentText: 'A late comment.',
      creatorName: 'Late Browser User',
      creatorEmail: 'late@example.com',
      createdTime: 1700000001000,
      isInternal: false,
    });

    const result = opened.editor.doc.comments.list();
    opened.dispose();

    const late = result.items.find((c) => c.id === 'c-browser-late');
    expect(late, 'late browser-authored comment should be listed').toBeDefined();
    expect(late?.text).toBe('A late comment.');
    expect(late?.creatorName).toBe('Late Browser User');
    expect(late?.creatorEmail).toBe('late@example.com');
    expect(late?.createdTime).toBe(1700000001000);
  });

  it('a remote update to an existing browser comment surfaces the new fields', async () => {
    const ydoc = new YDoc();

    pushBrowserAuthoredComment(ydoc, {
      commentId: 'c-update',
      commentText: 'v1',
      creatorName: 'Browser User',
      creatorEmail: 'browser@example.com',
      createdTime: 1700000002000,
    });

    const opened = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-doc-update',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    // Browser edits the same comment.
    const yArray = ydoc.getArray<YMap<unknown>>('comments');
    ydoc.transact(
      () => {
        yArray.delete(0, 1);
        yArray.push([
          new YMap(
            Object.entries({
              commentId: 'c-update',
              commentText: 'v2',
              creatorName: 'Browser User',
              creatorEmail: 'browser@example.com',
              createdTime: 1700000002000,
            }),
          ),
        ]);
      },
      { user: { name: 'Browser User', email: 'browser@example.com' } },
    );

    const result = opened.editor.doc.comments.list();
    opened.dispose();

    const item = result.items.find((c) => c.id === 'c-update');
    expect(item?.text).toBe('v2');
  });
});

// ---------------------------------------------------------------------------
// Two-client validation (SD-3214 follow-up).
// Option A: two Editors on a single shared Y.Doc — proves Yjs change broadcast
// reaches Session B's bridge through the real write path that a browser SuperDoc
// would use (editor.commands.addComment + bridge onCommentsUpdate → addYComment).
// Option B: two distinct Y.Docs synced by relaying updates — closer to
// wire-protocol reality. Verifies origin filtering survives applyUpdate hops.
// ---------------------------------------------------------------------------

import { applyUpdate as yApplyUpdate, encodeStateAsUpdate as yEncodeStateAsUpdate } from 'yjs';

describeSharedYDoc('SD-3214: two-client end-to-end', () => {
  it('Option A — shared Y.Doc: Session B sees a comment authored by Session A', async () => {
    const ydoc = new YDoc();

    // Session A — author (the "browser" side, run as a headless Editor here so
    // the test stays in Node; the code path it exercises is identical to what
    // SuperDoc.vue runs).
    const sessionA = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-shared-doc',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Browser User', email: 'browser@example.com' },
    });
    const insertA = sessionA.editor.doc.create.paragraph({
      at: { kind: 'documentEnd' },
      text: 'A clause about indemnification.',
    });
    expect(insertA.success).toBe(true);
    const matchA = sessionA.editor.doc.query.match({
      select: { type: 'text', pattern: 'indemnification' },
      require: 'first',
    });
    const matchBlock = expectFirstMatchBlock(matchA);
    const create = sessionA.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock.blockId, range: matchBlock.range } as never,
      text: 'Please review this clause.',
    });
    expect(create.success).toBe(true);

    // Session B — agent connects to the SAME ydoc.
    const sessionB = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-shared-doc',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: false,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    const listB = sessionB.editor.doc.comments.list();
    sessionA.dispose();
    sessionB.dispose();

    expect(listB.items.length).toBeGreaterThanOrEqual(1);
    const item = listB.items[0];
    // Anchor-derived fields survive via PM/Yjs sync.
    expect(item.target).toBeDefined();
    // Y.Array-derived metadata — the field set the ticket flagged as empty.
    expect(item.text).toBe('Please review this clause.');
    expect(item.creatorName).toBe('Browser User');
    expect(item.creatorEmail).toBe('browser@example.com');
    expect(item.createdTime).toBeTypeOf('number');
  });

  it('Option A — origin filter: Session A does not double-sync its own writes through observe', async () => {
    // After A writes a comment, A's bridge observer fires for its own write.
    // The origin filter must skip — otherwise the entry could be processed
    // twice (idempotent thanks to upsert, but wasted work and a hint of a
    // broken filter that would matter under deletion).
    const ydoc = new YDoc();
    const sessionA = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-self-echo',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Author', email: 'author@example.com' },
    });
    sessionA.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A short clause.' });
    const matchBlock = expectFirstMatchBlock(
      sessionA.editor.doc.query.match({
        select: { type: 'text', pattern: 'clause' },
        require: 'first',
      }),
    );
    sessionA.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock.blockId, range: matchBlock.range } as never,
      text: 'mine',
    });

    // Trigger any pending observers by reading.
    const list = sessionA.editor.doc.comments.list();
    sessionA.dispose();

    expect(list.items).toHaveLength(1);
    expect(list.items[0].text).toBe('mine');
    expect(list.items[0].creatorName).toBe('Author');
  });

  it('Option B — two Y.Docs synced via update relay: Session B sees the metadata', async () => {
    const docA = new YDoc();
    const docB = new YDoc();

    // Manual sync relay — simulates a network bridge. Origin tags prevent
    // infinite echo loops.
    const relayAtoB = (update: Uint8Array, origin: unknown) => {
      if (origin === 'from-B') return;
      yApplyUpdate(docB, update, 'from-A');
    };
    const relayBtoA = (update: Uint8Array, origin: unknown) => {
      if (origin === 'from-A') return;
      yApplyUpdate(docA, update, 'from-B');
    };
    docA.on('update', relayAtoB);
    docB.on('update', relayBtoA);

    const sessionA = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-two-docs',
      ydoc: docA,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Browser User', email: 'browser@example.com' },
    });
    sessionA.editor.doc.create.paragraph({
      at: { kind: 'documentEnd' },
      text: 'A clause on confidentiality.',
    });
    const matchA = sessionA.editor.doc.query.match({
      select: { type: 'text', pattern: 'confidentiality' },
      require: 'first',
    });
    const matchBlockA = expectFirstMatchBlock(matchA);
    sessionA.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlockA.blockId, range: matchBlockA.range } as never,
      text: 'Confidentiality should cover IP.',
    });

    // Seed docB from docA before opening Session B — mimics a fresh client
    // joining the room after some history exists.
    yApplyUpdate(docB, yEncodeStateAsUpdate(docA), 'from-A');

    const sessionB = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-two-docs',
      ydoc: docB,
      collaborationProvider: createProviderStub(),
      isNewFile: false,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    const listB = sessionB.editor.doc.comments.list();
    sessionA.dispose();
    sessionB.dispose();
    docA.off('update', relayAtoB);
    docB.off('update', relayBtoA);

    expect(listB.items.length).toBeGreaterThanOrEqual(1);
    const item = listB.items[0];
    expect(item.text).toBe('Confidentiality should cover IP.');
    expect(item.creatorName).toBe('Browser User');
    expect(item.creatorEmail).toBe('browser@example.com');
  });

  it('Option A — remote delete: when a browser removes a comment from Y.Array, Session B prunes the entry', async () => {
    // Scope: this validates Session B's READ-SIDE prune behavior. The browser
    // delete is simulated by removing the entry from ydoc.getArray('comments')
    // directly — exactly what packages/superdoc/.../collaboration-comments.js
    // deleteYComment does. The CLI's own write-side delete bridging is tracked
    // separately; SD-3214 covers metadata propagation from browser to agent.
    const ydoc = new YDoc();

    // Seed Y.Array with a browser-authored comment.
    pushBrowserAuthoredComment(ydoc, {
      commentId: 'c-to-delete',
      commentText: 'Will be removed.',
      creatorName: 'Browser User',
      creatorEmail: 'browser@example.com',
      createdTime: 1700000010000,
    });

    const opened = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-delete-readside',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    // Session sees the comment after attach.
    const beforeList = opened.editor.doc.comments.list();
    expect(beforeList.items.find((c) => c.id === 'c-to-delete')).toBeDefined();

    // Simulate browser deletion of the Y.Array entry.
    const yArr = ydoc.getArray<YMap<unknown>>('comments');
    const idx = (yArr.toJSON() as Array<Record<string, unknown>>).findIndex((c) => c.commentId === 'c-to-delete');
    ydoc.transact(
      () => {
        yArr.delete(idx, 1);
      },
      { user: { name: 'Browser User', email: 'browser@example.com' } },
    );

    const afterList = opened.editor.doc.comments.list();
    opened.dispose();

    expect(afterList.items.find((c) => c.id === 'c-to-delete')).toBeUndefined();
  });

  it('CLI write-side delete: agent.comments.delete propagates to Y.Array (customer "agent resolves comments" flow)', async () => {
    // The customer's headless agent needs to mutate comments and have those
    // mutations reach other browser collaborators. resolveComment / removeComment
    // engine commands don't emit `commentsUpdate`, so SD-3214's bridge fix
    // pairs with wrapper-level emits in `comments-wrappers.ts`.
    const ydoc = new YDoc();
    const session = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-cli-delete',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });
    session.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A clause to delete.' });
    const matchBlock = session.editor.doc.query.match({
      select: { type: 'text', pattern: 'delete' },
      require: 'first',
    }).items[0].blocks[0];
    session.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock!.blockId, range: matchBlock!.range } as never,
      text: 'agent-authored',
    });
    const yArr = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
    expect(yArr.length).toBe(1);
    const targetId = yArr[0].commentId as string;

    // Agent deletes — this is the write-side that previously didn't propagate.
    const del = session.editor.doc.comments.delete({ commentId: targetId });
    expect(del.success).toBe(true);

    // Y.Array now reflects the delete (other collaborators would observe this).
    const afterYArr = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
    session.dispose();
    expect(afterYArr).toHaveLength(0);
  });

  it('CLI write-side resolve: agent.comments.patch({status:resolved}) propagates resolvedTime to Y.Array', async () => {
    const ydoc = new YDoc();
    const session = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-cli-resolve',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });
    session.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A clause to resolve.' });
    const matchBlock = session.editor.doc.query.match({
      select: { type: 'text', pattern: 'resolve' },
      require: 'first',
    }).items[0].blocks[0];
    session.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock!.blockId, range: matchBlock!.range } as never,
      text: 'pending review',
    });
    const initial = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
    const targetId = initial[0].commentId as string;
    expect(initial[0].resolvedTime).toBeFalsy();

    // Agent resolves via the public patch surface.
    const patch = session.editor.doc.comments.patch({ commentId: targetId, status: 'resolved' });
    expect(patch.success).toBe(true);

    // Y.Array reflects the resolution.
    const after = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
    session.dispose();
    expect(after).toHaveLength(1);
    expect(after[0].isDone).toBe(true);
    expect(typeof after[0].resolvedTime).toBe('number');
  });

  it('Option B — post-open browser write: a comment authored AFTER the agent connects still propagates', async () => {
    const docA = new YDoc();
    const docB = new YDoc();
    const relayAtoB = (update: Uint8Array, origin: unknown) => {
      if (origin === 'from-B') return;
      yApplyUpdate(docB, update, 'from-A');
    };
    const relayBtoA = (update: Uint8Array, origin: unknown) => {
      if (origin === 'from-A') return;
      yApplyUpdate(docA, update, 'from-B');
    };
    docA.on('update', relayAtoB);
    docB.on('update', relayBtoA);

    // Agent connects FIRST.
    const sessionB = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-late-author',
      ydoc: docB,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });

    // Browser connects and authors a comment.
    const sessionA = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-late-author',
      ydoc: docA,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Browser User', email: 'browser@example.com' },
    });
    sessionA.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A late clause.' });
    const matchBlock = expectFirstMatchBlock(
      sessionA.editor.doc.query.match({
        select: { type: 'text', pattern: 'late clause' },
        require: 'first',
      }),
    );
    sessionA.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock.blockId, range: matchBlock.range } as never,
      text: 'Late comment.',
    });

    const listB = sessionB.editor.doc.comments.list();
    sessionA.dispose();
    sessionB.dispose();
    docA.off('update', relayAtoB);
    docB.off('update', relayBtoA);

    const found = listB.items.find((c) => (c as { text?: string }).text === 'Late comment.');
    expect(found, 'browser-authored comment after agent connect should reach agent').toBeDefined();
    expect((found as { creatorName?: string }).creatorName).toBe('Browser User');
  });

  // Codex P2 — "Track own Y.Array writes before filtering": the bridge used
  // to skip own-origin Y.Array events to avoid redundant work, but that also
  // meant `previousSyncedIds` never learned about agent-authored comments.
  // So a subsequent remote delete had no prior id to prune against, and the
  // metadata stored at create time (text / creatorName / createdTime / …)
  // would keep surfacing through doc.comments.list() even though the
  // canonical Y.Array entry was gone.
  //
  // The fix updates `previousSyncedIds` on every observer fire, including
  // own-origin ones. We assert the entity-store-resident metadata is pruned
  // here; the PM anchor mark is local to this session and (correctly)
  // outlives a Y.Array-only delete simulation, so we don't assert on
  // list-membership — only on the stale-metadata symptom Codex described.
  it('agent-authored entity-store metadata is pruned when a remote client deletes it from Y.Array', async () => {
    const ydoc = new YDoc();
    const session = await openDocument(undefined, createIo(), {
      documentId: 'sd-3214-own-write-then-remote-delete',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
    });
    session.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'Agent-authored body.' });
    const matchBlock = session.editor.doc.query.match({
      select: { type: 'text', pattern: 'Agent-authored' },
      require: 'first',
    }).items[0].blocks[0];
    session.editor.doc.comments.create({
      target: { kind: 'text', blockId: matchBlock!.blockId, range: matchBlock!.range } as never,
      text: 'agent says review this',
    });

    const yArr = ydoc.getArray<YMap<unknown>>('comments');
    const seeded = yArr.toJSON() as Array<Record<string, unknown>>;
    expect(seeded).toHaveLength(1);
    const targetId = seeded[0].commentId as string;

    const before = session.editor.doc.comments.list().items.find((c) => c.id === targetId);
    expect(before, 'comment should be visible before remote delete').toBeDefined();
    expect(before?.text, 'agent-authored text should be present pre-delete').toBe('agent says review this');
    expect(before?.creatorName).toBe('Headless Agent');

    // Remote client (different user origin) deletes the Y.Array entry.
    ydoc.transact(
      () => {
        const idx = (yArr.toJSON() as Array<Record<string, unknown>>).findIndex((c) => c.commentId === targetId);
        yArr.delete(idx, 1);
      },
      { user: { name: 'Other Browser', email: 'other@example.com' } },
    );

    const after = session.editor.doc.comments.list().items.find((c) => c.id === targetId);
    session.dispose();

    // The entity-store record carrying the rich metadata must be pruned. PM
    // anchor presence is a separate concern; this test scopes to the
    // metadata symptom Codex flagged ("stale local store entry").
    expect(after?.text, 'stale agent-authored text must be pruned after remote delete').toBeUndefined();
    expect(after?.creatorName, 'stale creatorName must be pruned after remote delete').toBeUndefined();
    expect(after?.creatorEmail, 'stale creatorEmail must be pruned after remote delete').toBeUndefined();
    expect(after?.createdTime, 'stale createdTime must be pruned after remote delete').toBeUndefined();
  });
});
