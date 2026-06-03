import { describe, it, expect, afterEach } from 'vitest';
import { toFlowBlocks } from '@core/layout-adapter';
import { createDomPainter } from '@superdoc/painter-dom';
import { resolveLayout } from '@superdoc/layout-resolved';
import { Editor } from '@core/Editor.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';

const SIGNATURE_SRC = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
const ENCODED_SIGNATURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" />';
const ENCODED_SIGNATURE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ENCODED_SIGNATURE_SVG)}`;
const PNG_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/Ur/9wAAAABJRU5ErkJggg==';

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

const findNodeByTypeAndId = (node, typeName, id) => {
  let found = null;
  node.descendants((child) => {
    if (child.type.name === typeName && child.attrs?.id === id) {
      found = child;
      return false;
    }
    return true;
  });
  return found;
};

const collectNodesByType = (node, typeName) => {
  const found = [];
  node.descendants((child) => {
    if (child.type.name === typeName) found.push(child);
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

const DEFAULT_CONVERTER_CONTEXT = {
  docx: {},
  translatedLinkedStyles: {
    docDefaults: {},
    latentStyles: {},
    styles: {},
  },
  translatedNumbering: {
    abstracts: {},
    definitions: {},
  },
};

const TEST_PAGE = {
  pageSize: { w: 612, h: 792 },
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

const paintSavedModel = (pmDoc, mediaFiles) => {
  const { blocks } = toFlowBlocks(pmDoc, {
    converterContext: DEFAULT_CONVERTER_CONTEXT,
    mediaFiles,
  });
  const contentWidth = TEST_PAGE.pageSize.w - TEST_PAGE.margins.left - TEST_PAGE.margins.right;
  const measures = blocks.map((block) => {
    const imageRun = block.runs?.find((run) => run.kind === 'image');
    const lineHeight = imageRun?.height ?? 20;

    return {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: Math.max((block.runs?.length ?? 1) - 1, 0),
          toChar: 0,
          width: imageRun?.width ?? contentWidth,
          ascent: lineHeight,
          descent: 0,
          lineHeight,
        },
      ],
      totalHeight: lineHeight,
    };
  });

  let y = TEST_PAGE.margins.top;
  const fragments = blocks.flatMap((block, index) => {
    const measure = measures[index];
    if (block.kind !== 'paragraph') return [];

    const fragment = {
      kind: 'para',
      blockId: block.id,
      fromLine: 0,
      toLine: measure.lines?.length ?? 1,
      x: TEST_PAGE.margins.left,
      y,
      width: contentWidth,
    };
    y += measure.totalHeight ?? 20;
    return [fragment];
  });

  const layout = {
    pageSize: TEST_PAGE.pageSize,
    pages: [{ number: 1, fragments }],
  };
  const mount = document.createElement('div');
  document.body.appendChild(mount);

  const painter = createDomPainter({});
  const resolvedLayout = resolveLayout({ layout, flowMode: 'paginated', blocks, measures });
  painter.paint({ resolvedLayout }, mount);

  return { mount, blocks };
};

describe('SD-3116 structured content image round-trip', () => {
  let editor;
  let reopened;
  let paintMount;

  afterEach(() => {
    editor?.destroy();
    reopened?.destroy();
    paintMount?.remove();
    editor = null;
    reopened = null;
    paintMount = null;
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

  it('repaints preset image content from a saved document model without export and re-import', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    const didInsert = editor.commands.insertStructuredContentBlock({
      attrs: {
        id: '1299215860',
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

    const savedModel = editor.getJSON();
    const savedMedia = { ...editor.storage.image.media };
    const savedImage = findFirstNodeByType(editor.state.doc, 'image');
    expect(savedImage?.attrs.src).toMatch(/^word\/media\/image-\d+\.svg$/);
    expect(savedMedia[savedImage.attrs.src]).toBe(SIGNATURE_SRC);

    const painted = paintSavedModel(savedModel, savedMedia);
    paintMount = painted.mount;

    expect(painted.blocks).toHaveLength(1);
    expect(painted.blocks[0].attrs?.sdt).toMatchObject({
      type: 'structuredContent',
      scope: 'block',
      id: '1299215860',
    });

    const img = paintMount.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SIGNATURE_SRC);
    expect(img?.getAttribute('alt')).toBe('Signature Example');
  });

  it('round-trips inline text SDTs and block plain-text SDTs', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    expect(
      editor.commands.insertStructuredContentInline({
        attrs: {
          id: '1299215861',
          tag: 'inline_text_sdt',
          alias: 'Inline text TEST',
          lockMode: 'sdtLocked',
        },
        text: 'Inline plain text',
      }),
    ).toBe(true);

    expect(
      editor.commands.insertStructuredContentBlock({
        attrs: {
          id: '1299215862',
          tag: 'block_text_sdt',
          alias: 'Block text TEST',
          lockMode: 'sdtLocked',
        },
        json: {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Block plain text' }],
        },
      }),
    ).toBe(true);

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

    const inlineSdt = findNodeByTypeAndId(reopened.state.doc, 'structuredContent', '1299215861');
    expect(inlineSdt?.attrs).toMatchObject({
      alias: 'Inline text TEST',
      lockMode: 'sdtLocked',
    });
    expect(inlineSdt?.textContent).toBe('Inline plain text');

    const blockSdt = findNodeByTypeAndId(reopened.state.doc, 'structuredContentBlock', '1299215862');
    expect(blockSdt?.attrs).toMatchObject({
      alias: 'Block text TEST',
      lockMode: 'sdtLocked',
    });
    expect(blockSdt?.textContent).toBe('Block plain text');
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

  it('round-trips two block SDTs with different preset image types in one document', async () => {
    const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx');
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));

    expect(
      editor.commands.insertStructuredContentBlock({
        attrs: {
          id: '1299215863',
          tag: 'svg_signature_sdt',
          alias: 'SVG Signature',
          lockMode: 'sdtLocked',
        },
        json: {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: SIGNATURE_SRC,
                alt: 'SVG Signature Example',
                size: { width: 200, height: 50 },
                wrap: { type: 'Inline' },
              },
            },
          ],
        },
      }),
    ).toBe(true);

    expect(
      editor.commands.insertStructuredContentBlock({
        attrs: {
          id: '1299215864',
          tag: 'png_signature_sdt',
          alias: 'PNG Signature',
          lockMode: 'sdtLocked',
        },
        json: {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: PNG_SRC,
                alt: 'PNG Signature Example',
                size: { width: 20, height: 10 },
                wrap: { type: 'Inline' },
              },
            },
          ],
        },
      }),
    ).toBe(true);

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

    const reopenedSvgBlock = findNodeByTypeAndId(reopened.state.doc, 'structuredContentBlock', '1299215863');
    const reopenedPngBlock = findNodeByTypeAndId(reopened.state.doc, 'structuredContentBlock', '1299215864');
    const reopenedSvgImage = findFirstNodeByType(reopenedSvgBlock, 'image');
    const reopenedPngImage = findFirstNodeByType(reopenedPngBlock, 'image');

    expect(reopenedSvgImage?.attrs).toMatchObject({
      alt: 'SVG Signature Example',
      size: { width: 200, height: 50 },
    });
    expect(reopenedPngImage?.attrs).toMatchObject({
      alt: 'PNG Signature Example',
      size: { width: 20, height: 10 },
    });
    expect(reopenedSvgImage?.attrs.src).toMatch(/^word\/media\/.+\.svg$/);
    expect(reopenedPngImage?.attrs.src).toMatch(/^word\/media\/.+\.png$/);
    expect(
      new Set(collectNodesByType(reopened.state.doc, 'image').map((node) => node.attrs.src)).size,
    ).toBeGreaterThanOrEqual(2);
    expect(Object.keys(roundTripMediaFiles).filter((path) => /\.(svg|png)$/.test(path))).toHaveLength(2);
  });
});
