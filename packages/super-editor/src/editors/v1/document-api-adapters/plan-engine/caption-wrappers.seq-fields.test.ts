import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { findAllCaptions } from '../helpers/caption-resolver.js';
import { captionsConfigureWrapper, captionsInsertWrapper } from './caption-wrappers.js';
import { registerBuiltInExecutors } from './register-executors.js';

registerBuiltInExecutors();

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { sdBlockId: { default: null }, paragraphProperties: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true, atom: true, toDOM: () => ['br'] },
    tab: { group: 'inline', inline: true, atom: true, toDOM: () => ['span'] },
    sequenceField: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        instruction: { default: '' },
        identifier: { default: '' },
        fieldArgument: { default: '' },
        sequenceMode: { default: 'next' },
        hideResult: { default: false },
        restartNumber: { default: null },
        restartLevel: { default: null },
        format: { default: 'Arabic' },
        hasGeneralFormat: { default: false },
        pageNumberFieldFormat: { default: null },
        numericPictureFormat: { default: null },
        resolvedNumber: { default: '' },
        resolvedNumberIsCurrent: { default: false },
        sdBlockId: { default: null },
      },
      toDOM: () => ['span', 0],
    },
  },
});

function createEditor(): Editor {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create({ sdBlockId: 'anchor-1' }, schema.text('Anchor 1')),
    schema.nodes.paragraph.create({ sdBlockId: 'anchor-2' }, schema.text('Anchor 2')),
  ]);
  const editor = {
    schema,
    state: EditorState.create({ schema, doc }),
    converter: {
      translatedLinkedStyles: { docDefaults: {}, styles: {} },
      translatedNumbering: {},
    },
    view: { dispatch: () => {} },
    dispatch(tr) {
      this.state = this.state.apply(tr);
    },
  };
  return editor as unknown as Editor;
}

function insertCaption(editor: Editor, anchorId: string, text: string) {
  return captionsInsertWrapper(editor, {
    label: 'Figure',
    adjacentTo: { kind: 'block', nodeType: 'paragraph', nodeId: anchorId },
    position: 'below',
    text,
  });
}

describe('caption wrappers SEQ fields', () => {
  it('captions.insert recomputes SEQ numbers for inserted captions', () => {
    const editor = createEditor();

    expect(insertCaption(editor, 'anchor-1', 'One').success).toBe(true);
    expect(insertCaption(editor, 'anchor-2', 'Two').success).toBe(true);

    const captions = findAllCaptions(editor.state.doc).filter((caption) => caption.label === 'Figure');
    expect(captions.map((caption) => caption.number)).toEqual(['1', '2']);
  });

  it('captions.configure updates matching SEQ format attrs and recomputes values', () => {
    const editor = createEditor();
    insertCaption(editor, 'anchor-1', 'One');
    insertCaption(editor, 'anchor-2', 'Two');

    const result = captionsConfigureWrapper(editor, { label: 'Figure', format: 'lowerRoman' });

    expect(result.success).toBe(true);
    const fields: any[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'sequenceField') fields.push(node);
      return true;
    });
    expect(fields.map((field) => field.attrs.instruction)).toEqual(['SEQ Figure \\* roman', 'SEQ Figure \\* roman']);
    expect(fields.map((field) => field.attrs.pageNumberFieldFormat)).toEqual([
      { format: 'lowerRoman' },
      { format: 'lowerRoman' },
    ]);
    expect(fields.map((field) => field.attrs.resolvedNumber)).toEqual(['i', 'ii']);
  });
});
