import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { TrackChanges } from './track-changes.js';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from './constants.js';
import { TrackChangesBasePlugin, TrackChangesBasePluginKey } from './plugins/trackChangesBasePlugin.js';
import { initTestEditor, hasAnyMark } from '@tests/helpers/helpers.js';

const commands = TrackChanges.config.addCommands();

describe('TrackChanges extension commands', () => {
  let editor;
  let schema;

  const createDoc = (text, marks = []) => {
    const paragraph = schema.nodes.paragraph.create(null, schema.text(text, marks));
    return schema.nodes.doc.create(null, paragraph);
  };

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: [TrackChangesBasePlugin()],
    });

  const markPresent = (doc, markName) => doc.nodeAt(1)?.marks.some((mark) => mark.type.name === markName);
  const getFirstTextRange = (doc) => {
    let range = null;
    doc.descendants((node, pos) => {
      if (!node.isText || range) return;
      range = { from: pos, to: pos + node.nodeSize };
    });
    return range;
  };
  const getSubstringRange = (doc, substring) => {
    let range = null;

    doc.descendants((node, pos) => {
      if (!node.isText || range || typeof node.text !== 'string') return;

      const startIndex = node.text.indexOf(substring);
      if (startIndex === -1) return;

      range = {
        from: pos + startIndex,
        to: pos + startIndex + substring.length,
      };
    });

    return range;
  };
  const getMarkedText = (doc, markName) => {
    let text = '';

    doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((mark) => mark.type.name === markName)) {
        text += node.text ?? '';
      }
    });

    return text;
  };

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('acceptTrackedChangesBetween removes tracked insert marks and preserves content', () => {
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: 'ins-1' });
    const doc = createDoc('Inserted', [insertMark]);
    const state = createState(doc);

    let nextState;
    const result = commands.acceptTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
    });

    expect(result).toBe(true);
    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('Inserted');
    expect(markPresent(nextState.doc, TrackInsertMarkName)).toBe(false);
  });

  it('acceptTrackedChangesBetween removes tracked delete content', () => {
    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: 'del-1' });
    const doc = createDoc('Old', [deleteMark]);
    const state = createState(doc);

    let nextState;
    commands.acceptTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('');
  });

  it('blocks accepting tracked changes when permissionResolver denies access', () => {
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: 'ins-guard', authorEmail: 'author@example.com' });
    const doc = createDoc('Pending', [insertMark]);
    const state = createState(doc);

    editor.options.user = { email: 'reviewer@example.com' };
    editor.options.role = 'editor';
    editor.options.permissionResolver = vi.fn(() => false);

    const dispatch = vi.fn();
    const result = commands.acceptTrackedChangesBetween(1, doc.content.size)({ state, dispatch, editor });

    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.options.permissionResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'RESOLVE_OTHER',
        trackedChange: expect.objectContaining({ id: 'ins-guard' }),
      }),
    );
  });

  it('rejectTrackedChangesBetween deletes inserted content and keeps deletions', () => {
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: 'ins-2' });
    const insertDoc = createDoc('New', [insertMark]);
    const insertState = createState(insertDoc);

    let rejectedState;
    commands.rejectTrackedChangesBetween(
      1,
      insertDoc.content.size,
    )({
      state: insertState,
      dispatch: (tr) => {
        rejectedState = insertState.apply(tr);
      },
    });

    expect(rejectedState).toBeDefined();
    expect(rejectedState.doc.textContent).toBe('');

    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: 'del-2' });
    const deleteDoc = createDoc('Legacy', [deleteMark]);
    const deleteState = createState(deleteDoc);

    let restoredState;
    commands.rejectTrackedChangesBetween(
      1,
      deleteDoc.content.size,
    )({
      state: deleteState,
      dispatch: (tr) => {
        restoredState = deleteState.apply(tr);
      },
    });

    expect(restoredState).toBeDefined();
    expect(restoredState.doc.textContent).toBe('Legacy');
    expect(markPresent(restoredState.doc, TrackDeleteMarkName)).toBe(false);
  });

  it('acceptTrackedChangesBetween accepts only the selected middle substring of an insertion', () => {
    const changeId = 'ins-partial-accept';
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: changeId });
    const doc = createDoc('ABCDE', [insertMark]);
    const state = createState(doc);
    const emit = vi.fn();
    const selectionRange = getSubstringRange(doc, 'BC');

    let nextState;
    commands.acceptTrackedChangesBetween(
      selectionRange.from,
      selectionRange.to,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: {
        emit,
        options: { documentId: 'test-doc', user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('ABCDE');
    expect(getMarkedText(nextState.doc, TrackInsertMarkName)).toBe('ADE');

    const updatePayload = emit.mock.calls.find(
      ([eventName, payload]) =>
        eventName === 'commentsUpdate' &&
        payload?.type === 'trackedChange' &&
        payload?.event === 'update' &&
        payload?.changeId === changeId,
    )?.[1];

    expect(updatePayload).toEqual(
      expect.objectContaining({
        trackedChangeText: 'ADE',
      }),
    );
    expect(
      emit.mock.calls.some(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' &&
          payload?.type === 'trackedChange' &&
          payload?.event === 'resolve' &&
          payload?.changeId === changeId,
      ),
    ).toBe(false);
  });

  it('rejectTrackedChangesBetween rejects only the selected middle substring of an insertion', () => {
    const changeId = 'ins-partial-reject';
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: changeId });
    const doc = createDoc('ABCDE', [insertMark]);
    const state = createState(doc);
    const emit = vi.fn();
    const selectionRange = getSubstringRange(doc, 'BC');

    let nextState;
    commands.rejectTrackedChangesBetween(
      selectionRange.from,
      selectionRange.to,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: {
        emit,
        options: { documentId: 'test-doc', user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('ADE');
    expect(getMarkedText(nextState.doc, TrackInsertMarkName)).toBe('ADE');

    const updatePayload = emit.mock.calls.find(
      ([eventName, payload]) =>
        eventName === 'commentsUpdate' &&
        payload?.type === 'trackedChange' &&
        payload?.event === 'update' &&
        payload?.changeId === changeId,
    )?.[1];

    expect(updatePayload).toEqual(
      expect.objectContaining({
        trackedChangeText: 'ADE',
      }),
    );
    expect(
      emit.mock.calls.some(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' &&
          payload?.type === 'trackedChange' &&
          payload?.event === 'resolve' &&
          payload?.changeId === changeId,
      ),
    ).toBe(false);
  });

  it('acceptTrackedChangesBetween accepts only the selected middle substring of a deletion', () => {
    const changeId = 'del-partial-accept';
    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: changeId });
    const doc = createDoc('ABCDE', [deleteMark]);
    const state = createState(doc);
    const emit = vi.fn();
    const selectionRange = getSubstringRange(doc, 'BC');

    let nextState;
    commands.acceptTrackedChangesBetween(
      selectionRange.from,
      selectionRange.to,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: {
        emit,
        options: { documentId: 'test-doc', user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('ADE');
    expect(getMarkedText(nextState.doc, TrackDeleteMarkName)).toBe('ADE');

    const updatePayload = emit.mock.calls.find(
      ([eventName, payload]) =>
        eventName === 'commentsUpdate' &&
        payload?.type === 'trackedChange' &&
        payload?.event === 'update' &&
        payload?.changeId === changeId,
    )?.[1];

    expect(updatePayload).toEqual(
      expect.objectContaining({
        deletedText: 'ADE',
      }),
    );
    expect(
      emit.mock.calls.some(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' &&
          payload?.type === 'trackedChange' &&
          payload?.event === 'resolve' &&
          payload?.changeId === changeId,
      ),
    ).toBe(false);
  });

  it('rejectTrackedChangesBetween rejects only the selected middle substring of a deletion', () => {
    const changeId = 'del-partial-reject';
    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: changeId });
    const doc = createDoc('ABCDE', [deleteMark]);
    const state = createState(doc);
    const emit = vi.fn();
    const selectionRange = getSubstringRange(doc, 'BC');

    let nextState;
    commands.rejectTrackedChangesBetween(
      selectionRange.from,
      selectionRange.to,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: {
        emit,
        options: { documentId: 'test-doc', user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('ABCDE');
    expect(getMarkedText(nextState.doc, TrackDeleteMarkName)).toBe('ADE');

    const updatePayload = emit.mock.calls.find(
      ([eventName, payload]) =>
        eventName === 'commentsUpdate' &&
        payload?.type === 'trackedChange' &&
        payload?.event === 'update' &&
        payload?.changeId === changeId,
    )?.[1];

    expect(updatePayload).toEqual(
      expect.objectContaining({
        deletedText: 'ADE',
      }),
    );
    expect(
      emit.mock.calls.some(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' &&
          payload?.type === 'trackedChange' &&
          payload?.event === 'resolve' &&
          payload?.changeId === changeId,
      ),
    ).toBe(false);
  });

  it('rejectTrackedChangesBetween emits tracked-change resolve events for rejected IDs', () => {
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: 'ins-resolve-1' });
    const doc = createDoc('Pending', [insertMark]);
    const state = createState(doc);
    const emit = vi.fn();

    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state,
      dispatch: (tr) => state.apply(tr),
      editor: {
        emit,
        options: { user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(emit).toHaveBeenCalledWith(
      'commentsUpdate',
      expect.objectContaining({
        type: 'trackedChange',
        event: 'resolve',
        changeId: 'ins-resolve-1',
        resolvedByEmail: 'reviewer@example.com',
        resolvedByName: 'Reviewer',
      }),
    );
  });

  it('rejectTrackedChangesBetween applies mixed selections per overlapped tracked segment', () => {
    const changeId = 'ins-partial-still-present';
    const insertMark = schema.marks[TrackInsertMarkName].create({ id: changeId });
    const deleteId = 'del-partial-still-present';
    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: deleteId });
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('AB', [insertMark]),
      schema.text('x'),
      schema.text('CD', [deleteMark]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);
    const state = createState(doc);
    const emit = vi.fn();
    const insertionSelection = getSubstringRange(doc, 'B');
    const deletionSelection = getSubstringRange(doc, 'C');

    let nextState;
    commands.rejectTrackedChangesBetween(
      insertionSelection.from,
      deletionSelection.to,
    )({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: {
        emit,
        options: { user: { email: 'reviewer@example.com', name: 'Reviewer' } },
      },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('AxCD');
    expect(getMarkedText(nextState.doc, TrackInsertMarkName)).toBe('A');
    expect(getMarkedText(nextState.doc, TrackDeleteMarkName)).toBe('D');

    const updatedIds = emit.mock.calls
      .filter(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' && payload?.type === 'trackedChange' && payload?.event === 'update',
      )
      .map(([, payload]) => payload.changeId);

    expect(updatedIds).toEqual(expect.arrayContaining([changeId, deleteId]));
    expect(
      emit.mock.calls.some(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' &&
          payload?.type === 'trackedChange' &&
          payload?.event === 'resolve' &&
          [changeId, deleteId].includes(payload?.changeId),
      ),
    ).toBe(false);
  });

  it('blocks rejecting tracked changes when permissionResolver denies access', () => {
    const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: 'del-guard', authorEmail: 'author@example.com' });
    const doc = createDoc('Legacy', [deleteMark]);
    const state = createState(doc);

    editor.options.user = { email: 'author@example.com' };
    editor.options.role = 'editor';
    editor.options.permissionResolver = vi.fn(({ permission }) => permission !== 'REJECT_OWN');

    const dispatch = vi.fn();
    const result = commands.rejectTrackedChangesBetween(1, doc.content.size)({ state, dispatch, editor });

    expect(result).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.options.permissionResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: 'REJECT_OWN',
        trackedChange: expect.objectContaining({ id: 'del-guard' }),
      }),
    );
  });

  it('accept/reject operations handle format changes', () => {
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-1',
      before: [{ type: 'bold', attrs: {} }],
      after: [{ type: 'italic', attrs: {} }],
    });
    const italic = schema.marks.italic.create();
    const doc = createDoc('Styled', [italic, formatMark]);

    const acceptState = createState(doc);
    let afterAccept;
    commands.acceptTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: acceptState,
      dispatch: (tr) => {
        afterAccept = acceptState.apply(tr);
      },
    });

    expect(afterAccept).toBeDefined();
    expect(markPresent(afterAccept.doc, TrackFormatMarkName)).toBe(false);
    expect(markPresent(afterAccept.doc, 'italic')).toBe(true);

    const rejectState = createState(doc);
    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);
    expect(markPresent(afterReject.doc, 'bold')).toBe(true);
    expect(markPresent(afterReject.doc, 'italic')).toBe(false);
  });

  it('acceptTrackedChangesBetween bulk-accepts all format/style changes in range', () => {
    const bold = schema.marks.bold.create();
    const italic = schema.marks.italic.create();
    const fmt1 = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-bulk-1',
      before: [],
      after: [{ type: 'bold', attrs: {} }],
    });
    const fmt2 = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-bulk-2',
      before: [{ type: 'bold', attrs: {} }],
      after: [{ type: 'italic', attrs: {} }],
    });
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('One', [bold, fmt1]),
      schema.text(' two ', []),
      schema.text('three', [italic, fmt2]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);
    const state = createState(doc);

    let afterAccept;
    commands.acceptTrackedChangesBetween(
      0,
      doc.content.size,
    )({
      state,
      dispatch: (tr) => {
        afterAccept = state.apply(tr);
      },
    });

    expect(afterAccept).toBeDefined();
    expect(afterAccept.doc.textContent).toBe('One two three');

    let formatMarkCount = 0;
    afterAccept.doc.descendants((node) => {
      if (node.marks.some((m) => m.type.name === TrackFormatMarkName)) formatMarkCount += 1;
    });
    expect(formatMarkCount).toBe(0);

    const firstRange = getFirstTextRange(afterAccept.doc);
    const firstMarks = afterAccept.doc.nodeAt(firstRange.from)?.marks ?? [];
    expect(firstMarks.some((m) => m.type.name === 'bold')).toBe(true);

    afterAccept.doc.descendants((node, pos) => {
      if (!node.isText || node.textContent !== 'three') return;
      const marks = afterAccept.doc.nodeAt(pos)?.marks ?? [];
      expect(marks.some((m) => m.type.name === 'italic')).toBe(true);
      return false;
    });
  });

  it('rejectTrackedChangesBetween restores imported textStyle attrs for color suggestions', () => {
    const oldTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Calibri, sans-serif',
      fontSize: '11pt',
      color: '#112233',
    });
    const newTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Calibri, sans-serif',
      fontSize: '11pt',
      color: '#FF0000',
    });
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-color-1',
      before: [{ type: 'textStyle', attrs: oldTextStyle.attrs }],
      after: [{ type: 'textStyle', attrs: newTextStyle.attrs }],
    });
    const doc = createDoc('Styled', [newTextStyle, formatMark]);
    const rejectState = createState(doc);

    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);

    let restoredTextStyle;
    afterReject.doc.descendants((node) => {
      if (!node.isText) {
        return;
      }

      restoredTextStyle = node.marks.find((mark) => mark.type.name === 'textStyle');
      if (restoredTextStyle) {
        return false;
      }
    });

    expect(restoredTextStyle).toBeDefined();
    expect(restoredTextStyle.attrs).toEqual(oldTextStyle.attrs);
  });

  it('rejectTrackedChangesBetween removes sparse after textStyle snapshots against richer live marks', () => {
    const suggestedTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Calibri, sans-serif',
      fontSize: '11pt',
      color: '#FF0000',
    });
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-sparse-after',
      before: [],
      after: [{ type: 'textStyle', attrs: { color: '#FF0000' } }],
    });
    const doc = createDoc('Styled', [suggestedTextStyle, formatMark]);
    const rejectState = createState(doc);

    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);
    expect(markPresent(afterReject.doc, 'textStyle')).toBe(false);
  });

  it('rejectTrackedChangesBetween removes richer after textStyle snapshots against sparse live marks', () => {
    const suggestedTextStyle = schema.marks.textStyle.create({
      color: '#0563C1',
    });
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-rich-after-textstyle',
      before: [],
      after: [
        {
          type: 'textStyle',
          attrs: {
            color: '#0563C1',
            styleId: 'Hyperlink',
            fontFamily: 'Calibri, sans-serif',
            fontSize: '11pt',
          },
        },
      ],
    });
    const doc = createDoc('Styled', [suggestedTextStyle, formatMark]);
    const rejectState = createState(doc);

    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);
    expect(markPresent(afterReject.doc, 'textStyle')).toBe(false);
  });

  it('rejectTrackedChangesBetween preserves restored textStyle when before/after attrs overlap', () => {
    const beforeTextStyle = schema.marks.textStyle.create({
      color: '#0563C1',
      fontFamily: 'Times New Roman, serif',
      fontSize: '12pt',
    });
    const afterTextStyle = schema.marks.textStyle.create({
      color: '#0563C1',
      styleId: 'Hyperlink',
      fontFamily: 'Calibri, sans-serif',
      fontSize: '11pt',
    });
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-overlap-reject',
      before: [{ type: 'textStyle', attrs: beforeTextStyle.attrs }],
      after: [{ type: 'textStyle', attrs: afterTextStyle.attrs }],
    });
    const doc = createDoc('Styled', [afterTextStyle, formatMark]);
    const rejectState = createState(doc);

    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);

    const restoredTextStyle = afterReject.doc.nodeAt(1)?.marks.find((mark) => mark.type.name === 'textStyle');
    expect(restoredTextStyle).toBeDefined();
    expect(restoredTextStyle?.attrs).toEqual(beforeTextStyle.attrs);
  });

  it('rejectTrackedChangesBetween restores full before snapshot across tracked mark types', () => {
    const beforeTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Times New Roman, serif',
      fontSize: '11pt',
      color: '#111111',
    });
    const afterTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12pt',
      color: '#FF0000',
    });
    const afterItalic = schema.marks.italic.create();
    const formatMark = schema.marks[TrackFormatMarkName].create({
      id: 'fmt-snapshot-reject',
      before: [
        { type: 'bold', attrs: {} },
        { type: 'textStyle', attrs: beforeTextStyle.attrs },
      ],
      after: [
        { type: 'italic', attrs: {} },
        { type: 'textStyle', attrs: afterTextStyle.attrs },
      ],
    });
    const doc = createDoc('Styled', [afterItalic, afterTextStyle, formatMark]);
    const rejectState = createState(doc);

    let afterReject;
    commands.rejectTrackedChangesBetween(
      1,
      doc.content.size,
    )({
      state: rejectState,
      dispatch: (tr) => {
        afterReject = rejectState.apply(tr);
      },
    });

    expect(afterReject).toBeDefined();
    expect(markPresent(afterReject.doc, TrackFormatMarkName)).toBe(false);
    expect(markPresent(afterReject.doc, 'bold')).toBe(true);
    expect(markPresent(afterReject.doc, 'italic')).toBe(false);

    const textStyle = afterReject.doc.nodeAt(1)?.marks.find((mark) => mark.type.name === 'textStyle');
    expect(textStyle?.attrs).toEqual(beforeTextStyle.attrs);
  });

  it('acceptTrackedChangeById and rejectTrackedChangeById should NOT link two insertions', () => {
    const prevMark = schema.marks[TrackInsertMarkName].create({ id: 'prev' });
    const targetMark = schema.marks[TrackInsertMarkName].create({ id: 'ins-id' });
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('A', [prevMark]),
      schema.text('B', [targetMark]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);
    const state = createState(doc);

    let nextState = state;
    const editor = { options: { user: { name: 'Reviewer', email: 'reviewer@example.com' } } };
    const dispatch = (tr) => {
      nextState = nextState.apply(tr);
    };
    const result = commands.acceptTrackedChangeById('ins-id')({
      state,
      tr: state.tr,
      dispatch,
      editor,
      commands: {},
    });
    expect(result).toBe(true);
    // The target's "B" is accepted (no longer tracked-inserted), but the
    // unrelated "prev" insertion ("A") remains tracked.
    const insertIds = new Set();
    nextState.doc.descendants((node) => {
      if (!node.isText) return;
      const mark = node.marks.find((m) => m.type.name === TrackInsertMarkName);
      if (mark?.attrs?.id) insertIds.add(mark.attrs.id);
    });
    expect(insertIds.has('ins-id')).toBe(false);
    expect(insertIds.has('prev')).toBe(true);
  });

  it('interaction: color suggestion reject removes inline color styling from DOM', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Plain text</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.commands.enableTrackChanges();

      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );
      interactionEditor.commands.setColor('#FF0000');

      const coloredInline = interactionEditor.view.dom.querySelector('span[style*="color"]');
      expect(coloredInline).toBeTruthy();
      let hasTrackFormat = false;
      interactionEditor.state.doc.descendants((node) => {
        if (!node.isText) {
          return;
        }
        if (node.marks.some((mark) => mark.type.name === TrackFormatMarkName)) {
          hasTrackFormat = true;
          return false;
        }
      });
      expect(hasTrackFormat).toBe(true);

      interactionEditor.commands.rejectTrackedChangesBetween(0, interactionEditor.state.doc.content.size);

      const coloredInlineAfterReject = interactionEditor.view.dom.querySelector('span[style*="color"]');
      expect(coloredInlineAfterReject).toBeNull();
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: rejecting multi-format suggestions reverts all tracked formatting', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Plain text</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );

      interactionEditor.commands.setFontFamily('Times New Roman, serif');
      interactionEditor.commands.enableTrackChanges();

      interactionEditor.commands.toggleBold();
      interactionEditor.commands.setColor('#FF00AA');
      interactionEditor.commands.toggleUnderline();
      interactionEditor.commands.setFontFamily('Arial, sans-serif');

      interactionEditor.commands.rejectTrackedChangesBetween(0, interactionEditor.state.doc.content.size);

      const textPos = getFirstTextRange(interactionEditor.state.doc);
      const textNode = interactionEditor.state.doc.nodeAt(textPos.from);
      const marks = textNode?.marks || [];
      const textStyle = marks.find((mark) => mark.type.name === 'textStyle');

      expect(marks.some((mark) => mark.type.name === TrackFormatMarkName)).toBe(false);
      expect(marks.some((mark) => mark.type.name === 'bold')).toBe(false);
      expect(marks.some((mark) => mark.type.name === 'underline')).toBe(false);
      expect(textStyle?.attrs?.color).not.toBe('#FF00AA');
      expect(textStyle?.attrs?.fontFamily).toBe('Times New Roman, serif');
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: rejecting hyperlink suggestion removes link formatting', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Plain text</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.setDocumentMode('suggesting');

      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );

      interactionEditor.commands.setLink({ href: 'https://example.com' });

      expect(hasAnyMark(interactionEditor.state.doc, 'link')).toBe(true);
      expect(hasAnyMark(interactionEditor.state.doc, TrackFormatMarkName)).toBe(true);

      const selectedRange = getFirstTextRange(interactionEditor.state.doc);
      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, selectedRange.from, selectedRange.to),
        ),
      );

      interactionEditor.commands.rejectTrackedChangeOnSelection();

      expect(hasAnyMark(interactionEditor.state.doc, TrackFormatMarkName)).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'link')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'underline')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'textStyle')).toBe(false);
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: rejecting hyperlink suggestion by tracked-change id removes link formatting', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Plain text</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.setDocumentMode('suggesting');

      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );

      interactionEditor.commands.setLink({ href: 'https://example.com' });

      const trackFormatIds = new Set();
      interactionEditor.state.doc.descendants((node) => {
        if (!node.isText) return;
        node.marks.forEach((mark) => {
          if (mark.type.name === TrackFormatMarkName && mark.attrs?.id) {
            trackFormatIds.add(mark.attrs.id);
          }
        });
      });

      const [trackedChangeId] = [...trackFormatIds];
      expect(trackedChangeId).toBeDefined();
      expect(trackFormatIds.size).toBe(1);

      interactionEditor.commands.rejectTrackedChangeById(trackedChangeId);

      expect(hasAnyMark(interactionEditor.state.doc, TrackFormatMarkName)).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'link')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'underline')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'textStyle')).toBe(false);
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction(docx): rejecting hyperlink suggestion by tracked-change id removes link formatting', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'docx',
      content: '<p></p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.commands.insertContent('Plain text');
      interactionEditor.setDocumentMode('suggesting');

      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );

      interactionEditor.commands.setLink({ href: 'https://example.com' });

      const trackFormatIds = new Set();
      interactionEditor.state.doc.descendants((node) => {
        if (!node.isText) return;
        node.marks.forEach((mark) => {
          if (mark.type.name === TrackFormatMarkName && mark.attrs?.id) {
            trackFormatIds.add(mark.attrs.id);
          }
        });
      });

      const [trackedChangeId] = [...trackFormatIds];
      expect(trackedChangeId).toBeDefined();
      expect(trackFormatIds.size).toBe(1);

      interactionEditor.commands.rejectTrackedChangeById(trackedChangeId);

      expect(hasAnyMark(interactionEditor.state.doc, TrackFormatMarkName)).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'link')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'underline')).toBe(false);
      expect(hasAnyMark(interactionEditor.state.doc, 'textStyle')).toBe(false);
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: rejectTrackedChangeOnSelection reverts mixed marks + textStyle in suggesting mode', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Agreement signed by both parties</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      const textRange = getFirstTextRange(interactionEditor.state.doc);
      expect(textRange).toBeDefined();

      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, textRange.from, textRange.to),
        ),
      );
      interactionEditor.commands.setFontFamily('Times New Roman, serif');
      interactionEditor.commands.setColor('#112233');
      interactionEditor.setDocumentMode('suggesting');

      const selectionRange = getFirstTextRange(interactionEditor.state.doc);
      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, selectionRange.from, selectionRange.to),
        ),
      );
      interactionEditor.commands.toggleBold();
      interactionEditor.commands.toggleUnderline();
      interactionEditor.commands.setColor('#FF00AA');
      interactionEditor.commands.setFontFamily('Arial, sans-serif');

      interactionEditor.commands.rejectTrackedChangeOnSelection();

      const textPos = getFirstTextRange(interactionEditor.state.doc);
      const textNode = interactionEditor.state.doc.nodeAt(textPos.from);
      const marks = textNode?.marks || [];
      const textStyle = marks.find((mark) => mark.type.name === 'textStyle');

      expect(marks.some((mark) => mark.type.name === TrackFormatMarkName)).toBe(false);
      expect(marks.some((mark) => mark.type.name === 'bold')).toBe(false);
      expect(marks.some((mark) => mark.type.name === 'underline')).toBe(false);
      expect(textStyle?.attrs?.color).toBe('#112233');
      expect(textStyle?.attrs?.fontFamily).toBe('Times New Roman, serif');
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: composition at paragraph start replaces a dead-key placeholder in suggesting mode', async () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p></p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.setDocumentMode('suggesting');

      const view = interactionEditor.view;
      const getContainer = () => {
        const paragraph = view.dom.querySelector('p');
        return paragraph?.querySelector('.sd-paragraph-content') ?? paragraph;
      };
      const getBreak = () => getContainer()?.querySelector('br.ProseMirror-trailingBreak');

      view.focus();
      view.dom.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));

      expect(getContainer()).toBeTruthy();

      getContainer().insertBefore(document.createTextNode('´'), getBreak() ?? null);
      view.domObserver.flush();
      await Promise.resolve();

      getContainer().insertBefore(document.createTextNode('é'), getBreak() ?? null);
      view.domObserver.flush();
      await Promise.resolve();

      view.dom.dispatchEvent(new CompositionEvent('compositionend', { data: 'é', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(interactionEditor.state.doc.textContent).toBe('é');
    } finally {
      interactionEditor.destroy();
    }
  });

  it('interaction: setLink in suggesting mode emits hyperlink-specific tracked change messaging', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>Visit website</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.setDocumentMode('suggesting');
      const websiteRange = getSubstringRange(interactionEditor.state.doc, 'website');
      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, websiteRange.from, websiteRange.to),
        ),
      );

      const emitSpy = vi.spyOn(interactionEditor, 'emit');
      interactionEditor.commands.setLink({ href: 'https://example.com' });

      const trackedChangePayload = emitSpy.mock.calls.find(
        ([eventName, payload]) =>
          eventName === 'commentsUpdate' && payload?.type === 'trackedChange' && payload?.event === 'add',
      )?.[1];

      expect(trackedChangePayload).toMatchObject({
        trackedChangeType: TrackFormatMarkName,
        trackedChangeText: 'https://example.com',
        trackedChangeDisplayType: 'hyperlinkAdded',
      });
    } finally {
      interactionEditor.destroy();
    }
  });

  it('undo/redo restores partially accepted insertion splits', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p></p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      interactionEditor.commands.insertTrackedChange({ from: 1, to: 1, text: 'ABCDE' });

      const selectionRange = getSubstringRange(interactionEditor.state.doc, 'BC');
      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, selectionRange.from, selectionRange.to),
        ),
      );

      interactionEditor.commands.acceptTrackedChangeBySelection();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackInsertMarkName)).toBe('ADE');

      interactionEditor.commands.undo();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackInsertMarkName)).toBe('ABCDE');

      interactionEditor.commands.redo();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackInsertMarkName)).toBe('ADE');
    } finally {
      interactionEditor.destroy();
    }
  });

  it('undo/redo restores partially rejected deletion splits', () => {
    const { editor: interactionEditor } = initTestEditor({
      mode: 'text',
      content: '<p>ABCDE</p>',
      user: { name: 'Track Tester', email: 'track@example.com' },
    });

    try {
      const fullTextRange = getFirstTextRange(interactionEditor.state.doc);
      interactionEditor.commands.insertTrackedChange({ from: fullTextRange.from, to: fullTextRange.to, text: '' });

      const selectionRange = getSubstringRange(interactionEditor.state.doc, 'BC');
      interactionEditor.view.dispatch(
        interactionEditor.state.tr.setSelection(
          TextSelection.create(interactionEditor.state.doc, selectionRange.from, selectionRange.to),
        ),
      );

      interactionEditor.commands.rejectTrackedChangeOnSelection();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackDeleteMarkName)).toBe('ADE');

      interactionEditor.commands.undo();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackDeleteMarkName)).toBe('ABCDE');

      interactionEditor.commands.redo();
      expect(interactionEditor.state.doc.textContent).toBe('ABCDE');
      expect(getMarkedText(interactionEditor.state.doc, TrackDeleteMarkName)).toBe('ADE');
    } finally {
      interactionEditor.destroy();
    }
  });

  // The by-id tests below assert product-visible outcomes (final doc text +
  // remaining tracked marks) instead of internal delegation to the range
  // command. The decision engine is the single accept/reject path; how it
  // groups same-id segments internally is an implementation detail and not a
  // contract callers depend on.

  const runByIdDecision = ({ decision, id, doc }) => {
    const state = createState(doc);
    let nextState = state;
    const editor = { options: { user: { name: 'Reviewer', email: 'reviewer@example.com' } } };
    const command = decision === 'accept' ? commands.acceptTrackedChangeById(id) : commands.rejectTrackedChangeById(id);
    const result = command({
      state,
      tr: state.tr,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor,
      commands: {
        // Provide range-command fallbacks so the underlying command stays
        // functional if it ever needs to compose them. These are not the path
        // under test — the decision engine handles by-id natively.
        acceptTrackedChangesBetween: (from, to) => {
          const tr = nextState.tr;
          nextState.doc.nodesBetween(from, to, (node, pos) => {
            const mark = node.marks.find((m) => TRACKED_MARK_NAMES.has(m.type.name));
            if (!mark) return;
            const mFrom = Math.max(pos, from);
            const mTo = Math.min(pos + node.nodeSize, to);
            if (mark.type.name === TrackDeleteMarkName) tr.replace(mFrom, mTo);
            else tr.removeMark(mFrom, mTo, mark);
          });
          nextState = nextState.apply(tr);
          return true;
        },
        rejectTrackedChangesBetween: (from, to) => {
          const tr = nextState.tr;
          nextState.doc.nodesBetween(from, to, (node, pos) => {
            const mark = node.marks.find((m) => TRACKED_MARK_NAMES.has(m.type.name));
            if (!mark) return;
            const mFrom = Math.max(pos, from);
            const mTo = Math.min(pos + node.nodeSize, to);
            if (mark.type.name === TrackInsertMarkName) tr.replace(mFrom, mTo);
            else tr.removeMark(mFrom, mTo, mark);
          });
          nextState = nextState.apply(tr);
          return true;
        },
      },
    });
    return { result, nextState };
  };

  const TRACKED_MARK_NAMES = new Set([TrackInsertMarkName, TrackDeleteMarkName]);

  it('acceptTrackedChangeById resolves contiguous insertion segments sharing an id (across inline formatting)', () => {
    const italicMark = schema.marks.italic.create();
    const insertionId = 'ins-multi';
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('A', [schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
      schema.text('B', [italicMark, schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
      schema.text('C', [schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: insertionId, doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe('ABC');
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
  });

  it('rejectTrackedChangeById removes inserted content across formatting splits', () => {
    const italicMark = schema.marks.italic.create();
    const insertionId = 'ins-multi-reject';
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('A', [schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
      schema.text('B', [italicMark, schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
      schema.text('C', [schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'reject', id: insertionId, doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe('');
  });

  it('acceptTrackedChangeById does not pull in adjacent different-id deletions', () => {
    const insertionId = 'shared-id';
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('old', [schema.marks[TrackDeleteMarkName].create({ id: 'del-id' })]),
      schema.text('AB', [schema.marks[TrackInsertMarkName].create({ id: insertionId })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: insertionId, doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe('oldAB');
    // The unrelated deletion is still tracked-deleted.
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(true);
    // Our insertion is accepted (no longer tracked-inserted).
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
  });

  it('by-id decisions on adjacent del+ins pairs with different ids resolve only the target id', () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('old', [schema.marks[TrackDeleteMarkName].create({ id: 'del-id' })]),
      schema.text('new', [schema.marks[TrackInsertMarkName].create({ id: 'ins-id' })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: 'ins-id', doc });
    expect(result).toBe(true);
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(true);
  });

  it('by-id decisions on adjacent del+ins pairs with the same id resolve the paired replacement together', () => {
    const sharedId = 'replace-id';
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('old', [schema.marks[TrackDeleteMarkName].create({ id: sharedId })]),
      schema.text('new', [schema.marks[TrackInsertMarkName].create({ id: sharedId })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: sharedId, doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe('new');
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(false);
  });

  it('by-id decisions do not resolve unrelated tracked changes separated by untracked content', () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('deleted', [schema.marks[TrackDeleteMarkName].create({ id: 'del-id' })]),
      schema.text(' '),
      schema.text('inserted', [schema.marks[TrackInsertMarkName].create({ id: 'ins-id' })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: 'ins-id', doc });
    expect(result).toBe(true);
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(true);
  });

  it('by-id decisions resolve same-id changes even when they are not directly adjacent', () => {
    const id = 'shared-id';
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('deleted', [schema.marks[TrackDeleteMarkName].create({ id })]),
      schema.text(' '),
      schema.text('inserted', [schema.marks[TrackInsertMarkName].create({ id })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id, doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe(' inserted');
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(false);
  });

  it('by-id decisions resolve only the target deletion, leaving sibling deletions intact', () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('first', [schema.marks[TrackDeleteMarkName].create({ id: 'del-1' })]),
      schema.text('second', [schema.marks[TrackDeleteMarkName].create({ id: 'del-2' })]),
    ]);
    const doc = schema.nodes.doc.create(null, paragraph);

    const { result, nextState } = runByIdDecision({ decision: 'accept', id: 'del-2', doc });
    expect(result).toBe(true);
    expect(nextState.doc.textContent).toBe('first');
    expect(hasAnyMark(nextState.doc, TrackDeleteMarkName)).toBe(true);
  });

  it('toggle and enable commands set plugin metadata', () => {
    const doc = createDoc('Toggle test');
    const state = createState(doc);
    const pluginState = TrackChangesBasePluginKey.getState(state);
    expect(pluginState.isTrackChangesActive).toBe(false);

    const tr = state.tr;
    const commandState = Object.create(state, {
      tr: { value: tr },
    });

    const toggled = commands.toggleTrackChanges()({ state: commandState });
    expect(toggled).toBe(true);
    expect(tr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'TRACK_CHANGES_ENABLE',
      value: true,
    });

    const enableTr = state.tr;
    const enableState = Object.create(state, {
      tr: { value: enableTr },
    });
    commands.enableTrackChanges()({ state: enableState });
    expect(enableTr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'TRACK_CHANGES_ENABLE',
      value: true,
    });

    const disableTr = state.tr;
    const disableState = Object.create(state, {
      tr: { value: disableTr },
    });
    commands.disableTrackChanges()({ state: disableState });
    expect(disableTr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'TRACK_CHANGES_ENABLE',
      value: false,
    });

    const showOriginalTr = state.tr;
    const showOriginalState = Object.create(state, {
      tr: { value: showOriginalTr },
    });
    const toggleOriginal = commands.toggleTrackChangesShowOriginal()({ state: showOriginalState });
    expect(toggleOriginal).toBe(true);
    expect(showOriginalTr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'SHOW_ONLY_ORIGINAL',
      value: !pluginState.onlyOriginalShown,
    });

    const enableFinalTr = state.tr;
    const enableFinalState = Object.create(state, {
      tr: { value: enableFinalTr },
    });
    const enabledFinal = commands.enableTrackChangesShowFinal()({ state: enableFinalState });
    expect(enabledFinal).toBe(true);
    expect(enableFinalTr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'SHOW_ONLY_MODIFIED',
      value: true,
    });

    const disableOriginalTr = state.tr;
    const disableOriginalState = Object.create(state, {
      tr: { value: disableOriginalTr },
    });
    const disabledOriginal = commands.disableTrackChangesShowOriginal()({ state: disableOriginalState });
    expect(disabledOriginal).toBe(true);
    expect(disableOriginalTr.getMeta(TrackChangesBasePluginKey)).toEqual({
      type: 'SHOW_ONLY_ORIGINAL',
      value: false,
    });
  });

  it('wrapper commands delegate to range-based handlers', () => {
    // Single-target wrappers still delegate to the range commands because the
    // wrappers compose them. The All wrappers go through the unified decision
    // engine instead (see "acceptAllTrackedChanges resolves every tracked
    // change in the document" below).
    const rangeCommand = vi.fn().mockReturnValue(true);
    const trackedChange = { start: 5, end: 9 };

    expect(
      commands.acceptTrackedChange({ trackedChange })({
        commands: { acceptTrackedChangesBetween: rangeCommand },
      }),
    ).toBe(true);
    expect(rangeCommand).toHaveBeenCalledWith(5, 9);

    rangeCommand.mockClear();
    expect(
      commands.rejectTrackedChange({ trackedChange })({
        commands: { rejectTrackedChangesBetween: rangeCommand },
      }),
    ).toBe(true);
    expect(rangeCommand).toHaveBeenCalledWith(5, 9);

    const selectionRange = { from: 1, to: 4 };
    const acceptSelection = vi.fn().mockReturnValue(true);
    const rejectSelection = vi.fn().mockReturnValue(true);

    expect(
      commands.acceptTrackedChangeBySelection()({
        state: { selection: selectionRange },
        commands: { acceptTrackedChangesBetween: acceptSelection },
      }),
    ).toBe(true);
    expect(acceptSelection).toHaveBeenCalledWith(1, 4);

    expect(
      commands.rejectTrackedChangeOnSelection()({
        state: { selection: selectionRange },
        commands: { rejectTrackedChangesBetween: rejectSelection },
      }),
    ).toBe(true);
    expect(rejectSelection).toHaveBeenCalledWith(1, 4);
  });

  it('acceptAllTrackedChanges resolves every tracked change in the document', () => {
    const doc = createDoc('All the things', [schema.marks[TrackInsertMarkName].create({ id: 'all-accept' })]);
    const state = createState(doc);

    let nextState;
    commands.acceptAllTrackedChanges()({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: { options: { user: { name: 'Reviewer', email: 'reviewer@example.com' } } },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('All the things');
    expect(hasAnyMark(nextState.doc, TrackInsertMarkName)).toBe(false);
  });

  it('rejectAllTrackedChanges removes every tracked insertion from the document', () => {
    const doc = createDoc('Hello world', [schema.marks[TrackInsertMarkName].create({ id: 'all-reject' })]);
    const state = createState(doc);

    let nextState;
    commands.rejectAllTrackedChanges()({
      state,
      dispatch: (tr) => {
        nextState = state.apply(tr);
      },
      editor: { options: { user: { name: 'Reviewer', email: 'reviewer@example.com' } } },
    });

    expect(nextState).toBeDefined();
    expect(nextState.doc.textContent).toBe('');
  });

  describe('insertTrackedChange', () => {
    it('inserts text as a tracked change with both delete and insert marks', () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      let nextState;
      const dispatch = vi.fn((tr) => {
        nextState = state.apply(tr);
      });

      const result = commands.insertTrackedChange({
        from: 7,
        to: 12,
        text: 'universe',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Test', email: 'test@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalled();
      // Track changes keeps deleted content with a mark, so both old and new text are present
      expect(nextState.doc.textContent).toContain('Hello');
      expect(nextState.doc.textContent).toContain('universe');
      // Check for both marks in the document
      let hasDeleteMark = false;
      let hasInsertMark = false;
      nextState.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === TrackDeleteMarkName)) hasDeleteMark = true;
        if (node.marks.some((m) => m.type.name === TrackInsertMarkName)) hasInsertMark = true;
      });
      expect(hasDeleteMark).toBe(true);
      expect(hasInsertMark).toBe(true);
    });

    it('returns false when no change is needed', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      const dispatch = vi.fn();
      const result = commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Hello',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Test', email: 'test@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      expect(result).toBe(false);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('uses provided user for tracked change author', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      let dispatchedTr;
      const dispatch = vi.fn((tr) => {
        dispatchedTr = tr;
      });

      commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Hi',
        user: { name: 'Custom User', email: 'custom@example.com' },
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Default', email: 'default@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      const meta = dispatchedTr.getMeta(TrackChangesBasePluginKey);
      expect(meta.insertedMark.attrs.author).toBe('Custom User');
      expect(meta.insertedMark.attrs.authorEmail).toBe('custom@example.com');
    });

    it('falls back to editor user when user option not provided', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      let dispatchedTr;
      const dispatch = vi.fn((tr) => {
        dispatchedTr = tr;
      });

      commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Hi',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Editor User', email: 'editor@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      const meta = dispatchedTr.getMeta(TrackChangesBasePluginKey);
      expect(meta.insertedMark.attrs.author).toBe('Editor User');
      expect(meta.insertedMark.attrs.authorEmail).toBe('editor@example.com');
    });

    it('calls addCommentReply when comment is provided', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      const addCommentReply = vi.fn();
      const dispatch = vi.fn((tr) => {
        state.apply(tr);
      });

      commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Hi',
        comment: 'This is a suggestion',
        user: { name: 'Commenter', email: 'commenter@example.com', image: 'https://example.com/avatar.png' },
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Default', email: 'default@example.com' } },
          commands: { addCommentReply },
        },
      });

      expect(addCommentReply).toHaveBeenCalledWith({
        parentId: expect.any(String),
        content: 'This is a suggestion',
        author: 'Commenter',
        authorEmail: 'commenter@example.com',
        authorImage: 'https://example.com/avatar.png',
      });
    });

    it('does not call addCommentReply when comment is empty', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      const addCommentReply = vi.fn();
      const dispatch = vi.fn((tr) => {
        state.apply(tr);
      });

      commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Hi',
        comment: '   ',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Default', email: 'default@example.com' } },
          commands: { addCommentReply },
        },
      });

      expect(addCommentReply).not.toHaveBeenCalled();
    });

    it('replaces text and creates tracked marks', () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      let nextState;
      const dispatch = vi.fn((tr) => {
        nextState = state.apply(tr);
      });

      const result = commands.insertTrackedChange({
        from: 1,
        to: 6,
        text: 'Goodbye',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Test', email: 'test@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      expect(result).toBe(true);
      // Track changes keeps deleted "Hello" with mark and adds inserted "Goodbye"
      expect(nextState.doc.textContent).toContain('Goodbye');
      expect(nextState.doc.textContent).toContain('world');
    });

    it('handles pure deletion (empty replacement text)', () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      let nextState;
      const dispatch = vi.fn((tr) => {
        nextState = state.apply(tr);
      });

      const result = commands.insertTrackedChange({
        from: 6,
        to: 12,
        text: '',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Test', email: 'test@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      expect(result).toBe(true);
      expect(dispatch).toHaveBeenCalled();
      // The deleted content should be marked with TrackDeleteMarkName
      // Check anywhere in the doc for the mark
      let hasDeleteMark = false;
      nextState.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === TrackDeleteMarkName)) {
          hasDeleteMark = true;
        }
      });
      expect(hasDeleteMark).toBe(true);
    });

    it('handles pure insertion (from equals to)', () => {
      const doc = createDoc('Hello');
      const state = createState(doc);

      let nextState;
      const dispatch = vi.fn((tr) => {
        nextState = state.apply(tr);
      });

      const result = commands.insertTrackedChange({
        from: 6,
        to: 6,
        text: ' world',
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Test', email: 'test@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      expect(result).toBe(true);
      expect(nextState.doc.textContent).toBe('Hello world');
      // Check anywhere in the doc for the mark
      let hasInsertMark = false;
      nextState.doc.descendants((node) => {
        if (node.marks.some((m) => m.type.name === TrackInsertMarkName)) {
          hasInsertMark = true;
        }
      });
      expect(hasInsertMark).toBe(true);
    });

    it('replacement marks share the same ID for proper comment linking', () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      let dispatchedTr;
      const dispatch = vi.fn((tr) => {
        dispatchedTr = tr;
        state.apply(tr);
      });

      commands.insertTrackedChange({
        from: 7,
        to: 12,
        text: 'universe',
        user: { name: 'Test', email: 'test@example.com' },
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Default', email: 'default@example.com' } },
          commands: { addCommentReply: vi.fn() },
        },
      });

      const meta = dispatchedTr.getMeta(TrackChangesBasePluginKey);
      // Both marks should exist and share the same ID
      expect(meta.insertedMark).toBeDefined();
      expect(meta.deletionMark).toBeDefined();
      expect(meta.insertedMark.attrs.id).toBe(meta.deletionMark.attrs.id);
    });

    it("gives each replacement mark its own ID when replacements='independent'", () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      let dispatchedTr;
      const dispatch = vi.fn((tr) => {
        dispatchedTr = tr;
        state.apply(tr);
      });

      commands.insertTrackedChange({
        from: 7,
        to: 12,
        text: 'universe',
        user: { name: 'Test', email: 'test@example.com' },
      })({
        state,
        dispatch,
        editor: {
          options: {
            user: { name: 'Default', email: 'default@example.com' },
            trackedChanges: { replacements: 'independent' },
          },
          commands: { addCommentReply: vi.fn() },
        },
      });

      const meta = dispatchedTr.getMeta(TrackChangesBasePluginKey);
      expect(meta.insertedMark).toBeDefined();
      expect(meta.deletionMark).toBeDefined();
      expect(meta.insertedMark.attrs.id).not.toBe(meta.deletionMark.attrs.id);
    });

    it('resolves only the targeted half of a replacement in unpaired mode', () => {
      const { editor: interactionEditor } = initTestEditor({
        mode: 'text',
        content: '<p>Hello world</p>',
        user: { name: 'Track Tester', email: 'track@example.com' },
        trackedChanges: { replacements: 'independent' },
      });

      try {
        const worldRange = getSubstringRange(interactionEditor.state.doc, 'world');
        interactionEditor.commands.insertTrackedChange({
          from: worldRange.from,
          to: worldRange.to,
          text: 'universe',
        });

        // Gather both independent ids for the insertion and deletion halves.
        const changes = [];
        interactionEditor.state.doc.descendants((node) => {
          node.marks.forEach((mark) => {
            if (mark.type.name === TrackInsertMarkName || mark.type.name === TrackDeleteMarkName) {
              changes.push({ type: mark.type.name, id: mark.attrs.id });
            }
          });
        });
        const insertion = changes.find((c) => c.type === TrackInsertMarkName);
        const deletion = changes.find((c) => c.type === TrackDeleteMarkName);
        expect(insertion).toBeDefined();
        expect(deletion).toBeDefined();
        expect(insertion.id).not.toBe(deletion.id);

        // Accepting the insertion must not touch the deletion side.
        interactionEditor.commands.acceptTrackedChangeById(insertion.id);
        expect(getMarkedText(interactionEditor.state.doc, TrackInsertMarkName)).toBe('');
        expect(getMarkedText(interactionEditor.state.doc, TrackDeleteMarkName)).toBe('world');

        // The deletion is still independently resolvable by its own id.
        // Rejecting the deletion keeps the original text (unmarking it);
        // the previously accepted insertion stays. Both words coexist in
        // the final doc, which is the point of treating them as
        // independent revisions.
        interactionEditor.commands.rejectTrackedChangeById(deletion.id);
        expect(getMarkedText(interactionEditor.state.doc, TrackDeleteMarkName)).toBe('');
        expect(interactionEditor.state.doc.textContent).toContain('universe');
        expect(interactionEditor.state.doc.textContent).toContain('world');
      } finally {
        interactionEditor.destroy();
      }
    });

    it('attaches comment to replacement using shared ID', () => {
      const doc = createDoc('Hello world');
      const state = createState(doc);

      const addCommentReply = vi.fn();
      let dispatchedTr;
      const dispatch = vi.fn((tr) => {
        dispatchedTr = tr;
        state.apply(tr);
      });

      commands.insertTrackedChange({
        from: 7,
        to: 12,
        text: 'universe',
        comment: 'Replacing world with universe',
        user: { name: 'Test', email: 'test@example.com' },
      })({
        state,
        dispatch,
        editor: {
          options: { user: { name: 'Default', email: 'default@example.com' } },
          commands: { addCommentReply },
        },
      });

      const meta = dispatchedTr.getMeta(TrackChangesBasePluginKey);
      const sharedId = meta.insertedMark.attrs.id;

      // Comment should be attached using the shared ID
      expect(addCommentReply).toHaveBeenCalledWith({
        parentId: sharedId,
        content: 'Replacing world with universe',
        author: 'Test',
        authorEmail: 'test@example.com',
        authorImage: undefined,
      });
    });
  });
});
