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
});
