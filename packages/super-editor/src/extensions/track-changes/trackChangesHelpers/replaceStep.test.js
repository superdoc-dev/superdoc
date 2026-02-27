import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser, Slice } from 'prosemirror-model';
import { trackedTransaction, documentHelpers } from './index.js';
import { TrackInsertMarkName, TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePluginKey } from '../plugins/trackChangesBasePlugin.js';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { findTextPos } from './testUtils.js';

describe('trackChangesHelpers replaceStep', () => {
  let editor;
  let schema;
  let basePlugins;

  const user = { name: 'Track Tester', email: 'track@example.com' };

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    editor?.destroy();
    editor = null;
  });

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: basePlugins,
    });

  const getParagraphRange = (docNode, index) => {
    let range = null;
    docNode.forEach((node, offset, childIndex) => {
      if (childIndex !== index) return;
      range = { from: offset + 1, to: offset + node.nodeSize - 1 };
    });
    return range;
  };

  const getTrackedTextById = (docNode, id, markName) => {
    let text = '';
    docNode.descendants((node) => {
      if (!node.isText) return;
      const hasMark = node.marks.some((mark) => mark.type.name === markName && mark.attrs.id === id);
      if (hasMark) {
        text += node.text;
      }
    });
    return text;
  };

  it('types characters in correct order after fully deleting content (SD-1624)', () => {
    // Setup: Create a paragraph with "AB" fully marked as deleted
    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [schema.text('AB', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    // Position cursor at the start of the paragraph (position 2, after doc and paragraph open tags)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    // Simulate typing "xy" one character at a time
    // Note: We must explicitly setSelection to match real browser input behavior
    // (replaceWith alone doesn't set tr.selectionSet = true)

    // First character: "x"
    let tr = state.tr.replaceWith(state.selection.from, state.selection.from, schema.text('x'));
    // Browser input places cursor after inserted text
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');
    let tracked = trackedTransaction({ tr, state, user });
    state = state.apply(tracked);

    // Second character: "y"
    tr = state.tr.replaceWith(state.selection.from, state.selection.from, schema.text('y'));
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');
    tracked = trackedTransaction({ tr, state, user });
    state = state.apply(tracked);

    // Extract the inserted text (text with trackInsert mark)
    let insertedText = '';
    state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    // The bug would cause "yx" (reversed), the fix ensures "xy" (correct order)
    expect(insertedText).toBe('xy');
  });

  it('should map insertedTo through deletionMap when replacing own insertions near deletion spans', () => {
    // Edge case: User has their own prior insertion adjacent to a deletion span.
    // When selecting across both and replacing, markDeletion removes the user's own
    // insertion (shifting positions), but insertedTo was calculated before this shift.
    // The cursor would land too far to the right if insertedTo isn't remapped.
    //
    // Document: [inserted:"XY"][deleted:"ABC"]
    // User selects "XY" + part of "ABC" and types "Q"
    // Expected: cursor lands right after "Q"
    // Bug: cursor lands 2 positions too far right (length of removed "XY")

    const insertionMark = schema.marks[TrackInsertMarkName].create({
      id: 'ins-own',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    // "XY" with insertion mark, "ABC" with deletion mark
    const run = schema.nodes.run.create({}, [schema.text('XY', [insertionMark]), schema.text('ABC', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    const posXY = findTextPos(state.doc, 'XY');
    const posABC = findTextPos(state.doc, 'ABC');

    // Select from start of "XY" into the deletion span (selecting "XY" + "A")
    // This triggers positionAdjusted=true because selection ends inside deletion span.
    const from = posXY;
    const to = posABC + 1;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    // Replace selection with "Q"
    let tr = state.tr.replaceWith(from, to, schema.text('Q'));
    tr.setSelection(TextSelection.create(tr.doc, from + 1)); // Browser would place cursor after "Q"
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    // After the transaction:
    // - "XY" (user's own insertion) is removed entirely by markDeletion
    // - "A" already has delete mark, stays as deleted
    // - "Q" is inserted after the deletion span
    // - Final doc should be: [deleted:"ABC"][inserted:"Q"]
    //
    // The cursor should be right after "Q"
    // Bug would place it 2 positions too far right (length of removed "XY")

    // Verify the document structure
    let deletedText = '';
    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText) {
        if (node.marks.some((mark) => mark.type.name === TrackDeleteMarkName)) {
          deletedText += node.text;
        }
        if (node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
          insertedText += node.text;
        }
      }
    });

    expect(deletedText).toBe('ABC'); // Already-deleted text is preserved
    expect(insertedText).toBe('Q');

    // The critical assertion: cursor position
    // With the bug, this would fail because cursor is at wrong position
    const cursorPos = finalState.selection.from;
    const expectedCursorPos = findTextPos(finalState.doc, 'Q') + 1; // Right after "Q"

    expect(cursorPos).toBe(expectedCursorPos);
  });

  it('handles multi-step transactions without losing content (SD-1624 fix)', () => {
    // Multi-step transactions (like input rules) should preserve all content.
    // The position adjustment for insertion after deletion spans is only applied
    // to single-step transactions to avoid breaking multi-step mapping.
    const deletionMark = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [schema.text('AB', [deletionMark])]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    // Two steps in one transaction (like input rules or batched typing)
    let tr = state.tr;
    tr = tr.replaceWith(2, 2, schema.text('x'));
    tr = tr.replaceWith(3, 3, schema.text('y'));
    tr.setSelection(TextSelection.create(tr.doc, 4));
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    // Both characters should be tracked
    expect(insertedText).toBe('xy');
  });

  it('tracks single-paragraph HTML paste insertions', () => {
    const doc = schema.nodes.doc.create(
      {},
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Base')])),
    );
    let state = createState(doc);

    const basePos = findTextPos(state.doc, 'Base');
    expect(basePos).toBeTypeOf('number');
    const insertPos = basePos + 'Base'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, insertPos)));

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = '<p>Paste One</p>';
    const parsedDoc = PMDOMParser.fromSchema(schema).parse(tempDiv);
    const slice = new Slice(parsedDoc.content, 0, 0);

    let tr = state.tr.replaceSelection(slice);
    tr.setMeta('inputType', 'insertFromPaste');
    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    expect(insertedText).toContain('Paste One');
  });

  it('tracks multi-paragraph HTML paste insertions', () => {
    const doc = schema.nodes.doc.create(
      {},
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Base')])),
    );
    let state = createState(doc);

    const basePos = findTextPos(state.doc, 'Base');
    expect(basePos).toBeTypeOf('number');
    const insertPos = basePos + 'Base'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, insertPos)));

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = '<p>Paste One</p><p>Paste Two</p>';
    const parsedDoc = PMDOMParser.fromSchema(schema).parse(tempDiv);
    const slice = new Slice(parsedDoc.content, 0, 0);

    let tr = state.tr.replaceSelection(slice);
    tr.setMeta('inputType', 'insertFromPaste');
    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    expect(insertedText).toContain('Paste One');
    expect(insertedText).toContain('Paste Two');
  });

  it('tracks plain-text paste insertions', () => {
    const doc = schema.nodes.doc.create(
      {},
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Base')])),
    );
    let state = createState(doc);

    const basePos = findTextPos(state.doc, 'Base');
    expect(basePos).toBeTypeOf('number');
    const insertPos = basePos + 'Base'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, insertPos)));

    let tr = state.tr.insertText('Plain Paste', insertPos);
    tr.setMeta('inputType', 'insertFromPaste');
    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    let insertedText = '';
    finalState.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText += node.text;
      }
    });

    expect(insertedText).toContain('Plain Paste');
  });

  it('tracks paste replacement over selected existing text', () => {
    const doc = schema.nodes.doc.create(
      {},
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello World')])),
    );
    let state = createState(doc);

    const worldPos = findTextPos(state.doc, 'Hello World');
    expect(worldPos).toBeTypeOf('number');
    const from = worldPos + 'Hello '.length;
    const to = from + 'World'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = '<p>Pasted</p>';
    const parsedDoc = PMDOMParser.fromSchema(schema).parse(tempDiv);
    const slice = new Slice(parsedDoc.content, 0, 0);

    let tr = state.tr.replaceSelection(slice);
    tr.setMeta('inputType', 'insertFromPaste');
    const tracked = trackedTransaction({ tr, state, user });
    const meta = tracked.getMeta(TrackChangesBasePluginKey);
    const finalState = state.apply(tracked);

    let insertedText = '';
    let deletedText = '';
    finalState.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) insertedText += node.text;
      if (node.marks.some((mark) => mark.type.name === TrackDeleteMarkName)) deletedText += node.text;
    });

    expect(insertedText).toContain('Pasted');
    expect(deletedText).toContain('World');
    expect(meta?.insertedMark).toBeDefined();
    expect(meta?.deletionMark).toBeDefined();
    expect(meta.insertedMark.attrs.id).toBe(meta.deletionMark.attrs.id);
  });

  it('prefers original paste slice before maxOpen fallback for collapsed insertions', () => {
    const doc = schema.nodes.doc.create(
      {},
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Base')])),
    );
    let state = createState(doc);

    const basePos = findTextPos(state.doc, 'Base');
    expect(basePos).toBeTypeOf('number');
    const insertPos = basePos + 'Base'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, insertPos)));

    const originalDiv = document.createElement('div');
    originalDiv.innerHTML = '<p>Paste One</p><p>Paste Two</p>';
    const originalSlice = new Slice(PMDOMParser.fromSchema(schema).parse(originalDiv).content, 0, 0);

    const fallbackDiv = document.createElement('div');
    fallbackDiv.innerHTML = '<p>Flattened Fallback</p>';
    const fallbackSlice = new Slice(PMDOMParser.fromSchema(schema).parse(fallbackDiv).content, 0, 0);
    vi.spyOn(Slice, 'maxOpen').mockReturnValue(fallbackSlice);

    let tr = state.tr.replaceSelection(originalSlice);
    tr.setMeta('inputType', 'insertFromPaste');
    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    const text = finalState.doc.textBetween(0, finalState.doc.content.size, '\n');
    expect(text).toContain('Paste One');
    expect(text).toContain('Paste Two');
    expect(text).not.toContain('Flattened Fallback');
  });

  it('deletes empty paragraph on Backspace in suggesting mode', () => {
    // When the cursor is inside an empty paragraph and the user presses Backspace,
    // ProseMirror creates a ReplaceStep that removes the empty paragraph node.
    // The track changes system should allow this deletion to proceed since there's
    // no inline content to track.

    // Create doc with: <p>Hello</p><p></p>
    const run = schema.nodes.run.create({}, [schema.text('Hello')]);
    const para1 = schema.nodes.paragraph.create({}, run);
    const para2 = schema.nodes.paragraph.create();
    const doc = schema.nodes.doc.create({}, [para1, para2]);
    let state = createState(doc);

    // Find empty paragraph position dynamically
    let emptyParaOffset = null;
    state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.content.size === 0) {
        emptyParaOffset = offset;
      }
    });
    expect(emptyParaOffset).not.toBeNull();

    // Cursor inside empty paragraph (offset + 1 for the opening position)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, emptyParaOffset + 1)));

    // Simulate Backspace: joinBackward creates a ReplaceStep that removes the empty paragraph
    const tr = state.tr.delete(emptyParaOffset, emptyParaOffset + para2.nodeSize);
    tr.setMeta('inputType', 'deleteContentBackward');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    // The empty paragraph should be deleted — only one paragraph should remain
    let paragraphCount = 0;
    finalState.doc.forEach((node) => {
      if (node.type.name === 'paragraph') paragraphCount++;
    });
    expect(paragraphCount).toBe(1);

    // The remaining paragraph should contain "Hello"
    let textContent = '';
    finalState.doc.descendants((node) => {
      if (node.isText) textContent += node.text;
    });
    expect(textContent).toBe('Hello');
  });

  it('applies paragraph join directly in suggesting mode (no inline content to track)', () => {
    // Paragraph joins have no inline content in their step range (only block boundary
    // tokens), so markDeletion has nothing to mark. The join is applied directly.
    const para1 = schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('Hello')]));
    const para2 = schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text('World')]));
    const doc = schema.nodes.doc.create({}, [para1, para2]);
    let state = createState(doc);

    let joinPos = null;
    state.doc.forEach((node, offset, index) => {
      if (index === 0) joinPos = offset + node.nodeSize;
    });
    expect(joinPos).not.toBeNull();

    const tr = state.tr.join(joinPos);
    tr.setMeta('inputType', 'deleteContentBackward');

    const tracked = trackedTransaction({ tr, state, user });
    const finalState = state.apply(tracked);

    // The join should be applied — only one paragraph remains
    let paragraphCount = 0;
    finalState.doc.forEach(() => paragraphCount++);
    expect(paragraphCount).toBe(1);

    // Both texts should be merged
    expect(finalState.doc.textContent).toBe('HelloWorld');
  });

  it('tracks replace even when selection contains existing deletions and links', () => {
    const linkMark = schema.marks.link.create({ href: 'https://example.com' });
    const existingDeletion = schema.marks[TrackDeleteMarkName].create({
      id: 'del-existing',
      author: user.name,
      authorEmail: user.email,
      date: '2024-01-01T00:00:00.000Z',
    });

    const run = schema.nodes.run.create({}, [
      schema.text('Start'),
      schema.text('Del', [existingDeletion]),
      schema.text('Link', [linkMark]),
      schema.text('Tail'),
    ]);
    const doc = schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, run));
    let state = createState(doc);

    const startPos = findTextPos(state.doc, 'Start');
    const linkPos = findTextPos(state.doc, 'Link');
    expect(startPos).toBeTypeOf('number');
    expect(linkPos).toBeTypeOf('number');

    const from = startPos;
    const to = linkPos + 'Link'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    const tr = state.tr.replaceWith(from, to, schema.text('X'));
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const meta = tracked.getMeta(TrackChangesBasePluginKey);

    expect(meta?.insertedMark).toBeDefined();
    expect(meta?.deletionMark).toBeDefined();
    expect(meta.insertedMark.attrs.id).toBe(meta.deletionMark.attrs.id);

    const finalState = state.apply(tracked);
    const inlineNodes = documentHelpers.findInlineNodes(finalState.doc);
    expect(inlineNodes.some(({ node }) => node.marks.some((mark) => mark.type.name === TrackInsertMarkName))).toBe(
      true,
    );
    expect(inlineNodes.some(({ node }) => node.marks.some((mark) => mark.type.name === TrackDeleteMarkName))).toBe(
      true,
    );
  });

  it('supersedes tracked changes across multiple paragraphs with one replacement ID', () => {
    const line1 = 'Line one base';
    const line2 = 'Line two base';
    const tail = 'Tail line';

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(line1)])),
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(line2)])),
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(tail)])),
    ]);
    let state = createState(doc);

    const applyTrackedReplace = ({ from, to, text }) => {
      let tr = state.tr.replaceWith(from, to, schema.text(text));
      tr.setSelection(TextSelection.create(tr.doc, from + text.length));
      tr.setMeta('inputType', 'insertText');
      const tracked = trackedTransaction({ tr, state, user });
      state = state.apply(tracked);
    };

    const line1Pos = findTextPos(state.doc, line1);
    expect(line1Pos).toBeTypeOf('number');
    applyTrackedReplace({ from: line1Pos, to: line1Pos + line1.length, text: 'Line one change' });

    const line2Pos = findTextPos(state.doc, line2);
    expect(line2Pos).toBeTypeOf('number');
    applyTrackedReplace({ from: line2Pos, to: line2Pos + line2.length, text: 'Line two change' });

    const para1 = getParagraphRange(state.doc, 0);
    const para2 = getParagraphRange(state.doc, 1);
    expect(para1).toBeTruthy();
    expect(para2).toBeTruthy();

    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, para1.from, para2.to)));
    let tr = state.tr.replaceWith(para1.from, para2.to, schema.text('Merged suggestion'));
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');

    const tracked = trackedTransaction({ tr, state, user });
    const meta = tracked.getMeta(TrackChangesBasePluginKey);
    const finalState = state.apply(tracked);

    expect(meta?.insertedMark).toBeDefined();
    expect(meta?.deletionMark).toBeDefined();
    expect(meta.insertedMark.attrs.id).toBe(meta.deletionMark.attrs.id);

    const replacementId = meta.insertedMark.attrs.id;
    const insertedText = getTrackedTextById(finalState.doc, replacementId, TrackInsertMarkName);
    const deletedText = getTrackedTextById(finalState.doc, replacementId, TrackDeleteMarkName);
    expect(insertedText).toContain('Merged suggestion');
    expect(deletedText).toContain(line1);
    expect(deletedText).toContain(line2);
    expect(deletedText).not.toContain('Line one change');
    expect(deletedText).not.toContain('Line two change');

    const insertIds = new Set();
    finalState.doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => {
        if (mark.type.name === TrackInsertMarkName) {
          insertIds.add(mark.attrs.id);
        }
      });
    });
    expect(insertIds.size).toBe(1);
  });

  it('keeps caret stable after superseding multi-paragraph tracked changes', () => {
    const line1 = 'Alpha base';
    const line2 = 'Beta base';
    const tail = 'Tail text';

    const doc = schema.nodes.doc.create({}, [
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(line1)])),
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(line2)])),
      schema.nodes.paragraph.create({}, schema.nodes.run.create({}, [schema.text(tail)])),
    ]);
    let state = createState(doc);

    const applyTrackedReplace = ({ from, to, text }) => {
      let tr = state.tr.replaceWith(from, to, schema.text(text));
      tr.setSelection(TextSelection.create(tr.doc, from + text.length));
      tr.setMeta('inputType', 'insertText');
      const tracked = trackedTransaction({ tr, state, user });
      state = state.apply(tracked);
    };

    const line1Pos = findTextPos(state.doc, line1);
    applyTrackedReplace({ from: line1Pos, to: line1Pos + line1.length, text: 'Alpha change' });

    const line2Pos = findTextPos(state.doc, line2);
    applyTrackedReplace({ from: line2Pos, to: line2Pos + line2.length, text: 'Beta change' });

    const para1 = getParagraphRange(state.doc, 0);
    const para2 = getParagraphRange(state.doc, 1);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, para1.from, para2.to)));
    let tr = state.tr.replaceWith(para1.from, para2.to, schema.text('Merged'));
    tr.setSelection(TextSelection.create(tr.doc, tr.selection.from));
    tr.setMeta('inputType', 'insertText');
    state = state.apply(trackedTransaction({ tr, state, user }));

    ['X', 'Y', 'Z'].forEach((char) => {
      const prevSelection = state.selection.from;
      let typingTr = state.tr.replaceWith(state.selection.from, state.selection.from, schema.text(char));
      typingTr.setSelection(TextSelection.create(typingTr.doc, typingTr.selection.from));
      typingTr.setMeta('inputType', 'insertText');
      state = state.apply(trackedTransaction({ tr: typingTr, state, user }));

      expect(state.selection.from).toBe(prevSelection + 1);
      const tailPos = findTextPos(state.doc, tail);
      expect(tailPos).toBeTypeOf('number');
      expect(state.selection.from).toBeLessThanOrEqual(tailPos);
    });

    const insertedText = [];
    state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((mark) => mark.type.name === TrackInsertMarkName)) {
        insertedText.push(node.text);
      }
    });

    expect(insertedText.join('')).toContain('MergedXYZ');
  });
});
