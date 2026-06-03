import { test, expect } from '../../fixtures/superdoc.js';
import JSZip from 'jszip';

test.use({ config: { toolbar: 'none' } });

test('relative image paths survive DOCX export', async ({ superdoc, browserName }) => {
  test.skip(browserName !== 'chromium', 'Relative image fetch requires Chromium.');

  // Wait for editor to be fully available, then insert an image with a relative src
  await superdoc.page.waitForFunction(() => !!(window as any).editor?.commands?.setImage, null, { timeout: 10_000 });
  await superdoc.page.evaluate(() => {
    (window as any).editor.commands.setImage({ src: 'assets/image-landscape.png' });
  });

  // Wait for registerRelativeImages to complete — the node should get an rId
  const rId = await expect
    .poll(
      async () => {
        return superdoc.page.evaluate(() => {
          let rId: string | null = null;
          (window as any).editor.state.doc.descendants((n: any) => {
            if (n.type.name === 'image' && n.attrs.rId) rId = n.attrs.rId;
          });

          return rId;
        });
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();

  // Export to DOCX and transfer the raw bytes to Node
  const bytes: number[] = await superdoc.page.evaluate(async () => {
    const blob: Blob = await (window as any).editor.exportDocx();
    const buffer = await blob.arrayBuffer();

    return Array.from(new Uint8Array(buffer));
  });

  // Parse the zip and verify the image made it into the DOCX
  const zip = await JSZip.loadAsync(Buffer.from(bytes));

  // The image file exists in word/media/ with the expected filename
  const mediaEntries = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir);
  expect(mediaEntries).toContain('word/media/image-landscape.png');

  // The image binary is non-empty and starts with the PNG signature
  const imageData = await zip.file('word/media/image-landscape.png')!.async('uint8array');
  expect(imageData.length).toBeGreaterThan(0);
  // This is a "magic number" signature for identifying the PNG file format.
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  expect(Array.from(imageData.slice(0, 8))).toEqual(pngSignature);

  // The relationships XML links the rId to the media file
  const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('string');
  expect(relsXml).toContain('image-landscape.png');

  // The document XML contains a drawing element (image reference)
  const documentXml = await zip.file('word/document.xml')!.async('string');
  expect(documentXml).toContain('r:embed=');
});
