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
import { EditorState } from 'prosemirror-state';
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

  it('re-stamps tocStorage.pageMap and pageMapDoc to the current editor doc before every TOC update', () => {
    const cachedPageMap = new Map([
      ['h-1', 5],
      ['h-2', 9],
    ]);
    const tocStorage = { pageMap: cachedPageMap, pageMapDoc: 'pre-loop-doc' };

    const captured = [];
    // Each entry simulates a fresh editor.state after toc.update dispatched.
    const states = [
      EditorState.create({ schema: tocSchema, doc: buildTocDoc(['toc-a', 'toc-b']) }),
      EditorState.create({ schema: tocSchema, doc: buildTocDoc(['toc-a', 'toc-b']) }),
      EditorState.create({ schema: tocSchema, doc: buildTocDoc(['toc-a', 'toc-b']) }),
    ];
    let stateIdx = 0;

    const editor = {
      doc: {
        toc: {
          update: vi.fn(() => {
            captured.push({
              pageMap: tocStorage.pageMap,
              pageMapDoc: tocStorage.pageMapDoc,
              stateDocAtCall: editor.state.doc,
            });
            // Simulate toc.update dispatching its own transaction (editor.state advances).
            stateIdx += 1;
          }),
        },
      },
      storage: { tableOfContents: tocStorage },
      get state() {
        return states[stateIdx];
      },
    };
    const doc = states[0].doc;

    runUpdateFields({ doc, editor });

    expect(editor.doc.toc.update).toHaveBeenCalledTimes(2);
    expect(captured).toHaveLength(2);
    // Cached pageMap survives across iterations.
    expect(captured[0].pageMap).toBe(cachedPageMap);
    expect(captured[1].pageMap).toBe(cachedPageMap);
    // pageMapDoc was re-stamped to the editor's current state.doc each time.
    expect(captured[0].pageMapDoc).toBe(captured[0].stateDocAtCall);
    expect(captured[1].pageMapDoc).toBe(captured[1].stateDocAtCall);
    // The two iterations actually saw different docs (the swap-on-dispatch the
    // bug was about) — proving the re-stamp ran each iteration.
    expect(captured[0].stateDocAtCall).not.toBe(captured[1].stateDocAtCall);
  });
});

// ---------------------------------------------------------------------------
// Luccas's regression — early `return` after the TOC path skipped stat fields.
// A doc with both TOCs and stat fields must update both on F9.
// ---------------------------------------------------------------------------

const mixedSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    tableOfContents: {
      group: 'block',
      content: 'paragraph*',
      attrs: { sdBlockId: { default: null } },
      toDOM: () => ['div', 0],
    },
    documentStatField: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        instruction: { default: '' },
        resolvedText: { default: '' },
      },
      toDOM: (n) => ['span', n.attrs.resolvedText ?? ''],
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
    text: { group: 'inline' },
  },
});

describe('updateFieldsInSelection — TOC + stat fields combined (regression)', () => {
  it('updates stat fields after running the TOC path so docs with both kinds of fields refresh fully on F9', () => {
    const tocUpdate = vi.fn(() => ({ success: true }));
    const para = (children) => mixedSchema.nodes.paragraph.create({}, children);
    const text = (t) => mixedSchema.text(t);
    const statField = mixedSchema.nodes.documentStatField.create({
      instruction: 'NUMWORDS',
      resolvedText: '0',
    });
    const toc = mixedSchema.nodes.tableOfContents.create({ sdBlockId: 'toc-1' }, [para([text('entry')])]);
    const doc = mixedSchema.nodes.doc.create({}, [para([text('hello world')]), toc, para([statField])]);

    const editorState = EditorState.create({ schema: mixedSchema, doc });
    const editor = {
      doc: { toc: { update: tocUpdate } },
      // resolveMainBodyEditor falls back to the editor itself for stats.
      state: editorState,
    };

    const commands = FieldUpdate.config.addCommands.call({ editor });
    const command = commands.updateFieldsInSelection();
    const outerTr = editorState.tr;
    outerTr.setMeta = vi.fn(outerTr.setMeta.bind(outerTr));
    const dispatch = vi.fn();
    const state = {
      doc,
      selection: { from: 0, to: doc.content.size },
      schema: mixedSchema,
      tr: outerTr,
    };

    const result = command({ editor, state, tr: outerTr, dispatch });

    // TOC path ran and marked the framework tr preventDispatch.
    expect(tocUpdate).toHaveBeenCalledTimes(1);
    expect(outerTr.setMeta).toHaveBeenCalledWith('preventDispatch', true);
    // Stat-field path also ran — the early-return regression would skip it.
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('updates SECTIONPAGES fields from the current header/footer section page count', () => {
    const para = (children) => mixedSchema.nodes.paragraph.create({}, children);
    const sectionPageCountField = mixedSchema.nodes['section-page-count'].create(
      {
        instruction: 'SECTIONPAGES',
        resolvedText: '1',
      },
      mixedSchema.text('1'),
    );
    const doc = mixedSchema.nodes.doc.create({}, [para([sectionPageCountField])]);
    const editorState = EditorState.create({ schema: mixedSchema, doc });
    const editor = {
      options: { sectionPageCount: 4 },
      state: editorState,
    };

    const commands = FieldUpdate.config.addCommands.call({ editor });
    const command = commands.updateFieldsInSelection();
    const outerTr = editorState.tr;
    const dispatch = vi.fn();
    const state = {
      doc,
      selection: { from: 0, to: doc.content.size },
      schema: mixedSchema,
      tr: outerTr,
    };

    const result = command({ editor, state, tr: outerTr, dispatch });

    expect(result).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const updatedDoc = dispatch.mock.calls[0][0].doc;
    const updatedField = updatedDoc.nodeAt(1);
    expect(updatedField.type.name).toBe('section-page-count');
    expect(updatedField.attrs.resolvedText).toBe('4');
    expect(updatedField.textContent).toBe('4');
  });

  it('updates SECTIONPAGES zero-padded fields from the current header/footer section page count', () => {
    const para = (children) => mixedSchema.nodes.paragraph.create({}, children);
    const sectionPageCountField = mixedSchema.nodes['section-page-count'].create(
      {
        instruction: 'SECTIONPAGES \\# "000"',
        pageNumberFormat: 'decimal',
        pageNumberZeroPadding: 3,
        resolvedText: '001',
      },
      mixedSchema.text('001'),
    );
    const doc = mixedSchema.nodes.doc.create({}, [para([sectionPageCountField])]);
    const editorState = EditorState.create({ schema: mixedSchema, doc });
    const editor = {
      options: { sectionPageCount: 4 },
      state: editorState,
    };

    const commands = FieldUpdate.config.addCommands.call({ editor });
    const command = commands.updateFieldsInSelection();
    const outerTr = editorState.tr;
    const dispatch = vi.fn();
    const state = {
      doc,
      selection: { from: 0, to: doc.content.size },
      schema: mixedSchema,
      tr: outerTr,
    };

    const result = command({ editor, state, tr: outerTr, dispatch });

    expect(result).toBe(true);
    const updatedDoc = dispatch.mock.calls[0][0].doc;
    const updatedField = updatedDoc.nodeAt(1);
    expect(updatedField.attrs.resolvedText).toBe('004');
    expect(updatedField.textContent).toBe('004');
  });

  it('leaves SECTIONPAGES fields unchanged when section page context is unavailable', () => {
    const para = (children) => mixedSchema.nodes.paragraph.create({}, children);
    const sectionPageCountField = mixedSchema.nodes['section-page-count'].create(
      {
        instruction: 'SECTIONPAGES',
        resolvedText: '3',
      },
      mixedSchema.text('3'),
    );
    const doc = mixedSchema.nodes.doc.create({}, [para([sectionPageCountField])]);
    const editorState = EditorState.create({ schema: mixedSchema, doc });
    const editor = {
      options: {},
      state: editorState,
    };

    const commands = FieldUpdate.config.addCommands.call({ editor });
    const command = commands.updateFieldsInSelection();
    const outerTr = editorState.tr;
    const dispatch = vi.fn();
    const state = {
      doc,
      selection: { from: 0, to: doc.content.size },
      schema: mixedSchema,
      tr: outerTr,
    };

    const result = command({ editor, state, tr: outerTr, dispatch });

    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    const unchangedField = editorState.doc.nodeAt(1);
    expect(unchangedField.attrs.resolvedText).toBe('3');
    expect(unchangedField.textContent).toBe('3');
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
