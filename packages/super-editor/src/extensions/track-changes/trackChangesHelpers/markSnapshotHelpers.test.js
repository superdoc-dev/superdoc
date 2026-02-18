import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import {
  attrsExactlyMatch,
  markSnapshotMatchesStepMark,
  hasMatchingMark,
  upsertMarkSnapshotByType,
  findMarkInRangeBySnapshot,
} from './markSnapshotHelpers.js';

describe('markSnapshotHelpers', () => {
  let editor;
  let schema;
  let basePlugins;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
    basePlugins = editor.state.plugins;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const createDocWithRuns = (runs) => {
    const runNodes = runs.map(({ text, marks = [] }) => schema.nodes.run.create({}, schema.text(text, marks)));
    return schema.nodes.doc.create({}, schema.nodes.paragraph.create({}, runNodes));
  };

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: basePlugins,
    });

  it('attrsExactlyMatch checks both directions', () => {
    expect(attrsExactlyMatch({ color: '#112233', size: '11pt' }, { size: '11pt', color: '#112233' })).toBe(true);
    expect(attrsExactlyMatch({ color: '#112233' }, { color: '#112233', size: '11pt' })).toBe(false);
    expect(attrsExactlyMatch({}, {})).toBe(true);
    expect(attrsExactlyMatch({ underline: null }, {})).toBe(true);
    expect(attrsExactlyMatch({ underline: null, color: '#111111' }, { color: '#111111' })).toBe(true);
  });

  it('markSnapshotMatchesStepMark supports exact and type-only modes', () => {
    const textStyleMark = schema.marks.textStyle.create({ color: '#112233', fontSize: '11pt' });

    expect(
      markSnapshotMatchesStepMark({ type: 'textStyle', attrs: { ...textStyleMark.attrs } }, textStyleMark, true),
    ).toBe(true);

    expect(markSnapshotMatchesStepMark({ type: 'textStyle', attrs: { color: '#FFFFFF' } }, textStyleMark, true)).toBe(
      false,
    );

    expect(markSnapshotMatchesStepMark({ type: 'textStyle', attrs: { color: '#FFFFFF' } }, textStyleMark, false)).toBe(
      true,
    );

    expect(markSnapshotMatchesStepMark({ type: 'bold', attrs: {} }, textStyleMark, false)).toBe(false);
  });

  it('hasMatchingMark requires same mark type and attrs', () => {
    const existing = [schema.marks.bold.create(), schema.marks.textStyle.create({ color: '#AA0000' })];

    expect(hasMatchingMark(existing, schema.marks.textStyle.create({ color: '#AA0000' }))).toBe(true);
    expect(hasMatchingMark(existing, schema.marks.textStyle.create({ color: '#00AA00' }))).toBe(false);
    expect(hasMatchingMark(existing, schema.marks.italic.create())).toBe(false);
  });

  it('upsertMarkSnapshotByType replaces same-type snapshot and preserves others', () => {
    const snapshots = [
      { type: 'bold', attrs: {} },
      { type: 'textStyle', attrs: { color: '#112233' } },
      { type: 'italic', attrs: {} },
    ];

    const updated = upsertMarkSnapshotByType(snapshots, { type: 'textStyle', attrs: { color: '#FF0000' } });

    expect(updated).toEqual([
      { type: 'bold', attrs: {} },
      { type: 'italic', attrs: {} },
      { type: 'textStyle', attrs: { color: '#FF0000' } },
    ]);
  });

  it('findMarkInRangeBySnapshot returns exact attr match when present', () => {
    const red = schema.marks.textStyle.create({ color: '#FF0000' });
    const blue = schema.marks.textStyle.create({ color: '#0000FF' });
    const doc = createDocWithRuns([
      { text: 'A', marks: [red] },
      { text: 'B', marks: [blue] },
    ]);
    const state = createState(doc);

    const match = findMarkInRangeBySnapshot({
      doc: state.doc,
      from: 1,
      to: state.doc.content.size,
      snapshot: { type: 'textStyle', attrs: { ...blue.attrs } },
    });

    expect(match).toBeTruthy();
    expect(match.type.name).toBe('textStyle');
    expect(match.attrs.color).toBe('#0000FF');
  });

  it('findMarkInRangeBySnapshot falls back to type-only when snapshot attrs are empty', () => {
    const red = schema.marks.textStyle.create({ color: '#FF0000' });
    const doc = createDocWithRuns([{ text: 'A', marks: [red] }]);
    const state = createState(doc);

    const match = findMarkInRangeBySnapshot({
      doc: state.doc,
      from: 2,
      to: 3,
      snapshot: { type: 'textStyle', attrs: {} },
    });

    expect(match).toBeTruthy();
    expect(match.type.name).toBe('textStyle');
    expect(match.attrs.color).toBe('#FF0000');
  });

  it('findMarkInRangeBySnapshot does not fallback when snapshot attrs are present', () => {
    const red = schema.marks.textStyle.create({ color: '#FF0000' });
    const doc = createDocWithRuns([{ text: 'A', marks: [red] }]);
    const state = createState(doc);

    const match = findMarkInRangeBySnapshot({
      doc: state.doc,
      from: 2,
      to: 3,
      snapshot: { type: 'textStyle', attrs: { color: '#00FF00' } },
    });

    expect(match).toBeNull();
  });

  it('findMarkInRangeBySnapshot falls back to subset attr match for sparse snapshots', () => {
    const richTextStyle = schema.marks.textStyle.create({
      styleId: 'Emphasis',
      fontFamily: 'Calibri, sans-serif',
      fontSize: '11pt',
      color: '#FF0000',
    });
    const doc = createDocWithRuns([{ text: 'A', marks: [richTextStyle] }]);
    const state = createState(doc);

    const match = findMarkInRangeBySnapshot({
      doc: state.doc,
      from: 2,
      to: 3,
      snapshot: { type: 'textStyle', attrs: { color: '#FF0000' } },
    });

    expect(match).toBeTruthy();
    expect(match.type.name).toBe('textStyle');
    expect(match.attrs).toEqual(richTextStyle.attrs);
  });
});
