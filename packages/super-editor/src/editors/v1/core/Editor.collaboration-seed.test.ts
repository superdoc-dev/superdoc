import { beforeAll, describe, expect, it } from 'vitest';
import { Doc as YDoc } from 'yjs';
import { Editor } from './Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsFileBuffer } from '@tests/helpers/helpers.js';

type SyncHandler = (synced?: boolean) => void;

function createProviderStub() {
  const listeners = {
    sync: new Set<SyncHandler>(),
    synced: new Set<SyncHandler>(),
  };

  return {
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
}

function createTestEditor(options: Partial<ConstructorParameters<typeof Editor>[0]> = {}) {
  return new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
}

describe('Editor collaboration seeding', () => {
  let centeredBuffer: Buffer;

  beforeAll(async () => {
    centeredBuffer = await getTestDataAsFileBuffer('advanced-text.docx');
  });

  it('preserves the first paragraph attrs when seeding a collaborative room', async () => {
    const provider = createProviderStub();
    const ydoc = new YDoc();
    const seededEditor = createTestEditor({
      ydoc,
      collaborationProvider: provider,
    });
    const directEditor = createTestEditor();

    try {
      await seededEditor.open(centeredBuffer, {
        mode: 'docx',
        isNewFile: true,
      });
      await directEditor.open(centeredBuffer, {
        mode: 'docx',
      });

      provider.emit('synced', true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const seededFirstParagraph = seededEditor.state.doc.firstChild;
      const directFirstParagraph = directEditor.state.doc.firstChild;

      expect(seededFirstParagraph?.textContent).toBe(directFirstParagraph?.textContent);
      expect(seededFirstParagraph?.attrs?.paraId).toBe(directFirstParagraph?.attrs?.paraId);
      expect(seededFirstParagraph?.attrs?.paragraphProperties?.justification).toBe(
        directFirstParagraph?.attrs?.paragraphProperties?.justification,
      );
      expect(seededFirstParagraph?.attrs?.attributes ?? null).toEqual(directFirstParagraph?.attrs?.attributes ?? null);
    } finally {
      if (seededEditor.lifecycleState === 'ready') {
        seededEditor.close();
      }
      if (directEditor.lifecycleState === 'ready') {
        directEditor.close();
      }
      seededEditor.destroy();
      directEditor.destroy();
    }
  });
});
