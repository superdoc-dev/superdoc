import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { writeStreaming, write, rewriteStreaming, rewrite, formatDocument } from './ai-helpers.js';

const createMockStream = (chunks = []) => ({
  getReader() {
    let index = 0;
    return {
      read: async () => {
        if (index < chunks.length) {
          const value = new TextEncoder().encode(chunks[index]);
          index += 1;
          return { value, done: false };
        }
        return { value: undefined, done: true };
      },
      releaseLock: vi.fn(),
    };
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ai-helpers', () => {
  it('streams chunks while writing and respects custom config', async () => {
    const stream = createMockStream(['chunk-1', 'chunk-2']);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: stream,
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const onChunk = vi.fn();
    const onDone = vi.fn();

    const result = await writeStreaming(
      'Generate summary',
      {
        documentXml: '<doc/>',
        config: { apiKey: 'key-123', endpoint: 'https://example.com/insights' },
      },
      onChunk,
      onDone,
    );

    expect(result).toBe('');
    expect(onChunk).toHaveBeenCalledWith('chunk-1');
    expect(onChunk).toHaveBeenCalledWith('chunk-2');
    expect(onDone).toHaveBeenCalled();

    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://example.com/insights');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'Content-Type': 'application/json', 'x-api-key': 'key-123' });
    const payload = JSON.parse(options.body);
    expect(payload.stream).toBe(true);
    expect(payload.document_content).toBe('<doc/>');
  });

  it('returns generated text for non-streaming write', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ custom_prompt: [{ value: 'Generated text' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await write('Outline the document', { config: { apiKey: 'abc' } });

    expect(result).toBe('Generated text');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rewrites with streaming and throws without text', async () => {
    const stream = createMockStream(['rewrite']);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: stream,
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const rewritten = await rewriteStreaming('Original', 'shorter', { config: {} });
    expect(rewritten).toBe('');

    await expect(rewriteStreaming('', 'prompt')).rejects.toThrow('Text is required for rewriting');
  });

  it('rewrites without streaming using prompt context', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ custom_prompt: [{ value: 'Adjusted text' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await rewrite('Original', 'keep tone', { config: {} });
    expect(result).toBe('Adjusted text');
    const [, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.insights[0].message).toContain('Original');
    expect(payload.insights[0].message).toContain('keep tone');
  });

  it('formats markdown markers into bold marks', () => {
    const nodes = {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
      text: { group: 'inline' },
    };

    const marks = {
      bold: {
        parseDOM: [{ tag: 'strong' }],
        toDOM: () => ['strong', 0],
      },
      italic: {
        parseDOM: [{ tag: 'em' }],
        toDOM: () => ['em', 0],
      },
      underline: {
        parseDOM: [{ tag: 'u' }],
        toDOM: () => ['u', 0],
      },
    };

    const schema = new Schema({ nodes, marks });
    const paragraph = schema.node('paragraph', null, [schema.text('**bold** text')]);
    const doc = schema.node('doc', null, [paragraph]);
    const baseState = EditorState.create({ schema, doc });

    const view = {
      state: baseState,
      dispatch(tr) {
        this.state = this.state.apply(tr);
      },
    };

    const editor = {
      schema,
      view,
      get state() {
        return view.state;
      },
    };

    formatDocument(editor);

    const updatedParagraph = editor.state.doc.firstChild;
    const [firstNode] = updatedParagraph.content.content;
    expect(firstNode.marks[0].type.name).toBe('bold');
    expect(updatedParagraph.textContent).toBe('bold text');
  });
});
