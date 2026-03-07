import { beforeAll, describe, expect, it } from 'vitest';
import { Doc as YDoc } from 'yjs';
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
  let replacementBuffer: Buffer;

  beforeAll(async () => {
    blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
    replacementBuffer = await getTestDataAsFileBuffer('Hello docx world.docx');
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
});
