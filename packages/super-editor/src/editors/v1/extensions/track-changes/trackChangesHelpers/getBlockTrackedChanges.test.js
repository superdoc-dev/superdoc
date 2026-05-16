import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getBlockTrackedChanges } from './getBlockTrackedChanges.js';

describe('getBlockTrackedChanges', () => {
  let editor, schema;
  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });
  afterEach(() => editor?.destroy());

  const trackedRow = (kind, id, operationId) => {
    const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('x')));
    return schema.nodes.tableRow.create({ trackChange: { kind, id, operationId } }, [cell]);
  };
  const tableWith = (rows) => schema.nodes.table.create({ sdBlockId: 't1' }, rows);

  it('returns an entry per node with trackChange attr set', () => {
    const doc = schema.nodes.doc.create(null, [
      tableWith([trackedRow('delete', 'r1', 'op1'), trackedRow('delete', 'r2', 'op1')]),
    ]);
    const items = getBlockTrackedChanges({ doc });
    expect(items).toHaveLength(2);
    items.forEach((it) => {
      expect(it.kind).toBe('delete');
      expect(it.operationId).toBe('op1');
      expect(it.nodeType).toBe('tableRow');
      expect(it.to).toBeGreaterThan(it.from);
    });
    expect(items.map((it) => it.id)).toEqual(['r1', 'r2']);
  });

  it('returns [] when no node carries trackChange attr', () => {
    expect(getBlockTrackedChanges({ doc: schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]) })).toEqual(
      [],
    );
  });

  it('skips defensively when kind is not insert/delete', () => {
    const cell = schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('x')));
    const row = schema.nodes.tableRow.create({ trackChange: { kind: 'format', id: 'r1' } }, [cell]);
    expect(getBlockTrackedChanges({ doc: schema.nodes.doc.create(null, [tableWith([row])]) })).toEqual([]);
  });

  it('returns [] for null/undefined input', () => {
    expect(getBlockTrackedChanges(null)).toEqual([]);
    expect(getBlockTrackedChanges(undefined)).toEqual([]);
  });
});
