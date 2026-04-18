import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import * as coreHelpers from '@core/helpers/index.js';
import { ReplaceAroundStep } from 'prosemirror-transform';
import {
  getAllFieldAnnotations,
  getAllFieldAnnotationsWithRect,
  findFieldAnnotations,
  findFieldAnnotationsByFieldId,
  findFirstFieldAnnotationByFieldId,
  findFieldAnnotationsBetween,
  findRemovedFieldAnnotations,
  getHeaderFooterAnnotations,
  findHeaderFooterAnnotationsByFieldId,
  trackFieldAnnotationsDeletion,
} from './index.js';

vi.mock('@core/helpers/annotator.js', () => ({
  getAllHeaderFooterEditors: vi.fn(),
}));

const { getAllHeaderFooterEditors } = await import('@core/helpers/annotator.js');

describe('fieldAnnotation helpers', () => {
  let editor;
  let schema;
  let state;
  let doc;
  let annotations;
  let positions;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.ReplaceAroundStep = ReplaceAroundStep;
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;

    const createAnnotation = (fieldId, label) =>
      schema.nodes.fieldAnnotation.create({ fieldId, displayLabel: label, type: 'text' });

    const annotationA = createAnnotation('field-a', 'Field A');
    const annotationB = createAnnotation('field-b', 'Field B');
    const paragraph = schema.nodes.paragraph.create(null, [annotationA, schema.text(' content '), annotationB]);

    doc = schema.nodes.doc.create(null, [paragraph]);
    state = EditorState.create({ schema, doc, plugins: editor.state.plugins });

    annotations = [];
    positions = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'fieldAnnotation') {
        annotations.push(node);
        positions.push(pos);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete globalThis.ReplaceAroundStep;
    editor?.destroy();
    editor = null;
  });

  it('collects annotations across the document', () => {
    const found = getAllFieldAnnotations(state);
    expect(found).toHaveLength(2);
    expect(found.map((entry) => entry.node.attrs.fieldId)).toEqual(['field-a', 'field-b']);
  });

  it('returns annotations with DOM rect metadata', () => {
    const rect = { left: 1, top: 2, right: 3, bottom: 4 };
    vi.spyOn(coreHelpers, 'posToDOMRect').mockReturnValue(rect);

    const found = getAllFieldAnnotationsWithRect(editor.view, state);
    expect(found).toHaveLength(2);
    expect(found[0].rect).toBe(rect);
  });

  it('filters annotations using predicates and field ids', () => {
    const predicate = (node) => node.attrs.fieldId === 'field-a';
    const filtered = findFieldAnnotations(predicate, state);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].node.attrs.fieldId).toBe('field-a');

    const byId = findFieldAnnotationsByFieldId('field-b', state);
    expect(byId).toHaveLength(1);
    expect(byId[0].node.attrs.fieldId).toBe('field-b');

    const byArray = findFieldAnnotationsByFieldId(['field-a', 'missing'], state);
    expect(byArray).toHaveLength(1);
    expect(byArray[0].node.attrs.fieldId).toBe('field-a');

    const first = findFirstFieldAnnotationByFieldId('field-b', state);
    expect(first?.node.attrs.fieldId).toBe('field-b');
  });

  it('finds annotations between document positions', () => {
    const between = findFieldAnnotationsBetween(0, doc.content.size, doc);
    expect(between).toHaveLength(2);
    expect(between[0].pos).toBe(positions[0]);
  });

  it('detects removed annotations in transactions and emits deletion events', () => {
    const tr = state.tr.delete(positions[0], positions[0] + annotations[0].nodeSize);
    const removed = findRemovedFieldAnnotations(tr);
    expect(removed).toHaveLength(1);
    expect(removed[0].node.attrs.fieldId).toBe('field-a');

    const emit = vi.spyOn(editor, 'emit');
    trackFieldAnnotationsDeletion(editor, tr);
    vi.runAllTimers();
    expect(emit).toHaveBeenCalledWith('fieldAnnotationDeleted', expect.objectContaining({ removedNodes: removed }));
  });

  it('aggregates header/footer annotations via helpers', () => {
    getAllHeaderFooterEditors.mockReturnValue([{ editor: { state, options: { documentId: 'header' } } }]);

    const headerAnnotations = getHeaderFooterAnnotations(editor);
    expect(headerAnnotations).toHaveLength(2);

    const activeEditor = { state, options: { documentId: 'header' } };
    const byId = findHeaderFooterAnnotationsByFieldId('field-a', editor, activeEditor);
    expect(byId).toHaveLength(1);
    expect(byId[0].node.attrs.fieldId).toBe('field-a');
  });
});
