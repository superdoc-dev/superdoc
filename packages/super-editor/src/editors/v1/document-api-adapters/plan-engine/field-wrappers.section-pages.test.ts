import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { fieldsRebuildWrapper } from './field-wrappers.js';

registerBuiltInExecutors();

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { sdBlockId: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    'section-page-count': {
      group: 'inline',
      inline: true,
      atom: true,
      content: 'text*',
      attrs: {
        instruction: { default: null },
        importedCachedText: { default: null },
        resolvedText: { default: null },
        pageNumberFormat: { default: null },
      },
      toDOM: () => ['span', 0],
    },
  },
});

function createEditorWithSectionPageCount(sectionPageCount?: number, initialValue = '1'): Editor {
  const field = schema.nodes['section-page-count'].create(
    { instruction: 'SECTIONPAGES', resolvedText: initialValue },
    schema.text(initialValue),
  );
  const paragraph = schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, field);
  const doc = schema.nodes.doc.create(null, paragraph);
  const options = sectionPageCount == null ? {} : { sectionPageCount };

  const editor = {
    schema,
    state: EditorState.create({ schema, doc }),
    options,
    view: { dispatch: () => {} },
    dispatch(tr) {
      this.state = this.state.apply(tr);
    },
  };

  return editor as unknown as Editor;
}

describe('fieldsRebuildWrapper SECTIONPAGES fields', () => {
  it('updates section-page-count text content and resolvedText from editor section page count', () => {
    const editor = createEditorWithSectionPageCount(4);

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    const updatedField = editor.state.doc.nodeAt(1);
    expect(updatedField?.type.name).toBe('section-page-count');
    expect(updatedField?.attrs.resolvedText).toBe('4');
    expect(updatedField?.textContent).toBe('4');
  });

  it('preserves existing section-page-count text when section page context is unavailable', () => {
    const editor = createEditorWithSectionPageCount(undefined, '3');

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    const updatedField = editor.state.doc.nodeAt(1);
    expect(updatedField?.type.name).toBe('section-page-count');
    expect(updatedField?.attrs.resolvedText).toBe('3');
    expect(updatedField?.textContent).toBe('3');
  });
});
