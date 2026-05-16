import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { CommentsPluginKey } from './comments-plugin.js';

describe('comments-plugin — block-level tracked-change registration', () => {
  let editor, schema;
  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });
  afterEach(() => editor?.destroy());

  const makeRow = (kind, id, operationId) => {
    const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('x')));
    return schema.nodes.tableRow.create({ trackChange: { kind, id, operationId } }, [cell]);
  };

  const installDoc = (children) => {
    const doc = schema.nodes.doc.create(null, children);
    const newState = EditorState.create({ schema, doc, plugins: editor.state.plugins });
    editor.setState(newState);
  };

  it('registers one entry per operationId, collapsing multi-row deletes', () => {
    const table = schema.nodes.table.create({ sdBlockId: 't1' }, [
      makeRow('delete', 'r1', 'OP1'),
      makeRow('delete', 'r2', 'OP1'),
      makeRow('delete', 'r3', 'OP1'),
    ]);
    installDoc([table]);
    const pluginState = CommentsPluginKey.getState(editor.state);
    const tracked = pluginState?.trackedChanges ?? {};
    expect(Object.keys(tracked)).toContain('OP1');
  });

  it('registers individual rows when they have no operationId', () => {
    const table = schema.nodes.table.create({ sdBlockId: 't1' }, [makeRow('insert', 'r1', undefined)]);
    installDoc([table]);
    const pluginState = CommentsPluginKey.getState(editor.state);
    const tracked = pluginState?.trackedChanges ?? {};
    expect(Object.keys(tracked)).toContain('r1');
  });

  it('does not register entries for block-level when there are no tracked rows', () => {
    installDoc([schema.nodes.paragraph.create(null, schema.text('plain'))]);
    const pluginState = CommentsPluginKey.getState(editor.state);
    const tracked = pluginState?.trackedChanges ?? {};
    // None of the block-level test ids should be present
    expect(tracked['OP1']).toBeUndefined();
    expect(tracked['r1']).toBeUndefined();
  });

  it('hasBlockChanges starts false on a doc without tracked rows and stays false through typing', () => {
    installDoc([schema.nodes.paragraph.create(null, schema.text('hello'))]);
    expect(CommentsPluginKey.getState(editor.state).hasBlockChanges).toBe(false);

    // Simulate a typing transaction; the gate should keep the block walk
    // skipped so trackedChanges remains an empty stable reference.
    const before = CommentsPluginKey.getState(editor.state).trackedChanges;
    const tr = editor.state.tr.insertText('!', editor.state.doc.content.size - 1);
    editor.view.dispatch(tr);
    const after = CommentsPluginKey.getState(editor.state);
    expect(after.hasBlockChanges).toBe(false);
    expect(after.trackedChanges).toEqual(before);
  });

  it('hasBlockChanges flips to true once a tracked row appears', () => {
    installDoc([schema.nodes.paragraph.create(null, schema.text('x'))]);
    expect(CommentsPluginKey.getState(editor.state).hasBlockChanges).toBe(false);

    const table = schema.nodes.table.create({ sdBlockId: 't1' }, [makeRow('delete', 'r1', 'OP1')]);
    installDoc([table]);
    expect(CommentsPluginKey.getState(editor.state).hasBlockChanges).toBe(true);
  });

  it('drops a block-level entry once its row is no longer tracked (resolved op)', () => {
    const table = schema.nodes.table.create({ sdBlockId: 't1' }, [makeRow('delete', 'r1', 'OP1')]);
    installDoc([table]);
    expect(CommentsPluginKey.getState(editor.state).trackedChanges['OP1']).toBeDefined();

    // Walk the doc to find the tracked row, then clear its trackChange attr
    // through a transaction. This exercises the apply() reducer's stale-entry
    // pruning rather than recomputing state from init().
    let rowPos = null;
    let rowNode = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableRow' && node.attrs.trackChange) {
        rowPos = pos;
        rowNode = node;
        return false;
      }
      return true;
    });
    expect(rowPos).not.toBeNull();

    const tr = editor.state.tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, trackChange: null });
    editor.view.dispatch(tr);

    const pluginState = CommentsPluginKey.getState(editor.state);
    expect(pluginState.trackedChanges['OP1']).toBeUndefined();
  });
});
