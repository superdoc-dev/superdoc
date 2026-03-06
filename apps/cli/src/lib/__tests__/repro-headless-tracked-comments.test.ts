import { describe, expect, it } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { openDocument } from '../document';

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

describe('headless tracked changes → yjs comments', () => {
  it('writes a tracked-change comment entry when creating a tracked paragraph', async () => {
    const ydoc = new YDoc();
    const opened = await openDocument(undefined, createIo(), {
      documentId: 'repro-doc',
      ydoc,
      collaborationProvider: createProviderStub(),
      isNewFile: true,
      user: { name: 'Agent', email: 'agent@superdoc.dev' },
    });

    opened.editor.doc.create.paragraph({ at: { kind: 'documentEnd' }, text: 'hello world' }, { changeMode: 'tracked' });

    const comments = ydoc.getArray('comments').toJSON() as Array<Record<string, unknown>>;
    opened.dispose();

    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].trackedChange).toBe(true);
  });
});
