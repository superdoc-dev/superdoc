import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from './Editor.js';
import { createStoryEditor } from './story-editor-factory.ts';
import { initTestEditor } from '../tests/helpers/helpers.js';

const createdEditors: Editor[] = [];

function trackEditor(editor: Editor): Editor {
  createdEditors.push(editor);
  return editor;
}

afterEach(() => {
  while (createdEditors.length > 0) {
    const editor = createdEditors.pop();
    try {
      editor?.destroy?.();
    } catch {
      // best-effort cleanup for test editors
    }
  }
});

describe('createStoryEditor', () => {
  it('inherits tracked changes configuration from the parent editor', () => {
    const parent = trackEditor(
      initTestEditor({
        mode: 'text',
        content: '<p>Hello world</p>',
        trackedChanges: {
          visible: true,
          mode: 'review',
          enabled: true,
          replacements: 'independent',
        },
      }).editor as Editor,
    );

    const child = trackEditor(
      createStoryEditor(
        parent,
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header text' }] }],
        },
        {
          documentId: 'hf:part:rId9',
          isHeaderOrFooter: true,
          headless: true,
        },
      ),
    );

    expect(child.options.trackedChanges).toEqual({
      visible: true,
      mode: 'review',
      enabled: true,
      replacements: 'independent',
    });

    child.options.trackedChanges!.replacements = 'paired';
    expect(parent.options.trackedChanges?.replacements).toBe('independent');
  });
});
