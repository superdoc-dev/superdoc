import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';

const { seedPartsFromEditorSpy } = vi.hoisted(() => ({
  seedPartsFromEditorSpy: vi.fn(),
}));

vi.mock('@extensions/collaboration/part-sync/seed-parts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@extensions/collaboration/part-sync/seed-parts.js')>();

  return {
    ...actual,
    seedPartsFromEditor: vi.fn((...args: Parameters<typeof actual.seedPartsFromEditor>) => {
      seedPartsFromEditorSpy(...args);
      return actual.seedPartsFromEditor(...args);
    }),
  };
});

import { Editor } from './Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsFileBuffer, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

type SyncHandler = (synced?: boolean) => void;

function createProviderStub() {
  const listeners = {
    sync: new Set<SyncHandler>(),
    synced: new Set<SyncHandler>(),
  };

  const provider = {
    awareness: {
      getStates() {
        return new Map();
      },
      on() {},
      off() {},
    },
    synced: false,
    isSynced: false,
    on(event: 'sync' | 'synced', handler: SyncHandler) {
      listeners[event].add(handler);
    },
    off(event: 'sync' | 'synced', handler: SyncHandler) {
      listeners[event].delete(handler);
    },
    emit(event: 'sync' | 'synced', value?: boolean) {
      for (const handler of listeners[event]) {
        handler(value);
      }
    },
  };

  return provider;
}

function createTestEditor(options: Partial<Parameters<(typeof Editor)['prototype']['constructor']>[0]> = {}) {
  return new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
}

describe('Editor.replaceFile', () => {
  let blankDocData: { docx: unknown; mediaFiles: unknown; fonts: unknown };
  let initialCollaborativeBuffer: Buffer;
  let replacementBuffer: Buffer;
  let multiSectionReplacementBuffer: Buffer;

  beforeAll(async () => {
    blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
    initialCollaborativeBuffer = await getTestDataAsFileBuffer('advanced-text.docx');
    replacementBuffer = await getTestDataAsFileBuffer('Hello docx world.docx');
    multiSectionReplacementBuffer = await getTestDataAsFileBuffer('multi_section_doc.docx');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('applies replacement when provider emits sync(true) without synced event', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();

    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const expectedEditor = createTestEditor();

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });
      await expectedEditor.open(replacementBuffer, { mode: 'docx' });

      const textBeforeReplace = editor.state.doc.textContent;
      const expectedText = expectedEditor.state.doc.textContent;

      const replacePromise = editor.replaceFile(replacementBuffer);
      await Promise.resolve();

      // Providers like Liveblocks can emit sync(false) before sync(true).
      provider.emit('sync', false);
      provider.emit('sync', true);
      await replacePromise;

      const textAfterReplace = editor.state.doc.textContent;
      expect(textAfterReplace).toBe(expectedText);
      expect(textAfterReplace).not.toBe(textBeforeReplace);
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      if (expectedEditor.lifecycleState === 'ready') {
        expectedEditor.close();
      }
      editor.destroy();
      expectedEditor.destroy();
    }
  });

  it('rejects with timeout when provider never syncs', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();

    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });

    // Mock loadXmlData to return instantly — avoids JSZip's internal
    // setTimeout usage which conflicts with fake timers.
    const loadSpy = vi
      .spyOn(Editor, 'loadXmlData')
      .mockResolvedValue([blankDocData.docx as any, {} as any, blankDocData.mediaFiles as any, {} as any]);

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const replacePromise = editor.replaceFile(replacementBuffer);

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const expectRejected = expect(replacePromise).rejects.toThrow(/did not sync within/);

      // Advance past the 10s sync timeout
      await vi.advanceTimersByTimeAsync(10_000);

      await expectRejected;
    } finally {
      loadSpy.mockRestore();
      vi.useRealTimers();
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      editor.destroy();
    }
  });

  it('applies replacement when provider emits synced event', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();

    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const expectedEditor = createTestEditor();

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });
      await expectedEditor.open(replacementBuffer, { mode: 'docx' });

      const expectedText = expectedEditor.state.doc.textContent;

      const replacePromise = editor.replaceFile(replacementBuffer);
      await Promise.resolve();

      provider.emit('synced', true);
      await replacePromise;

      expect(editor.state.doc.textContent).toBe(expectedText);
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      if (expectedEditor.lifecycleState === 'ready') {
        expectedEditor.close();
      }
      editor.destroy();
      expectedEditor.destroy();
    }
  });

  it('replaces an already-seeded collaborative room cleanly', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();

    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const expectedEditor = createTestEditor();
    try {
      await editor.open(initialCollaborativeBuffer, {
        mode: 'docx',
        isNewFile: true,
      });

      provider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const roomFragmentBeforeReplace = ydoc.getXmlFragment('supereditor');
      expect(roomFragmentBeforeReplace.length).toBeGreaterThan(0);

      const initialText = editor.state.doc.textContent;

      await expectedEditor.open(replacementBuffer, { mode: 'docx' });
      const expectedText = expectedEditor.state.doc.textContent;

      const replacePromise = editor.replaceFile(replacementBuffer);
      await Promise.resolve();

      provider.emit('synced', true);
      await replacePromise;

      const sharedRoot = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('supereditor'), editor.schema);
      expect(sharedRoot.textContent).toBe(expectedText);
      expect(editor.state.doc.textContent).toBe(expectedText);
      expect(editor.state.doc.textContent).not.toBe(initialText);
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      if (expectedEditor.lifecycleState === 'ready') {
        expectedEditor.close();
      }
      editor.destroy();
      expectedEditor.destroy();
    }
  });

  it('runs collaborative replace side effects once when the provider is already synced', async () => {
    const provider = createProviderStub();
    provider.synced = true;
    provider.isSynced = true;

    const ydoc = new YDoc();
    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const expectedEditor = createTestEditor();

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });
      await expectedEditor.open(replacementBuffer, { mode: 'docx' });

      const seedCallsBeforeReplace = seedPartsFromEditorSpy.mock.calls.length;

      await editor.replaceFile(replacementBuffer);

      const seedCallsDuringReplace = seedPartsFromEditorSpy.mock.calls.length - seedCallsBeforeReplace;

      expect(editor.state.doc.textContent).toBe(expectedEditor.state.doc.textContent);
      expect(seedCallsDuringReplace).toBe(1);
      expect(seedPartsFromEditorSpy).toHaveBeenLastCalledWith(editor, ydoc, { replaceExisting: true });
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      if (expectedEditor.lifecycleState === 'ready') {
        expectedEditor.close();
      }
      editor.destroy();
      expectedEditor.destroy();
    }
  });

  it('stores decrypted bytes as fileSource when replacing with an encrypted file', async () => {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const encryptedPath = resolve(__dir, 'ooxml-encryption/fixtures/encrypted-hello.docx');
    const encryptedBuffer = readFileSync(encryptedPath);

    const editor = createTestEditor();

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });

      await editor.replaceFile(encryptedBuffer, { password: 'test123' });

      // fileSource must NOT be the original encrypted buffer — it should be
      // the decrypted ZIP bytes so export paths don't choke on the CFB container.
      expect(editor.options.fileSource).not.toBe(encryptedBuffer);
      expect(editor.options.fileSource).toBeInstanceOf(Uint8Array);

      // Verify the stored bytes are a valid ZIP (PK magic)
      const stored = editor.options.fileSource as Uint8Array;
      expect(stored[0]).toBe(0x50); // 'P'
      expect(stored[1]).toBe(0x4b); // 'K'
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      editor.destroy();
    }
  }, 30_000);

  it('seeds collaborative bodySectPr metadata when replacing a file with a final section', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();

    const editor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });

    try {
      await editor.open(undefined, {
        mode: 'docx',
        content: blankDocData.docx as any,
        mediaFiles: blankDocData.mediaFiles as any,
        fonts: blankDocData.fonts as any,
      });

      const replacePromise = editor.replaceFile(multiSectionReplacementBuffer);
      await Promise.resolve();

      provider.emit('synced', true);
      await replacePromise;

      const bodySectPr = editor.options.ydoc?.getMap('meta').get('bodySectPr') as any;
      expect(bodySectPr).toBeTruthy();
      const pageSize = bodySectPr.elements.find(
        (element: { name?: string; attributes?: Record<string, string> }) => element.name === 'w:pgSz',
      );
      expect(pageSize).toBeTruthy();
      expect(Number(pageSize.attributes['w:w'])).toBeGreaterThan(Number(pageSize.attributes['w:h']));
    } finally {
      if (editor.lifecycleState === 'ready') {
        editor.close();
      }
      editor.destroy();
    }
  });
});
