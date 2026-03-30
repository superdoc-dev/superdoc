/* @vitest-environment jsdom */

/**
 * Tests for the FieldUpdate extension's updateFieldsInSelection command.
 *
 * Uses the numwords.docx fixture which contains NUMWORDS, NUMCHARS, and
 * NUMPAGES fields with known imported values.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { getWordStatistics } from '../../document-api-adapters/helpers/word-statistics.js';

describe('FieldUpdate extension', () => {
  let docData;
  let editor;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('numwords.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function createEditor() {
    const result = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });
    return result.editor;
  }

  function findNodesByType(ed, typeName) {
    const results = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === typeName) {
        results.push({ pos, node, attrs: node.attrs });
      }
      return true;
    });
    return results;
  }

  it('exposes updateFieldsInSelection as a command', () => {
    editor = createEditor();
    expect(typeof editor.commands.updateFieldsInSelection).toBe('function');
  });

  it('updates documentStatField resolvedText when selection covers the field', () => {
    editor = createEditor();

    const before = findNodesByType(editor, 'documentStatField');
    expect(before.length).toBeGreaterThan(0);

    const originalValue = before[0].attrs.resolvedText;

    // Select the entire document, then run the command
    editor.commands.selectAll();
    const result = editor.commands.updateFieldsInSelection();

    expect(result).toBe(true);

    // After update, the resolvedText should be recomputed from current document stats.
    // The exact value depends on the fixture's word count, but the command should succeed.
    const after = findNodesByType(editor, 'documentStatField');
    expect(after.length).toBe(before.length);

    // The resolved value should be a numeric string
    const numwordsField = after.find((f) => {
      const instr = (f.attrs.instruction ?? '').trim().split(/\s+/)[0]?.toUpperCase();
      return instr === 'NUMWORDS';
    });
    expect(numwordsField).toBeTruthy();
    expect(Number(numwordsField.attrs.resolvedText)).toBeGreaterThan(0);
  });

  it('returns false when no updatable fields are in the selection', () => {
    editor = createEditor();

    // Set a collapsed selection at position 1 (likely inside the first paragraph text,
    // not adjacent to any field)
    editor.commands.setTextSelection(1);
    const result = editor.commands.updateFieldsInSelection();

    expect(result).toBe(false);
  });

  it('updates NUMCHARS field to a numeric string', () => {
    editor = createEditor();
    const expectedValue = String(getWordStatistics(editor).characters);

    editor.commands.selectAll();
    editor.commands.updateFieldsInSelection();

    const statFields = findNodesByType(editor, 'documentStatField');
    const numcharsField = statFields.find((f) => {
      const instr = (f.attrs.instruction ?? '').trim().split(/\s+/)[0]?.toUpperCase();
      return instr === 'NUMCHARS';
    });

    expect(numcharsField).toBeTruthy();
    expect(numcharsField.attrs.resolvedText).toBe(expectedValue);
  });
});
