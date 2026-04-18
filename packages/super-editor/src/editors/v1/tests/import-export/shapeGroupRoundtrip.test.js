import { describe, it, expect } from 'vitest';
import { createDocumentJson } from '@core/super-converter/v2/importer/docxImporter.js';
import { exportSchemaToJson } from '@core/super-converter/exporter.js';
import { getTestDataByFileName } from '../helpers/helpers.js';

describe('Shape Group Round-trip', () => {
  const getShapeGroupDocx = async () => {
    return await getTestDataByFileName('shape_group.docx');
  };

  it('imports shape groups with preserved structure', async () => {
    const docxFixture = await getShapeGroupDocx();

    const converter = {
      headers: {},
      headerIds: {},
      footers: {},
      footerIds: {},
    };
    const editor = {
      options: {},
      emit: () => {},
      extensionService: { extensions: [] },
    };
    const result = createDocumentJson(docxFixture, converter, editor);
    const importedDoc = result.pmDoc;

    expect(importedDoc).toBeDefined();

    // Find shape group nodes using recursive walk
    let shapeGroupNodes = [];
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'shapeGroup') {
        shapeGroupNodes.push(node);
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(walk);
      }
    };

    walk(importedDoc);

    expect(shapeGroupNodes.length).toBeGreaterThan(0);
    const shapeGroup = shapeGroupNodes[0];

    // Verify shape group structure
    expect(shapeGroup.attrs).toBeDefined();
    expect(shapeGroup.attrs.shapes).toBeDefined();
    expect(Array.isArray(shapeGroup.attrs.shapes)).toBe(true);
    expect(shapeGroup.attrs.shapes.length).toBeGreaterThan(0);

    // Verify first shape
    const shape1 = shapeGroup.attrs.shapes[0];
    expect(shape1.shapeType).toBe('vectorShape');
    expect(shape1.attrs.kind).toBe('ellipse');
    expect(shape1.attrs.fillColor).toBeDefined();

    // Verify group transform
    expect(shapeGroup.attrs.groupTransform).toBeDefined();
    expect(shapeGroup.attrs.groupTransform.width).toBeGreaterThan(0);
    expect(shapeGroup.attrs.groupTransform.height).toBeGreaterThan(0);

    // Verify drawingContent is preserved for round-tripping
    expect(shapeGroup.attrs.drawingContent).toBeDefined();
    expect(shapeGroup.attrs.drawingContent.name).toBe('w:drawing');
  });

  it('exports shape groups back to DOCX format', async () => {
    const docxFixture = await getShapeGroupDocx();

    const converter = {
      headers: {},
      headerIds: {},
      footers: {},
      footerIds: {},
    };
    const editor = {
      options: {},
      emit: () => {},
      extensionService: { extensions: [] },
    };
    const result = createDocumentJson(docxFixture, converter, editor);
    const importedDoc = result.pmDoc;

    // Find shape group node using recursive walk
    let shapeGroupNode = null;
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'shapeGroup') {
        shapeGroupNode = node;
        return;
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(walk);
      }
    };

    walk(importedDoc);
    expect(shapeGroupNode).toBeDefined();
    expect(shapeGroupNode).not.toBeNull();

    // Export shape group back to XML
    const exported = exportSchemaToJson({ node: shapeGroupNode, relationships: [] });
    expect(exported).toBeDefined();
    expect(exported).not.toBeNull();

    // Verify exported structure contains run with drawing
    expect(exported.name).toBe('w:r');
    const runElements = exported.elements || [];
    const alternateContent = runElements.find((el) => el.name === 'mc:AlternateContent');
    expect(alternateContent).toBeTruthy();

    const choice = alternateContent?.elements?.find((el) => el.name === 'mc:Choice');
    expect(choice).toBeTruthy();
    expect(choice?.attributes?.Requires).toBe('wpg');

    const drawing = choice?.elements?.find((el) => el.name === 'w:drawing');
    expect(drawing).toBeTruthy();
  });
});
