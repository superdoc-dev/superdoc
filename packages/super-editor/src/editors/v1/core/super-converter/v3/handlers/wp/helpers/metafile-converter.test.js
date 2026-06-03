import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('EMF+ embedded bitmap extraction', () => {
    // The file's vitest environment is 'node' (see packages/super-editor/vite.config.js),
    // so each test installs a JSDOM via setMetafileDomEnvironment — convertEmfToSvg
    // needs `document` and `XMLSerializer` to render the placeholder branch.
    let dom;

    beforeEach(() => {
      dom = new JSDOM('<!doctype html><html><body></body></html>');
      setMetafileDomEnvironment({ window: dom.window, document: dom.window.document });
    });

    afterEach(() => {
      setMetafileDomEnvironment(null);
      // ensureDomEnvironment promotes window/document onto globalThis on first use.
      // Tear those down so neighbouring node-env tests don't see the JSDOM globals.
      if (globalThis.window === dom.window) delete globalThis.window;
      if (globalThis.document === dom.window.document) delete globalThis.document;
      if (globalThis.XMLSerializer === dom.window.XMLSerializer) delete globalThis.XMLSerializer;
    });

    // Smallest valid 1x1 transparent PNG (67 bytes).
    const TINY_PNG_HEX =
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489' +
      '0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082';

    // Smallest valid JPEG: 134 bytes, 1x1 grayscale.
    const TINY_JPEG_HEX =
      'FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707' +
      '07090908' +
      '0A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C231C1C28372928' +
      '2C30313434' +
      '1F2739' +
      '3D38323C2E333432FFC0000B080001000101011100FFC4001F00' +
      '0001050101010101010000000000000000010203040506070809' +
      '0A0BFFC400B5100002010303020403050504040000017D010203000411051221314106' +
      '13516107227114328191A1082342B1C11552D1F02433627282090A161718191A252627' +
      '28292A3435363738393A434445464748494A535455565758595A636465666768696A73' +
      '7475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3' +
      'B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EA' +
      'F1F2F3F4F5F6F7F8F9FAFFDA0008010100003F00FB7CFFD9';

    function hexToBytes(hex) {
      const clean = hex.replace(/\s+/g, '');
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
      return bytes;
    }

    function bytesToBase64(bytes) {
      return Buffer.from(bytes).toString('base64');
    }

    function alignTo4(n) {
      return (n + 3) & ~3;
    }

    function writeEmfHeader(totalBytes, recordCount) {
      const hdr = new Uint8Array(88);
      const v = new DataView(hdr.buffer);
      v.setUint32(0, 1, true); // type
      v.setUint32(4, 88, true); // headerSize
      v.setInt32(24, 0, true);
      v.setInt32(28, 0, true);
      v.setInt32(32, 254, true); // frame right (0.01mm) → ~9.6px @96dpi
      v.setInt32(36, 254, true); // frame bottom
      v.setUint32(40, 0x464d4520, true); // ' EMF' signature
      v.setUint32(44, 0x00010000, true); // version
      v.setUint32(48, totalBytes, true); // bytes
      v.setUint32(52, recordCount, true); // records
      v.setUint16(56, 0, true); // handles
      v.setInt32(72, 100, true); // szlDevice cx
      v.setInt32(76, 100, true); // szlDevice cy
      v.setInt32(80, 200, true); // szlMillimeters cx
      v.setInt32(84, 200, true); // szlMillimeters cy
      return hdr;
    }

    /**
     * Build a standalone EmfPlusObject(Image) record (ContinueBit=0) carrying a
     * compressed bitmap. Standard 12-byte header per MS-EMFPLUS § 2.3.5.1.
     */
    function writeStandaloneImageRecord(imageBytes, objectId = 0) {
      const dataSize = 28 + imageBytes.length; // EmfPlusImage(8) + EmfPlusBitmap header(20) + bitmap data
      const recordSize = alignTo4(12 + dataSize);

      const rec = new Uint8Array(recordSize);
      const v = new DataView(rec.buffer);
      v.setUint16(0, 0x4008, true); // EmfPlusObject
      v.setUint16(2, ((5 & 0x7f) << 8) | (objectId & 0xff), true); // Image, no continue
      v.setUint32(4, recordSize, true);
      v.setUint32(8, dataSize, true);

      // EmfPlusImage header at offset 12
      v.setUint32(12, 0xdbc01001, true); // Version
      v.setUint32(16, 1, true); // Type = Bitmap
      // EmfPlusBitmap header
      v.setUint32(20, 1, true); // Width
      v.setUint32(24, 1, true); // Height
      v.setUint32(28, 4, true); // Stride
      v.setUint32(32, 0x0026200a, true); // PixelFormat (32bppARGB)
      v.setUint32(36, 1, true); // Bitmap Type = Compressed
      rec.set(imageBytes, 40);
      return rec;
    }

    /**
     * Build an EmfPlusObject record with ContinueBit=1. Header is 16 bytes per
     * MS-EMFPLUS § 2.3.5.1: Type(2) Flags(2) Size(4) TotalObjectSize(4) DataSize(4),
     * then ObjectData. TotalObjectSize is present on every continued record.
     */
    function writeContinuedRecord(chunkBytes, objectId, totalObjectSize) {
      const dataSize = chunkBytes.length;
      const recordSize = alignTo4(16 + dataSize);
      const rec = new Uint8Array(recordSize);
      const v = new DataView(rec.buffer);
      v.setUint16(0, 0x4008, true);
      v.setUint16(2, 0x8000 | ((5 & 0x7f) << 8) | (objectId & 0xff), true); // continue, image
      v.setUint32(4, recordSize, true);
      v.setUint32(8, totalObjectSize, true); // TotalObjectSize lives in header
      v.setUint32(12, dataSize, true);
      rec.set(chunkBytes, 16);
      return rec;
    }

    /**
     * Build the terminating EmfPlusObject record of a continued series (ContinueBit=0).
     * Standard 12-byte header; ObjectData carries the final chunk of object payload.
     */
    function writeFinalRecord(chunkBytes, objectId) {
      const dataSize = chunkBytes.length;
      const recordSize = alignTo4(12 + dataSize);
      const rec = new Uint8Array(recordSize);
      const v = new DataView(rec.buffer);
      v.setUint16(0, 0x4008, true);
      v.setUint16(2, ((5 & 0x7f) << 8) | (objectId & 0xff), true); // no continue, image
      v.setUint32(4, recordSize, true);
      v.setUint32(8, dataSize, true);
      rec.set(chunkBytes, 12);
      return rec;
    }

    function writeEmrComment(emfPlusBytes) {
      const dataSize = 4 + emfPlusBytes.length; // CommentIdentifier + payload
      const recSize = alignTo4(12 + dataSize);
      const rec = new Uint8Array(recSize);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 70, true); // EMR_COMMENT
      v.setUint32(4, recSize, true);
      v.setUint32(8, dataSize, true);
      v.setUint32(12, 0x2b464d45, true); // 'EMF+' identifier
      rec.set(emfPlusBytes, 16);
      return rec;
    }

    function buildEmfBuffer(commentRecords) {
      const totalSize = commentRecords.reduce((s, r) => s + r.length, 88);
      const out = new Uint8Array(totalSize);
      out.set(writeEmfHeader(totalSize, commentRecords.length), 0);
      let pos = 88;
      for (const rec of commentRecords) {
        out.set(rec, pos);
        pos += rec.length;
      }
      return out.buffer;
    }

    function asEmfDataUri(buffer) {
      return `data:image/emf;base64,${bytesToBase64(new Uint8Array(buffer))}`;
    }

    it('extracts an embedded PNG from an EmfPlusObject(Image)', () => {
      const png = hexToBytes(TINY_PNG_HEX);
      const buffer = buildEmfBuffer([writeEmrComment(writeStandaloneImageRecord(png))]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      expect(result).toBeTruthy();
      expect(result.format).toBe('png');
      expect(result.dataUri.startsWith('data:image/png;base64,')).toBe(true);
      const extractedB64 = result.dataUri.slice('data:image/png;base64,'.length);
      const extracted = Buffer.from(extractedB64, 'base64');
      expect(Buffer.from(png).equals(extracted)).toBe(true);
    });

    it('extracts an embedded JPEG from an EmfPlusObject(Image)', () => {
      const jpeg = hexToBytes(TINY_JPEG_HEX);
      const buffer = buildEmfBuffer([writeEmrComment(writeStandaloneImageRecord(jpeg))]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      expect(result?.format).toBe('jpeg');
      expect(result?.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
    });

    /**
     * Build the EmfPlusImage payload (8-byte image header + 20-byte bitmap header +
     * compressed bitmap) that gets split across EmfPlusObject continuation records.
     */
    function buildImagePayload(imageBytes) {
      const payload = new Uint8Array(28 + imageBytes.length);
      const v = new DataView(payload.buffer);
      v.setUint32(0, 0xdbc01001, true); // Version
      v.setUint32(4, 1, true); // Image Type = Bitmap
      v.setUint32(8, 1, true); // Width
      v.setUint32(12, 1, true); // Height
      v.setUint32(16, 4, true); // Stride
      v.setUint32(20, 0x0026200a, true); // PixelFormat
      v.setUint32(24, 1, true); // Bitmap Type = Compressed
      payload.set(imageBytes, 28);
      return payload;
    }

    it('reassembles a compressed bitmap split across continued EmfPlusObject records', () => {
      const png = hexToBytes(TINY_PNG_HEX);
      const payload = buildImagePayload(png);

      const splitAt = 40;
      const firstChunk = payload.slice(0, splitAt);
      const finalChunk = payload.slice(splitAt);

      // Per MS-EMFPLUS § 2.3.5.1 every continued record (ContinueBit=1) carries a
      // TotalObjectSize header field; the terminating record has ContinueBit=0 with
      // the standard 12-byte header.
      const firstRec = writeContinuedRecord(firstChunk, 0x07, payload.length);
      const finalRec = writeFinalRecord(finalChunk, 0x07);

      const buffer = buildEmfBuffer([writeEmrComment(firstRec), writeEmrComment(finalRec)]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
      expect(result?.format).toBe('png');
      const extracted = Buffer.from(result.dataUri.slice('data:image/png;base64,'.length), 'base64');
      expect(Buffer.from(png).equals(extracted)).toBe(true);
    });

    it('reassembles a compressed bitmap split across three or more continued records', () => {
      // Exercises the middle-chunk path of the accumulator, not just first+final.
      const jpeg = hexToBytes(TINY_JPEG_HEX);
      const payload = buildImagePayload(jpeg);

      const a = payload.slice(0, 40);
      const b = payload.slice(40, 90);
      const c = payload.slice(90);

      const buffer = buildEmfBuffer([
        writeEmrComment(writeContinuedRecord(a, 0x05, payload.length)),
        writeEmrComment(writeContinuedRecord(b, 0x05, payload.length)),
        writeEmrComment(writeFinalRecord(c, 0x05)),
      ]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
      expect(result?.format).toBe('jpeg');
    });

    it('flushes a continuation series early when TotalObjectSize is reached without a ContinueBit=0 terminator', () => {
      // Defends against off-spec encoders that leave ContinueBit=1 on the final record.
      const png = hexToBytes(TINY_PNG_HEX);
      const payload = buildImagePayload(png);

      const splitAt = 40;
      const firstChunk = payload.slice(0, splitAt);
      const finalChunk = payload.slice(splitAt);

      const firstRec = writeContinuedRecord(firstChunk, 0x09, payload.length);
      // Off-spec final chunk: still carries a ContinueBit=1 header (with TotalObjectSize).
      const finalRec = writeContinuedRecord(finalChunk, 0x09, payload.length);

      const buffer = buildEmfBuffer([writeEmrComment(firstRec), writeEmrComment(finalRec)]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
      expect(result?.format).toBe('png');
      const extracted = Buffer.from(result.dataUri.slice('data:image/png;base64,'.length), 'base64');
      expect(Buffer.from(png).equals(extracted)).toBe(true);
    });

    it('falls back to the EMF+ placeholder when no compressed bitmap is present', () => {
      // Build an EMF+ stream containing only a non-Image EmfPlusObject (object type=1, brush).
      const brush = new Uint8Array(20);
      const dv = new DataView(brush.buffer);
      dv.setUint16(0, 0x4008, true);
      dv.setUint16(2, (1 << 8) | 0, true); // ObjectType=1 (Brush), no continue
      dv.setUint32(4, 20, true);
      dv.setUint32(8, 8, true);

      const buffer = buildEmfBuffer([writeEmrComment(brush)]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
      expect(result?.format).toBe('svg');
      expect(result?.dataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);
      const decoded = decodeDataUri(result.dataUri);
      expect(decoded).toContain('Unable to render EMF+ image');
    });

    /**
     * Build a standalone EmfPlusObject(Image) record with `Bitmap.Type = 0` (Pixel) and
     * the given raw pixel buffer. Height sign and stride sign are passed through to
     * exercise both row directions.
     */
    function writeStandalonePixelImageRecord({ width, height, stride, pixelFormat, pixels }, objectId = 0) {
      const recBody = new Uint8Array(28 + pixels.length);
      const dv = new DataView(recBody.buffer);
      dv.setUint32(0, 0xdbc01001, true); // Version
      dv.setUint32(4, 1, true); // Image Type = Bitmap
      dv.setInt32(8, width, true);
      dv.setInt32(12, height, true);
      dv.setInt32(16, stride, true);
      dv.setUint32(20, pixelFormat, true);
      dv.setUint32(24, 0, true); // Bitmap Type = Pixel
      recBody.set(pixels, 28);

      const recordSize = alignTo4(12 + recBody.length);
      const rec = new Uint8Array(recordSize);
      const rv = new DataView(rec.buffer);
      rv.setUint16(0, 0x4008, true);
      rv.setUint16(2, ((5 & 0x7f) << 8) | (objectId & 0xff), true);
      rv.setUint32(4, recordSize, true);
      rv.setUint32(8, recBody.length, true);
      rec.set(recBody, 12);
      return rec;
    }

    /**
     * Install a mock canvas on the JSDOM document so the pixel-bitmap path can run
     * end-to-end in Node. Returns a spy plus a getter for the most recently written
     * ImageData buffer so tests can assert the RGBA conversion result directly.
     */
    function installCanvasMock(toDataUriResult) {
      let lastImageData = null;
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
          putImageData: (imageData) => {
            lastImageData = imageData;
          },
        }),
        toDataURL: () => toDataUriResult,
      };
      const spy = vi.spyOn(dom.window.document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return dom.window.document.createElement.wrappedMethod
          ? dom.window.document.createElement.wrappedMethod.call(dom.window.document, tag)
          : null;
      });
      return { spy, getLastImageData: () => lastImageData, mockCanvas };
    }

    it('renders a raw-pixel 32bppARGB bitmap via canvas and returns a PNG data URI', () => {
      // 2x2 32bppARGB stored top-down. Bytes per pixel in EMF+ memory order: B, G, R, A.
      // prettier-ignore
      const pixels = new Uint8Array([
        // row 0: red(opaque),                green(opaque)
        0x00, 0x00, 0xff, 0xff,  0x00, 0xff, 0x00, 0xff,
        // row 1: blue(opaque),               transparent
        0xff, 0x00, 0x00, 0xff,  0x00, 0x00, 0x00, 0x00,
      ]);

      const { getLastImageData, spy } = installCanvasMock('data:image/png;base64,iVBORw0KGgo=');

      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 2,
            height: -2, // negative = top-down
            stride: 8,
            pixelFormat: 0x0026200a, // 32bppARGB
            pixels,
          }),
        ),
      ]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      try {
        expect(result?.format).toBe('png');
        expect(result.dataUri).toBe('data:image/png;base64,iVBORw0KGgo=');

        const img = getLastImageData();
        expect(img.width).toBe(2);
        expect(img.height).toBe(2);
        // After BGRA → RGBA: row 0 should be red then green; row 1 blue then transparent.
        expect(Array.from(img.data)).toEqual([
          0xff, 0x00, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00,
        ]);
      } finally {
        spy.mockRestore();
      }
    });

    it('preserves storage order for positive height (GDI+ writes top-down regardless of sign)', () => {
      // 1x2, 32bppARGB. MS-EMFPLUS § 2.2.2.2 is silent on what Height sign means
      // for row direction. Empirically GDI+ writes top-down whether Height is
      // positive or negative — every Office-produced EMF+ does the same. The
      // earlier "positive Height = bottom-up" reading borrowed from the classic
      // Windows DIB convention and rendered real cover images upside down.
      // prettier-ignore
      const pixels = new Uint8Array([
        // storage row 0 = visual top row: red
        0x00, 0x00, 0xff, 0xff,
        // storage row 1 = visual bottom row: blue
        0xff, 0x00, 0x00, 0xff,
      ]);

      const { getLastImageData, spy } = installCanvasMock('data:image/png;base64,xxx=');

      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 1,
            height: 2, // positive height — still top-down per GDI+
            stride: 4,
            pixelFormat: 0x0026200a,
            pixels,
          }),
        ),
      ]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      try {
        expect(result?.format).toBe('png');
        const img = getLastImageData();
        // Storage row 0 (red) stays at the visual top; row 1 (blue) at the bottom.
        expect(Array.from(img.data)).toEqual([0xff, 0, 0, 0xff, 0, 0, 0xff, 0xff]);
      } finally {
        spy.mockRestore();
      }
    });

    it('decodes 24bppRGB raw pixels', () => {
      // 1x1 24bppRGB. EMF+ stores 24bpp as B,G,R; expected RGBA output is R,G,B,255.
      const pixels = new Uint8Array([0x33, 0x66, 0x99]); // B=0x33, G=0x66, R=0x99

      const { getLastImageData, spy } = installCanvasMock('data:image/png;base64,yyy=');

      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 1,
            height: -1,
            stride: 3,
            pixelFormat: 0x00021808, // 24bppRGB
            pixels,
          }),
        ),
      ]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      try {
        expect(result?.format).toBe('png');
        expect(Array.from(getLastImageData().data)).toEqual([0x99, 0x66, 0x33, 0xff]);
      } finally {
        spy.mockRestore();
      }
    });

    it('un-premultiplies alpha for 32bppPARGB raw pixels', () => {
      // PARGB stores premultiplied channels. With alpha=128 and stored R=64, the
      // recovered straight-alpha R should be ~128 (64 * 255 / 128).
      const pixels = new Uint8Array([0x40, 0x40, 0x40, 0x80]); // B=0x40, G=0x40, R=0x40, A=0x80

      const { getLastImageData, spy } = installCanvasMock('data:image/png;base64,zzz=');

      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 1,
            height: -1,
            stride: 4,
            pixelFormat: 0x000e200b, // 32bppPARGB
            pixels,
          }),
        ),
      ]);

      const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');

      try {
        expect(result?.format).toBe('png');
        const data = getLastImageData().data;
        // 0x40 * 255 / 0x80 = 127.5 → Uint8ClampedArray rounds to 128.
        expect(data[0]).toBe(128);
        expect(data[1]).toBe(128);
        expect(data[2]).toBe(128);
        expect(data[3]).toBe(0x80);
      } finally {
        spy.mockRestore();
      }
    });

    it('falls back to the placeholder when no DOM canvas is available for raw pixels', () => {
      // Simulate an environment without canvas by stubbing the 2D context to null;
      // the renderer should give up and let the EMF+ placeholder take over.
      const spy = vi.spyOn(dom.window.document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return { width: 0, height: 0, getContext: () => null, toDataURL: () => 'data:,' };
        }
        return null;
      });

      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 1,
            height: -1,
            stride: 4,
            pixelFormat: 0x0026200a,
            pixels: new Uint8Array([0, 0, 0, 0xff]),
          }),
        ),
      ]);

      try {
        const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
        expect(result?.format).toBe('svg');
        expect(decodeDataUri(result.dataUri)).toContain('Unable to render EMF+ image');
      } finally {
        spy.mockRestore();
      }
    });

    it('falls back to the placeholder for indexed pixel formats', () => {
      // Indexed formats need a palette lookup we don't implement; falling back to
      // the placeholder is preferable to misreporting indices as raw RGBA bytes.
      const { spy } = installCanvasMock('data:image/png;base64,unused=');
      const buffer = buildEmfBuffer([
        writeEmrComment(
          writeStandalonePixelImageRecord({
            width: 2,
            height: -2,
            stride: 2,
            pixelFormat: 0x00030803, // 8bppIndexed (has the indexed flag set)
            pixels: new Uint8Array([0, 1, 2, 3]),
          }),
        ),
      ]);

      try {
        const result = convertMetafileToSvg(asEmfDataUri(buffer), 'emf');
        expect(result?.format).toBe('svg');
        expect(decodeDataUri(result.dataUri)).toContain('Unable to render EMF+ image');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
