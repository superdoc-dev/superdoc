// prettier-ignore
import { beforeAll, expect } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { loadTestDataForEditorTests, initTestEditor, getNewTransaction } from '@tests/helpers/helpers.js';

describe('[blank-doc.docx] import, add node, export', () => {
  const filename = 'blank-doc.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
  });

  it('starts with an empty document containing only a paragraph', () => {
    const currentState = editor.getJSON();
    expect(currentState.content.length).toBe(1);
    expect(currentState.content[0].type).toBe('paragraph');
  });

  it('can start an ordered list', () => {
    // Generate a new list, track the list ID to check it later
    editor.commands.toggleOrderedList();

    const currentState = editor.getJSON();
    expect(currentState.content.length).toBe(1);
    expect(currentState.content[0].type).toBe('paragraph');
    expect(currentState.content[0].attrs.paragraphProperties.numberingProperties).toBeDefined();
  });

  it('can export the empty list node', () => {
    const { result: exported } = editor.converter.exportToXmlJson({
      data: editor.getJSON(),
      editorSchema: editor.schema,
      editor,
    });
    const body = exported.elements.find((el) => el.name === 'w:body');
    const content = body.elements;

    const paragraph = content[0];
    expect(paragraph.name).toBe('w:p');

    const pPr = paragraph.elements.find((el) => el.name === 'w:pPr');
    expect(pPr).toBeDefined();

    const numPr = pPr.elements.find((el) => el.name === 'w:numPr');
    expect(numPr).toBeDefined();
    expect(numPr.elements.length).toBe(2);
  });

  it('can add text to the first list item', () => {
    const tr = getNewTransaction(editor);
    const listPosition = 1;

    tr.insertText('hello world', listPosition);
    dispatch(tr);

    const currentState = editor.getJSON();
    expect(currentState.content[0].content[0].content[0].text).toBe('hello world');
    const content = currentState.content;
    expect(content[0].type).toBe('paragraph');
    const firstListItem = content[0];
    expect(firstListItem.type).toBe('paragraph');

    const { attrs } = firstListItem;
    expect(attrs.listRendering.numberingType).toBe('decimal');
    expect(attrs.listRendering.markerText).toBe('1.');
    expect(attrs.listRendering.justification).toBe('left');
    expect(attrs.listRendering.path).toStrictEqual([1]);
    expect(attrs.paragraphProperties.numberingProperties.numId).toBe(3);
    expect(attrs.paragraphProperties.numberingProperties.ilvl).toBe(0);
  });

  it('correctly exports after the first list item', () => {
    const { result: exported } = editor.converter.exportToXmlJson({
      data: editor.getJSON(),
      editor,
    });

    expect(exported).toBeDefined();
    expect(exported.elements.length).toBe(1);
    expect(exported.elements[0].name).toBe('w:body');

    const body = exported.elements[0];
    const listItem = body.elements[0];
    const pPr = listItem.elements[0];
    const numPr = pPr.elements[0];
    expect(numPr.elements.length).toBe(2);

    const numIdTag = numPr.elements.find((el) => el.name === 'w:numId');
    const numId = numIdTag.attributes['w:val'];
    expect(numId).toBe('3');

    const lvl = numPr.elements.find((el) => el.name === 'w:ilvl');
    const lvlText = lvl.attributes['w:val'];
    expect(lvlText).toBe('0');

    const runNode = listItem.elements.find((el) => el.name === 'w:r');
    const textElement = runNode.elements.find((el) => el.name === 'w:t');
    expect(textElement.elements[0].text).toBe('hello world');
  });

  it('can add a second list item by splitting the first', () => {
    const tr = getNewTransaction(editor);
    const $pos = tr.doc.resolve(3 + 'hello world'.length);
    tr.setSelection(TextSelection.near($pos));
    dispatch(tr);

    editor.commands.splitBlock();

    const currentState = editor.getJSON();
    expect(currentState.content.length).toBe(4);

    const firstItem = currentState.content[0];
    expect(firstItem.type).toBe('paragraph');
    expect(firstItem.attrs.paragraphProperties?.numberingProperties).toBeDefined();
    expect(firstItem.attrs.paragraphProperties?.numberingProperties?.numId).toBeDefined();
    expect(firstItem.attrs.paragraphProperties?.numberingProperties?.ilvl).toBeDefined();

    const secondItem = currentState.content[1];
    expect(secondItem.type).toBe('paragraph');
    expect(secondItem.attrs.paragraphProperties?.numberingProperties).toBeDefined();
    expect(secondItem.attrs.paragraphProperties.numberingProperties.numId).toBe(
      firstItem.attrs.paragraphProperties.numberingProperties.numId,
    );
    expect(secondItem.attrs.paragraphProperties.numberingProperties.ilvl).toBe(
      firstItem.attrs.paragraphProperties.numberingProperties.ilvl,
    );
  });
});
