import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotatorHelpers } from '@helpers/annotator.js';
import * as listsV2Migrations from '@core/migrations/0.14-listsv2/listsv2migration.js';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

describe('Editor annotation utilities', () => {
  let editor;
  let docx;
  let media;
  let mediaFiles;
  let fonts;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx'));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (editor) {
      editor.destroy();
      editor = null;
    }
  });

  it('prepareForAnnotations processes tables and dispatches the returned transaction', () => {
    const processedTransaction = { mocked: true };
    const annotationValues = [{ input_id: 'field-1', input_value: 'value' }];

    const dispatchSpy = vi.spyOn(editor, 'dispatch').mockImplementation(() => {});
    const processTablesSpy = vi.spyOn(AnnotatorHelpers, 'processTables').mockReturnValue(processedTransaction);

    editor.prepareForAnnotations(annotationValues);

    expect(processTablesSpy).toHaveBeenCalledWith(expect.objectContaining({ annotationValues }));
    expect(dispatchSpy).toHaveBeenCalledWith(processedTransaction);
  });

  it('annotate dispatches when annotator makes a change', () => {
    const dispatchSpy = vi.spyOn(editor, 'dispatch').mockImplementation(() => {});
    vi.spyOn(AnnotatorHelpers, 'processTables').mockImplementation(({ tr }) => tr);

    const scrolledTransaction = { id: 'scrolled' };
    const scrollIntoView = vi.fn().mockReturnValue(scrolledTransaction);
    const annotateDocumentSpy = vi
      .spyOn(AnnotatorHelpers, 'annotateDocument')
      .mockReturnValue({ docChanged: true, scrollIntoView });

    const annotationValues = [{ input_id: 'a', input_value: 'b' }];
    const hiddenIds = ['hidden'];
    editor.annotate(annotationValues, hiddenIds, true);

    const callArgs = annotateDocumentSpy.mock.calls[0][0];
    expect(callArgs.annotationValues).toBe(annotationValues);
    expect(callArgs.hiddenFieldIds).toBe(hiddenIds);
    expect(callArgs.removeEmptyFields).toBe(true);
    expect(callArgs.editor).toBe(editor);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(scrolledTransaction);
  });

  it('annotate skips dispatch when no document changes occur', () => {
    const dispatchSpy = vi.spyOn(editor.view, 'dispatch').mockImplementation(() => {});
    vi.spyOn(AnnotatorHelpers, 'processTables').mockImplementation(({ tr }) => tr);
    vi.spyOn(AnnotatorHelpers, 'annotateDocument').mockReturnValue({ docChanged: false, scrollIntoView: vi.fn() });

    editor.annotate();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('previewAnnotations stores the original state and delegates to annotate', () => {
    const annotateSpy = vi.spyOn(editor, 'annotate').mockImplementation(() => {});
    const currentState = editor.state;
    const annotations = [{ input_id: 'field', input_value: 'value' }];
    const hidden = ['hidden'];

    editor.previewAnnotations(annotations, hidden);

    expect(editor.originalState).toBe(currentState);
    expect(annotateSpy).toHaveBeenCalledWith(annotations, hidden);
  });

  it('closePreview restores the saved state when available', () => {
    const updatedState = { restored: true };
    const updateStateSpy = vi.spyOn(editor.view, 'updateState').mockImplementation(() => {});
    editor.originalState = updatedState;

    editor.closePreview();

    expect(updateStateSpy).toHaveBeenCalledWith(updatedState);
  });

  it('closePreview is a no-op when there is no stored state', () => {
    const updateStateSpy = vi.spyOn(editor.view, 'updateState').mockImplementation(() => {});

    editor.originalState = null;
    editor.closePreview();

    expect(updateStateSpy).not.toHaveBeenCalled();
  });

  it('migrateParagraphFields delegates to lists v2 migration helper when values exist', async () => {
    const annotationValues = [{ input_id: 'field', input_value: 'value' }];
    const migrated = [{ input_id: 'field', input_value: 'updated' }];
    const migrateSpy = vi.spyOn(listsV2Migrations, 'migrateParagraphFieldsListsV2').mockResolvedValue(migrated);

    const result = await editor.migrateParagraphFields(annotationValues);

    expect(migrateSpy).toHaveBeenCalledWith(annotationValues, editor);
    expect(result).toEqual(migrated);
  });

  it('migrateParagraphFields returns original values when nothing is provided', async () => {
    const migrateSpy = vi.spyOn(listsV2Migrations, 'migrateParagraphFieldsListsV2');

    const result = await editor.migrateParagraphFields([]);

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
