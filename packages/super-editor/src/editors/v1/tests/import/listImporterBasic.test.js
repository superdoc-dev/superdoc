import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { expect } from 'vitest';
import { extractParagraphText } from '../helpers/getParagraphText.js';

describe('[sublist-issue.docx] Imports sublist with numId issue', () => {
  const filename = 'sublist-issue.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
  });

  it('correctly imports first list item and indented paragraph break', () => {
    const item1 = content.content[2];

    expect(item1.type).toBe('paragraph');
    expect(item1.attrs.paragraphProperties?.indent).toEqual({ right: -220 });
    expect(item1.attrs.paragraphProperties?.numberingProperties).toEqual({ ilvl: 0, numId: 5 });
    expect(item1.attrs.listRendering).toBeDefined();
    expect(item1.attrs.listRendering).toEqual({
      markerText: '1.',
      justification: 'right',
      path: [1],
      numberingType: 'decimal',
    });
  });

  it('imports second list item and break', () => {
    const item = content.content[4];
    expect(item.type).toBe('paragraph');
    expect(item.attrs.paragraphProperties?.indent).toBeUndefined();
    expect(item.attrs.paragraphProperties.numberingProperties).toEqual({ ilvl: 0, numId: 5 });
    expect(item.attrs.listRendering).toBeDefined();
    expect(item.attrs.listRendering).toEqual({
      markerText: '2.',
      justification: 'right',
      path: [2],
      numberingType: 'decimal',
    });

    // Ensure we're importing the empty paragraprh
    const emptyParagraph = content.content[5];
    expect(emptyParagraph.type).toBe('paragraph');
    expect(emptyParagraph.content).toBeUndefined();
  });

  it('correctly imports numId in sublist that does not match outer list', () => {
    const item = content.content[6];
    expect(item.type).toBe('paragraph');
    expect(item.attrs.paragraphProperties?.indent).toEqual({ firstLine: 0, left: 360, right: -221 });
    expect(item.attrs.paragraphProperties.numberingProperties).toEqual({ ilvl: 0, numId: 3 });
    expect(item.attrs.listRendering).toBeDefined();
    expect(item.attrs.listRendering).toEqual({
      markerText: 'a.',
      justification: 'left',
      path: [1],
      numberingType: 'lowerLetter',
    });
  });
});

describe('[base-ordered.docx] Imports base list and sublist', () => {
  const filename = 'base-ordered.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
  });

  it('can import the first list item from list 1', () => {
    const list = content.content[0];
    expect(list.type).toBe('paragraph');

    const { attrs: listAttrs } = list;
    expect(listAttrs).toBeDefined();
    expect(listAttrs.listRendering.path).toStrictEqual([1]);
    expect(listAttrs.paragraphProperties?.numberingProperties).toEqual({ ilvl: 0, numId: 1 });

    expect(list.content.length).toBe(1);
    const runNode = list.content[0];
    expect(runNode.type).toBe('run');
    const textNode = runNode.content.find((child) => child.type === 'text');
    expect(textNode?.text).toBe('One');
    expect(extractParagraphText(list)).toBe('One');
  });

  it('can import the second list item from list 1', () => {
    const list = content.content[1];
    expect(list.type).toBe('paragraph');
    expect(list.content.length).toBe(1);

    const { attrs: listAttrs } = list;
    expect(listAttrs.listRendering.path).toStrictEqual([2]);
    expect(listAttrs.paragraphProperties.numberingProperties).toEqual({ ilvl: 0, numId: 1 });
    expect(listAttrs.paragraphProperties.indent).toBeUndefined();
  });

  it('can import the third list item from list 1', () => {
    const list = content.content[2];
    expect(list.type).toBe('paragraph');
    expect(list.content.length).toBe(1);

    const { attrs: listAttrs } = list;
    expect(listAttrs.listRendering.path).toStrictEqual([3]);
    expect(listAttrs.paragraphProperties?.numberingProperties).toEqual({ ilvl: 0, numId: 1 });
    expect(listAttrs.paragraphProperties.indent).toBeUndefined();
  });

  it('correctly imports spacer paragraphs', () => {
    const p1 = content.content[3];
    expect(p1.type).toBe('paragraph');
    expect(p1.content).toBeUndefined();
    expect(p1.attrs.paragraphProperties?.numberingProperties).toBeUndefined();

    const p2 = content.content[4];
    expect(p2.type).toBe('paragraph');
    expect(p2.content).toBeUndefined();
    expect(p2.attrs.paragraphProperties?.numberingProperties).toBeUndefined();
  });

  it('correctly imports first item list 2', () => {
    const list = content.content[5];

    expect(list.type).toBe('paragraph');
    expect(list.content.length).toBe(1);

    const { attrs: listAttrs } = list;
    expect(listAttrs).toBeDefined();
    expect(listAttrs.listRendering.path).toStrictEqual([1]);
    expect(listAttrs.paragraphProperties.numberingProperties).toEqual({ ilvl: 0, numId: 2 });
    expect(listAttrs.paragraphProperties.indent).toBeUndefined();

    const runNode = list.content[0];
    expect(runNode.type).toBe('run');
    const textNode = runNode.content.find((child) => child.type === 'text');
    expect(textNode?.text).toBe('One');
    expect(extractParagraphText(list)).toBe('One');
  });
});
