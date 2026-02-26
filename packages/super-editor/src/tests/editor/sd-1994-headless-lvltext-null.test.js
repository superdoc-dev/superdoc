/* @vitest-environment node */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { createDOMGlobalsLifecycle } from '../helpers/dom-globals-test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadDocxFixture = async (filename) => {
  return readFile(join(__dirname, '../data', filename));
};

describe('SD-1994 reproduction: headless docx + markdown JSON ordered lists', () => {
  const domLifecycle = createDOMGlobalsLifecycle();

  beforeEach(() => {
    domLifecycle.setup();
  });

  afterEach(() => {
    domLifecycle.teardown();
  });

  it('does not crash when constructing a headless docx editor from markdown-derived JSON with ordered lists', async () => {
    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();

    const injectedDocument = new JSDOM('').window.document;
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const sourceEditor = new Editor({
      mode: 'docx',
      document: injectedDocument,
      documentId: 'sd-1994-source-editor',
      extensions: getStarterExtensions(),
      content,
      mediaFiles,
      fonts,
      markdown: '1. one\n2. two\n3. three',
    });

    const json = sourceEditor.getJSON();
    sourceEditor.destroy();

    expect(() => {
      const targetEditor = new Editor({
        mode: 'docx',
        isHeadless: true,
        documentId: 'sd-1994-target-editor',
        extensions: getStarterExtensions(),
        content,
        mediaFiles,
        fonts,
        jsonOverride: json,
      });
      targetEditor.destroy();
    }).not.toThrow();
  }, 60_000);

  it('does not crash when numbering definitions exist but lvlText is missing', async () => {
    const buffer = await loadDocxFixture('blank-doc.docx');
    const [content, , mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

    const numberingEntry = content.find((entry) => entry.name === 'word/numbering.xml');
    const numberingXmlMissingLvlText =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0">' +
      '<w:lvl w:ilvl="0">' +
      '<w:start w:val="1"/>' +
      '<w:numFmt w:val="decimal"/>' +
      '</w:lvl>' +
      '</w:abstractNum>' +
      '<w:num w:numId="1">' +
      '<w:abstractNumId w:val="0"/>' +
      '</w:num>' +
      '</w:numbering>';

    const contentWithMissingLvlText = numberingEntry
      ? content.map((entry) =>
          entry.name === 'word/numbering.xml' ? { ...entry, content: numberingXmlMissingLvlText } : entry,
        )
      : [...content, { name: 'word/numbering.xml', content: numberingXmlMissingLvlText }];

    const jsonWithOrderedListParagraph = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              numberingProperties: {
                numId: 1,
                ilvl: 0,
              },
            },
            listRendering: null,
          },
          content: [{ type: 'text', text: 'List item from JSON' }],
        },
      ],
    };

    const editor = new Editor({
      mode: 'docx',
      isHeadless: true,
      documentId: 'sd-1994-missing-lvltext',
      extensions: getStarterExtensions(),
      content: contentWithMissingLvlText,
      mediaFiles,
      fonts,
      jsonOverride: jsonWithOrderedListParagraph,
    });

    // Ensure converter loaded the injected numbering definition and paragraph list props.
    expect(editor.converter?.numbering?.definitions?.[1]).toBeTruthy();
    expect(editor.converter?.numbering?.abstracts?.[0]).toBeTruthy();

    const details = ListHelpers.getListDefinitionDetails({ numId: 1, level: 0, editor });
    expect(details).toBeTruthy();
    expect(details?.listNumberingType).toBe('decimal');
    expect(details?.lvlText == null).toBe(true);

    const firstParagraph = editor.getJSON()?.content?.[0];
    expect(firstParagraph?.type).toBe('paragraph');
    expect(firstParagraph?.attrs?.paragraphProperties?.numberingProperties).toEqual({ numId: 1, ilvl: 0 });
    expect(firstParagraph?.attrs?.listRendering?.numberingType).toBe('decimal');
    expect(firstParagraph?.attrs?.listRendering?.markerText).toBe('');
    expect(firstParagraph?.attrs?.listRendering?.path).toEqual([1]);

    editor.destroy();
  }, 60_000);
});
