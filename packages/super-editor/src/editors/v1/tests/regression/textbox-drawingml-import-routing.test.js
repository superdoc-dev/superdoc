import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { Editor } from '@core/Editor.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

const FIXTURE_PATH = join(__dirname, '../data/sd-1331-text-boxes.docx');

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

describe('sd-1331 textbox import routing', () => {
  it('currently routes textbox content through DrawingML vectorShape nodes', async () => {
    const fileSource = await readFile(FIXTURE_PATH);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(fileSource, true);
    const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });

    try {
      const json = editor.getJSON();
      const vectorShapes = collectNodesByType(json, 'vectorShape');
      const shapeContainers = collectNodesByType(json, 'shapeContainer');

      expect(shapeContainers).toHaveLength(0);
      expect(vectorShapes.length).toBeGreaterThan(0);

      const textboxShapes = vectorShapes.filter(
        (node) =>
          node?.attrs?.kind === 'rect' &&
          node?.attrs?.drawingContent?.name === 'w:drawing' &&
          node?.attrs?.textContent &&
          Array.isArray(node.attrs.textContent.parts) &&
          node.attrs.textContent.parts.length > 0,
      );

      expect(textboxShapes.length).toBeGreaterThan(0);
      expect(textboxShapes.every((node) => node.attrs.textInsets != null)).toBe(true);
      expect(textboxShapes.some((node) => node.attrs.textAlign === 'left' || node.attrs.textAlign === 'center')).toBe(
        true,
      );
    } finally {
      editor.destroy();
    }
  });

  it.todo('normalizes DrawingML textbox content to shapeContainer > shapeTextbox > paragraphs');
});
