import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { TrackInsertMarkName, TrackDeleteMarkName, TrackFormatMarkName } from './constants.js';

const toAttrs = (domSpec) => domSpec[1];

describe('track change marks render DOM datasets', () => {
  let editor;
  let schema;

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('TrackInsert encodes metadata as data attributes', () => {
    const markType = schema.marks[TrackInsertMarkName];
    const mark = markType.create({
      id: 'insert-1',
      author: 'Alice',
      authorEmail: 'alice@example.com',
      date: '2024-01-01T00:00:00.000Z',
    });

    const dom = markType.spec.toDOM(mark);
    const attrs = toAttrs(dom);

    expect(dom[0]).toBe('span');
    expect(attrs.class.split(' ')).toContain('track-insert');
    expect(attrs['data-id']).toBe('insert-1');
    expect(attrs['data-author']).toBe('Alice');
    expect(attrs['data-authoremail']).toBe('alice@example.com');
    expect(attrs['data-date']).toBe('2024-01-01T00:00:00.000Z');
  });

  it('TrackDelete uses the track-delete class and datasets', () => {
    const markType = schema.marks[TrackDeleteMarkName];
    const mark = markType.create({
      id: 'delete-1',
      author: 'Bob',
      authorEmail: 'bob@example.com',
      date: '2024-02-02T00:00:00.000Z',
    });

    const attrs = toAttrs(markType.spec.toDOM(mark));
    expect(attrs.class).toContain('track-delete');
    expect(attrs['data-id']).toBe('delete-1');
    expect(attrs['data-date']).toBe('2024-02-02T00:00:00.000Z');
  });

  it('TrackFormat serialises before/after payloads', () => {
    const markType = schema.marks[TrackFormatMarkName];
    const beforePayload = [{ type: 'bold', attrs: {} }];
    const afterPayload = [{ type: 'italic', attrs: {} }];
    const mark = markType.create({
      id: 'fmt-1',
      author: 'Casey',
      authorEmail: 'casey@example.com',
      before: beforePayload,
      after: afterPayload,
    });

    const attrs = toAttrs(markType.spec.toDOM(mark));
    expect(attrs.class).toContain('track-format');
    expect(attrs['data-before']).toBe(JSON.stringify(beforePayload));
    expect(attrs['data-after']).toBe(JSON.stringify(afterPayload));
  });
});
