import path from 'path';
import fs from 'fs';
import { describe, it, expect, beforeEach } from 'vitest';
import DocxZipper from './DocxZipper';
import JSZip from 'jszip';

async function readFileAsBuffer(filePath) {
  const resolvedPath = path.resolve(__dirname, filePath);
  return new Promise((resolve, reject) => {
    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        // Convert file content to a Buffer
        const buffer = Buffer.from(data);
        resolve(buffer);
      }
    });
  });
}

describe('DocxZipper - file extraction', () => {
  let zipper;
  beforeEach(() => {
    zipper = new DocxZipper();
  });

  it('It can unzip a docx', async () => {
    const fileContent = await readFileAsBuffer('../tests/data/Hello docx world.docx');
    const fileObject = Buffer.from(fileContent);
    const unzippedXml = await zipper.unzip(fileObject);
    expect(unzippedXml).toHaveProperty('files');
  });

  it('It can extract xml files', async () => {
    const fileContent = await readFileAsBuffer('../tests/data/Hello docx world.docx');
    const fileObject = Buffer.from(fileContent);
    const unzippedXml = await zipper.getDocxData(fileObject);
    expect(unzippedXml).toBeInstanceOf(Array);

    unzippedXml.forEach((file) => {
      expect(file).toHaveProperty('name');
      expect(file).toHaveProperty('content');
      expect(file.content).toMatch(/<\?xml/);
    });

    // Make sure we have document.xml
    const documentXml = unzippedXml.find((file) => file.name === 'word/document.xml');
    expect(documentXml).toBeTruthy();
  });
});

// Helper to build a UTF-16LE Buffer with BOM
function utf16leWithBOM(str) {
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(str, 'utf16le');
  return Buffer.concat([bom, body]);
}

describe('DocxZipper - UTF-16 XML handling', () => {
  let zipper;
  beforeEach(() => {
    zipper = new DocxZipper();
  });

  it('decodes a UTF-16LE customXml part correctly (was failing before fix)', async () => {
    const zip = new JSZip();

    // Minimal [Content_Types].xml to look like a docx
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);

    // A basic UTF-8 document.xml so there's at least one normal XML entry
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body>
      </w:document>`;
    zip.file('word/document.xml', documentXml);

    // The problematic UTF-16LE customXml item
    const customXmlUtf16 = `<?xml version="1.0" encoding="utf-16"?>
<properties xmlns="http://www.imanage.com/work/xmlschema">
  <documentid>TELEKOM!4176814.1</documentid>
  <senderid>A675398</senderid>
  <senderemail>GUDRUN.JORDAN@TELEKOM.DE</senderemail>
  <lastmodified>2023-07-06T15:09:00.0000000+02:00</lastmodified>
  <database>TELEKOM</database>
</properties>`;
    zip.file('customXml/item2.xml', utf16leWithBOM(customXmlUtf16));

    // Generate the zip as a Node buffer and feed it to the zipper
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const files = await zipper.getDocxData(buf /* isNode not needed for XML */);

    // Find the customXml item
    const item2 = files.find((f) => f.name === 'customXml/item2.xml');
    expect(item2).toBeTruthy();

    // ✅ With the fix, content is a clean JS string:
    expect(item2.content).toContain('<?xml'); // prolog present
    expect(item2.content).toContain('<properties'); // real tag (no NULs interleaved)
    expect(item2.content).not.toMatch(/\u0000/); // no embedded NULs
    expect(item2.content.toLowerCase()).toContain('encoding="utf-16"');
  });
});

describe('DocxZipper - updateZip compression', () => {
  it('uses DEFLATE compression by default', async () => {
    const zipper = new DocxZipper();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${'Hello world. '.repeat(100)}</w:t></w:r></w:p></w:body>
      </w:document>`;

    const docx = [
      { name: '[Content_Types].xml', content: contentTypes },
      { name: 'word/document.xml', content: documentXml },
    ];

    const result = await zipper.updateZip({
      docx,
      updatedDocs: {},
      media: {},
      fonts: {},
      isHeadless: true,
    });

    // Verify the output is compressed by checking DEFLATE produces smaller output than STORE
    const storeResult = await new DocxZipper().updateZip({
      docx,
      updatedDocs: {},
      media: {},
      fonts: {},
      isHeadless: true,
      compression: 'STORE',
    });

    expect(result.length).toBeLessThan(storeResult.length);

    // Verify the compressed output is a valid zip that can be read back
    const readBack = await new JSZip().loadAsync(result);
    const docXml = await readBack.file('word/document.xml').async('string');
    expect(docXml).toContain('Hello world.');
  });

  it('respects STORE compression when explicitly requested', async () => {
    const zipper = new DocxZipper();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${'Hello world. '.repeat(100)}</w:t></w:r></w:p></w:body>
      </w:document>`;

    const docx = [
      { name: '[Content_Types].xml', content: contentTypes },
      { name: 'word/document.xml', content: documentXml },
    ];

    const result = await zipper.updateZip({
      docx,
      updatedDocs: {},
      media: {},
      fonts: {},
      isHeadless: true,
      compression: 'STORE',
    });

    // STORE should produce output roughly the size of the uncompressed content
    // (plus ZIP overhead), so it should be larger than DEFLATE
    const deflateResult = await new DocxZipper().updateZip({
      docx,
      updatedDocs: {},
      media: {},
      fonts: {},
      isHeadless: true,
      compression: 'DEFLATE',
    });

    expect(result.length).toBeGreaterThan(deflateResult.length);
  });
});

describe('DocxZipper - updateContentTypes', () => {
  it('adds header/footer overrides for newly added parts', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );
    zip.file('word/header1.xml', '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
    zip.file('word/footer1.xml', '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');

    await zipper.updateContentTypes(zip, {}, false, ['word/header1.xml', 'word/footer1.xml']);

    const updatedContentTypes = await zip.file('[Content_Types].xml').async('string');
    expect(updatedContentTypes).toContain('/word/header1.xml');
    expect(updatedContentTypes).toContain('/word/footer1.xml');
  });

  it('adds overrides when header targets exist only in updated relationships', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );

    const updatedDocs = {
      'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
        </Relationships>`,
    };

    await zipper.updateContentTypes(zip, {}, false, updatedDocs);

    const updatedContentTypes = await zip.file('[Content_Types].xml').async('string');
    expect(updatedContentTypes).toContain('/word/header1.xml');
    expect(updatedContentTypes).toContain('/word/footer1.xml');
  });

  it('removes stale comment overrides when updated docs mark comment files as deleted', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
        <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
        <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>
        <Override PartName="/word/commentsIds.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml"/>
        <Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );

    const updatedDocs = {
      'word/comments.xml': null,
      'word/commentsExtended.xml': null,
      'word/commentsIds.xml': null,
      'word/commentsExtensible.xml': null,
    };

    await zipper.updateContentTypes(zip, {}, false, updatedDocs);

    const updatedContentTypes = await zip.file('[Content_Types].xml').async('string');
    expect(updatedContentTypes).toContain('PartName="/word/document.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/comments.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtended.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsIds.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtensible.xml"');
  });
});

describe('DocxZipper - exportFromCollaborativeDocx media handling', () => {
  it('handles both base64 string and ArrayBuffer media values', async () => {
    const zipper = new DocxZipper();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;

    const docx = [
      { name: '[Content_Types].xml', content: contentTypes },
      { name: 'word/document.xml', content: '<w:document/>' },
    ];

    // base64 for bytes [72, 101, 108, 108, 111] ("Hello")
    const base64Media = 'SGVsbG8=';
    // ArrayBuffer for bytes [87, 111, 114, 108, 100] ("World")
    const binaryMedia = new Uint8Array([87, 111, 114, 108, 100]).buffer;

    const result = await zipper.updateZip({
      docx,
      updatedDocs: {},
      media: {
        'word/media/image1.png': base64Media,
        'word/media/image2.png': binaryMedia,
      },
      fonts: {},
      isHeadless: true,
    });

    const readBack = await new JSZip().loadAsync(result);
    const img1 = await readBack.file('word/media/image1.png').async('uint8array');
    const img2 = await readBack.file('word/media/image2.png').async('uint8array');

    expect(Array.from(img1)).toEqual([72, 101, 108, 108, 111]);
    expect(Array.from(img2)).toEqual([87, 111, 114, 108, 100]);
  });
});

describe('DocxZipper - .tif MIME type mapping', () => {
  it('produces image/tiff data URI for .tif files on import', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('word/document.xml', '<w:document/>');

    // Arbitrary binary data stored as a .tif file
    const tifData = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    zip.file('word/media/image1.tif', tifData);

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await zipper.getDocxData(buf, false);

    // Must use image/tiff, not image/tif
    expect(zipper.mediaFiles['word/media/image1.tif']).toMatch(/^data:image\/tiff;base64,/);
  });

  it('writes image/tiff content type in [Content_Types].xml on export', async () => {
    const zipper = new DocxZipper();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;

    const docx = [
      { name: '[Content_Types].xml', content: contentTypes },
      { name: 'word/document.xml', content: '<w:document/>' },
    ];

    const result = await zipper.updateZip({
      docx,
      updatedDocs: {},
      media: { 'word/media/image1.tif': 'AAAA' },
      fonts: {},
      isHeadless: true,
    });

    const readBack = await new JSZip().loadAsync(result);
    const updatedContentTypes = await readBack.file('[Content_Types].xml').async('string');

    // Should contain Extension="tif" with ContentType="image/tiff"
    expect(updatedContentTypes).toContain('Extension="tif"');
    expect(updatedContentTypes).toContain('ContentType="image/tiff"');
    expect(updatedContentTypes).not.toContain('ContentType="image/tif"');
  });
});

describe('DocxZipper - .tmp image file detection', () => {
  it('detects and processes .tmp files with PNG signatures as PNG images', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    // Minimal DOCX structure
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('word/document.xml', '<w:document/>');

    // Create a minimal PNG file with proper signature
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A, followed by some padding
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    ]);

    // Add it to the ZIP with a .tmp extension
    zip.file('word/media/image1.tmp', pngData);

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await zipper.getDocxData(buf, false);

    // Verify the .tmp file was detected as PNG and processed correctly
    expect(zipper.mediaFiles['word/media/image1.tmp']).toBeTruthy();
    expect(zipper.mediaFiles['word/media/image1.tmp']).toContain('data:image/png;base64');

    // Verify it's stored in media as a blob URL
    expect(zipper.media['word/media/image1.tmp']).toBeTruthy();
    expect(typeof zipper.media['word/media/image1.tmp']).toBe('string');
  });

  it('detects and processes .tmp files with JPEG signatures as JPEG images', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('word/document.xml', '<w:document/>');

    // JPEG signature: FF D8 FF
    const jpegData = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    ]);

    zip.file('word/media/photo.tmp', jpegData);

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await zipper.getDocxData(buf, false);

    // Verify the .tmp file was detected as JPEG
    expect(zipper.mediaFiles['word/media/photo.tmp']).toBeTruthy();
    expect(zipper.mediaFiles['word/media/photo.tmp']).toContain('data:image/jpeg;base64');

    // Verify it's stored in media as a blob URL
    expect(zipper.media['word/media/photo.tmp']).toBeTruthy();
  });

  it('does not process .tmp files without image signatures', async () => {
    const zipper = new DocxZipper();
    const zip = new JSZip();

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('word/document.xml', '<w:document/>');

    // Some random data that is not an image
    const randomData = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef]);
    zip.file('word/media/data.tmp', randomData);

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await zipper.getDocxData(buf, false);

    // Verify the .tmp file was NOT processed as an image (stored as raw base64)
    expect(zipper.mediaFiles['word/media/data.tmp']).toBeTruthy();
    expect(zipper.mediaFiles['word/media/data.tmp']).not.toContain('data:image/');

    // Should not be in media blob URLs
    expect(zipper.media['word/media/data.tmp']).toBeFalsy();
  });
});

describe('DocxZipper - comment file deletion', () => {
  const contentTypesWithComments = `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
      <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>
      <Override PartName="/word/commentsIds.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml"/>
      <Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"/>
    </Types>`;

  const updatedDocsWithCommentDeletes = {
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    'word/comments.xml': null,
    'word/commentsExtended.xml': null,
    'word/commentsIds.xml': null,
    'word/commentsExtensible.xml': null,
  };

  it('removes stale comment files in collaborative export path when null sentinels are provided', async () => {
    const zipper = new DocxZipper();
    const docx = [
      { name: '[Content_Types].xml', content: contentTypesWithComments },
      {
        name: 'word/document.xml',
        content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
      },
      {
        name: 'word/comments.xml',
        content: '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
      },
      {
        name: 'word/commentsExtended.xml',
        content: '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>',
      },
      {
        name: 'word/commentsIds.xml',
        content: '<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"/>',
      },
      {
        name: 'word/commentsExtensible.xml',
        content: '<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"/>',
      },
    ];

    const result = await zipper.updateZip({
      docx,
      updatedDocs: updatedDocsWithCommentDeletes,
      media: {},
      fonts: {},
      isHeadless: true,
    });

    const readBack = await new JSZip().loadAsync(result);
    expect(readBack.file('word/comments.xml')).toBeNull();
    expect(readBack.file('word/commentsExtended.xml')).toBeNull();
    expect(readBack.file('word/commentsIds.xml')).toBeNull();
    expect(readBack.file('word/commentsExtensible.xml')).toBeNull();

    const updatedContentTypes = await readBack.file('[Content_Types].xml').async('string');
    expect(updatedContentTypes).not.toContain('PartName="/word/comments.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtended.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsIds.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtensible.xml"');
  });

  it('removes stale comment files in original-file export path when null sentinels are provided', async () => {
    const zipper = new DocxZipper();
    const originalZip = new JSZip();
    originalZip.file('[Content_Types].xml', contentTypesWithComments);
    originalZip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );
    originalZip.file(
      'word/comments.xml',
      '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    );
    originalZip.file(
      'word/commentsExtended.xml',
      '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"/>',
    );
    originalZip.file(
      'word/commentsIds.xml',
      '<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"/>',
    );
    originalZip.file(
      'word/commentsExtensible.xml',
      '<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"/>',
    );
    const originalDocxFile = await originalZip.generateAsync({ type: 'nodebuffer' });

    const result = await zipper.updateZip({
      docx: [],
      updatedDocs: updatedDocsWithCommentDeletes,
      originalDocxFile,
      media: {},
      fonts: {},
      isHeadless: true,
    });

    const readBack = await new JSZip().loadAsync(result);
    expect(readBack.file('word/comments.xml')).toBeNull();
    expect(readBack.file('word/commentsExtended.xml')).toBeNull();
    expect(readBack.file('word/commentsIds.xml')).toBeNull();
    expect(readBack.file('word/commentsExtensible.xml')).toBeNull();

    const updatedContentTypes = await readBack.file('[Content_Types].xml').async('string');
    expect(updatedContentTypes).not.toContain('PartName="/word/comments.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtended.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsIds.xml"');
    expect(updatedContentTypes).not.toContain('PartName="/word/commentsExtensible.xml"');
  });
});
