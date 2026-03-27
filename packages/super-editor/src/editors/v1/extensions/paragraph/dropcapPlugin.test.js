// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { createDropcapPlugin } from './dropcapPlugin.js';
import { calculateResolvedParagraphProperties } from './resolvedPropertiesCache.js';

vi.mock('./resolvedPropertiesCache.js', () => ({
  calculateResolvedParagraphProperties: vi.fn(),
}));

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    text: { group: 'inline' },
  },
});

const createEditor = (doc) => {
  const plugins = [];
  const view = {
    nodeDOM: vi.fn((pos) => {
      const dom = document.createElement('p');
      dom.textContent = `Dropcap@${pos}`;
      return dom;
    }),
  };
  const state = EditorState.create({ doc, schema, plugins });
  const editor = { view, state, schema };
  return { editor, plugins };
};

const buildDoc = (paragraphCount, dropcapIndices = []) => {
  const paragraphs = [];
  for (let i = 0; i < paragraphCount; i += 1) {
    paragraphs.push(schema.nodes.paragraph.create(null, [schema.text(`Para ${i + 1}`)]));
  }
  const doc = schema.nodes.doc.create(null, paragraphs);

  // Stub resolve to map positions to our paragraphs
  const paragraphPositions = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphPositions.push(pos);
    }
  });
  const dropcapPosSet = new Set(dropcapIndices.map((index) => paragraphPositions[index]));

  calculateResolvedParagraphProperties.mockImplementation((_editor, node, $pos) => {
    const shouldDropcap = dropcapPosSet.has($pos?.pos);
    return shouldDropcap ? { framePr: { dropCap: 'margin' } } : {};
  });

  return { doc, dropcapPosSet };
};

describe('dropcapPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: vi.fn(),
      getBoundingClientRect: () => ({ width: 10 }),
    });
  });

  it('creates decorations for paragraphs with margin dropcaps on init', () => {
    const { doc, dropcapPosSet } = buildDoc(2, [1]);
    const { editor, plugins } = createEditor(doc);
    editor.state = EditorState.create({ doc, schema, plugins: [] });
    const plugin = createDropcapPlugin(editor);
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decoSet = plugin.getState(state);
    expect(decoSet.find()).toHaveLength(1);
    const deco = decoSet.find()[0];
    const [expectedPos] = [...dropcapPosSet];
    expect(deco.from).toBe(expectedPos);
    expect(deco.to).toBe(expectedPos + doc.child(1).nodeSize);
  });

  it('returns empty decorations when no dropcaps exist', () => {
    const { doc } = buildDoc(1, []);
    const { editor } = createEditor(doc);
    const plugin = createDropcapPlugin(editor);
    const state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decoSet = plugin.getState(state);
    expect(decoSet.find()).toHaveLength(0);
  });

  it('maps existing decorations when transactions do not affect dropcaps', () => {
    const { doc } = buildDoc(1, [0]);
    const { editor } = createEditor(doc);
    const plugin = createDropcapPlugin(editor);
    let state = EditorState.create({ doc, schema, plugins: [plugin] });

    const decoSet = plugin.getState(state);
    const tr = state.tr.setMeta('test', true); // no doc change
    state = state.apply(tr);

    const mapped = plugin.spec.state.apply(tr, decoSet, state, state);
    expect(mapped).toBe(decoSet); // unchanged when no docChanged
  });
});
