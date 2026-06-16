import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { Editor } from '../../core/Editor.js';
import { fieldsInsertWrapper, fieldsRebuildWrapper } from './field-wrappers.js';
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

function createEditor(doc = schema.nodes.doc.create(null, [paragraph('block-1', 'A')])): Editor {
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

function paragraph(id: string, text?: string) {
  return schema.nodes.paragraph.create({ sdBlockId: id }, text ? schema.text(text) : null);
}

function seq(instruction: string, attrs: Record<string, unknown> = {}) {
  return schema.nodes.sequenceField.create({ instruction, ...attrs });
}

function fieldInsertInput(instruction: string) {
  return {
    mode: 'raw' as const,
    instruction,
    at: {
      segments: [{ blockId: 'block-1', range: { start: 1, end: 1 } }],
    },
  };
}

function sequenceFields(editor: Editor) {
  const fields: any[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'sequenceField') fields.push(node);
    return true;
  });
  return fields;
}

describe('field wrappers SEQ fields', () => {
  it('fields.insert raw SEQ creates parsed attrs and a computed result', () => {
    const editor = createEditor();

    const result = fieldsInsertWrapper(editor, fieldInsertInput('SEQ Figure \\* ARABIC'));

    expect(result.success).toBe(true);
    const [field] = sequenceFields(editor);
    expect(field.attrs.identifier).toBe('Figure');
    expect(field.attrs.pageNumberFieldFormat).toEqual({ format: 'decimal' });
    expect(field.attrs.resolvedNumber).toBe('1');
    expect(field.attrs.resolvedNumberIsCurrent).toBe(true);
  });

  it('fields.insert recomputes existing matching SEQ fields in document order', () => {
    const firstCaption = schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, [
      seq('SEQ Figure \\* ARABIC', { resolvedNumber: '9' }),
      schema.text('A'),
    ]);
    const doc = schema.nodes.doc.create(null, [firstCaption]);
    const editor = createEditor(doc);

    const result = fieldsInsertWrapper(editor, fieldInsertInput('SEQ Figure \\* ARABIC'));

    expect(result.success).toBe(true);
    expect(sequenceFields(editor).map((node) => node.attrs.resolvedNumber)).toEqual(['1', '2']);
  });

  it('fields.insert rejects cached-result options the v1 runtime cannot preserve', () => {
    const editor = createEditor();

    expect(() =>
      fieldsInsertWrapper(editor, {
        ...fieldInsertInput('REF exhibitA \\h'),
        cachedResultText: 'Exhibit A',
        updatePolicy: 'preserveCached',
        serialization: 'complex',
      }),
    ).toThrow(/preserveCached/);
  });

  it('fields.insert rejects complex formatting options the v1 runtime cannot preserve', () => {
    const editor = createEditor();

    expect(() =>
      fieldsInsertWrapper(editor, {
        ...fieldInsertInput('REF exhibitA \\h'),
        serialization: 'complex',
        complexFormatting: { resultRunProps: { rStyle: 'Hyperlink' } },
      }),
    ).toThrow(/complexFormatting/);
  });

  it('fields.insert rejects explicit simple serialization in the v1 runtime', () => {
    const editor = createEditor();

    expect(() =>
      fieldsInsertWrapper(editor, {
        ...fieldInsertInput('REF exhibitA \\h'),
        serialization: 'simple',
      }),
    ).toThrow(/serialization: "simple"/);
  });

  it('fields.rebuild recomputes stale SEQ resolvedNumber values for the full document', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, [
        seq('SEQ Figure \\* ARABIC', { resolvedNumber: '9' }),
        seq('SEQ Figure \\* ARABIC', { resolvedNumber: '9' }),
      ]),
    ]);
    const editor = createEditor(doc);

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    expect(sequenceFields(editor).map((node) => node.attrs.resolvedNumber)).toEqual(['1', '2']);
  });

  it('fields.rebuild succeeds when SEQ values are already current', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create({ sdBlockId: 'block-1' }, [
        seq('SEQ Figure \\* ARABIC', { resolvedNumber: '1', resolvedNumberIsCurrent: true }),
        seq('SEQ Figure \\* ARABIC', { resolvedNumber: '2', resolvedNumberIsCurrent: true }),
      ]),
    ]);
    const editor = createEditor(doc);

    const result = fieldsRebuildWrapper(editor, {
      target: { kind: 'field', blockId: 'block-1', occurrenceIndex: 0, nestingDepth: 0 },
    });

    expect(result.success).toBe(true);
    expect(sequenceFields(editor).map((node) => node.attrs.resolvedNumber)).toEqual(['1', '2']);
  });
});
