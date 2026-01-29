import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { wrapTextInRunsPlugin } from './wrapTextInRunsPlugin.js';

const makeSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        group: 'block',
        content: 'inline*',
        toDOM: () => ['p', 0],
        attrs: {
          paragraphProperties: { default: null },
        },
      },
      run: {
        inline: true,
        group: 'inline',
        content: 'inline*',
        toDOM: () => ['span', { 'data-run': '1' }, 0],
        attrs: {
          runProperties: { default: null },
        },
      },
      text: { group: 'inline' },
    },
    marks: {
      bold: {
        toDOM: () => ['strong', 0],
        parseDOM: [{ tag: 'strong' }],
      },
      italic: {
        toDOM: () => ['em', 0],
        parseDOM: [{ tag: 'em' }],
      },
      textStyle: {
        attrs: {
          fontFamily: { default: null },
          fontSize: { default: null },
        },
        toDOM: (mark) => [
          'span',
          { style: `font-family: ${mark.attrs.fontFamily}; font-size: ${mark.attrs.fontSize}` },
          0,
        ],
        parseDOM: [
          { tag: 'span', getAttrs: (dom) => ({ fontFamily: dom.style.fontFamily, fontSize: dom.style.fontSize }) },
        ],
      },
    },
  });

const paragraphDoc = (schema) => schema.node('doc', null, [schema.node('paragraph')]);

describe('wrapTextInRunsPlugin', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const createView = (schema, doc, editor) =>
    new EditorView(container, {
      state: EditorState.create({
        schema,
        doc,
        plugins: [wrapTextInRunsPlugin(editor)],
      }),
      dispatchTransaction(tr) {
        const state = this.state.apply(tr);
        this.updateState(state);
      },
    });

  it('wraps text inserted via transactions (e.g. composition) inside runs', () => {
    const schema = makeSchema();
    const view = createView(schema, paragraphDoc(schema));

    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('こんにちは');
    view.dispatch(tr);

    const paragraph = view.state.doc.firstChild;
    expect(paragraph.firstChild.type.name).toBe('run');
    expect(paragraph.textContent).toBe('こんにちは');
  });

  it('wraps composition text as soon as composition ends without extra typing', async () => {
    const schema = makeSchema();
    const view = createView(schema, paragraphDoc(schema));

    // Simulate composition insert while composing
    const composingSpy = vi.spyOn(view, 'composing', 'get').mockReturnValue(true);
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('あ');
    view.dispatch(tr);

    // Text is still bare while composing
    expect(view.state.doc.firstChild.firstChild.type.name).toBe('text');

    // Finish composition; plugin flushes on compositionend
    composingSpy.mockReturnValue(false);
    const event = new CompositionEvent('compositionend', { data: 'あ', bubbles: true });
    view.dom.dispatchEvent(event);

    await Promise.resolve();

    composingSpy.mockRestore();

    const paragraph = view.state.doc.firstChild;
    expect(paragraph.firstChild.type.name).toBe('run');
    expect(paragraph.textContent).toBe('あ');
  });

  it('copies run properties from previous paragraph and applies marks to wrapped text', () => {
    const schema = makeSchema();
    const prevRun = schema.node('run', { runProperties: { bold: true } }, [schema.text('Prev')]);
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [prevRun]), schema.node('paragraph')]);
    const view = createView(schema, doc);

    const secondParagraphPos = view.state.doc.child(0).nodeSize + 1;
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, secondParagraphPos)).insertText('Next');
    view.dispatch(tr);

    const secondParagraph = view.state.doc.child(1);
    const run = secondParagraph.firstChild;
    expect(run.type.name).toBe('run');
    expect(run.attrs.runProperties).toEqual({ bold: true });
    expect(run.firstChild.marks.some((mark) => mark.type.name === 'bold')).toBe(true);
  });

  it('merges previous paragraph marks with existing text marks', () => {
    const schema = makeSchema();
    const prevRun = schema.node('run', { runProperties: { bold: true } }, [schema.text('Prev')]);
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [prevRun]), schema.node('paragraph')]);
    const view = createView(schema, doc);

    const secondParagraphPos = view.state.doc.child(0).nodeSize + 1;
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, secondParagraphPos));
    tr.addStoredMark(schema.marks.italic.create());
    tr.insertText('X');
    view.dispatch(tr);

    const secondParagraph = view.state.doc.child(1);
    const run = secondParagraph.firstChild;
    const markNames = run.firstChild.marks.map((mark) => mark.type.name);
    expect(markNames).toContain('bold');
    expect(markNames).toContain('italic');
  });

  describe('resolveRunPropertiesFromParagraphStyle', () => {
    it('resolves run properties from paragraph styleId', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: {
            'w:styles': {
              'w:style': [
                {
                  '@w:styleId': 'Heading1',
                  '@w:type': 'paragraph',
                  'w:rPr': {
                    'w:b': {},
                    'w:sz': { '@w:val': '28' },
                  },
                },
              ],
            },
          },
          numbering: {},
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'Heading1' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('handles missing converter gracefully', () => {
      const schema = makeSchema();
      const mockEditor = {}; // No converter

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'Heading1' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('handles missing styleId gracefully', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: {},
          numbering: {},
        },
      };

      const paragraphWithoutStyle = schema.node('paragraph', {
        paragraphProperties: {},
      });

      const doc = schema.node('doc', null, [paragraphWithoutStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('extracts ascii property from complex font family object', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: {
            'w:styles': {
              'w:style': [
                {
                  '@w:styleId': 'TestStyle',
                  '@w:type': 'paragraph',
                  'w:rPr': {
                    'w:rFonts': {
                      '@w:ascii': 'Arial',
                      '@w:hAnsi': 'Arial',
                    },
                  },
                },
              ],
            },
          },
          numbering: {},
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'TestStyle' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('handles fontFamily as plain string', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: {
            'w:styles': {
              'w:style': [
                {
                  '@w:styleId': 'TestStyle',
                  '@w:type': 'paragraph',
                  'w:rPr': {
                    'w:rFonts': 'Times New Roman',
                  },
                },
              ],
            },
          },
          numbering: {},
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'TestStyle' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('falls back when fontFamily object has no ascii property', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: {
            'w:styles': {
              'w:style': [
                {
                  '@w:styleId': 'TestStyle',
                  '@w:type': 'paragraph',
                  'w:rPr': {
                    'w:rFonts': {
                      '@w:hAnsi': 'Calibri',
                    },
                  },
                },
              ],
            },
          },
          numbering: {},
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'TestStyle' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('handles malformed converter context without crashing', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          convertedXml: null, // Malformed
          numbering: undefined, // Malformed
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'TestStyle' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });

    it('handles errors during style resolution gracefully', () => {
      const schema = makeSchema();
      const mockEditor = {
        converter: {
          get convertedXml() {
            throw new Error('Converter error');
          },
          numbering: {},
        },
      };

      const paragraphWithStyle = schema.node('paragraph', {
        paragraphProperties: { styleId: 'TestStyle' },
      });

      const doc = schema.node('doc', null, [paragraphWithStyle]);
      const view = createView(schema, doc, mockEditor);

      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)).insertText('Test');
      view.dispatch(tr);

      const paragraph = view.state.doc.firstChild;
      expect(paragraph.firstChild.type.name).toBe('run');
      expect(paragraph.textContent).toBe('Test');
    });
  });
});
