import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@core/Editor.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const SIGNATURE_SRC = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
const ENCODED_SIGNATURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" />';
const ENCODED_SIGNATURE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ENCODED_SIGNATURE_SVG)}`;

const findFirstNodeByType = (node, typeName) => {
  let found = null;
  node.descendants((child) => {
    if (child.type.name === typeName) {
      found = child;
      return false;
    }
    return true;
  });
  return found;
};

const collectElementsByName = (node, name, result = []) => {
  if (!node || typeof node !== 'object') return result;
  if (node.name === name) result.push(node);
  (node.elements || []).forEach((child) => collectElementsByName(child, name, result));
  return result;
};

const getChildElement = (node, name) => node?.elements?.find((child) => child.name === name);

const hasDescendantNamed = (node, name) => collectElementsByName(node, name).length > 0;

describe('SD-3116 structured content image round-trip', () => {
  let editor;
  let reopened;

  afterEach(() => {
    editor?.destroy();
    reopened?.destroy();
    editor = null;
    reopened = null;
  });

  it('exports and reopens a block SDT containing preset image content', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const didInsert = editor.commands.insertStructuredContentBlock({
      attrs: {
        id: '1299215856',
        tag: '{"fieldType":"signer"}',
        alias: 'Signature TEST',
        lockMode: 'sdtLocked',
      },
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'image',
            attrs: {
              src: SIGNATURE_SRC,
              alt: 'Signature Example',
              size: { width: 200, height: 50 },
              wrap: { type: 'Inline' },
            },
          },
        ],
      },
    });

    expect(didInsert).toBe(true);

    const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true, isFinalDoc: false });
    const documentXml = parseXmlToJson(updatedDocs['word/document.xml']);
    const sdt = collectElementsByName(documentXml, 'w:sdt').find((candidate) => {
      const sdtPr = getChildElement(candidate, 'w:sdtPr');
      return sdtPr?.elements?.some((el) => el.name === 'w:id' && el.attributes?.['w:val'] === '1299215856');
    });

    expect(sdt).toBeDefined();
    const sdtContent = getChildElement(sdt, 'w:sdtContent');
    expect(sdtContent).toBeDefined();
    expect(hasDescendantNamed(sdtContent, 'a:blip')).toBe(true);

    const exported = await editor.exportDocx({ isFinalDoc: false });
    const [roundTripDocx, roundTripMedia, roundTripMediaFiles, roundTripFonts] = await Editor.loadXmlData(
      exported,
      true,
    );
    ({ editor: reopened } = initTestEditor({
      content: roundTripDocx,
      media: roundTripMedia,
      mediaFiles: roundTripMediaFiles,
      fonts: roundTripFonts,
      isNewFile: false,
    }));

    const reopenedBlock = findFirstNodeByType(reopened.state.doc, 'structuredContentBlock');
    expect(reopenedBlock?.attrs).toMatchObject({
      id: '1299215856',
      alias: 'Signature TEST',
      lockMode: 'sdtLocked',
    });

    const reopenedImage = findFirstNodeByType(reopenedBlock, 'image');
    expect(reopenedImage?.attrs).toMatchObject({
      alt: 'Signature Example',
      size: { width: 200, height: 50 },
    });
    expect(reopenedImage?.attrs.src).toMatch(/^word\/media\/.+\.svg$/);
  });

  it('exports non-base64 SVG preset image content as decoded media bytes', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const didInsert = editor.commands.insertStructuredContentBlock({
      attrs: {
        id: '1299215857',
        tag: '{"fieldType":"signer"}',
        alias: 'Signature TEST',
        lockMode: 'sdtLocked',
      },
      json: {
        type: 'paragraph',
        content: [
          {
            type: 'image',
            attrs: {
              src: ENCODED_SIGNATURE_SRC,
              alt: 'Signature Example',
              size: { width: 200, height: 50 },
              wrap: { type: 'Inline' },
            },
          },
        ],
      },
    });

    expect(didInsert).toBe(true);

    const exported = await editor.exportDocx({ isFinalDoc: false });
    const [, , exportedMediaFiles] = await Editor.loadXmlData(exported, true);
    const svgMediaEntry = Object.entries(exportedMediaFiles).find(([path]) => path.endsWith('.svg'));

    expect(svgMediaEntry).toBeDefined();
    expect(Buffer.from(svgMediaEntry[1], 'base64').toString('utf8')).toBe(ENCODED_SIGNATURE_SVG);
  });
});
