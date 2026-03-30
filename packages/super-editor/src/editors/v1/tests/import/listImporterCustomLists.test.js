import { getExportedResult } from '../export/export-helpers/index';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { beforeAll, beforeEach, expect } from 'vitest';
import { extractParagraphText } from '../helpers/getParagraphText.js';
import { linesToTwips } from '@converter/helpers.js';

describe('[custom-list1.docx] test import custom lists', () => {
  const filename = 'custom-list1.docx';
  let docx, media, mediaFiles, fonts, editor;
  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));
  beforeEach(() => ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts })));

  it('can import first element in custom list', () => {
    const state = editor.getJSON();
    const content = state.content;
    expect(content.length).toBe(5);

    const firstList = content[0];
    expect(firstList.type).toBe('paragraph');

    const { attrs: firstListAttrs } = firstList;
    expect(firstListAttrs).toBeDefined();
    firstListAttrs.listRendering = {
      markerText: '1.',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    };
    firstListAttrs.numberingProperties = {
      ilvl: 0,
      numId: 4,
    };
    firstListAttrs.paragraphProperties.numberingProperties = {
      ilvl: 0,
      numId: 4,
    };
  });

  it('can import the first sub-element (1.1)', () => {
    const state = editor.getJSON();
    const content = state.content;
    expect(content.length).toBe(5);

    const listItem = content[1];
    const { attrs } = listItem;
    const lvlText = attrs.listRendering.markerText;
    expect(lvlText).toBe('1.1.');

    const listLevel = attrs.listRendering.path;
    expect(listLevel).toStrictEqual([1, 1]);
  });

  it('can import the second sub-element (1.2)', () => {
    const state = editor.getJSON();
    const content = state.content;
    const listItem = content[2];

    const { attrs } = listItem;
    const lvlText = attrs.listRendering.markerText;
    expect(lvlText).toBe('1.2.');

    const listLevel = attrs.listRendering.path;
    expect(listLevel).toStrictEqual([1, 2]);
  });

  it('can import the sub-sub-element (1.2.1)', () => {
    const state = editor.getJSON();
    const content = state.content;
    const listItem = content[3];

    const { attrs } = listItem;
    const lvlText = attrs.listRendering.markerText;
    expect(lvlText).toBe('1.2.1.');

    const listLevel = attrs.listRendering.path;
    expect(listLevel).toStrictEqual([1, 2, 1]);
  });
});

describe('[broken-complex-list.docx] Tests with repeated list numbering item and complex indentation', () => {
  const filename = 'broken-complex-list.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;
  let exported, body;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
    exported = await getExportedResult(filename);
    body = exported.elements?.find((el) => el.name === 'w:body');
  });

  it('can import the first list item', () => {
    const item = content.content[0];
    expect(item.type).toBe('paragraph');

    expect(item.attrs.listRendering).toEqual({
      markerText: '1.',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    });
    expect(item.attrs.paragraphProperties?.numberingProperties).toEqual({
      ilvl: 0,
      numId: 5,
    });
    expect(item.attrs.paragraphProperties?.indent.left).toBe(360);
    expect(item.attrs.paragraphProperties?.indent.hanging).toBeUndefined();

    expect(extractParagraphText(item)).toBe('ONE');
  });

  it('can import the first sub item (a) with indent', () => {
    const item = content.content[2];
    expect(item.type).toBe('paragraph');

    expect(item.attrs.listRendering).toEqual({
      markerText: 'a.',
      justification: 'left',
      path: [1, 1],
      numberingType: 'lowerLetter',
    });
    expect(item.attrs.paragraphProperties?.numberingProperties).toEqual({
      ilvl: 1,
      numId: 5,
    });
    expect(item.attrs.paragraphProperties?.indent.left).toBe(360);
    expect(item.attrs.paragraphProperties?.indent.hanging).toBeUndefined();
    expect(item.attrs.paragraphProperties?.indent.firstLine).toBe(0);

    expect(extractParagraphText(item)).toBe('a');

    // Check spacing
    // The spacing in this document is crucial to showing the indented list in the right place
    const { spacing } = item.attrs.paragraphProperties || {};
    expect(spacing).toBeDefined();

    expect(spacing.before).toBeUndefined();
    expect(spacing.after).toBe(0);
    expect(spacing.line).toBe(linesToTwips(1));
    expect(spacing.lineRule).toBe('auto');

    // Compare with exported data
    const exportedList = body.elements[2];
    const text = exportedList.elements.find((el) => el.name === 'w:r')?.elements.find((el) => el.name === 'w:t')
      ?.elements[0].text;
    expect(text).toBe('a');

    const pPr = exportedList.elements.find((s) => s.name === 'w:pPr');
    const styleId = pPr?.elements.find((s) => s.name === 'w:pStyle')?.attributes['w:val'];
    expect(styleId).toBe('ListParagraph');

    const numPr = pPr?.elements.find((s) => s.name === 'w:numPr');
    expect(numPr).toBeDefined();
    expect(numPr.elements.length).toBe(2);
    const numIdTag = numPr.elements.find((s) => s.name === 'w:numId');
    const numId = numIdTag?.attributes['w:val'];
    expect(numId).toBe('5');
    const ilvlTag = numPr.elements.find((s) => s.name === 'w:ilvl');
    const iLvl = ilvlTag?.attributes['w:val'];
    expect(iLvl).toBe('1');

    const indentTag = pPr?.elements.find((s) => s.name === 'w:ind');
    expect(indentTag).toBeDefined();
    const indentLeft = indentTag?.attributes['w:left'];
    const indentHanging = indentTag?.attributes['w:hanging'];
    const indentFirstLine = indentTag?.attributes['w:firstLine'];
    expect(indentLeft).toBe('360');
    expect(indentHanging).toBeUndefined();
    expect(indentFirstLine).toBe('0');

    const spacingTag = pPr?.elements.find((el) => el.name === 'w:spacing');
    expect(spacingTag).toBeDefined();
    const spacingLine = spacingTag?.attributes['w:line'];
    const spacingAfter = spacingTag?.attributes['w:after'];
    const spacingBefore = spacingTag?.attributes['w:before'];
    const lineRule = spacingTag?.attributes['w:lineRule'];
    expect(spacingLine).toBe('240');
    expect(spacingAfter).toBe('0');
    expect(spacingBefore).toBeUndefined();
    expect(lineRule).toBe('auto');
  });

  it('can import the first "c" list item', () => {
    const item = content.content[6];
    expect(item.type).toBe('paragraph');
    expect(item.attrs.listRendering).toEqual({
      markerText: 'c.',
      justification: 'left',
      path: [1, 3],
      numberingType: 'lowerLetter',
    });
    expect(item.attrs.paragraphProperties?.numberingProperties).toEqual({
      ilvl: 1,
      numId: 5,
    });
    expect(item.attrs.paragraphProperties?.indent.left).toBe(360);
    expect(item.attrs.paragraphProperties?.indent.hanging).toBeUndefined();
    expect(item.attrs.paragraphProperties?.indent.firstLine).toBe(0);

    expect(extractParagraphText(item)).toBe('c');
  });
});

describe('[broken-list.docx] Test list breaking indentation formatting', () => {
  const filename = 'broken-list.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;
  let exported, body;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
    exported = await getExportedResult(filename);
    body = exported.elements?.find((el) => el.name === 'w:body');
  });

  it('can import the first list item', () => {
    const listItem = content.content[0];

    expect(listItem.type).toBe('paragraph');
    const { attrs } = listItem;
    expect(attrs.listRendering).toEqual({
      markerText: '1.',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    });
    expect(attrs.paragraphProperties?.numberingProperties).toEqual({
      ilvl: 0,
      numId: 1,
    });
    expect(attrs.paragraphProperties?.indent.left).toBeUndefined();
    expect(attrs.paragraphProperties?.indent.leftChars).toBe(0);
    expect(attrs.paragraphProperties?.indent.hanging).toBeUndefined();
  });
});

describe('[restart-numbering-sub-list.docx] Test sublist restart nubering', () => {
  const filename = 'restart-numbering-sub-list.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;
  let exported, body;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
    exported = await getExportedResult(filename);
    body = exported.elements?.find((el) => el.name === 'w:body');
  });

  it('resets the numbering for the indented list item', () => {
    const sublist1 = content.content[4];
    expect(sublist1.attrs.listRendering.path).toStrictEqual([2, 1]);
  });
});
