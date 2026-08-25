import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { Editor } from '../../Editor.js';
import { seedEditorStateToYDoc } from '../../../extensions/collaboration/seed-editor-to-ydoc.js';
import { initTestEditor } from '../../../tests/helpers/helpers.js';
import { createBodyParticipant } from './create-editor-participant.js';
import { DocumentHistoryCoordinator } from './DocumentHistoryCoordinator.js';

const INITIAL_TEXT = 'start';

const createLocalEditor = (): Editor => {
  const { editor } = initTestEditor({
    loadFromSchema: true,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { paraId: 'p1' },
          content: [
            {
              type: 'run',
              attrs: {},
              content: [{ type: 'text', text: INITIAL_TEXT }],
            },
          ],
        },
      ],
    },
    useImmediateSetTimeout: false,
  });
  return editor as Editor;
};

const appendText = (editor: Editor, text: string): void => {
  let insertionPosition: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.isText) insertionPosition = position + node.nodeSize;
  });

  if (insertionPosition === null) {
    throw new Error('Expected the test document to contain text');
  }

  editor.dispatch(editor.state.tr.insertText(text, insertionPosition));
};

describe('EditorHistorySnapshotAdapter collaboration upgrade', () => {
  it('undoes and redoes edits made after a local editor upgrades to collaboration', () => {
    const editor = createLocalEditor();
    const coordinator = new DocumentHistoryCoordinator();
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    const provider = {
      awareness,
      synced: true,
      isSynced: true,
      on() {},
      off() {},
    };

    try {
      coordinator.register(createBodyParticipant(editor));
      appendText(editor, 'A');
      expect(editor.state.doc.textContent).toBe('startA');

      seedEditorStateToYDoc(editor, ydoc);
      editor.attachCollaboration({ ydoc, collaborationProvider: provider });

      appendText(editor, 'B');
      expect(editor.state.doc.textContent).toBe('startAB');
      expect(coordinator.canUndo()).toBe(true);

      expect(coordinator.undo()).toBe(true);
      expect(editor.state.doc.textContent).toBe('startA');
      expect(coordinator.canRedo()).toBe(true);

      expect(coordinator.redo()).toBe(true);
      expect(editor.state.doc.textContent).toBe('startAB');
    } finally {
      coordinator.destroy();
      editor.destroy();
      awareness.destroy();
      ydoc.destroy();
    }
  });
});
