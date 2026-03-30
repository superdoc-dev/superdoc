import { describe, it, expect, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { skipTab } from './skipTab.js';

const makeSchema = ({ includeRun = true } = {}) =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      ...(includeRun && { run: { inline: true, group: 'inline', content: 'inline*' } }),
      tab: {
        inline: true,
        group: 'inline',
        selectable: false,
        atom: true,
        parseDOM: [{ tag: 'span[data-tab]' }],
        toDOM: () => ['span', { 'data-tab': 'true' }, '\t'],
      },
      text: { group: 'inline' },
    },
    marks: {},
  });

const buildDocWithRunAndTab = (schema) =>
  schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.node('run', null, schema.text('A')),
      schema.node('tab'),
      schema.node('run', null, schema.text('B')),
    ]),
  ]);

const posOfRunText = (doc, text) => {
  let pos = null;
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'run' && node.textContent === text) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  return pos;
};

describe('skipTab', () => {
  it('moves the cursor past a following tab when at end of run (dir > 0)', () => {
    const schema = makeSchema();
    const doc = buildDocWithRunAndTab(schema);
    const runPos = posOfRunText(doc, 'A');
    expect(runPos).not.toBeNull();
    const cursorPos = (runPos ?? 0) + doc.nodeAt(runPos ?? 0).nodeSize - 1; // end of first run

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    let dispatched;
    const ok = skipTab(1)({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    // After the tab node
    expect(dispatched.selection.from).toBe(cursorPos + 3);
  });

  it('moves the cursor before a preceding tab when at start of run (dir < 0)', () => {
    const schema = makeSchema();
    const doc = buildDocWithRunAndTab(schema);
    const runPos = posOfRunText(doc, 'B');
    expect(runPos).not.toBeNull();
    const cursorPos = (runPos ?? 0) + 1; // start inside second run

    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, cursorPos) });
    let dispatched;
    const ok = skipTab(-1)({
      state,
      dispatch: (tr) => {
        dispatched = tr;
      },
    });

    expect(ok).toBe(true);
    expect(dispatched).toBeDefined();
    // Position before the tab
    expect(dispatched.selection.from).toBe(cursorPos - 3);
  });

  it('returns false when not inside a run or no tab present', () => {
    const schema = makeSchema({ includeRun: false });
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('A\tB')])]);
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, 2) });
    const dispatch = vi.fn();

    const ok = skipTab(1)({ state, dispatch });
    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
