import { describe, it, expect } from 'vitest';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor, getTestDataAsFileBuffer } from '../helpers/helpers.js';

const collectAllText = (node) => {
  const parts = [];
  const visit = (current) => {
    if (!current) return;
    if (current.type === 'text' && typeof current.text === 'string') {
      parts.push(current.text);
    }
    (current.elements || []).forEach((child) => visit(child));
  };
  visit(node);
  return parts.join('');
};

const getBodyNode = (documentJson) => {
  const documentNode = documentJson.elements?.find((el) => el.name === 'w:document');
  return documentNode?.elements?.find((el) => el.name === 'w:body');
};

describe('alternateContent roundtrip', () => {
  it('retains choice content when exporting an alternatecontent document', async () => {
    const buffer = await getTestDataAsFileBuffer('alternateContent_valid.docx');

    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    const { editor } = await initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true });

    const exportedBuffer = await editor.exportDocx({ isFinalDoc: false });
    expect(exportedBuffer?.byteLength || exportedBuffer?.length || 0).toBeGreaterThan(0);

    const zipper = new DocxZipper();
    const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
    const documentEntry = exportedFiles.find((entry) => entry.name === 'word/document.xml');
    expect(documentEntry).toBeDefined();

    const documentJson = parseXmlToJson(documentEntry.content);
    const bodyNode = getBodyNode(documentJson);
    expect(bodyNode).toBeDefined();

    const documentText = collectAllText(bodyNode);

    expect(documentText).toContain('This document demonstrates valid uses of mc:AlternateContent for testing.');
    expect(documentText).toContain('Run-level AlternateContent: Choice run (bold red, Requires=w14)');
    expect(documentText).not.toContain('Fallback run (plain)');
    expect(documentText).toContain('Cell-level AlternateContent follows:');
    expect(documentText).toContain('Choice paragraph inside table cell (Requires=w14)');
    expect(documentText).not.toContain('Fallback paragraph inside table cell');
    expect(documentText).toContain('Choice paragraph at body level (Requires=w14)');
    expect(documentText).toContain('Choice A: Requires=w15');
    expect(documentText).not.toContain('Fallback: neither w15 nor w14 supported');

    editor.destroy();
  });
});
