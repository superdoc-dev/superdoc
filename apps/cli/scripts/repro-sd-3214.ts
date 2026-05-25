/**
 * SD-3214 end-to-end manual reproduction.
 *
 * Runs entirely in one Node process — no Liveblocks/Hocuspocus needed.
 * Two Editor instances share a single Y.Doc, so changes from one side
 * propagate to the other through the exact same Yjs primitives a real
 * browser + agent pair would use over the wire.
 *
 * USAGE (from the worktree root):
 *
 *   NODE_ENV=test bun apps/cli/scripts/repro-sd-3214.ts
 *
 * Three scenarios print PASS/FAIL lines so you can eyeball whether the
 * fix is active. See the "Toggle the fix" section in the guide for how
 * to compare before vs after.
 */

import { Doc as YDoc } from 'yjs';
import { openDocument } from '../src/lib/document';

const io = {
  stdout: () => {},
  stderr: () => {},
  readStdinBytes: async () => new Uint8Array(),
  now: () => Date.now(),
};

function providerStub() {
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

// ---------------------------------------------------------------------------
// Scenario 1: READ — browser authors, agent reads, metadata propagates
// ---------------------------------------------------------------------------

async function scenarioReadSide() {
  console.log('\n=== Scenario 1: READ — browser → agent metadata propagation ===');
  const ydoc = new YDoc();

  const browser = await openDocument(undefined, io, {
    documentId: 'sd-3214-readside',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: true,
    user: { name: 'Browser User', email: 'browser@example.com' },
  });

  browser.editor.doc.create.paragraph({
    at: { kind: 'documentEnd' },
    text: 'A clause about indemnification.',
  });
  const block = browser.editor.doc.query.match({
    select: { type: 'text', pattern: 'indemnification' },
    require: 'first',
  }).items[0]!.blocks[0]!;
  browser.editor.doc.comments.create({
    target: { kind: 'text', blockId: block.blockId, range: block.range } as never,
    text: 'Please review this clause.',
  });

  const agent = await openDocument(undefined, io, {
    documentId: 'sd-3214-readside',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: false,
    user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
  });

  const list = agent.editor.doc.comments.list();
  console.log(`  agent.comments.list() returned ${list.items.length} item(s):`);
  for (const item of list.items) {
    console.log({
      id: item.id,
      text: (item as { text?: string }).text,
      creatorName: (item as { creatorName?: string }).creatorName,
      creatorEmail: (item as { creatorEmail?: string }).creatorEmail,
      createdTime: (item as { createdTime?: number }).createdTime,
      target: (item as { target?: unknown }).target ? 'present' : 'absent',
    });
  }

  const item = list.items[0] as { text?: string; creatorName?: string; createdTime?: number } | undefined;
  if (item?.text && item?.creatorName && item?.createdTime) {
    console.log('  READ ✓ — metadata fully propagated');
  } else {
    console.log('  READ ✗ — metadata missing (this is the SD-3214 read-side bug pre-fix)');
  }

  browser.dispose();
  agent.dispose();
}

// ---------------------------------------------------------------------------
// Scenario 2: WRITE / RESOLVE — agent resolves, Y.Array reflects it
// ---------------------------------------------------------------------------

async function scenarioWriteSideResolve() {
  console.log('\n=== Scenario 2: WRITE — agent resolves comment, browser sees it ===');
  const ydoc = new YDoc();

  const browser = await openDocument(undefined, io, {
    documentId: 'sd-3214-writeside',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: true,
    user: { name: 'Browser User', email: 'browser@example.com' },
  });
  browser.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A clause to be resolved.' });
  const block = browser.editor.doc.query.match({
    select: { type: 'text', pattern: 'resolved' },
    require: 'first',
  }).items[0]!.blocks[0]!;
  browser.editor.doc.comments.create({
    target: { kind: 'text', blockId: block.blockId, range: block.range } as never,
    text: 'Resolve me.',
  });
  const targetId = (ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>)[0]!.commentId as string;

  const agent = await openDocument(undefined, io, {
    documentId: 'sd-3214-writeside',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: false,
    user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
  });
  const patch = agent.editor.doc.comments.patch({ commentId: targetId, status: 'resolved' });
  console.log(`  agent.comments.patch({status:'resolved'}).success === ${patch.success}`);

  const yEntry = (ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>)[0]!;
  console.log({
    commentId: yEntry.commentId,
    isDone: yEntry.isDone,
    resolvedTime: yEntry.resolvedTime,
  });

  if (yEntry.isDone === true && typeof yEntry.resolvedTime === 'number') {
    console.log('  WRITE ✓ — resolve propagated to Y.Array');
  } else {
    console.log('  WRITE ✗ — resolve did not reach Y.Array (this is the write-side gap pre-fix)');
  }

  browser.dispose();
  agent.dispose();
}

// ---------------------------------------------------------------------------
// Scenario 3: DELETE — agent deletes, Y.Array entry disappears
// ---------------------------------------------------------------------------

async function scenarioDelete() {
  console.log('\n=== Scenario 3: DELETE — agent deletes, Y.Array shrinks ===');
  const ydoc = new YDoc();

  const browser = await openDocument(undefined, io, {
    documentId: 'sd-3214-delete',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: true,
    user: { name: 'Browser User', email: 'browser@example.com' },
  });
  browser.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'A clause to delete.' });
  const block = browser.editor.doc.query.match({
    select: { type: 'text', pattern: 'delete' },
    require: 'first',
  }).items[0]!.blocks[0]!;
  browser.editor.doc.comments.create({
    target: { kind: 'text', blockId: block.blockId, range: block.range } as never,
    text: 'I will be deleted.',
  });
  const targetId = (ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>)[0]!.commentId as string;

  const agent = await openDocument(undefined, io, {
    documentId: 'sd-3214-delete',
    ydoc,
    collaborationProvider: providerStub() as never,
    isNewFile: false,
    user: { name: 'Headless Agent', email: 'agent@superdoc.dev' },
  });
  const del = agent.editor.doc.comments.delete({ commentId: targetId });
  console.log(`  agent.comments.delete().success === ${del.success}`);

  const yArr = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
  console.log(`  Y.Array length after delete: ${yArr.length}`);

  if (yArr.length === 0) {
    console.log('  DELETE ✓ — Y.Array entry removed');
  } else {
    console.log('  DELETE ✗ — Y.Array still has the entry (this is the write-side gap pre-fix)');
  }

  browser.dispose();
  agent.dispose();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  await scenarioReadSide();
  await scenarioWriteSideResolve();
  await scenarioDelete();
  console.log('\nDone.');
  process.exit(0);
} catch (err) {
  console.error('Repro crashed:', err);
  process.exit(1);
}
