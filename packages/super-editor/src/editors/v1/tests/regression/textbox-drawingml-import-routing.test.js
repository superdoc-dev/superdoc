import { describe, it, expect } from 'vitest';
import { createDocumentJson } from '@core/super-converter/v2/importer/docxImporter';
import { initTestEditor, getTestDataByFileName } from '@tests/helpers/helpers.js';
import { Editor } from '@core/Editor.js';
import { join } from 'path';
import { readFile } from 'fs/promises';

function collectNodesByType(node, type, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (node.type === type) {
    acc.push(node);
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectNodesByType(child, type, acc));
  }
  return acc;
}

describe('textbox drawingml import routing', () => {
  it('produces schema-valid PM JSON for the text-boxes fixture', async () => {
    const docx = await getTestDataByFileName('text-boxes.docx');
    const { editor } = initTestEditor({
      loadFromSchema: true,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    });

    try {
      const converter = { docHiglightColors: new Set(), headers: {}, footers: {}, headerIds: {}, footerIds: {} };
      const result = createDocumentJson(docx, converter, editor);
      const json = result.pmDoc;
      const vectorShapes = collectNodesByType(json, 'vectorShape');
      const shapeContainers = collectNodesByType(json, 'shapeContainer');
      const rootTypes = (json.content || []).map((node) => node?.type);

      expect(() => editor.schema.nodeFromJSON(json)).not.toThrow();

      expect(rootTypes).not.toContain('shapeTextbox');
      expect(rootTypes).not.toContain('run');
      expect(rootTypes).not.toContain('text');
      expect(shapeContainers.length).toBeGreaterThan(0);
      expect(vectorShapes).toHaveLength(0);

      const textboxShapes = shapeContainers.filter(
        (node) =>
          node?.attrs?.drawingContent?.name === 'w:drawing' &&
          Array.isArray(node?.content) &&
          node.content.some((child) => child?.type === 'shapeTextbox'),
      );

      expect(textboxShapes.length).toBeGreaterThan(0);
    } finally {
      editor.destroy();
    }
  });

  it('preserves imported shapeContainer geometry through schema node creation', async () => {
    const docx = await getTestDataByFileName('text-boxes.docx');
    const { editor } = initTestEditor({
      loadFromSchema: true,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    });

    try {
      const converter = { docHiglightColors: new Set(), headers: {}, footers: {}, headerIds: {}, footerIds: {} };
      const result = createDocumentJson(docx, converter, editor);
      const json = result.pmDoc;
      const importedShapeContainers = collectNodesByType(json, 'shapeContainer').filter(
        (node) =>
          node?.attrs?.drawingContent?.name === 'w:drawing' &&
          Array.isArray(node?.content) &&
          node.content.some((child) => child?.type === 'shapeTextbox'),
      );

      expect(importedShapeContainers.length).toBeGreaterThan(0);
      importedShapeContainers.forEach((node) => {
        expect(node.attrs?.width).toBeGreaterThan(1);
        expect(node.attrs?.height).toBeGreaterThan(1);
      });

      const schemaDoc = editor.schema.nodeFromJSON(json).toJSON();
      const schemaShapeContainers = collectNodesByType(schemaDoc, 'shapeContainer').filter(
        (node) =>
          node?.attrs?.drawingContent?.name === 'w:drawing' &&
          Array.isArray(node?.content) &&
          node.content.some((child) => child?.type === 'shapeTextbox'),
      );

      expect(schemaShapeContainers.length).toBeGreaterThan(0);
      schemaShapeContainers.forEach((node) => {
        expect(node.attrs?.width).toBeGreaterThan(1);
        expect(node.attrs?.height).toBeGreaterThan(1);
      });
    } finally {
      editor.destroy();
    }
  });

  it('full editor loads text-boxes.docx without PM view crash', async () => {
    const filePath = join(__dirname, '../data/text-boxes.docx');
    const fileSource = await readFile(filePath);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(fileSource, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });
    try {
      const json = editor.getJSON();
      const shapeContainers = collectNodesByType(json, 'shapeContainer');
      expect(shapeContainers.length).toBeGreaterThan(0);
    } finally {
      editor.destroy();
    }
  });
});
