import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import JSZip from 'jszip';
import { initTestEditor, loadTestDataForEditorTests } from '../helpers/helpers.js';

describe('EMF/WMF Image Conversion', () => {
  let docx;
  let media;
  let mediaFiles;
  let fonts;
  let editor;

  beforeAll(async () => {
    // Load the test file with EMF images
    const result = await loadTestDataForEditorTests('wmf-emf.docx');
    docx = result.docx;
    media = result.media;
    mediaFiles = result.mediaFiles;
    fonts = result.fonts;
  });

  afterEach(() => {
    if (editor) {
      editor.destroy?.();
      editor = null;
    }
  });

  it('should load a document containing EMF images', () => {
    // Check that the docx was loaded correctly
    expect(docx).toBeDefined();
    expect(Array.isArray(docx)).toBe(true);

    // Check that media files were found
    expect(mediaFiles).toBeDefined();

    // Find EMF files in media
    const emfFiles = Object.keys(mediaFiles).filter((key) => key.toLowerCase().endsWith('.emf'));
    expect(emfFiles.length).toBeGreaterThan(0);
  });

  it('should handle EMF images during import', () => {
    // Initialize editor with the EMF document
    const result = initTestEditor({ content: docx, media, mediaFiles, fonts });
    editor = result.editor;

    // Get the document JSON
    const doc = editor.getJSON();
    expect(doc).toBeDefined();
    expect(doc.content).toBeDefined();

    // Find image nodes in the document
    const findImages = (node) => {
      const images = [];
      if (node.type === 'image') {
        images.push(node);
      }
      if (node.content) {
        for (const child of node.content) {
          images.push(...findImages(child));
        }
      }
      return images;
    };

    const images = findImages(doc);

    // The document should contain images
    expect(images.length).toBeGreaterThan(0);

    // Each image should have either:
    // 1. Been converted to an image data URI (preferred: svg; fallback: bmp/png) with originalExtension metadata
    // 2. Remained as EMF/WMF (extension: 'emf' or 'wmf') if conversion wasn't possible
    for (const image of images) {
      const { src, extension, originalExtension } = image.attrs;

      if (originalExtension === 'emf' || originalExtension === 'wmf') {
        // Successfully converted - should have base64 data URI and a converted format
        expect(['svg', 'bmp', 'png']).toContain(extension);
        if (extension === 'svg') {
          expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
        } else if (extension === 'bmp') {
          expect(src).toMatch(/^data:image\/bmp;base64,/);
        } else if (extension === 'png') {
          expect(src).toMatch(/^data:image\/png;base64,/);
        }
      } else if (extension === 'emf' || extension === 'wmf') {
        // Not converted - should have original path
        expect(src).toMatch(/word\/media\//);
      }
      // Other image types (png, jpg, etc.) are fine as-is
    }
  });

  it('should preserve original EMF/WMF files during export round-trip', async () => {
    // Initialize editor with the EMF document
    const result = initTestEditor({ content: docx, media, mediaFiles, fonts });
    editor = result.editor;

    // Find EMF/WMF files in the original media
    const originalEmfWmfFiles = Object.keys(mediaFiles).filter(
      (key) => key.toLowerCase().endsWith('.emf') || key.toLowerCase().endsWith('.wmf'),
    );
    expect(originalEmfWmfFiles.length).toBeGreaterThan(0);

    // Export the document
    const exportedBuffer = await editor.exportDocx();
    expect(exportedBuffer).toBeDefined();

    // Load the exported docx and check media files
    const zip = await JSZip.loadAsync(exportedBuffer);
    const exportedMediaFiles = Object.keys(zip.files).filter((path) => path.startsWith('word/media/'));

    // Verify that original EMF/WMF files are preserved in the export
    for (const originalPath of originalEmfWmfFiles) {
      const found = exportedMediaFiles.some((exported) => exported === originalPath);
      expect(found, `Expected ${originalPath} to be preserved in export`).toBe(true);

      // Verify the content matches the original
      const exportedContent = await zip.files[originalPath].async('base64');
      expect(exportedContent).toBe(mediaFiles[originalPath]);
    }

    // Check the relationships file references the EMF/WMF files (not SVG conversions)
    const relsContent = await zip.files['word/_rels/document.xml.rels']?.async('string');
    expect(relsContent).toBeDefined();

    for (const originalPath of originalEmfWmfFiles) {
      const relativePath = originalPath.replace('word/', '');
      expect(relsContent).toContain(relativePath);
    }
  });
});
