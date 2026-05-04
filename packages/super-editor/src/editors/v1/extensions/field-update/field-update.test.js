/* @vitest-environment jsdom */

/**
 * Tests for the FieldUpdate extension's updateFieldsInSelection command.
 *
 * Uses the numwords.docx fixture which contains NUMWORDS, NUMCHARS, and
 * NUMPAGES fields with known imported values for the stat-field path. The
 * TOC path is exercised via direct command-function invocation against a
 * synthetic doc/editor — no docx fixture required.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { getWordStatistics } from '../../document-api-adapters/helpers/word-statistics.js';
import { FieldUpdate } from './field-update.js';

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

// ---------------------------------------------------------------------------
// TOC path — invoked directly against synthetic state to avoid needing a
// fully-imported TOC fixture.
// ---------------------------------------------------------------------------

const tocSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    tableOfContents: {
      group: 'block',
      content: 'paragraph*',
      attrs: { sdBlockId: { default: null } },
      toDOM: () => ['div', 0],
    },
    text: { group: 'inline' },
  },
});

const buildTocDoc = (sdBlockIds) => {
  const para = (txt) => tocSchema.nodes.paragraph.create({}, txt ? tocSchema.text(txt) : null);
  const tocs = sdBlockIds.map((id) => tocSchema.nodes.tableOfContents.create({ sdBlockId: id }, [para('entry')]));
  return tocSchema.nodes.doc.create({}, [para('intro'), ...tocs, para('outro')]);
};

const runUpdateFields = (overrides) => {
  const { doc, editor } = overrides;
  const dispatch = 'dispatch' in overrides ? overrides.dispatch : () => {};
  // FieldUpdate is wrapped by Extension.create(); reach into config.addCommands
  // to invoke the raw command function the same way ExtensionService does.
  const commands = FieldUpdate.config.addCommands.call({ editor });
  const command = commands.updateFieldsInSelection();
  const tr = { setMeta: vi.fn() };
  const state = { doc, selection: { from: 0, to: 0 }, schema: tocSchema, tr };
  return { result: command({ editor, state, tr, dispatch }), tr };
};

describe('updateFieldsInSelection — TOC path', () => {
  it('calls editor.doc.toc.update for every tableOfContents node in document order', () => {
    const update = vi.fn(() => ({ success: true }));
    const editor = { doc: { toc: { update } } };
    const doc = buildTocDoc(['toc-a', 'toc-b']);

    const { result } = runUpdateFields({ doc, editor });

    expect(result).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0]).toEqual({
      target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-a' },
      mode: 'all',
    });
    expect(update.mock.calls[1][0]).toEqual({
      target: { kind: 'block', nodeType: 'tableOfContents', nodeId: 'toc-b' },
      mode: 'all',
    });
  });

  it('sets preventDispatch on the framework tr so CommandService skips its auto-dispatch', () => {
    const update = vi.fn(() => ({ success: true }));
    const editor = { doc: { toc: { update } } };
    const doc = buildTocDoc(['toc-a']);

    const { tr } = runUpdateFields({ doc, editor });
    expect(tr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
  });

  it('skips a TOC whose sdBlockId is missing or empty', () => {
    const update = vi.fn(() => ({ success: true }));
    const editor = { doc: { toc: { update } } };
    const doc = buildTocDoc([null, '', 'toc-real']);

    runUpdateFields({ doc, editor });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].target.nodeId).toBe('toc-real');
  });

  it('swallows toc.update errors and continues with the remaining TOCs', () => {
    const update = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementationOnce(() => ({ success: true }));
    const editor = { doc: { toc: { update } } };
    const doc = buildTocDoc(['toc-a', 'toc-b']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = runUpdateFields({ doc, editor });
    expect(result).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('falls through to the stat-field path when the doc has no TOCs', () => {
    const update = vi.fn();
    const editor = { doc: { toc: { update } } };
    const para = (txt) => tocSchema.nodes.paragraph.create({}, txt ? tocSchema.text(txt) : null);
    const doc = tocSchema.nodes.doc.create({}, [para('hello world')]);

    const { tr } = runUpdateFields({ doc, editor });
    expect(update).not.toHaveBeenCalled();
    expect(tr.setMeta).not.toHaveBeenCalled(); // no preventDispatch when not taking the TOC path
  });
});

describe('FieldUpdate extension shortcuts', () => {
  it('binds F9 to updateFieldsInSelection', () => {
    const ed = { commands: { updateFieldsInSelection: vi.fn(() => true) } };
    const shortcuts = FieldUpdate.config.addShortcuts.call({ editor: ed });
    expect(Object.keys(shortcuts)).toEqual(['F9']);
    shortcuts.F9();
    expect(ed.commands.updateFieldsInSelection).toHaveBeenCalledTimes(1);
  });
});
