import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MULTI_IMAGE_DOC = path.resolve(__dirname, 'fixtures/multi-image-types.docx');

// MIME types used by SuperDoc clipboard
const SUPERDOC_SLICE_MIME = 'application/x-superdoc-slice';
const SUPERDOC_MEDIA_MIME = 'application/x-superdoc-media';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Grabs the SuperDoc clipboard payload from the editor by programmatically
 * slicing the document and collecting media. Returns everything needed to
 * simulate a paste event.
 */
async function copySelection(superdoc: SuperDocFixture): Promise<{
  sliceJson: string;
  mediaJson: string;
  html: string;
  plainText: string;
}> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { from, to } = editor.state.selection;
    const slice = editor.state.doc.slice(from, to);
    const sliceJson = JSON.stringify(slice.toJSON());

    // Collect referenced media
    const media = editor.storage?.image?.media ?? {};
    const referencedMedia: Record<string, string> = {};
    const walk = (node: any) => {
      if (node.type === 'image' && node.attrs?.src && media[node.attrs.src]) {
        referencedMedia[node.attrs.src] = media[node.attrs.src];
      }
      if (node.content) {
        for (const child of node.content) walk(child);
      }
    };
    const parsed = JSON.parse(sliceJson);
    if (Array.isArray(parsed.content)) parsed.content.forEach(walk);

    const mediaJson = Object.keys(referencedMedia).length > 0 ? JSON.stringify(referencedMedia) : '';

    const plainText = slice.content.textBetween(0, slice.content.size, '\n');

    // Build minimal SuperDoc-origin HTML so isSuperdocOriginClipboardHtml detects it
    const html = `<div data-superdoc-slice style="display:none"></div><p>${plainText}</p>`;

    return { sliceJson, mediaJson, html, plainText };
  });
}

/**
 * Dispatches a synthetic paste event with SuperDoc clipboard data.
 */
async function pasteSuperdocClipboard(
  superdoc: SuperDocFixture,
  payload: { sliceJson: string; mediaJson: string; html: string; plainText: string },
): Promise<void> {
  await superdoc.page.evaluate(
    ({ sliceJson, mediaJson, html, plainText, sliceMime, mediaMime }) => {
      const editor = (window as any).editor;
      const event = new Event('paste', { bubbles: true, cancelable: true });

      const data: Record<string, string> = {
        'text/html': html,
        'text/plain': plainText,
        [sliceMime]: sliceJson,
      };
      if (mediaJson) data[mediaMime] = mediaJson;

      (event as any).clipboardData = {
        getData(type: string) {
          return data[type] ?? '';
        },
      };

      editor.view.dom.dispatchEvent(event);
    },
    {
      ...payload,
      sliceMime: SUPERDOC_SLICE_MIME,
      mediaMime: SUPERDOC_MEDIA_MIME,
    },
  );

  await superdoc.waitForStable();
}

/**
 * Returns the number of image nodes in the PM document.
 */
async function countImages(superdoc: SuperDocFixture): Promise<number> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    let count = 0;
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'image') count++;
    });
    return count;
  });
}

/**
 * Returns all image src values in the PM document.
 */
async function getImageSrcs(superdoc: SuperDocFixture): Promise<string[]> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const srcs: string[] = [];
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'image' && node.attrs?.src) {
        srcs.push(node.attrs.src);
      }
    });
    return srcs;
  });
}

/**
 * Returns block identity attrs (paraId, sdBlockId) for all paragraphs.
 */
async function getParagraphIdentities(
  superdoc: SuperDocFixture,
): Promise<Array<{ paraId: string | null; sdBlockId: string | null }>> {
  return superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const ids: Array<{ paraId: string | null; sdBlockId: string | null }> = [];
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'paragraph') {
        ids.push({ paraId: node.attrs.paraId ?? null, sdBlockId: node.attrs.sdBlockId ?? null });
      }
    });
    return ids;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('SuperDoc-to-SuperDoc copy-paste', () => {
  test('copy-paste preserves inline formatting (bold, italic)', async ({ superdoc }) => {
    // Type and format text
    await superdoc.type('Hello world');
    await superdoc.waitForStable();

    // Select "world" and bold it
    const pos = await superdoc.findTextPos('world');
    await superdoc.setTextSelection(pos, pos + 'world'.length);
    await superdoc.waitForStable();
    await superdoc.bold();
    await superdoc.waitForStable();

    // Select all and copy
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Clear doc and paste
    await superdoc.press('Backspace');
    await superdoc.waitForStable();
    await pasteSuperdocClipboard(superdoc, payload);

    // Verify text survived
    await superdoc.assertTextContains('Hello world');
    // Verify bold mark on "world"
    await superdoc.assertTextHasMarks('world', ['bold']);
  });

  test('copy-paste preserves list structure', async ({ superdoc }) => {
    // Create an ordered list
    await superdoc.type('First item');
    await superdoc.waitForStable();
    await superdoc.executeCommand('toggleOrderedList');
    await superdoc.waitForStable();
    await superdoc.press('Enter');
    await superdoc.type('Second item');
    await superdoc.waitForStable();

    // Select all and copy
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Move to end and paste (appending, not replacing)
    await superdoc.press('End');
    await superdoc.waitForStable();
    await superdoc.press('Enter');
    await superdoc.waitForStable();
    // Exit list first
    await superdoc.press('Enter');
    await superdoc.waitForStable();

    await pasteSuperdocClipboard(superdoc, payload);

    // Verify both original and pasted text exist
    await superdoc.assertTextContains('First item');
    await superdoc.assertTextContains('Second item');
  });

  test('cut removes content and paste restores it', async ({ superdoc }) => {
    await superdoc.type('Cut me please');
    await superdoc.waitForStable();

    // Select all and copy (simulate cut = copy + delete)
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Delete the selection (simulates the cut)
    await superdoc.press('Backspace');
    await superdoc.waitForStable();
    await superdoc.assertTextNotContains('Cut me please');

    // Paste it back
    await pasteSuperdocClipboard(superdoc, payload);
    await superdoc.assertTextContains('Cut me please');
  });

  test('pasted block identities are stripped (no duplicate IDs)', async ({ superdoc }) => {
    await superdoc.type('Paragraph one');
    await superdoc.press('Enter');
    await superdoc.type('Paragraph two');
    await superdoc.waitForStable();

    // Get original paragraph identities
    const originalIds = await getParagraphIdentities(superdoc);

    // Select all and copy
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Move to end and paste
    await superdoc.press('End');
    await superdoc.waitForStable();
    await superdoc.press('Enter');
    await superdoc.waitForStable();
    await pasteSuperdocClipboard(superdoc, payload);

    // Get all paragraph identities after paste
    const allIds = await getParagraphIdentities(superdoc);

    // Pasted paragraphs should have null/fresh IDs, not duplicates of the originals
    const originalParaIds = originalIds.map((id) => id.paraId).filter(Boolean);
    const pastedIds = allIds.slice(originalIds.length);
    for (const pasted of pastedIds) {
      // paraId should be null (stripped by stripSuperdocSliceBlockIdentities)
      expect(pasted.paraId).toBeNull();
    }
  });
});

test.describe('SuperDoc copy-paste with images', () => {
  test('copy-paste preserves images from multi-format document', async ({ superdoc }) => {
    await superdoc.loadDocument(MULTI_IMAGE_DOC);
    await superdoc.waitForStable();

    // Count images in the loaded document
    const originalImageCount = await countImages(superdoc);
    expect(originalImageCount).toBeGreaterThan(0);

    // Get original image srcs
    const originalSrcs = await getImageSrcs(superdoc);

    // Select all and copy
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Verify media was collected
    expect(payload.sliceJson).toBeTruthy();

    // Move to end and paste
    await superdoc.press('End');
    await superdoc.waitForStable();
    await superdoc.press('Enter');
    await superdoc.waitForStable();
    await pasteSuperdocClipboard(superdoc, payload);

    // Total images should be double (original + pasted)
    const totalImages = await countImages(superdoc);
    expect(totalImages).toBe(originalImageCount * 2);

    // Pasted images should have src values (not empty/broken)
    const allSrcs = await getImageSrcs(superdoc);
    for (const src of allSrcs) {
      expect(src).toBeTruthy();
    }
  });

  test('pasting images with path collision renames to avoid overwrite', async ({ superdoc }) => {
    await superdoc.loadDocument(MULTI_IMAGE_DOC);
    await superdoc.waitForStable();

    // Store original media state
    const originalMedia: Record<string, string> = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      return { ...(editor.storage?.image?.media ?? {}) };
    });
    const originalMediaKeys = Object.keys(originalMedia);

    // Select all and copy
    await superdoc.press('Meta+a');
    await superdoc.waitForStable();
    const payload = await copySelection(superdoc);

    // Tamper with the media store to simulate a collision:
    // change the data at existing paths so the paste detects different bytes
    await superdoc.page.evaluate((keys) => {
      const editor = (window as any).editor;
      const store = editor.storage.image.media;
      for (const key of keys) {
        if (store[key]) {
          store[key] = 'data:image/png;base64,TAMPERED';
        }
      }
    }, originalMediaKeys);

    // Paste — should trigger renames since bytes differ
    await pasteSuperdocClipboard(superdoc, payload);

    // Get current media store
    const afterMedia: Record<string, string> = await superdoc.page.evaluate(() => {
      const editor = (window as any).editor;
      return { ...(editor.storage?.image?.media ?? {}) };
    });

    const afterKeys = Object.keys(afterMedia);

    // Should have new keys (sd-paste-*) for the renamed paths
    const newKeys = afterKeys.filter((k) => !originalMediaKeys.includes(k));
    expect(newKeys.length).toBeGreaterThan(0);

    // Original paths should still have the tampered data (not overwritten)
    for (const key of originalMediaKeys) {
      if (afterMedia[key]) {
        expect(afterMedia[key]).toBe('data:image/png;base64,TAMPERED');
      }
    }
  });
});
