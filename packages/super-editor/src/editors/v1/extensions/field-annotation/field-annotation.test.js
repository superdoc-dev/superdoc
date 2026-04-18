import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { findFieldAnnotationsByFieldId } from './fieldAnnotationHelpers/index.js';

describe('FieldAnnotation extension commands', () => {
  let editor;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)));
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const getAnnotations = (fieldId) => findFieldAnnotationsByFieldId(fieldId, editor.state);

  it('inserts annotations at the current selection with default labels', () => {
    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-1', displayLabel: 'Name' });
    const annotations = getAnnotations('field-1');
    expect(annotations).toHaveLength(1);
    const [annotation] = annotations;
    expect(annotation.node.attrs.displayLabel).toBe('Name');
    expect(annotation.node.attrs.defaultDisplayLabel).toBe('Name');
  });

  it('updates annotation attributes via updateFieldAnnotation', () => {
    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-2', displayLabel: 'Title' });
    let [annotation] = getAnnotations('field-2');

    editor.commands.updateFieldAnnotation(annotation, { displayLabel: 'Updated Title' });
    const [updated] = getAnnotations('field-2');
    expect(updated.node.attrs.displayLabel).toBe('Updated Title');
  });

  it('bulk updates annotations with updateFieldAnnotationsAttributes', () => {
    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-3', displayLabel: 'Label' });
    const annotations = getAnnotations('field-3');

    editor.commands.updateFieldAnnotationsAttributes(annotations, { hidden: true });
    const [updated] = getAnnotations('field-3');
    expect(updated.node.attrs.hidden).toBe(true);
  });

  it('removes annotations by id and by node', () => {
    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-4', displayLabel: 'Delete me' });
    let annotations = getAnnotations('field-4');
    expect(annotations).toHaveLength(1);

    editor.commands.deleteFieldAnnotations('field-4');
    annotations = getAnnotations('field-4');
    expect(annotations).toHaveLength(0);

    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-5', displayLabel: 'Second' });
    annotations = getAnnotations('field-5');
    editor.commands.deleteFieldAnnotationsByNode(annotations);
    expect(getAnnotations('field-5')).toHaveLength(0);
  });

  it('deletes a single annotation object', () => {
    editor.commands.addFieldAnnotationAtSelection({ fieldId: 'field-6', displayLabel: 'Single' });
    const [annotation] = getAnnotations('field-6');
    editor.commands.deleteFieldAnnotation(annotation);
    expect(getAnnotations('field-6')).toHaveLength(0);
  });
});
