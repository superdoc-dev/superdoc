import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';
import { calculateResolvedParagraphProperties } from './resolvedPropertiesCache.js';

describe('Paragraph Node', () => {
  let docx, media, mediaFiles, fonts, editor;
  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx'));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    vi.clearAllMocks();
  });

  it('inserting html with <h1> tag adds paragraph styled as heading', async () => {
    editor.commands.insertContent('<h1>Test Heading</h1>');
    const node = editor.state.doc.content.content[0];
    expect(node.type.name).toBe('paragraph');
    expect(node.attrs.paragraphProperties?.styleId).toBe('Heading1');

    const result = await editor.exportDocx({
      exportJsonOnly: true,
    });

    const body = result.elements[0];

    expect(body.elements).toHaveLength(2);
    expect(body.elements.map((el) => el.name)).toEqual(['w:p', 'w:sectPr']);
    const paragraph = body.elements[0];
    expect(paragraph.name).toBe('w:p');

    // Verify paragraph properties include the Heading1 style
    const pPr = paragraph.elements.find((el) => el.name === 'w:pPr');
    expect(pPr).toBeDefined();
    expect(pPr.elements).toContainEqual({
      name: 'w:pStyle',
      attributes: { 'w:val': 'Heading1' },
    });

    // Verify run exists with text content
    const run = paragraph.elements.find((el) => el.name === 'w:r');
    expect(run).toBeDefined();
    const textNode = run.elements.find((el) => el.name === 'w:t');
    expect(textNode).toBeDefined();
    const textContent = textNode.elements?.find((child) => child.type === 'text');
    expect(textContent?.text).toBe('Test Heading');
  });

  it('inserting plain text creates a simple paragraph', async () => {
    editor.commands.insertContent('This is a test paragraph.');
    expect(editor.state.doc.content.content[0].type.name).toBe('paragraph');
    expect(editor.state.doc.content.content[0].attrs.paragraphProperties?.styleId).toBeUndefined();
    const result = await editor.exportDocx({
      exportJsonOnly: true,
    });

    const body = result.elements[0];

    expect(body.elements).toHaveLength(2);
    expect(body.elements.map((el) => el.name)).toEqual(['w:p', 'w:sectPr']);
    const paragraph = body.elements[0];
    expect(paragraph.name).toBe('w:p');

    const run = paragraph.elements.find((el) => el.name === 'w:r');
    expect(run).toBeDefined();
    const textNode = run.elements.find((el) => el.name === 'w:t');
    expect(textNode).toBeDefined();
    const textValue = textNode.elements.find((child) => typeof child.text === 'string')?.text;
    expect(textValue).toBe('This is a test paragraph.');
  });

  it('handles beforeinput in an empty list paragraph without dropping the first character', () => {
    let paragraphPos = null;
    let paragraphNode = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && paragraphPos == null) {
        paragraphPos = pos;
        paragraphNode = node;
        return false;
      }
      return true;
    });

    expect(paragraphPos).not.toBeNull();
    expect(paragraphNode).not.toBeNull();

    const numberingProperties = { numId: 1, ilvl: 0 };
    const listRendering = {
      markerText: '1.',
      suffix: 'tab',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    };

    const updatedAttrs = {
      ...paragraphNode.attrs,
      paragraphProperties: {
        ...(paragraphNode.attrs.paragraphProperties || {}),
        numberingProperties,
      },
      numberingProperties,
      listRendering,
    };

    let tr = editor.state.tr.setNodeMarkup(paragraphPos, null, updatedAttrs);
    editor.view.dispatch(tr);

    const updatedParagraph = editor.state.doc.nodeAt(paragraphPos);
    calculateResolvedParagraphProperties(editor, updatedParagraph, editor.state.doc.resolve(paragraphPos));

    tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, paragraphPos + 1));
    editor.view.dispatch(tr);

    const beforeInputEvent = new InputEvent('beforeinput', {
      data: 't',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(beforeInputEvent);

    expect(editor.state.doc.textContent).toBe('t');
  });
});
