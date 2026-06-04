import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { registerBuiltInExecutors } from './register-executors.js';
import { fieldsInsertWrapper, fieldsRebuildWrapper } from './field-wrappers.js';

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
    sequenceField: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        instruction: { default: null },
        identifier: { default: null },
        format: { default: null },
        resolvedNumber: { default: null },
        sdBlockId: { default: null },
      },
      toDOM: () => ['span', 0],
    },
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
        pageNumberZeroPadding: { default: null },
      },
      toDOM: () => ['span', 0],
    },
  },
});

function createEditorWithSectionPageCount(
  sectionPageCount?: number,
  initialValue = '1',
  pageNumberFormat?: string,
): Editor {
  const field = schema.nodes['section-page-count'].create(
    { instruction: 'SECTIONPAGES', resolvedText: initialValue, pageNumberFormat },
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

function createEditorForInsert(sectionPageCount?: number): Editor {
  const paragraph = schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, schema.text('x'));
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
  it('inserts SECTIONPAGES as a section-page-count node with parsed formatting attrs', () => {
    const editor = createEditorForInsert(7);

    const result = fieldsInsertWrapper(editor, {
      mode: 'raw',
      instruction: 'SECTIONPAGES \\# "000"',
      at: { kind: 'text', segments: [{ blockId: 'block-1', range: { start: 0, end: 0 } }] },
    });

    expect(result.success).toBe(true);
    const insertedField = editor.state.doc.nodeAt(1);
    expect(insertedField?.type.name).toBe('section-page-count');
    expect(insertedField?.attrs).toMatchObject({
      instruction: 'SECTIONPAGES \\# "000"',
      pageNumberFormat: 'decimal',
      pageNumberZeroPadding: 3,
      resolvedText: '007',
    });
    expect(insertedField?.textContent).toBe('007');
  });

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

  it('formats rebuilt section-page-count values with pageNumberFormat', () => {
    const editor = createEditorWithSectionPageCount(4, '1', 'upperRoman');

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    const updatedField = editor.state.doc.nodeAt(1);
    expect(updatedField?.type.name).toBe('section-page-count');
    expect(updatedField?.attrs.resolvedText).toBe('IV');
    expect(updatedField?.textContent).toBe('IV');
  });

  it('formats rebuilt section-page-count values with zero-padding picture switches', () => {
    const editor = createEditorWithSectionPageCount(4, '1');
    const field = editor.state.doc.nodeAt(1);
    const currentAttrs = field?.attrs ?? {};
    const { tr } = editor.state;
    tr.setNodeMarkup(1, undefined, {
      ...currentAttrs,
      instruction: 'SECTIONPAGES \\# "000"',
      pageNumberFormat: 'decimal',
      pageNumberZeroPadding: 3,
    });
    editor.dispatch(tr);

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    const updatedField = editor.state.doc.nodeAt(1);
    expect(updatedField?.type.name).toBe('section-page-count');
    expect(updatedField?.attrs.resolvedText).toBe('004');
    expect(updatedField?.textContent).toBe('004');
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
