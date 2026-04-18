// prettier-ignore
import { beforeAll, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor, getNewTransaction } from '@tests/helpers/helpers.js';

describe('[complex-list-def-issue.docx] importing complex list (repeated num id in sub lists, breaks)', () => {
  const filename = 'complex-list-def-issue.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch;
  let currentState;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    currentState = editor.getJSON();
  });

  it('imports the list correctly', () => {
    expect(currentState.content[0].type).toBe('paragraph');
    expect(currentState.content[0].content.length).toBe(2);
  });

  it('first list item imports correctly', () => {
    const listItem = currentState.content[0];

    expect(listItem.type).toBe('paragraph');
    expect(listItem.attrs.listRendering).toEqual({
      markerText: '1.',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    });
    expect(listItem.attrs.paragraphProperties?.numberingProperties).toEqual({
      ilvl: 0,
      numId: 5,
    });

    const sublist = currentState.content[1];
    expect(sublist).toBeDefined();
    expect(sublist.type).toBe('paragraph');
    expect(sublist.attrs.listRendering).toEqual({
      markerText: 'a.',
      justification: 'left',
      path: [1, 1],
      numberingType: 'lowerLetter',
    });

    const subItem2 = currentState.content[3];
    expect(subItem2.attrs.listRendering).toEqual({
      markerText: 'b.',
      justification: 'left',
      path: [1, 2],
      numberingType: 'lowerLetter',
    });

    const subItem3 = currentState.content[5];
    expect(subItem3.attrs.listRendering).toEqual({
      markerText: 'c.',
      justification: 'left',
      path: [1, 3],
      numberingType: 'lowerLetter',
    });
    const subItem4 = currentState.content[7];
    expect(subItem4.attrs.listRendering).toEqual({
      markerText: 'd.',
      justification: 'left',
      path: [1, 4],
      numberingType: 'lowerLetter',
    });
  });

  it('third list item with node break imports correctly', () => {
    // The node break
    const nodeBreak = currentState.content[19];
    expect(nodeBreak.type).toBe('paragraph');
    expect(nodeBreak.content.length).toBe(1);
    expect(nodeBreak.attrs.listRendering).toBeNull();

    // Ensure the nodes after the break have the correct listLevel index
    const listAfterBreak = currentState.content[21];
    expect(listAfterBreak.type).toBe('paragraph');

    expect(listAfterBreak.attrs.listRendering).toEqual({
      markerText: 'b.',
      justification: 'left',
      path: [3, 2],
      numberingType: 'lowerLetter',
      suffix: undefined,
    });

    const subItem4 = currentState.content[23];
    expect(subItem4.type).toBe('paragraph');
    expect(subItem4.attrs.listRendering).toEqual({
      markerText: 'c.',
      justification: 'left',
      path: [3, 3],
      numberingType: 'lowerLetter',
      suffix: undefined,
    });
  });

  it('root list continues correctly after third item with break', () => {
    // Make sure the 'FOUR' list item continues correctly here
    const listItem = currentState.content[25];
    expect(listItem.type).toBe('paragraph');
    expect(listItem.attrs.listRendering).toEqual({
      markerText: '4.',
      justification: 'left',
      path: [4],
      numberingType: 'decimal',
    });

    const runNode = listItem.content[0];
    expect(runNode.type).toBe('run');
    expect(runNode.content.length).toBe(1);

    const textNode = runNode.content[0];
    expect(textNode.type).toBe('text');
    expect(textNode.text).toBe('FOUR');
  });
});

describe('[complex-list-def-issue.docx] importing complex list (repeated num id in sub lists, breaks)', () => {
  const filename = 'complex-list-def-issue.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch;
  let currentState;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    currentState = editor.getJSON();
  });

  it('correctly imports the list styles on the indented list (expects inline js, ind)', () => {
    const subItem1 = currentState.content[1];

    const spacing = subItem1.attrs.paragraphProperties?.spacing;
    expect(spacing).toEqual({
      after: 0,
      line: 240,
      lineRule: 'auto',
    });

    expect(subItem1.attrs.paragraphProperties?.indent).toEqual({
      left: 360,
      firstLine: 0,
    });
  });
});

describe('[custom-list-numbering1.docx] importing complex list (repeated num id in sub lists, breaks)', () => {
  const filename = 'custom-list-numbering1.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch;
  let currentState;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    currentState = editor.getJSON();
  });

  it('correctly imports list with numbering format SECTION %1.', () => {
    const listItem = currentState.content[0];
    const { attrs } = listItem;

    expect(attrs.listRendering).toEqual({
      markerText: 'SECTION 1.  ',
      suffix: 'nothing',
      justification: 'left',
      path: [1],
      numberingType: 'decimal',
    });
  });

  it('correctly imports the sublist with numbering (a), (b) etc', () => {
    const subItem1 = currentState.content[1];
    expect(subItem1.attrs.listRendering).toEqual({
      markerText: '(a)',
      justification: 'left',
      path: [1, 1],
      numberingType: 'lowerLetter',
    });
  });
});
