import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import DocxZipper from '@core/DocxZipper.js';
import { isMetafileExtension, convertMetafileToSvg, setMetafileDomEnvironment } from './metafile-converter.js';

describe('metafile-converter', () => {
  const decodeDataUri = (dataUri) => {
    const base64 = dataUri.substring(dataUri.indexOf(',') + 1);
    return Buffer.from(base64, 'base64').toString('utf-8');
  };

  describe('isMetafileExtension', () => {
    it('returns true for emf extension', () => {
      expect(isMetafileExtension('emf')).toBe(true);
      expect(isMetafileExtension('EMF')).toBe(true);
      expect(isMetafileExtension('Emf')).toBe(true);
    });

    it('returns true for wmf extension', () => {
      expect(isMetafileExtension('wmf')).toBe(true);
      expect(isMetafileExtension('WMF')).toBe(true);
      expect(isMetafileExtension('Wmf')).toBe(true);
    });

    it('returns false for other extensions', () => {
      expect(isMetafileExtension('png')).toBe(false);
      expect(isMetafileExtension('jpg')).toBe(false);
      expect(isMetafileExtension('jpeg')).toBe(false);
      expect(isMetafileExtension('gif')).toBe(false);
      expect(isMetafileExtension('svg')).toBe(false);
      expect(isMetafileExtension('')).toBe(false);
      expect(isMetafileExtension(null)).toBe(false);
      expect(isMetafileExtension(undefined)).toBe(false);
    });
  });

  describe('convertMetafileToSvg', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns null for unsupported extension', () => {
      const result = convertMetafileToSvg('data:image/png;base64,abc', 'png');
      expect(result).toBeNull();
    });

    it('returns null when document is not available (SSR)', () => {
      // In JSDOM test environment, document exists but this tests the guard
      const originalDocument = global.document;
      // @ts-ignore - intentionally setting to undefined for test
      delete global.document;

      const result = convertMetafileToSvg('data:image/emf;base64,abc', 'emf');
      expect(result).toBeNull();

      global.document = originalDocument;
    });

    it('returns null for invalid base64 data', () => {
      // Even with a valid extension, invalid data should return null
      const result = convertMetafileToSvg('not-valid-base64!!!', 'emf');
      expect(result).toBeNull();
    });

    it('converts EMF when a mock DOM is provided (Node)', async () => {
      const docxPath = join(__dirname, '../../../../../../tests/data/wmf-emf.docx');
      const docxBuffer = await readFile(docxPath);
      const zipper = new DocxZipper();
      await zipper.getDocxData(docxBuffer, true);
      const emfBase64 = zipper.mediaFiles['word/media/image1.emf'];
      expect(emfBase64).toBeTruthy();

      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;
      setMetafileDomEnvironment({ window: dom.window, document: dom.window.document });

      const result = convertMetafileToSvg(`data:image/emf;base64,${emfBase64}`, 'emf', { width: 10, height: 10 });

      // Cleanup globals
      setMetafileDomEnvironment(null);
      if (originalWindow) globalThis.window = originalWindow;
      else delete globalThis.window;
      if (originalDocument) globalThis.document = originalDocument;
      else delete globalThis.document;

      expect(result?.dataUri).toMatch(/^(data:image\/bmp;base64,|data:image\/svg\+xml;base64,)/);
      expect(result?.format).toBeTruthy();
    });

    it('converts WMF when a mock DOM is provided (Node)', async () => {
      const docxPath = join(__dirname, '../../../../../../tests/data/wmf-emf.docx');
      const docxBuffer = await readFile(docxPath);
      const zipper = new DocxZipper();
      await zipper.getDocxData(docxBuffer, true);
      const wmfBase64 = zipper.mediaFiles['word/media/image2.wmf'];
      expect(wmfBase64).toBeTruthy();

      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;
      setMetafileDomEnvironment({ window: dom.window, document: dom.window.document });

      const result = convertMetafileToSvg(`data:image/wmf;base64,${wmfBase64}`, 'wmf', { width: 10, height: 10 });

      // Cleanup globals
      setMetafileDomEnvironment(null);
      if (originalWindow) globalThis.window = originalWindow;
      else delete globalThis.window;
      if (originalDocument) globalThis.document = originalDocument;
      else delete globalThis.document;

      expect(result?.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(result?.format).toBe('svg');
    });
  });
});
