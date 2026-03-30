import { describe, it, expect, vi, afterEach } from 'vitest';
import { Fragment } from 'prosemirror-model';
import { schema as testSchema } from 'prosemirror-test-builder';
import { createNodeFromContent } from './createNodeFromContent.js';

const paragraphJSON = {
  type: 'paragraph',
  content: [{ type: 'text', text: 'Hello' }],
};

const createMockEditor = (schema = testSchema) => ({
  schema,
  options: {},
});

describe('createNodeFromContent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a node from JSON content', () => {
    const editor = createMockEditor();
    const node = createNodeFromContent(paragraphJSON, editor);
    expect(node.type.name).toBe('paragraph');
  });

  it('creates a fragment when JSON content is an array', () => {
    const editor = createMockEditor();
    const fragment = createNodeFromContent([paragraphJSON], editor);
    expect(fragment).toBeInstanceOf(Fragment);
    expect(fragment.childCount).toBe(1);
  });

  it('falls back gracefully when invalid JSON is provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const editor = createMockEditor();
    expect(() => createNodeFromContent({ type: 'unknown' }, editor)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('parses HTML content with or without slicing', () => {
    const editor = createMockEditor();
    const fragment = createNodeFromContent('<p>Slice</p>', editor);
    expect(fragment.childCount).toBeGreaterThan(0);

    const node = createNodeFromContent('<p>No slice</p>', editor, { slice: false });
    expect(node.type.name).toBe('doc');
  });

  it('throws when invalid HTML is supplied with errorOnInvalidContent', () => {
    const editor = createMockEditor();
    expect(() => createNodeFromContent('<unknown></unknown>', editor, { errorOnInvalidContent: true })).toThrow();
  });
});
