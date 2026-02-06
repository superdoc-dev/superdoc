import { expect } from 'vitest';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';
import { getExportedResult } from '../../export/export-helpers/index';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';

describe('[sdt-node-comment.docx] Test basic text SDT tag from gdocs', async () => {
  const fileName = 'sdt-node-comment.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch;
  let doc;
  let exported, body;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(fileName));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    doc = editor.getJSON();

    exported = await getExportedResult(fileName);
    body = exported.elements?.find((el) => el.name === 'w:body');
  });

  it('imports the sdt node with content', () => {
    const content = doc.content;
    expect(content.length).toBe(2);

    const p1 = content[0];
    expect(p1.type).toBe('paragraph');
    expect(p1.content.length).toBe(2);

    const sdtNode = p1.content[0];
    expect(sdtNode.type).toBe('structuredContent');
    expect(sdtNode.attrs.sdtPr).toBeDefined();

    const sdtPr = sdtNode.attrs.sdtPr;
    expect(sdtPr.elements.length).toBe(3);
    expect(sdtPr.name).toBe('w:sdtPr');

    const runs = sdtNode.content;
    expect(runs.length).toBe(2);

    const [textRunBefore, commentRun] = runs;
    expect(textRunBefore?.type).toBe('run');
    expect(commentRun?.type).toBe('run');

    const textBeforeComment = textRunBefore?.content?.find((child) => child.type === 'text');
    expect(textBeforeComment?.text).toBe('SDT field with ');
    const textBeforeMarks = textBeforeComment?.marks || [];
    expect(textBeforeMarks.some((mark) => mark.type === 'bold')).toBe(true);
    expect(textBeforeMarks.some((mark) => mark.type === 'textStyle')).toBe(true);

    const commentText = commentRun?.content?.find((child) => child.type === 'text');
    expect(commentText?.text).toBe('text and comment');
    const commentMarks = commentText?.marks || [];
    expect(commentMarks.some((mark) => mark.type === 'bold')).toBe(true);
    expect(commentMarks.some((mark) => mark.type === 'textStyle')).toBe(true);
    expect(commentMarks.some((mark) => mark.type === 'commentMark')).toBe(true);

    const extraRunAfterSdt = p1.content[1];
    expect(extraRunAfterSdt.type).toBe('run');
    const extraTextAfterSdt = extraRunAfterSdt.content.find((child) => child.type === 'text');
    expect(extraTextAfterSdt?.text).toBe(' text');

    const extraTextMarks = extraTextAfterSdt?.marks || [];
    expect(extraTextMarks.some((mark) => mark.type === 'bold')).toBe(true);
    expect(extraTextMarks.some((mark) => mark.type === 'textStyle')).toBe(true);
  });

  it('exports the sdt node correctly', () => {
    const p1 = body.elements[0];

    const sdtNode = p1.elements[1];
    expect(sdtNode).toBeDefined();
    expect(sdtNode.name).toBe('w:sdt');
    expect(sdtNode.elements.length).toBe(2);

    const sdtPr = sdtNode.elements[0];
    expect(sdtPr.name).toBe('w:sdtPr');
    expect(sdtPr.elements.length).toBe(3);

    const sdtContent = sdtNode.elements[1];
    expect(sdtContent.name).toBe('w:sdtContent');
    expect(sdtContent.elements.length).toBe(3);

    const [runBefore, runWithComment, commentReferenceRun] = sdtContent.elements;
    const textBeforeComment = runBefore?.elements?.find((el) => el.name === 'w:t');
    expect(textBeforeComment?.elements?.[0]?.text).toBe('SDT field with ');

    const commentText = runWithComment?.elements?.find((el) => el.name === 'w:t');
    expect(commentText?.elements?.[0]?.text).toBe('text and comment');

    const commentReferenceRunPr = commentReferenceRun?.elements?.find((el) => el.name === 'w:rPr');
    const commentReferenceStyle = commentReferenceRunPr?.elements?.find((el) => el.name === 'w:rStyle');
    expect(commentReferenceStyle?.attributes?.['w:val']).toBe('CommentReference');

    const extraRunAfterSdt = p1.elements[2];
    const extraTextAfterSdt = extraRunAfterSdt?.elements?.find((el) => el.name === 'w:t');
    expect(extraTextAfterSdt?.elements?.[0]?.text).toBe(' text');
  });
});
